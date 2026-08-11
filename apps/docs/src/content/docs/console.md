---
title: The console
description: fold's embedded read-only dashboard and MCP test console at /console — what it shows, how it authenticates, and why there is no privileged path.
---

<!-- Source: fold README § server.introspection + § server.console + docs/operations.md § HTTP endpoints + docs/security-model.md § "The console has no privileged path" + docs/design-console.md — curate, don't fork; keep in sync with github.com/fold-run/fold -->

Two flags serve the fold console at `/console/`: a read-only observability dashboard for the federation, plus an MCP test console for exercising tools, prompts, and resources against the gateway. Both are off by default, and the page ships inside the binary — no separate deployment, no build step at your end, and no external fetches (a strict `default-src 'self'` CSP pins every request the page makes to the gateway's own origin).

## Turning it on

```jsonc
"server": {
  "introspection": {
    "enabled": true,             // the read APIs: /api/federation, /api/auth-hint
    "groups": ["platform-ops"]   // optional viewer allowlist — see below
  },
  "console": {
    "enabled": true              // the browser page that renders them
  }
}
```

**The page requires the API.** The dashboard is an ordinary client of `GET /api/federation`, so `console.enabled` without `introspection.enabled` is refused at startup rather than degraded — the two move together. They are configured separately because the reverse is useful on its own: an operator scripting against the federation snapshot shouldn't have to serve a browser page to get it.

Both sections live under [`server`](/configuration/), so like the rest of that section they're wired at construction — enabling either is a restart, not a reload.

:::caution[Upgrading from v1.8 or earlier]
v1.9 renamed these with no aliases. `server.console.groups` became `server.introspection.groups`; `server.console.enabled` alone no longer serves the dashboard. The endpoints moved too — `/console/api/state` → `/api/federation`, `/console/api/auth` → `/api/auth-hint`. Two renames fail silently rather than loudly: the metric label `fold_http_rejections_total{reason="console_viewer"}` is now `reason="introspection_viewer"`, so a dashboard or alert selecting the old value simply stops matching, and the audit denial string `principal not in console viewer allowlist` is now `principal not in introspection viewer allowlist`, so a SIEM rule matching it goes quiet.
:::

## The dashboard

`/console/` is a routed application rather than one scrolling document, with filters, sort, and selection carried in the URL — so "the upstream that is down" is a link you can paste, not a description you have to give. Deep links route on the fragment (`#/upstreams?view=map`), because the gateway serves the assets from an embedded file server with no SPA fallback. Five views:

- **Overview** — deployment facts in one place: gateway version, whether auth and EMA are on, the policy default decision and rule count, global and per-principal rate limits, whether cross-instance state is Redis-backed, audit sink types, and tracing enablement.
- **Upstreams** — every upstream with its circuit-breaker state and, for load-balanced upstreams, per-endpoint rotation (in rotation vs ejected), plus each upstream's source — static config vs [discovery](/discovery/) — and its credential-strategy *name*. Discovery's source URL, poll interval, and last sync outcome sit alongside.
- **A drawing of the federation**, at `#/upstreams?view=map` — one gateway node fanning out to every upstream, each route carrying that upstream's live state: Live where the breaker is closed, Down where the connect failed, the neutral ramp for half-open, which is neither. It's generated from `/api/federation`, not authored, which makes it the one fold diagram that redraws itself when your topology changes.
- **An upstream in full** — a single upstream's health, endpoints, and governance on its own route.
- **The catalog** — a searchable index of what the federation exposes.

What the dashboard deliberately never carries: secret material of any kind. `secretRef` *names* are configuration shape and appear; values never do. The Redis URL is omitted entirely (it can embed credentials), and raw upstream connect errors — which can name secret env vars or internal hosts — are reduced to a category when auth is on, with the full text staying in gateway logs.

## The test console

The other half is a plain MCP client running in the browser, pointed at the gateway's own [`/mcp`](/operations/) endpoint. It lists tools, prompts, and resources with cursor-paginated lists, invokes them, and shows resource URIs passing through un-rewritten.

"Plain client" is the point: its traffic runs the full pipeline, indistinguishable from any other client's. Policy filters what it lists, denials answer `-32042`, rate limits apply, and every call lands in the audit trail. The console holds no credential of its own — a pasted Bearer token lives in page memory only, never storage — and reaches no endpoint a client couldn't. There is nothing to bypass governance *with*.

Rather than have operators paste a token at all, add an OAuth block and the console signs users in with Authorization Code + PKCE against a trusted issuer:

```jsonc
"console": {
  "enabled": true,
  "oauth": { "clientId": "fold-console" }   // + "issuer" / "scopes" as needed
}
```

Register `{origin}/console/` as the redirect URI at the IdP; `issuer` picks among multiple trusted issuers when you trust more than one.

## Who can see it

The two surfaces have deliberately different rules:

- **Static assets** (`/console/`) are the same bytes for every caller and carry no data, so they serve unauthenticated.
- **The federation API** (`/api/federation`) is data, so it authenticates exactly like `/mcp` — with `auth.mode: "required"` it demands a valid Bearer token through the same verifier — and it shares `/mcp`'s global and per-principal rate budgets. (`/api/auth-hint` is unauthenticated by design: it carries only the public SPA configuration a browser needs *before* it has a token.)

Its disclosure rule is broader than `/health`'s, and deliberately so: any authenticated principal, regardless of policy grants, sees the federation topology — the console exists to show it. One boundary narrows it: a viewer whose principal resolves to a [tenant](/tenancy/) carrying an `upstreams` subset sees that subset and nothing else, counts included — a dashboard that ignored the subset would be the one place a tenant could read another's upstream URLs.

If "any valid token holder" is still too wide an audience — the usual case in multi-tenant deployments — set `server.introspection.groups`: the API then answers `403` to any principal not carrying an allowlisted group, and every such denial exits through the audit sink like any other authorization decision. The allowlist requires `auth.mode: "required"` (validation enforces the combination), and the usual multi-issuer caveat applies: group names are only unique within an issuer, so keep the list meaningful across every issuer you trust.

The full trust story — including why this disclosure boundary sits where it does — is part of the [security model](/security/).

## Where the source lives

Since v1.9 the page's HTML/CSS/JS is maintained in [fold-run/fold-console](https://github.com/fold-run/fold-console) and vendored into the gateway at a pinned commit — a browser app was being reviewed and released on a proxy path's cadence, and the two have nothing to do with each other. It's still embedded in the binary you run, so nothing about what you receive changed.

The assets stay checked in rather than fetched at build time because the Go module proxy is fold's distribution channel: `go run github.com/fold-run/fold/cmd/fold@latest` has to build from the proxy zip alone, which runs no generators and carries no submodule content. The pin is a commit SHA rather than a tag, CI re-downloads the pinned artifact and diffs it, and the sync PR is never auto-merged — the page runs same-origin with a live Bearer token in memory, so a pin bump is a supply-chain change.
