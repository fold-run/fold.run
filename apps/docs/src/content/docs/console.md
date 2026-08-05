---
title: The console
description: fold's embedded read-only dashboard and MCP test console at /console — what it shows, how it authenticates, and why there is no privileged path.
---

<!-- Source: fold README § server.console + docs/security-model.md § "The console has no privileged path" + gateway/console.go — curate, don't fork; keep in sync with github.com/fold-run/fold -->

One flag serves the fold console at `/console/`: a read-only observability dashboard for the federation, plus an MCP test console for exercising tools, prompts, and resources against the gateway. It's off by default, and it ships inside the binary — hand-written HTML/CSS/JS embedded at build time, no frameworks, no build step, and no external fetches (a strict `default-src 'self'` CSP pins every request the page makes to the gateway's own origin).

## Turning it on

```jsonc
"server": {
  "console": {
    "enabled": true,
    "groups": ["platform-ops"]   // optional viewer allowlist — see below
  }
}
```

Nothing else to deploy: the assets are in the `fold` binary you're already running. The console section lives under [`server`](/configuration/), so like the rest of that section it's wired at construction — enabling it is a restart, not a reload.

## The dashboard

`/console/` renders the state a gateway operator reaches for first, backed by `GET /console/api/state`:

- **Federation health** — every upstream with its circuit-breaker state and, for load-balanced upstreams, per-endpoint rotation (in rotation vs ejected), plus each upstream's source — static config vs [discovery](/discovery/) — and its credential-strategy *name*.
- **Discovery status** — the source URL, poll interval, and the last sync's outcome and timestamp.
- **Deployment facts** — gateway version, whether auth and EMA are on, the policy default decision and rule count, global and per-principal rate limits, whether cross-instance state is Redis-backed, audit sink types, and tracing enablement.

What it deliberately never carries: secret material of any kind. `secretRef` *names* are configuration shape and appear; values never do. The Redis URL is omitted entirely (it can embed credentials), and raw upstream connect errors — which can name secret env vars or internal hosts — are reduced to a category when auth is on, with the full text staying in gateway logs.

## The test console

The other half is a plain MCP client running in the browser, pointed at the gateway's own [`/mcp`](/operations/) endpoint. It lists tools, prompts, and resources with cursor-paginated lists, invokes them, and shows resource URIs passing through un-rewritten.

"Plain client" is the point: its traffic runs the full pipeline, indistinguishable from any other client's. Policy filters what it lists, denials answer `-32042`, rate limits apply, and every call lands in the audit trail. The console holds no credential of its own — a pasted Bearer token lives in page memory only, never storage — and reaches no endpoint a client couldn't. There is nothing to bypass governance *with*.

## Who can see it

The two surfaces have deliberately different rules:

- **Static assets** (`/console/`) are the same bytes for every caller and carry no data, so they serve unauthenticated.
- **The state API** (`/console/api/state`) is data, so it authenticates exactly like `/mcp` — with `auth.mode: "required"` it demands a valid Bearer token through the same verifier — and it shares `/mcp`'s global and per-principal rate budgets.

Its disclosure rule is broader than `/healthz`'s, and deliberately so: any authenticated principal, regardless of policy grants, sees the federation topology — the console exists to show it. If "any valid token holder" is too wide an audience — the usual case in multi-tenant deployments — set `server.console.groups`: the state API then answers `403` to any principal not carrying an allowlisted group, and every such denial exits through the audit sink like any other authorization decision. The allowlist requires `auth.mode: "required"` (validation enforces the combination), and the usual multi-issuer caveat applies: group names are only unique within an issuer, so keep the list meaningful across every issuer you trust.

The full trust story — including why this disclosure boundary sits where it does — is part of the [security model](/security/).
