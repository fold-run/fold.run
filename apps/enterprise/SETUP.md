# enterprise.fold.run — what has to exist before this deploys

`apps/enterprise` is committed and validated but not deployed: its config names
things that do not exist yet in the identity provider. This is that list, plus
what a review of the provider's OAuth flows turned up while writing it.

The gateway config lives in `src/index.ts`; every literal below appears there,
so the two must agree exactly.

## 1. In oauth.work

### Two orgs

The gateway's tenants select on the `org_id` claim, so these ids are the
contract — not the display names.

| org_id | fold tenant | What it demonstrates |
|---|---|---|
| `org_acme` | `acme` | The full surface: 5,000 upstream calls/day, 120 rpm, all three upstreams |
| `org_globex` | `globex` | A bounded customer: 1,000 calls/day, 60 rpm, and an `upstreams` subset that never reaches gitmcp |

`org_acme` already exists in `packages/database/src/seed.ts`; `org_globex` is new.

### One SPA client, for console sign-in

- Redirect URI **`https://enterprise.fold.run/console/`** — exact string, with
  the trailing slash. fold's console registers that path, and the provider
  matches redirect URIs exactly (correctly — OAuth 2.1 forbids pattern
  matching).
- `token_endpoint_auth_method: none`, PKCE S256 (the console sends
  `code_challenge` and `resource`, never `audience`).
- Its `client_id` replaces `CONSOLE_CLIENT_ID` in `src/index.ts`.

Because the console takes a **single** sign-in issuer, this client lives on the
apex (`https://oauth.work`) rather than a tenant subdomain — one sign-in serves
both demo orgs, and `org_id` still distinguishes them.

### Two client-credentials clients, one per org

These back `/demo-token`, which keeps a copy-paste curl walkthrough possible
without making a visitor register an account.

- `grant_types` must include `client_credentials`.
- **`client_type: "agent"`**, not `"service"` — the gateway's policy rules match
  `actor_type: "agent"`, and `routes/token.ts` derives that from `client_type`.
  A client registered as `service` gets a token that verifies correctly and
  then matches no rule, which is a confusing failure. See finding 5.
- `org_id` set to the matching org: the minted token carries it, and that is
  what resolves the fold tenant.

Then set the four Worker secrets:

```bash
wrangler secret put OAUTH_WORK_CLIENT_ID_ACME     --config apps/enterprise/wrangler.jsonc
wrangler secret put OAUTH_WORK_CLIENT_SECRET_ACME --config apps/enterprise/wrangler.jsonc
wrangler secret put OAUTH_WORK_CLIENT_ID_GLOBEX   --config apps/enterprise/wrangler.jsonc
wrangler secret put OAUTH_WORK_CLIENT_SECRET_GLOBEX --config apps/enterprise/wrangler.jsonc
```

### Two demo users, one per org

Published credentials, so a visitor can sign into the console as either
customer and compare. This is the artifact the whole exercise is for: one
gateway, two logins, visibly different federations — different upstreams,
different limits, different tool lists.

## 2. Findings from reviewing the provider's OAuth flows

**None of these block the demo.** The flows fold depends on — authorization
code with PKCE, client credentials, RFC 8707 audience binding, JWKS
verification — are correct as written.

What is already right, and worth not regressing: PKCE is mandatory and S256-only;
`response_type=code` is the only one accepted (no implicit, no ROPC); redirect
URIs match exactly, and again at token exchange; authorization codes are
single-use through a Durable Object and bound to `client_id` + `redirect_uri`;
confidential clients must authenticate at `/token`; refresh tokens rotate with
family revocation on reuse; PAR is single-use through a Postgres arbiter rather
than a racy KV get-then-delete; DPoP is opt-in with `Bearer` as the default;
and no endpoint accepts an access token in a query string.

### Finding 1 — the authorization response carries no `iss` (RFC 9207)

**Severity: medium. Spec: OAuth 2.1 mix-up defense.**

`routes/consent.ts` redirects back with `code` and `state` but no `iss`, and
the discovery document does not advertise
`authorization_response_iss_parameter_supported`. OAuth 2.1 adopts the Security
BCP's mix-up-attack defense, and RFC 9207 is its mechanism: without `iss`, a
client that talks to more than one authorization server cannot tell which one
answered.

That is not a hypothetical for this product — an MCP client is *by
construction* a client of many authorization servers.

**Fix:** add `iss` to both the success and error redirects, and set the metadata
flag.

### Finding 2 — `resource` is unvalidated on the client-credentials grant

**Severity: medium-high in a multi-tenant deployment. Spec: RFC 8707 §2.**

The authorization-code path is rigorous: a `resource` on the token request must
be a subset of what was bound at `/authorize`, else `invalid_target`. The
client-credentials path (`routes/token.ts`, `resourceAudience(form)`) takes
whatever string it is given and reflects it into `aud` with no check that the
client is entitled to that resource.

So any customer's machine client can mint a validly signed token whose `aud`
names another customer's resource server. The token still carries its own `sub`
and `org_id`, so a resource server that checks those is unharmed — but one that
trusts issuer plus audience alone, which is the common shape, would accept it.

RFC 8707 §2.2 specifies `invalid_target` for exactly this case.

**Fix:** an allowed-resources list per client (mirroring `allowed_scopes`),
rejecting anything else with `invalid_target`. A useful interim step is finding
3, which is a few lines.

### Finding 3 — `resource` syntax is not checked at `/authorize`

**Severity: low. Spec: RFC 8707 §2.**

`routes/authorize.ts` takes `q.resource` verbatim. The RFC requires an absolute
URI without a fragment; today a malformed value flows into the token's `aud`
unchecked.

**Fix:** one shared validator used by both `/authorize` and `/token`, which is
also the natural home for finding 2's entitlement check.

### Finding 4 — repeated `resource` parameters are dropped at `/authorize`

**Severity: low. Spec: RFC 8707 §2 (the parameter may repeat).**

`/token` handles repetition correctly (`form.getAll("resource")`), but
`/authorize` reads a flattened query map and keeps one value, so the two ends
of the same flow disagree. The code comments the limitation, so this is a
"decide and record" item rather than a bug found by surprise.

### Finding 5 — `/revoke` does not authenticate the caller

**Severity: low-medium. Spec: RFC 7009 §2.1.**

`token.post("/revoke")` accepts a token string and revokes it with no client
authentication and no check that the token belongs to the presenting client.
RFC 7009 requires the client to authenticate. The practical exposure is small —
you must already hold the token — but it also means nothing stops one client
from revoking another's token if it ever learns the value.

Worth noting the neighbouring endpoint is *stricter* than the spec:
`/introspect` requires an API key.

**Fix:** authenticate the client and verify the token's `client_id` matches
before revoking.

### Finding 6 — authorization codes live 10 minutes

**Severity: low.**

`TTL.authCode` is 600s. That is the maximum RFC 6749 §4.1.2 permits and the
Security BCP prefers much shorter; codes here are single-use and PKCE-bound, so
the exposure is small, but 60s costs nothing.

### Checked and already correct

`DEV_AUTO_LOGIN` looked like a footgun — it logs every caller in as the demo
user — but `index.ts:48` refuses to start the request when it is set on an
https issuer. Fail-closed, no change needed.

## 3. Verifying it once the pieces exist

```bash
# 1. A token, and it should be a JWT (three dot-separated segments), not opaque
curl -s "https://enterprise.fold.run/demo-token?tenant=globex" | jq -r .access_token

# 2. aud must equal https://enterprise.fold.run, and org_id must be org_globex
#    (decode the payload; both are what fold matches on)

# 3. globex sees two upstreams and a short tool list; acme sees three and more
curl -s -X POST https://enterprise.fold.run/mcp \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 4. a globex agent calling a gitmcp tool is refused before policy runs
#    (-32042, and gitmcp is never contacted)
```

Then sign into `https://enterprise.fold.run/console/` as each demo user and
compare the federation view — that comparison is the deliverable.
