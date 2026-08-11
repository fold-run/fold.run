/**
 * fold-enterprise — Worker fronting the governed fold container at
 * enterprise.fold.run.
 *
 * The sibling of apps/demo, and deliberately a *second* gateway rather than a
 * change to the first: `auth.mode` is gateway-wide, so requiring a token here
 * would have ended demo.fold.run's copy-paste curl walkthrough. demo.fold.run
 * shows federation with no friction; this one shows what governance looks like
 * once callers have identities — tenants, per-tenant budgets and buckets, a
 * visibility subset, and a console scoped to whoever signed in.
 *
 * The container runs the unmodified fold release; this Worker routes, and
 * vends demo tokens (see /demo-token below).
 */
import { Container, getContainer } from '@cloudflare/containers';

// The identity provider is oauth.work, which mints EdDSA-signed JWT access
// tokens and honours RFC 8707 — the `resource` parameter is bound at
// /authorize and reflected into the token's `aud`. That matters because fold
// requires an exact audience match and the fold console sends `resource`,
// never `audience`.
//
// The apex issuer, not a tenant subdomain. oauth.work signs as the tenant on
// <slug>.oauth.work and as the platform on the apex; both carry the `org_id`
// claim the tenants below select on, and a single issuer means one console
// sign-in serves every demo org rather than one per tenant.
const ISSUER = 'https://oauth.work';

// TODO(oauth.work): a public SPA client registered with
// https://enterprise.fold.run/console/ as its redirect URI.
const CONSOLE_CLIENT_ID = 'REPLACE_WITH_OAUTH_WORK_SPA_CLIENT_ID';

// The canonical resource URI, which is also the audience every token must
// carry (RFC 8707). fold matches it exactly and publishes it as RFC 9728
// metadata, which is how the console discovers where to sign in.
const RESOURCE = 'https://enterprise.fold.run';

// The federation is the demo's, so the two gateways tell one story about one
// set of upstreams. What differs is everything governance decides.
const FOLD_CONFIG = {
  upstreams: [
    { id: 'cf-docs', url: 'https://docs.mcp.cloudflare.com/mcp', namespace: 'cfdocs' },
    { id: 'gitmcp', url: 'https://gitmcp.io/docs', namespace: 'git' },
    { id: 'demo-tasks', url: 'https://tasks.fold.run/mcp', namespace: 'jobs' },
  ],

  auth: {
    mode: 'required',
    resource: RESOURCE,
    issuers: [
      {
        issuer: ISSUER,
        jwksUri: `${ISSUER}/.well-known/jwks.json`,
        // oauth.work carries a signed-in user's memberships as `roles`; fold's
        // group matching reads whatever claim is named here.
        groupsClaim: 'roles',
      },
    ],
  },

  // Two customers of one gateway, differing on every axis a tenant governs:
  // what they may spend, how fast they may spend it, and what they can see at
  // all. globex never even reaches gitmcp — the subset filters the fan-out
  // before policy runs, so that upstream is not asked, not billed, and not a
  // partial failure when it is down.
  //
  // The selector is the IdP's own org id, which is the honest mapping: a fold
  // tenant is a customer, and so is an oauth.work org. It is also the shape
  // fold indexes — one claim equalling one value — so resolution stays a map
  // lookup rather than a scan.
  tenants: [
    {
      id: 'acme',
      subjects: { claims: { org_id: 'org_acme' } },
      budget: { period: 'day', upstreamCalls: 5000 },
      rateLimit: { requestsPerMinute: 120 },
    },
    {
      id: 'globex',
      subjects: { claims: { org_id: 'org_globex' } },
      budget: { period: 'day', upstreamCalls: 1000 },
      rateLimit: { requestsPerMinute: 60 },
      upstreams: ['cf-docs', 'demo-tasks'],
    },
  ],

  // Deny by default. The rules split each tenant by `actor_type`, which
  // oauth.work sets to "user" for a signed-in person and "agent"/"service" for
  // a client-credentials token — so the same customer's agent gets a narrower
  // surface than the person it runs for, which is the whole argument for
  // putting policy at the gateway rather than in each client.
  policy: {
    defaultDecision: 'deny',
    rules: [
      {
        id: 'acme-people',
        subjects: { claims: { org_id: 'org_acme', actor_type: 'user' } },
        allow: [
          { server: 'cf-docs' },
          { server: 'demo-tasks' },
          // Everything gitmcp offers except fetch_generic_url_content, which
          // fetches arbitrary URLs on the caller's behalf — the capability an
          // enterprise most wants decided at the gateway. Withheld from the
          // list *and* refused on call: invisibility plus denial is the pair.
          {
            server: 'gitmcp',
            methods: ['tools/call'],
            names: [
              'match_common_libs_owner_repo_mapping',
              'fetch_generic_documentation',
              'search_generic_documentation',
              'search_generic_code',
            ],
          },
          { server: 'gitmcp', methods: ['prompts/get', 'resources/read'] },
        ],
      },
      {
        id: 'acme-agents',
        subjects: { claims: { org_id: 'org_acme', actor_type: 'agent' } },
        allow: [
          { server: 'cf-docs', methods: ['tools/call'], names: ['search_*'] },
          { server: 'demo-tasks' },
          { server: 'gitmcp', methods: ['tools/call'], names: ['search_*'] },
        ],
      },
      {
        id: 'globex-people',
        subjects: { claims: { org_id: 'org_globex', actor_type: 'user' } },
        allow: [
          {
            server: 'cf-docs',
            methods: ['tools/call'],
            names: ['search_cloudflare_documentation'],
          },
          { server: 'demo-tasks' },
        ],
      },
      {
        id: 'globex-agents',
        subjects: { claims: { org_id: 'org_globex', actor_type: 'agent' } },
        allow: [{ server: 'demo-tasks' }],
      },
    ],
  },

  // stdout lands in the container log, which is where a visitor comparing two
  // logins can be shown the `tenant` field doing its work.
  audit: { sinks: [{ type: 'stdout' }] },

  server: {
    allowedHosts: ['enterprise.fold.run', 'fold-enterprise.bauman.workers.dev'],
    // Three ceilings that answer different questions: the gateway's own floor,
    // each person's bucket, and (above, per tenant) one bucket for a team.
    rateLimit: { requestsPerMinute: 300, perPrincipalPerMinute: 60 },
    // A singleton container, so per-instance enforcement *is* fleet-wide and
    // the startup warning about shared state is expected here.
    budget: { period: 'day', upstreamCalls: 20000 },
    // No `groups` allowlist: a viewer already sees only their own tenant's
    // federation, which is the narrowing that matters, and gating on role
    // names would lock the demo to whatever oauth.work memberships happen to
    // be called.
    introspection: { enabled: true },
    console: {
      enabled: true,
      // The console signs visitors in with Authorization Code + PKCE rather
      // than asking for a pasted token; register {origin}/console/ as the
      // redirect URI on the client above.
      oauth: { clientId: CONSOLE_CLIENT_ID, issuer: ISSUER },
    },
  },
};

export class FoldEnterprise extends Container {
  defaultPort = 8080;
  // The uptime monitor keeps this warm the same way it does the demo; the
  // timeout is the backstop if monitoring stops.
  sleepAfter = '1h';
  enableInternet = true; // fold dials the public upstreams and the issuer's JWKS
  envVars = { FOLD_CONFIG: JSON.stringify(FOLD_CONFIG) };
}

interface Env {
  FOLD_ENTERPRISE: DurableObjectNamespace;
  // One client-credentials client per demo org, so a token's `org_id` — and
  // therefore its fold tenant — is a property of which client minted it.
  // Register both as agent clients: oauth.work then stamps actor_type "agent"
  // rather than "service", which is what the agent rules above match.
  OAUTH_WORK_CLIENT_ID_ACME?: string;
  OAUTH_WORK_CLIENT_SECRET_ACME?: string;
  OAUTH_WORK_CLIENT_ID_GLOBEX?: string;
  OAUTH_WORK_CLIENT_SECRET_GLOBEX?: string;
}

type DemoTenant = 'acme' | 'globex';

/**
 * Minted tokens are cached until shortly before they expire. This is not an
 * optimization: /demo-token is a deliberately public endpoint, and caching is
 * what keeps a crawler hitting it from turning into the same number of calls
 * against the issuer.
 */
const tokenCache = new Map<DemoTenant, { token: string; expiresAt: number }>();

async function mintDemoToken(tenant: DemoTenant, env: Env): Promise<Response> {
  const clientId =
    tenant === 'acme' ? env.OAUTH_WORK_CLIENT_ID_ACME : env.OAUTH_WORK_CLIENT_ID_GLOBEX;
  const clientSecret =
    tenant === 'acme' ? env.OAUTH_WORK_CLIENT_SECRET_ACME : env.OAUTH_WORK_CLIENT_SECRET_GLOBEX;

  if (!clientId || !clientSecret) {
    // Deployable before the clients exist, and honest about why it cannot answer.
    return Response.json(
      { error: 'demo token vending is not configured yet', tenant },
      { status: 503 },
    );
  }

  const cached = tokenCache.get(tenant);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return Response.json({ tenant, access_token: cached.token, cached: true });
  }

  // Form-encoded, and `resource` rather than any vendor's audience parameter:
  // the token endpoint reads RFC 8707 resource indicators off the form and
  // reflects them into `aud`, which is the claim fold matches on.
  const res = await fetch(`${ISSUER}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      resource: RESOURCE,
    }),
  });

  if (!res.ok) {
    return Response.json({ error: 'could not mint a demo token', tenant }, { status: 502 });
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(tenant, {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  });
  return Response.json({ tenant, access_token: body.access_token, expires_in: body.expires_in });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Bare host is the "I pasted the URL in a browser" case: fold answers 404
    // there, so send it to the console, which is this gateway's front door.
    if (url.pathname === '/') {
      return Response.redirect(new URL('/console/', url).toString(), 302);
    }

    // The copy-paste path. A visitor curling this gateway needs a token, and
    // making them register an account first would defeat the point of a public
    // demo. The tokens are audience-pinned to this gateway and bounded by the
    // tenant budgets above, so what a holder can do is exactly what the
    // walkthrough shows.
    if (url.pathname === '/demo-token') {
      const tenant = url.searchParams.get('tenant');
      if (tenant !== 'acme' && tenant !== 'globex') {
        return Response.json({ error: 'tenant must be "acme" or "globex"' }, { status: 400 });
      }
      return mintDemoToken(tenant, env);
    }

    try {
      return await getContainer(env.FOLD_ENTERPRISE as never, 'enterprise').fetch(request);
    } catch {
      // Container cold-start hiccup: a clean 503 beats an opaque 1101.
      return new Response('enterprise gateway is starting, retry in a few seconds\n', {
        status: 503,
      });
    }
  },
};
