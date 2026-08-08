---
title: Embedding in Go
description: Mount fold's gateway inside your own Go service — construction, hot reload, and the frozen v1 API surface.
---

<!-- Source: fold docs/embedding.md + README § API stability — curate, don't fork; keep in sync with github.com/fold-run/fold -->

The `fold` binary is a thin CLI over a public Go API: build a `Gateway` from the config document, mount its `http.Handler`, close it on shutdown. The example below mirrors the [package examples](https://pkg.go.dev/github.com/fold-run/fold/gateway), which are part of fold's test suite and compile in CI.

```go
package main

import (
    "log"
    "log/slog"
    "net/http"

    "github.com/fold-run/fold/config"
    "github.com/fold-run/fold/gateway"
)

func main() {
    cfg, err := config.Parse([]byte(`{
        "upstreams": [
            {"id": "github", "url": "https://mcp.example.com/mcp", "namespace": "github"}
        ]
    }`))
    if err != nil {
        log.Fatal(err)
    }

    gw, err := gateway.New(cfg, gateway.WithLogger(slog.Default()))
    if err != nil {
        log.Fatal(err)
    }
    defer gw.Close()

    log.Fatal(http.ListenAndServe("127.0.0.1:8080", gw.Handler()))
}
```

## Notes

- **Config** comes from `config.Parse` (bytes), `config.Load` (file path), or a `config.Config` you construct; `gateway.New` validates either way. `config.Schema()` returns the JSON Schema if you want to lint documents in your own tooling — see [Configuration](/configuration/) for the full document reference.
- **`Handler()`** serves the MCP endpoint plus the operational endpoints (`/health`, `/metrics`, and the OAuth endpoints when auth/EMA are configured) — mount it at the root of a listener, not under a prefix. fold does not terminate TLS; that's your server's job.
- **`WithLogger`** supplies a `*slog.Logger` for operational events; without it the gateway is silent. Per-request accounting is in `/metrics` and the audit sinks, not the log stream.
- **`Close()`** drains upstream sessions, stops background loops (sweeper, discovery, health probes), and flushes buffered trace spans. It's safe to call more than once.

## Hot reload

`Reload` applies a new document to a running gateway — the embedder equivalent of the CLI's SIGHUP/`--watch`:

```go
next, err := config.Parse(newDocument)
if err != nil {
    // reject the push; the running config is untouched
}
if err := gw.Reload(next); err != nil {
    // also fine: validation failures and changes to construction-wired
    // sections (auth, server, routing, audit, tracing, discovery) are
    // rejected loudly while the old configuration keeps serving
}
```

The upstream set and policy engine swap atomically; upstreams whose config is unchanged keep their live sessions; removed ones drain; connected clients receive `list_changed`. Discovery-sourced upstreams (if the `discovery` section is configured) survive a base reload unchanged.

## What is API

The stable embedding surface is defined by fold's v1 compatibility contract, in force as of v1.0.0. **Frozen at v1.0** (breaking changes only with a new major version):

- **The config document** — field names, meanings, defaults, and validation semantics. The machine-readable contract is [`config/fold.config.schema.json`](https://github.com/fold-run/fold/blob/main/config/fold.config.schema.json) (`fold --schema`), kept in lockstep with the code by test. Defaults are part of the freeze — every one was reviewed as a deliberate decision before v1.0 (see [Defaults](/defaults/)).
- **The `fold` CLI** — flags, exit codes, and `FOLD_CONFIG` semantics.
- **The wire surface** — gateway-minted JSON-RPC error codes, HTTP endpoints (`/mcp`, `/health`, `/metrics`, `/.well-known/*`, `/oauth/token`), metric names and label sets, and the audit event JSON shape.
- **Go, for embedders** — the `gateway` package (`New`, `Option`, `WithLogger`, `Gateway.Handler`/`Reload`/`Close`, `Version`), the `config` package's document structs and `Load`/`Parse`/`Validate`/`Schema`, plus the contract types the gateway hands outward: `auth.Principal` with `WithPrincipal`/`PrincipalFromContext`, and `audit.Event`/`Outcome`. See the [package example](https://pkg.go.dev/github.com/fold-run/fold/gateway).

**Wiring, not API** (may change in any release): the constructors the gateway threads through its packages — `auth.Verifier`/`EMA`/`UpstreamCredentials`, `policy.Engine`, `audit.Logger`/`Sink`. They're exported so the gateway can reach them across package boundaries, not as an extension surface. `internal/` packages are never API.

**Upgrades and deprecation.** fold follows semver: within a major version, upgrades are drop-in — new config fields and capabilities arrive in minors, nothing frozen changes. Anything slated for removal is deprecated in a minor release (documented in the changelog, with the replacement) and removed no sooner than the next major. Security fixes land on the latest minor as patch releases.

One practical use of the contract types: the verified caller rides the request context, so middleware you wrap *inside* fold's handler chain — or tool-side code in the same process — can read it with `auth.PrincipalFromContext(ctx)`.
