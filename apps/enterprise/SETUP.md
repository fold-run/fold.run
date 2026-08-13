# enterprise.fold.run — what it depends on in the identity provider

**Status: live.** `enterprise.fold.run` is deployed, and everything in section 1
is provisioned on oauth.work — `spa_fold_enterprise` resolves at
`https://oauth.work/authorize`, and `/demo-token` mints working tokens for both
tenants. Section 1 is now the record of what exists and how to recreate it, not
a to-do list; re-run the provisioning script to rebuild it.

Verified end to end on 2026-08-13 against production on both sides, on both
paths a customer can take.

*Machine* — a client-credentials token from oauth.work carries
`iss=https://oauth.work`, `aud=https://enterprise.fold.run`, `org_id`, and
`actor_type=agent`; the gateway resolves the tenant from `org_id` and enforces
the subset. A globex agent calling a gitmcp tool is refused with `-32042`
before the upstream is contacted, while the same call as acme reaches gitmcp
and is answered by it — the contrast, not a shared failure, is the proof.

*Browser* — signing in at `https://enterprise.fold.run/console/` completes the
authorization-code flow: `/authorize` on the apex, the sign-in and consent
screens on the same origin, the consent decision as a native form POST so the
authorization server can answer with a 302, and PKCE token exchange back at
the console.

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
  then matches no policy rule — the request is denied by `defaultDecision`,
  which looks like a gateway fault rather than a registration mistake.
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

| org | email | password |
|---|---|---|
| `org_acme` | `casey@acme.example` | `Fold-Demo-Acme-26!` |
| `org_globex` | `jordan@globex.example` | `Fold-Demo-Globex-26!` |

SPA client id (wired in `src/index.ts`): **`spa_fold_enterprise`**.

Agent clients (Worker secrets): `agent_fold_acme` / `agent_fold_globex`.

Re-provision on oauth.work with:

```bash
DATABASE_URL=… node --experimental-strip-types \
  apps/worker/scripts/provision-fold-enterprise.ts
```

## 2. Findings from reviewing the provider's OAuth flows

Each finding is kept as written at review time — present tense, describing the
code as it was. **All six are now fixed and deployed** (re-verified against
production on 2026-08-13), so read the state in the heading and the table
before the prose.

| | Finding | State |
|---|---|---|
| 1 | `iss` on the authorization response (RFC 9207) | fixed — discovery advertises `authorization_response_iss_parameter_supported: true` |
| 2 | `resource` unvalidated on client_credentials | fixed — per-client `allowed_resources` |
| 3 | `resource` syntax unchecked at `/authorize` | fixed — shared `parseResourceIndicators` |
| 4 | repeated `resource` dropped at `/authorize` | fixed — every value is bound, at `/authorize` and through PAR |
| 5 | `/revoke` unauthenticated | fixed — answers 401 without client auth |
| 6 | auth-code TTL 10 minutes | fixed — `TTL.authCode` is 60s |

**None of these blocked the demo.** The flows fold depends on — authorization
code with PKCE, client credentials, RFC 8707 audience binding, JWKS
verification — were already correct as written for the happy path.

What is already right, and worth not regressing: PKCE is mandatory and S256-only;
`response_type=code` is the only one accepted (no implicit, no ROPC); redirect
URIs match exactly, and again at token exchange; authorization codes are
single-use through a Durable Object and bound to `client_id` + `redirect_uri`;
confidential clients must authenticate at `/token`; refresh tokens rotate with
family revocation on reuse; PAR is single-use through a Postgres arbiter rather
than a racy KV get-then-delete; DPoP is opt-in with `Bearer` as the default;
and no endpoint accepts an access token in a query string.

### Finding 1 — the authorization response carries no `iss` (RFC 9207) — FIXED

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

### Finding 2 — `resource` is unvalidated on the client-credentials grant — FIXED

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

### Finding 3 — `resource` syntax is not checked at `/authorize` — FIXED

**Severity: low. Spec: RFC 8707 §2.**

`routes/authorize.ts` takes `q.resource` verbatim. The RFC requires an absolute
URI without a fragment; today a malformed value flows into the token's `aud`
unchecked.

**Fix:** one shared validator used by both `/authorize` and `/token`, which is
also the natural home for finding 2's entitlement check.

### Finding 4 — repeated `resource` parameters are dropped at `/authorize` — FIXED

**Severity: low. Spec: RFC 8707 §2 (the parameter may repeat).**

`/token` handles repetition correctly (`form.getAll("resource")`), but
`/authorize` reads a flattened query map and keeps one value, so the two ends
of the same flow disagree. The code comments the limitation, so this is a
"decide and record" item rather than a bug found by surprise.

**Fixed.** `/par` also dropped the extras — it stored parameters with
`form.get` into a flat map, so a pushed request lost the repetition before
`/authorize` ever saw it. Both now collect every value.

The severity held. The extra value was *dropped, not honoured*: `aud` never
carried it, and `/token`'s subset check still refused it afterwards. What the
client lost was the answer — it asked for two resources, silently got one, and
found out at the token request. It now gets `invalid_target` at the point it
asked, per RFC 8707 §2.2.

### Finding 5 — `/revoke` does not authenticate the caller — FIXED

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

### Finding 6 — authorization codes live 10 minutes — FIXED

**Severity: low.**

`TTL.authCode` is 600s. That is the maximum RFC 6749 §4.1.2 permits and the
Security BCP prefers much shorter; codes here are single-use and PKCE-bound, so
the exposure is small, but 60s costs nothing.

### Checked and already correct

`DEV_AUTO_LOGIN` looked like a footgun — it logs every caller in as the demo
user — but `index.ts:48` refuses to start the request when it is set on an
https issuer. Fail-closed, no change needed.

## 3. Verifying it

`/demo-token` mints a **client-credentials** token, so everything below runs as
an *agent*. That matters for what you should expect back: policy narrows the
agent surface below the tenant's upstream subset, which is the whole argument
for putting policy at the gateway. Signing into the console as a demo user
shows the wider, human surface.

| | tenant subset | what an **agent** token sees | what a signed-in **user** sees |
|---|---|---|---|
| `acme` | all three | `cfdocs`, `git`, `jobs` | all three |
| `globex` | `cf-docs`, `demo-tasks` | `jobs` only (`globex-agents` allows `demo-tasks`) | `cfdocs` (one tool) + `jobs` |

```bash
# 1. A token, and it should be a JWT (three dot-separated segments), not opaque
TOKEN=$(curl -s "https://enterprise.fold.run/demo-token?tenant=globex" | jq -r .access_token)

# 2. aud must equal https://enterprise.fold.run, and org_id must be org_globex
#    (decode the payload; both are what fold matches on)
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{iss,aud,org_id,sub,actor_type}'
```

MCP over streamable HTTP is a **session** protocol: `tools/list` before
`initialize` returns `method "tools/list" is invalid during session
initialization`. Handshake first, and carry the `Mcp-Session-Id` the initialize
response returns as a header.

```bash
BASE=https://enterprise.fold.run
H=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json'
   -H 'Accept: application/json, text/event-stream')

# 3a. initialize — the session id comes back as a *response header*
SID=$(curl -s -D - -o /dev/null "${H[@]}" -X POST "$BASE/mcp" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"setup","version":"1"}}}' \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="mcp-session-id"{print $2}')

# 3b. the initialized notification closes the handshake
curl -s -o /dev/null "${H[@]}" -H "Mcp-Session-Id: $SID" -X POST "$BASE/mcp" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3c. now the tool list — one entry for a globex agent, four for acme
curl -s "${H[@]}" -H "Mcp-Session-Id: $SID" -X POST "$BASE/mcp" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 4. a globex agent calling a gitmcp tool is refused before the upstream is
#    contacted: -32042, "upstream \"gitmcp\" is outside tenant \"globex\"'s subset".
#    Run the same call with an acme token as the control — it reaches gitmcp,
#    which answers on its own terms. That contrast is the demonstration: not
#    "both fail", but "one is refused by policy, the other gets through".
curl -s "${H[@]}" -H "Mcp-Session-Id: $SID" -X POST "$BASE/mcp" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"git__search_generic_code","arguments":{"owner":"cloudflare","repo":"workers-sdk"}}}'
```

Then sign into `https://enterprise.fold.run/console/` as each demo user and
compare the federation view — that comparison is the deliverable, and it shows
the user surface the agent checks above deliberately do not.
