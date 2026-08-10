---
title: Configuration
description: The full reference for fold's configuration document — upstreams, auth, policy, audit, server, routing, discovery, and tracing.
---

<!-- Source: fold README § Configuration + § Error codes — curate, don't fork; keep in sync with github.com/fold-run/fold -->

fold is configured with **one JSON document**, validated on startup (`fold --validate`). Load it from `--config <path>` or the `FOLD_CONFIG` environment variable, which accepts either a file path or the JSON itself inline.

A JSON Schema for the document ships with fold — [`config/fold.config.schema.json`](https://github.com/fold-run/fold/blob/main/config/fold.config.schema.json), printed by `fold --schema`, and included in release archives. Point your editor at it for completion and inline validation. The schema is the structural contract (fields, types, enums, required properties) and is kept in lockstep with the code by test; cross-field rules — namespace requirements, `https` mandates — remain `fold --validate`'s job, so a schema-valid document can still fail validation.

## `upstreams` (required)

One entry per MCP server folded into the gateway.

| Field | Default | Notes |
|---|---|---|
| `id` | — | Lowercase alphanumeric + hyphens. Used in policy, audit, health. |
| `url` | — | The upstream's MCP endpoint. Exactly one of `url` / `urls`. |
| `urls` | — | Multiple equivalent replicas of this upstream. New sessions balance round-robin across them with connect failover; a failed endpoint rests for the breaker's `halfOpenAfterMs`. |
| `namespace` | none | Tool/prompt name prefix (`{namespace}__{name}`). Omitted → passthrough; only valid with a single upstream. |
| `protocol` | `session` | `"session"` negotiates the sessionful handshake, required to bridge server-initiated traffic (sampling, elicitation, logging, progress). `"auto"`/`"2026-07-28"` lets the SDK prefer the stateless 2026 protocol, which cannot carry server-initiated requests. |
| `owner` | none | `{ org, team, contact }` — surfaces in audit and health. |
| `labels` | none | Free-form string map for reporting. |
| `auth` | `{"strategy":"none"}` | Upstream credential strategy — see below. |
| `timeouts` | `5s/60s` | `connectMs`, `requestMs`. |
| `circuitBreaker` | `5 / 30s` | `failureThreshold` consecutive failures open the circuit; a probe is admitted after `halfOpenAfterMs`. |
| `rateLimit` | none | `{ requestsPerMinute }` for this upstream only. |
| `budget` | none | `{ period, upstreamCalls }` — a consumption allowance for this upstream over a calendar period. See [/consumption/](/consumption/). |
| `healthCheck` | none | `{ intervalMs }` — actively probe every endpoint (full MCP connect) on this interval, ejecting dead replicas before client traffic hits them and restoring recovered ones immediately. Absent → passive health (connect failures eject, cooldown restores). |
| `cacheTtlMs` | `30000` | TTL for cached list results. Negative disables caching. |

List freshness works end to end: when an upstream emits a `list_changed` notification, the gateway invalidates its cache **and re-emits the notification to every connected client**, so clients refetch and see the change immediately. TTLs remain the backstop when no notification arrives.

A single upstream with no `namespace` runs **passthrough** — tool and prompt names pass through unmodified. Any additional upstream requires every upstream to carry a `namespace`, so names never collide across the federation.

**Stdio servers.** `url` is always an HTTP endpoint — the gateway never runs a process. To federate an MCP server that speaks stdio (which is most of them), put [`fold-stdio`](/stdio/) in front of it: the shim runs the server and exposes it over streamable HTTP, so the upstream entry is an ordinary `url` and every strategy, guard, and policy rule applies unchanged. The command is fixed at the shim's argv and never travels over the network, which is why stdio is not a field here.

## Upstream auth strategies

| Strategy | Fields | When |
|---|---|---|
| `none` | — | Trusted network, no upstream auth. |
| `static` | `secretRef`, `header?`, `scheme?` | API-key upstreams. `secretRef` names an environment variable. |
| `passthrough` | — | Forwards the client's Bearer token as-is. Upstreams doing strict RFC 8707 audience checks will reject it — prefer token-exchange. |
| `client-credentials` | `tokenEndpoint`, `clientId`, `clientAuth`, `scopes?`, `resource?` | Service identity per upstream. Tokens cached until 60s before expiry. |
| `token-exchange` | `tokenEndpoint`, `clientId`, `clientAuth`, `audience`, `scopes?` | RFC 8693 — exchanges the caller's token for an upstream-audience token, preserving user identity end-to-end. **Recommended enterprise default.** Cached per (upstream, subject). |

`passthrough` and `token-exchange` derive per-principal credentials, so they require `auth.mode: "required"` — without a verified caller identity there is no subject to exchange for, and passthrough would forward whatever header an anonymous caller supplied.

`clientAuth` is `{ "type": "client_secret_post" | "client_secret_basic", "secretRef": "..." }`. Token endpoints must use `https` (loopback exempt). Upstream credentials are attached per request and bound to the configured upstream host: the gateway refuses cross-host redirects and never re-attaches a credential to another host, so a hostile upstream cannot capture the API key (or a passthrough caller's token) with a 3xx. Exchanged tokens are cached per `(upstream, issuer, subject)`. List results are not cached for `passthrough`/`token-exchange` upstreams, since those may be per-user.

## `auth` (gateway authentication)

```jsonc
{
  "mode": "required",                     // "disabled" (default) | "required"
  "resource": "https://gw.example.com",   // canonical resource URI = required token audience (RFC 8707)
  "issuers": [
    {
      "issuer": "https://acme.okta.com",
      "jwksUri": "https://acme.okta.com/oauth2/v1/keys",  // default: {issuer}/.well-known/jwks.json
      "groupsClaim": "groups"             // Okta "groups", Entra "roles", Auth0 custom-namespaced
    }
  ]
}
```

With `mode: "required"`, every `/mcp` request needs a valid Bearer token: trusted issuer (checked before any network I/O), verified signature via cached JWKS, exact audience match, a non-empty `sub`, asymmetric algorithms only (RS/ES/EdDSA). Failures answer `401` with a `WWW-Authenticate` challenge pointing at `/.well-known/oauth-protected-resource` (RFC 9728), which the gateway publishes. Issuer and JWKS URLs must use `https` (loopback exempt) — they are the inbound trust anchor. The JWKS fetch is single-flighted, size-bounded, and timeout-bounded so an unauthenticated flood of unknown-`kid` tokens cannot be amplified into requests against the IdP.

### `auth.ema` (Enterprise-Managed Authorization)

fold can embed a deliberately one-grant-wide MCP Authorization Server: `POST /oauth/token` exchanges an enterprise-IdP-issued **ID-JAG** (Identity Assertion JWT Authorization Grant, RFC 7523 `jwt-bearer`) for a short-lived fold-signed access token. Everything the gateway then accepts has `aud` = fold, which keeps upstream token exchange coherent.

```jsonc
{
  "mode": "required",
  "resource": "https://gw.example.com",
  "issuers": [
    { "issuer": "https://acme.okta.com", "mode": "exchange" }  // ID-JAGs only — never accepted directly
  ],
  "ema": {
    "idpIssuer": "https://acme.okta.com",
    "idpJwksUri": "https://acme.okta.com/oauth2/v1/keys",  // default: {idpIssuer}/.well-known/jwks.json
    "signingKeyRef": "FOLD_EMA_KEY",   // env var: ES256 private key, PKCS#8 PEM
    "tokenTtlSec": 600,                // minted-token lifetime (default 600)
    "tokenRateLimitPerMinute": 600     // cap on the unauthenticated /oauth/token endpoint (default 600)
  }
}
```

An assertion must be issued by `idpIssuer` for the `resource` audience and carry `exp` and `jti`; each `jti` is single-use until it expires (recorded fleet-wide via Redis when configured), so a captured ID-JAG cannot be redeemed twice. Issuers with `mode: "exchange"` are excluded from direct token presentation and from the advertised `authorization_servers` — fold itself is the authorization server for those, publishing its minting key at `/.well-known/jwks.json` and announcing the `io.modelcontextprotocol/enterprise-managed-authorization` extension in the protected-resource metadata. The token endpoint is unauthenticated by design (the assertion is the credential) and rate-limited against amplification. Generate a key with `openssl ecparam -genkey -name prime256v1 | openssl pkcs8 -topk8 -nocrypt`.

See [/security/](/security/) for how this fits the inbound trust model.

## `policy`

```jsonc
{
  "defaultDecision": "deny",
  "rules": [
    {
      "id": "eng-github",
      "subjects": { "groups": ["engineering"] },   // and/or "subs"; omit → any principal
      "allow": [
        { "server": "github", "methods": ["tools/call"], "names": ["get_*", "create_pr"] },
        { "server": "search" }                     // all methods/names on that upstream
      ]
    }
  ]
}
```

First matching rule allows; otherwise `defaultDecision` — **fold denies by default** when no rule matches. Policy governs named invocations (`tools/call`, `prompts/get`, `resources/read`), the completions and subscriptions derived from them (`completion/complete` is gated behind the prompt/resource it completes; `resources/subscribe` behind the resource), and it **filters list results per principal** — callers never see tools, prompts, or resources they cannot reach. Protocol plumbing (ping, the lists themselves) is not policy-gated; invisibility plus call-denial is the enforcement pair.

Scope a rule to specific token issuers with `"subjects": { "issuers": ["https://corp.okta.com"], "groups": [...] }`. Subjects and group names are only unique within an issuer, so **when more than one issuer is trusted, pin rules to an issuer** — otherwise a lower-assurance IdP could mint a principal that matches a rule written for another.

Attribute-based rules match on verified token claims: `"subjects": { "claims": { "dept": "eng", "mfa": true } }`. Every listed claim must match — the token claim equals the value, or, when the token carries an array (like an entitlements list), contains it. Values are JSON scalars (string, number, bool). Claims gate like issuers: they combine with `subs`/`groups` as an additional requirement, or stand alone as the whole subject. The same issuer-pinning caveat applies — claim names mean whatever each IdP says they mean, so pin claim-based rules to an issuer when more than one is trusted. Richer conditions (device posture, network location) belong in the IdP, surfaced to fold as claims.

## `audit`

```jsonc
{ "sinks": [ { "type": "stdout" }, { "type": "webhook", "url": "https://siem.example.com/ingest", "headers": { "x-api-key": "..." } } ] }
```

One JSON event per terminal response — including 401s, 403-equivalents, and 429s — with principal, upstream, authz decision + rule id, outcome, and latency. Webhook delivery is asynchronous and batched, so audit never adds request latency. Audit is the single exit door: every request through the pipeline produces exactly one event.

## `server`

| Field | Default | Notes |
|---|---|---|
| `mcpPath` | `/mcp` | Path the gateway serves MCP on. |
| `allowedHosts` | localhost set | DNS-rebinding protection: allowed Host/Origin hostnames. Set to your public hostname(s) in production, or `["*"]` only behind a trusted proxy. |
| `rateLimit` | none | Global `{ requestsPerMinute }` across all upstreams, plus optional `perPrincipalPerMinute` capping each authenticated principal on its own bucket, so one caller's flood cannot 429 the others. For a bucket shared by a *team* rather than one per person, see [`tenants`](#tenants). |
| `budget` | none | `{ period, upstreamCalls }` — a consumption allowance across every upstream, accumulating until the calendar period rolls over. Construction-wired like the rest of this section: a reload rejects a change to it, so an allowance cannot be widened under a running gateway. See [/consumption/](/consumption/). |
| `maxBodyBytes` | 1 MiB | Request body cap; larger bodies are answered `413` (chunked bodies are cut off at the cap). |
| `redisUrl` | `REDIS_URL` env | `redis://` URL sharing cache, rate-limit, and breaker state across gateway instances. Absent → in-process state. Redis outages fail open (bounded 500 ms per operation). |

Setting `redisUrl` (or `REDIS_URL`) is what makes a fleet of gateway instances behave as one — see [/deployment/](/deployment/) for running fold behind a load balancer.

## `routing`

| Field | Default | Notes |
|---|---|---|
| `namespaceSeparator` | `__` | Separator between namespace and bare name in public tool/prompt names. Must not contain lowercase letters, digits, or hyphens (the namespace alphabet). |
| `pageSize` | `200` | Per-page bound on federated list results (tools, prompts, resources, templates, tasks). Fold merges and policy-filters every upstream's full list, then serves it in pages; cursors are opaque, bound to the calling principal, and expire when the underlying snapshot changes (the client receives `-32602` and restarts the list — `list_changed` notifications already prompt refetches). Negative disables pagination (single merged page). |

## `discovery`

Discovery lets fold poll a URL for `{"upstreams": [...]}` (same schema as the static section) and hot-swap the discovered set into the federation alongside statically configured upstreams — a team ships an MCP server, a registry lists it, and it appears behind the gateway without anyone touching fold's config. Base reloads and discovery syncs each preserve the other's contribution, and a bad document or unreachable source is rejected whole, leaving the last good set serving.

The full field reference — `url`, `intervalMs`, `bearerSecretRef`, and the `allowed*` credential-containment fields for a partially trusted registry — lives on [/discovery/](/discovery/).

## `tenants`

Groups principals for governance: a shared allowance, a shared rate-limit bucket, a bounded view of the federation, and a name in the audit trail. A tenant is resolved from claims the IdP already asserts — it never travels alongside a token. **A tenant groups principals; it does not authenticate them**, and policy remains the authority on what may be invoked.

```jsonc
"tenants": [
  {
    "id": "acme",
    "subjects": { "claims": { "org_id": "acme-prod" } },  // same shape policy rules use
    "budget": { "period": "month", "upstreamCalls": 500000 },
    "rateLimit": { "requestsPerMinute": 2000 },           // one bucket for the whole tenant
    "upstreams": ["billing", "crm"]                        // optional: all upstreams if omitted
  }
]
```

| Field | Default | Notes |
|---|---|---|
| `id` | — | Lowercase alphanumeric + hyphens. Appears in every audit event the tenant's principals produce, and as the `tenant` label on `fold_tenant_*` metrics. |
| `subjects` | — | Required. Which principals belong, using the same shape policy rules use. A tenant with no selector would capture every caller, so it is rejected. |
| `budget` | none | `{ period, upstreamCalls }` for the tenant as a whole; exhaustion mints `-32044` naming the tenant. |
| `rateLimit` | none | `{ requestsPerMinute }`, one bucket shared by the tenant's principals. |
| `upstreams` | all | Optional visibility subset by upstream id, evaluated before policy. |

A principal belongs to at most one tenant, and ambiguous overlap is refused rather than guessed. Unlike `server.budget`, tenants are **reloadable** — they change when a customer signs up. Declare none and nothing changes.

The full treatment — charge ordering, what visibility filtering does to the fan-out, resolution cost at ten thousand tenants — is on [/tenancy/](/tenancy/).

## `tracing`

```jsonc
{
  "otlpEndpoint": "http://otel-collector:4318",  // OTLP/HTTP collector; a bare base URL gets the standard /v1/traces path
  "serviceName": "fold",                         // resource service.name (default "fold")
  "sampleRatio": 1.0                             // sampling for traces fold roots itself; parent-based, so sampled callers stay sampled
}
```

Absent, fold still propagates the caller's W3C trace context. Present, fold emits its own spans: one server span per MCP request — carrying method, tool/prompt name, routed upstream, policy decision + rule id, principal, and outcome, the same fields as the audit event — and one client span per upstream call with its guard outcome (ok, rate-limited, circuit open, error). Spans export through a batching processor, so the request path never waits on the collector.

## Hot reload and construction-wired sections

`kill -HUP` the process (or run with `--watch` to poll the config file) and fold revalidates and applies the new document without dropping the listener: the upstream set and policy engine swap atomically, in-flight requests finish against the snapshot they started on, and connected clients get `list_changed` notifications so they refetch. Embedders get the same behavior via `gw.Reload(cfg)`.

The `auth`, `server`, `routing`, `audit`, `tracing`, and `discovery` sections are wired in at construction and **cannot hot-swap** — changing any of them makes the reload fail loudly while the running configuration keeps serving; a rejected reload never takes anything down. Everything else — `upstreams`, `policy`, `tenants` — reloads live.

`tenants` is deliberately on the reloadable side while `server.budget` is not: tenants change when a customer signs up, whereas a gateway-wide allowance that could be widened under a running process would not be much of a ceiling.

See [/operations/](/operations/) for how reloads and discovery syncs surface in logs and metrics.

## Error codes

Gateway-minted JSON-RPC errors — everything else passes through from the upstream verbatim:

| Code | Meaning |
|---|---|
| `-32040` | Per-upstream rate limit exceeded |
| `-32041` | Upstream unavailable (circuit open / unreachable / all upstreams down) |
| `-32042` | Policy denied the invocation |
| `-32043` | Name does not resolve to a configured namespace |
| `-32044` | Consumption budget exhausted for the period (server, upstream, or tenant) |
| `-32002` | Task id not owned by any upstream |

Next: [/deployment/](/deployment/) for running fold in production, or [/security/](/security/) for the trust model behind `auth`, `policy`, and `discovery`.
