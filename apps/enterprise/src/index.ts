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

// Auth0 tenant facts. Both are public values — the issuer is in every token's
// `iss` and the SPA client id is in the console's own sign-in hint — so they
// live here rather than in secrets. The M2M *secret* behind /demo-token does
// not; it arrives as a Worker secret.
//
// TODO(auth0): replace once the tenant exists. The trailing slash on the
// issuer is load-bearing: Auth0 puts it in the `iss` claim, and fold matches
// the issuer exactly, so an issuer configured without it fails every token.
const AUTH0_ISSUER = 'https://fold-demo.us.auth0.com/';
const AUTH0_SPA_CLIENT_ID = 'REPLACE_WITH_AUTH0_SPA_CLIENT_ID';

// The canonical resource URI, which is also the audience every token must
// carry (RFC 8707). fold matches it exactly and publishes it as RFC 9728
// metadata, which is how the console discovers where to sign in.
const RESOURCE = 'https://enterprise.fold.run';

const ISSUER_SUBJECT = { issuers: [AUTH0_ISSUER] };

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
        issuer: AUTH0_ISSUER,
        jwksUri: `${AUTH0_ISSUER}.well-known/jwks.json`,
        // Auth0 drops custom claims that aren't namespaced, so the group claim
        // is a URL rather than "groups".
        groupsClaim: 'https://fold.run/groups',
      },
    ],
  },

  // Two customers of one gateway, differing on every axis a tenant governs:
  // what they may spend, how fast they may spend it, and what they can see at
  // all. globex never even reaches gitmcp — the subset filters the fan-out
  // before policy runs, so that upstream is not asked, not billed, and not a
  // partial failure when it is down.
  tenants: [
    {
      id: 'acme',
      subjects: { ...ISSUER_SUBJECT, groups: ['acme'] },
      budget: { period: 'day', upstreamCalls: 5000 },
      rateLimit: { requestsPerMinute: 120 },
    },
    {
      id: 'globex',
      subjects: { ...ISSUER_SUBJECT, groups: ['globex'] },
      budget: { period: 'day', upstreamCalls: 1000 },
      rateLimit: { requestsPerMinute: 60 },
      upstreams: ['cf-docs', 'demo-tasks'],
    },
  ],

  // Deny by default, and each tenant is allowed only what its story needs.
  // Rules are issuer-pinned even though there is one issuer: subjects and
  // group names are unique only within an issuer, so the pin costs nothing now
  // and is required the moment a second one is trusted.
  policy: {
    defaultDecision: 'deny',
    rules: [
      {
        id: 'acme-full',
        subjects: { ...ISSUER_SUBJECT, groups: ['acme'] },
        allow: [
          { server: 'cf-docs' },
          { server: 'demo-tasks' },
          // Everything gitmcp offers except fetch_generic_url_content, which
          // fetches arbitrary URLs on the agent's behalf — the capability an
          // enterprise most wants decided at the gateway. Withheld from lists
          // *and* refused on call: invisibility plus denial is the pair.
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
        id: 'globex-readonly',
        subjects: { ...ISSUER_SUBJECT, groups: ['globex'] },
        allow: [
          {
            server: 'cf-docs',
            methods: ['tools/call'],
            names: ['search_cloudflare_documentation'],
          },
          { server: 'demo-tasks' },
        ],
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
    introspection: { enabled: true, groups: ['acme', 'globex'] },
    console: {
      enabled: true,
      // The console signs visitors in with Authorization Code + PKCE rather
      // than asking for a pasted token; register {origin}/console/ as the
      // redirect URI at Auth0.
      oauth: { clientId: AUTH0_SPA_CLIENT_ID, issuer: AUTH0_ISSUER },
    },
  },
};

export class FoldEnterprise extends Container {
  defaultPort = 8080;
  // The uptime monitor keeps this warm the same way it does the demo; the
  // timeout is the backstop if monitoring stops.
  sleepAfter = '1h';
  enableInternet = true; // fold dials the public upstreams and Auth0's JWKS
  envVars = { FOLD_CONFIG: JSON.stringify(FOLD_CONFIG) };
}

interface Env {
  FOLD_ENTERPRISE: DurableObjectNamespace;
  // Machine-to-machine credentials, one client per demo tenant, so a token's
  // group claim is a property of which client minted it. Secrets, unlike the
  // issuer and SPA client id above.
  AUTH0_M2M_CLIENT_ID_ACME?: string;
  AUTH0_M2M_CLIENT_SECRET_ACME?: string;
  AUTH0_M2M_CLIENT_ID_GLOBEX?: string;
  AUTH0_M2M_CLIENT_SECRET_GLOBEX?: string;
}

type DemoTenant = 'acme' | 'globex';

/**
 * Minted tokens are cached until shortly before they expire. This is not an
 * optimization: /demo-token is a deliberately public endpoint, and caching is
 * what keeps a crawler hitting it from turning into the same number of calls
 * against Auth0.
 */
const tokenCache = new Map<DemoTenant, { token: string; expiresAt: number }>();

async function mintDemoToken(tenant: DemoTenant, env: Env): Promise<Response> {
  const clientId =
    tenant === 'acme' ? env.AUTH0_M2M_CLIENT_ID_ACME : env.AUTH0_M2M_CLIENT_ID_GLOBEX;
  const clientSecret =
    tenant === 'acme' ? env.AUTH0_M2M_CLIENT_SECRET_ACME : env.AUTH0_M2M_CLIENT_SECRET_GLOBEX;

  if (!clientId || !clientSecret) {
    // Deployable before Auth0 exists, and honest about why it cannot answer.
    return Response.json(
      { error: 'demo token vending is not configured yet', tenant },
      { status: 503 },
    );
  }

  const cached = tokenCache.get(tenant);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return Response.json({ tenant, access_token: cached.token, cached: true });
  }

  const res = await fetch(`${AUTH0_ISSUER}oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: RESOURCE,
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
    // making them register an Auth0 account first would defeat the point of a
    // public demo. The tokens are audience-pinned to this gateway and bounded
    // by the tenant budgets above, so what a holder can do is exactly what the
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
