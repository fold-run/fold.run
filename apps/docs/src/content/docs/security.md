---
title: Security model
description: The trust anchors, inbound auth chain, and enforcement pattern that make fold a governed boundary rather than a transparent pipe.
---

<!-- Source: fold docs/security-model.md — curate, don't fork; keep in sync with github.com/fold-run/fold -->

What fold trusts, what it enforces, and how the pieces compose.

## Trust anchors

Four configuration values are trust anchors — compromising any of them compromises the gateway. Validation forces each onto `https` (loopback exempt for development):

| Anchor | Why it is one |
|---|---|
| `auth.issuers[].issuer` / `jwksUri` | The inbound identity root: forging a principal only requires substituting the key set. Issuers are allowlisted and checked before any network I/O; JWKS fetches are single-flighted, size-bounded, and timeout-bounded so unknown-`kid` floods can't be amplified against the IdP. |
| `auth.ema.idpIssuer` / `idpJwksUri` | The same, for the ID-JAG exchange path. |
| Upstream `tokenEndpoint`s | Carry client secrets (`client-credentials`, `token-exchange`). |
| `discovery.url` | Decides where traffic routes and where credentials attach: whoever controls the document can add upstreams. Documents are strictly parsed, size-capped (4 MiB), and validated whole against the running config — a collision with a static upstream rejects the entire document. |

## The inbound chain

Every `/mcp` request passes, in order: host/origin allowlist (DNS-rebinding protection) → body-size cap → Bearer verification (trusted issuer, JWKS signature, exact audience per RFC 8707, non-empty `sub`, asymmetric algorithms only — RS/ES/EdDSA) → global and per-principal rate limits → routing → policy → per-upstream guards → the upstream. Every terminal response — including the refusals — produces exactly one audit event; audit is the single exit door. See [Architecture](/architecture/) for the full pipeline diagram.

With `auth.mode: "required"`, failed verification answers 401 with a `WWW-Authenticate` challenge pointing at `/.well-known/oauth-protected-resource` (RFC 9728), which the gateway publishes.

### Enterprise-Managed Authorization (EMA)

With EMA configured, fold additionally acts as a deliberately one-grant-wide authorization server:

```jsonc
{
  "ema": {
    "idpIssuer": "https://acme.okta.com",
    "idpJwksUri": "https://acme.okta.com/oauth2/v1/keys",
    "signingKeyRef": "FOLD_EMA_KEY",
    "tokenTtlSec": 600,
    "tokenRateLimitPerMinute": 600
  }
}
```

`POST /oauth/token` exchanges an enterprise-IdP ID-JAG (Identity Assertion JWT Authorization Grant, RFC 7523 `jwt-bearer`) for a short-lived fold-signed access token. Each assertion's `jti` is single-use — recorded fleet-wide via Redis when configured, so a captured ID-JAG can't be redeemed twice — the token endpoint is rate-limited against amplification, and issuers marked `mode: "exchange"` are never accepted as direct bearer issuers. Everything fold accepts afterward has `aud = fold`, which keeps upstream token exchange coherent.

## Enforcement: the invisibility pair

Policy is deny-by-default and enforced twice: named invocations (`tools/call`, `prompts/get`, `resources/read`, and the completions and subscriptions derived from them) are denied outright, **and** list results are filtered per principal — a caller never sees a tool it can't call. Protocol plumbing (ping, the lists themselves) is not policy-gated; invisibility plus call-denial is the enforcement pair.

Rules match subjects, groups, issuers, and verified token claims (ABAC). Subjects, groups, and claim names are only meaningful within an issuer, so rules should pin `issuers` whenever more than one IdP is trusted — otherwise a lower-assurance IdP could mint a principal that satisfies a rule written for another.

Task ownership follows the same principle: a task minted through the gateway is bound to the minting principal, and another caller's requests for it answer exactly like an unknown id — no existence leak.

## Credentials never travel further than configured

Upstream credentials (API keys, exchanged tokens, passthrough bearers) attach per outgoing request and only to requests bound for a configured endpoint host of that upstream. Two layers enforce it: the HTTP client refuses cross-host redirects outright, and the transport re-checks the destination host before attaching anything — a hostile upstream answering 3xx can't capture a credential. The token-endpoint client refuses redirects entirely, not just cross-host ones: Go replays POST bodies on 307/308, and those requests carry the client secret and, under token-exchange, the caller's own bearer token as `subject_token` — so a redirecting token endpoint would otherwise hand both to the host it names.

Each upstream picks one credential strategy:

| Strategy | Identity at the upstream | When |
|---|---|---|
| `none` | — | Trusted network, no upstream auth. |
| `static` | A shared API key. | API-key upstreams. |
| `passthrough` | The caller's raw Bearer token, forwarded as-is. | Upstreams doing strict RFC 8707 audience checks will reject it — prefer token-exchange. |
| `client-credentials` | fold's own service identity for that upstream. | Tokens cached until 60s before expiry. |
| `token-exchange` (RFC 8693) | The end user, in a token minted for that upstream's audience. | **Recommended enterprise default** — preserves user identity end-to-end. Cached per `(upstream, subject)`. |

`passthrough` and `token-exchange` derive per-principal credentials, so both require `auth.mode: "required"` — without a verified caller identity there's no subject to exchange for, and passthrough would forward whatever header an anonymous caller supplied. Exchanged tokens cache per `(upstream, issuer, subject)`; per-caller strategies disable list caching, so one caller's per-user list can never serve another.

Secrets never appear in the config document — `secretRef` fields name environment variables — and `/healthz` withholds URLs, owners, and error text (which can name env vars or internal hosts) unless auth is disabled, i.e. on deployments already private by posture.

## Audit: every terminal response, one exit door

One JSON event is emitted per terminal response — including 401s, 403-equivalents, and 429s, the events a SOC team actually hunts for — carrying the principal, the upstream, the authorization decision plus the matching rule id, the outcome, and latency. Sinks are configurable (stdout, webhook); webhook delivery is asynchronous and batched, so shipping audit events never adds request latency. Because audit sits at the single exit door in the pipeline (see [Architecture](/architecture/)), nothing that reaches a terminal response can bypass it — a denial is exactly as auditable as a success.

## Discovery moves an authorization boundary — treat it that way

With dynamic discovery, *who can register an upstream* becomes a security decision made outside fold — on Kubernetes with `fold-discovery`, it's whoever can create or label a Service in a watched namespace (see [Discovery](/discovery/) for the mechanics). Three consequences, each with a control:

- **Credential references are the sharp edge.** A registered upstream chooses both its `secretRef` names and its destination URL — ungated, that's an exfiltration path for any gateway-held secret, and `passthrough` would forward caller tokens to a URL of the registrant's choosing. Two independent gates close it: the producer refuses credentialed strategies and secret references by default, and the gateway enforces its own `discovery.allowedAuthStrategies` / `allowedSecretRefs` / `allowedCredentialHosts` allowlists as a backstop, rejecting a violating document whole. Set the gateway-side allowlists whenever the discovery source isn't operated by the gateway's own operators.
- **Identity claims need bounds.** A registration colliding with a static upstream id makes the gateway reject every future document — fail-safe, but a freeze an attacker can cause, so alert on `fold_discovery_syncs_total{outcome="rejected"}`. Among discovered entries, namespace prefixing requires both the upstream id and the MCP namespace to carry the registering Kubernetes namespace's prefix; contested claims drop every claimant, so list order can't hand an identity to whoever sorts earlier.
- **Policy is the exposure gate, and wildcards defeat it.** A discovered upstream is inert until a policy rule grants its tools — unless rules use `"server": "*"`, which makes every future registration instantly callable. With discovery enabled, name servers explicitly in allow rules.

## Tenant isolation under load

The global rate limit protects the gateway; `perPrincipalPerMinute` gives each authenticated principal its own bucket so one tenant's flood can't 429 the rest. Per-upstream limits and circuit breakers protect fragile backends; with Redis, all of this state — plus EMA replay protection — is fleet-wide. Redis outages fail open, bounded at 500 ms per operation: the gateway degrades to per-instance enforcement rather than going down.

## What fold deliberately does not do

Content inspection — DLP, PII filtering, prompt-injection detection — is out of scope by design. Inspecting request and response bodies means buffering and rewriting traffic, which conflicts with fold's invisibility rule (behavior through the gateway matches hitting the upstream directly) and its latency gate. fold's security model is structural instead: deny-by-default allowlists, per-principal invisibility, claim-gated (ABAC) rules, credential brokering so agents never hold upstream keys, and a complete audit trail feeding the SIEM that does the detecting.

For vulnerability reporting and the supported-versions policy, see [SECURITY.md](https://github.com/fold-run/fold/blob/main/SECURITY.md) at the repo root — this page is the architecture, that one is the process.

## See also

- [Architecture](/architecture/) — the full request pipeline these controls sit inside.
- [Configuration](/configuration/) — `auth`, `policy`, `audit`, and `discovery` field references.
- [Conformance](/conformance/) — how the official MCP conformance suite verifies the gateway stays invisible.
- [Defaults](/defaults/) — every default reviewed as a deliberate security decision.
