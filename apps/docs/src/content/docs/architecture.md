---
title: Architecture
description: How fold routes, bridges, and reloads a federation of MCP upstreams behind one governed endpoint.
---

<!-- Source: fold README.md "Request pipeline" / "Repository layout", cross-checked against fold's internal architecture notes — curate, don't fork; keep in sync with github.com/fold-run/fold -->

fold is a single Go binary that presents any number of upstream MCP servers as one virtual server. It's built directly on the official [MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk): the wire protocol — streamable HTTP, both request/response and SSE — is the SDK's own implementation on both the client-facing and upstream-facing sides, so fold never hand-rolls protocol framing. Internally, the gateway is an SDK `mcp.Server` wrapped in middleware that classifies, routes, authorizes, proxies, and audits every method call.

## Request pipeline

Every request to `POST /mcp` passes through the same ordered pipeline:

```
POST /mcp
 → host validation      DNS-rebinding protection (Host/Origin allowlist)
 → authenticate         Bearer → issuer allowlist → JWKS → audience → Principal
 → rate limit           global window → 429 + Retry-After
 → route                federated fan-out (lists) or namespaced routing
 → authorize            deny-by-default policy per invocation
 → per-upstream guards  rate limit, circuit breaker, request timeout
 → proxy                credentials attached, held SDK session per upstream
 → egress               per-principal list filtering, namespace rewriting
 → audit                one event per request, including denials (single exit door)
```

The order is an invariant, not an implementation detail: authentication always runs before rate limiting, routing always runs before authorization, and audit is the single exit door every terminal response passes through — including denials. See [Security model](/security/) for what each authentication and policy stage actually enforces.

Route resolves two shapes of request differently. A list call (`tools/list`, `prompts/list`, `resources/list`, ...) fans out to every upstream and merges the results; a named call (`tools/call`, `prompts/get`, ...) resolves the `{namespace}__{name}` prefix to exactly one upstream. Per-upstream guards then apply that upstream's own rate limit, circuit breaker, and request timeout before the call is proxied — a slow or failing upstream degrades in isolation rather than dragging down the rest of the federation.

Gateway-minted errors are a fixed, small set; anything an upstream itself returns passes through verbatim:

| Code | Meaning |
|---|---|
| `-32040` | Per-upstream rate limit exceeded |
| `-32041` | Upstream unavailable (circuit open / unreachable / all upstreams down) |
| `-32042` | Policy denied the invocation |
| `-32043` | Name does not resolve to a configured namespace |
| `-32002` | Task id not owned by any upstream |

## Multi-endpoint upstreams and health

An upstream can be configured with multiple equivalent replica URLs instead of one. New sessions balance across them round-robin, with connect failover to the next replica if one is unreachable; once a session picks an endpoint, it stays pinned there for the life of that session. A failed endpoint rests for the circuit breaker's configured cooldown before it's tried again.

Health checking is either passive or active. By default, health is passive: connect failures eject an endpoint and a cooldown period restores it. Configuring `healthCheck.intervalMs` adds an active probe loop — a full MCP connect on that interval — which ejects dead replicas before client traffic ever reaches them and restores recovered ones immediately, without waiting on live traffic to notice.

## Server-initiated traffic

MCP isn't purely request/response — servers can push sampling requests, elicitation, log messages, and progress notifications back to a client mid-call. fold bridges this traffic in both directions. Each upstream holds one shared root session for lists, reads, and subscriptions, plus a separate bridged session per connected downstream client, keyed by that client's session id. When a client makes a named invocation (`tools/call`, `prompts/get`, and the like), fold tracks that call's in-flight context so the SDK can route any upstream-initiated request — `sampling/createMessage`, elicitation, log messages, progress — back over the same stream the call arrived on. That's what lets clients without a standalone SSE stream still receive server-initiated traffic.

`resources/subscribe` is forwarded to the owning upstream and `resources/updated` notifications fan back out to subscribed clients; `completion/complete` routes by prompt namespace or resource ownership; a client's `logging/setLevel` propagates to its upstream sessions. Idle bridged sessions are swept after 5 minutes.

## Federated tasks

Task ids, like resource URIs, are opaque — clients persist them across sessions, so fold never rewrites them; it remembers ownership instead. A `tools/call` that mints a task (advertised in the result `_meta`) pins `taskId → upstream`, and `tasks/get`, `tasks/cancel`, `tasks/result`, and `tasks/update` route to that owner, whose errors pass through verbatim. A task fold never saw minted — from another gateway instance, or evicted from affinity — is located by a read-only `tasks/get` probe fanned across upstreams: the owner answers, everyone else returns a healthy "no," and only then does the mutating method go to the owner alone. `tasks/list` merges every upstream in deterministic id order and pages like the typed lists.

Task ownership is bound to the minting principal: another caller's task-scoped calls answer the same "unknown id" error as a task that doesn't exist, with no existence leak. Tasks fold has no ownership record for stay reachable by any caller via the probe fallback, and anonymous callers share one owner bucket, so no-auth deployments are unaffected.

## Reload and shared state

fold's reloadable configuration lives in one atomic snapshot: the upstream set and its indexes, the passthrough flag, and the policy engine. Every request loads that snapshot once and routes against it. A reload — triggered by `SIGHUP`, `--watch`, or the embedding API — validates the new configuration, swaps the snapshot, reuses any upstream whose config didn't change (its live sessions survive the reload), and drains the upstreams that were retired. Authentication, server, routing, audit, and tracing configuration are fixed at startup and can't change on reload.

Upstreams can also arrive dynamically: fold polls a `discovery.url` for a document of additional upstreams and merges it into the federation alongside the static config. A base-config reload and a discovery sync each preserve the other's contribution, and the merged document is validated as a whole before anything swaps in — a bad discovery document never partially applies. See [Discovery](/discovery/) for the Kubernetes producer that feeds it.

Rate-limit windows, circuit breakers, and list caches sit behind a shared-state interface with two implementations: in-memory by default, or Redis-backed (`REDIS_URL` / `server.redisUrl`) so a fleet of gateway instances behaves as one — shared rate-limit buckets, shared breaker state, shared cache. Redis outages fail open, bounded at 500 ms per operation, so a Redis blip degrades enforcement to per-instance rather than taking the gateway down.

## Naming and identity

Tools and prompts are exposed as `{namespace}__{name}`; a single upstream configured without a namespace runs in passthrough mode with no rewriting, which is why passthrough is only valid when exactly one upstream is configured — there'd otherwise be no way to tell two upstreams' `search` tools apart. Resource URIs are opaque and are never rewritten — fold instead remembers which upstream listed each URI ("resource ownership") and routes reads and subscriptions there. Policy filtering and namespace rewriting both happen at egress, the last pipeline stage before audit, so what a client sees already reflects both what it's allowed to see and which virtual name it should use to call it.

## Repository layout

| Path | Purpose |
|---|---|
| [`cmd/fold`](https://github.com/fold-run/fold/blob/main/cmd/fold) | The `fold` CLI |
| [`cmd/fold-discovery`](https://github.com/fold-run/fold/blob/main/cmd/fold-discovery) | The Kubernetes discovery-document producer |
| [`gateway`](https://github.com/fold-run/fold/blob/main/gateway) | Gateway engine: pipeline, federation routing, proxying, health |
| [`config`](https://github.com/fold-run/fold/blob/main/config) | Config schema + validation |
| [`auth`](https://github.com/fold-run/fold/blob/main/auth) | OAuth resource server (JWKS verifier) + upstream credential strategies |
| [`policy`](https://github.com/fold-run/fold/blob/main/policy) | Allowlist policy engine + per-principal list filtering |
| [`audit`](https://github.com/fold-run/fold/blob/main/audit) | Audit events + sinks (stdout, webhook) |
| [`docs`](https://github.com/fold-run/fold/blob/main/docs) | Deploy, operations, security-model, embedding, and defaults guides |
| [`internal/ratelimit`](https://github.com/fold-run/fold/blob/main/internal/ratelimit) | Sliding-window limiter |
| [`internal/breaker`](https://github.com/fold-run/fold/blob/main/internal/breaker) | Circuit breaker |
| [`internal/cache`](https://github.com/fold-run/fold/blob/main/internal/cache) | TTL cache with single-flight refresh |

fold is a single static binary with no local state, but the `gateway` package is also a Go library: embedding it directly into another Go service skips the CLI and `cmd/fold` entirely. See [Embedding](/embedding/) for that surface.

## See also

- [Security model](/security/) — the trust anchors, auth chain, and enforcement pair behind the `authenticate` and `authorize` pipeline stages.
- [Configuration](/configuration/) — the full config document these mechanisms read from.
- [Conformance](/conformance/) — how the official MCP conformance suite verifies the pipeline stays invisible.
- [Defaults](/defaults/) — every default in this pipeline, reviewed as a deliberate decision.
