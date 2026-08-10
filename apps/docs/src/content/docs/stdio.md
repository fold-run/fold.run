---
title: Local stdio servers
description: fold-stdio, the shim that runs a local stdio MCP server and serves it over streamable HTTP, so the gateway federates it as an ordinary upstream.
---

<!-- Source: fold docs/stdio.md + docs/design-stdio.md + README § upstreams — curate, don't fork; keep in sync with github.com/fold-run/fold -->

fold federates streamable-HTTP MCP endpoints. Most MCP servers are not that — they are local processes speaking stdio. `fold-stdio` closes the gap: it runs one stdio server and exposes it over streamable HTTP.

Nothing in the gateway or the config document knows about stdio. A shimmed server is an `http://` upstream, so credential strategies, health checks, load balancing, breakers, timeouts, policy, pagination, and audit all apply with no special case.

## Quick start

```bash
fold-stdio --port 8091 -- npx -y @modelcontextprotocol/server-filesystem /data
```

Everything after `--` is the server command and its arguments. Then point an upstream at it like any other:

```json
{
  "upstreams": [
    { "id": "files", "url": "http://127.0.0.1:8091/mcp", "namespace": "files" }
  ]
}
```

Ships as its own binary and image (`ghcr.io/fold-run/fold-stdio`), with a compose profile.

## Flags

| Flag | Default | Purpose |
|---|---|---|
| `--port` | `8091` | Port to serve the MCP endpoint on |
| `--host` | `127.0.0.1` | Bind address — loopback by default; `0.0.0.0` is a deliberate act |
| `--max-sessions` | `64` | Concurrent sessions, **each of which is one child process** |
| `--max-body-bytes` | `1048576` | Request body cap, matching the gateway's default |
| `--env-passthrough` | *(none)* | Comma-separated variable names the server may see |
| `--dir` | *(this process's)* | Working directory for the server |
| `--bearer-env` | *(none)* | Variable holding a token callers must present |
| `--probe` | `false` | Start the server once to check it runs, then exit |
| `--log-format` | `text` | `text` \| `json` |
| `--log-level` | `info` | `debug` \| `info` \| `warn` \| `error` |

## Endpoints

- **`POST|GET|DELETE /mcp`** — the endpoint the gateway federates.
- **`GET /health`** — `200` when the server is runnable, `503` when it is not, plus session counters. Matches the gateway's own health semantics, so chart probes and `healthCheck.intervalMs` behave identically against a shim. Probing costs a process, so the answer is memoized for one second and single-flighted; a live session is itself proof of health, so the common case costs nothing.
- **`GET /metrics`** — `fold_stdio_sessions`, `fold_stdio_max_sessions`, `fold_stdio_spawned_total`, `fold_stdio_spawn_errors_total`, `fold_stdio_rejected_total`, `fold_stdio_build_info`.

## One process per session

Each downstream session gets its own child process. This is not a tuning knob: a stdio connection carries exactly one MCP session, so two sessions sharing a process would share a JSON-RPC id space and the replies would cross.

The practical consequences:

- **`--max-sessions` is a process ceiling.** The default of 64 is deliberately low enough that a misbehaving client cannot fork-bomb the host. A slot is held until its child is actually reaped, so open-and-abandon cannot run past the bound while old processes are still dying. At the ceiling the shim answers `503` with `Retry-After`, which the gateway's breaker reads as a temporarily unhealthy endpoint rather than a hard failure.
- **Idle sessions are swept after five minutes**, matching the gateway's own bridged-session sweep. A client that opens sessions and walks away without a `DELETE` would otherwise pin a process each, permanently.
- **Children run in their own process group**, swept on teardown. Wrappers like `npx` fork the real server and do not always forward signals; without the group kill those grandchildren would survive and reparent to PID 1 — which, in the shim's own image, is the shim.
- **Session count tracks connected clients.** The gateway opens one bridged session per downstream client to carry sampling, elicitation, logging, and progress, so a federation with many simultaneous clients on one shimmed server wants headroom. `fold_stdio_sessions` is the number to watch.
- **Memory is per process.** A server that loads a large index on start pays that cost per session; such servers are better run natively over HTTP.

## Security

**The command never comes from the network.** It is fixed at startup from argv — not from a request, not from a config document, not from discovery.

This is the whole security story, and it is why stdio is not a field in fold's config document. A `command` field would hand whoever controls the discovery document an `exec` on the gateway host, which would reduce [`allowedSecretRefs` and `allowedCredentialHosts`](/discovery/) to formalities.

**The child inherits nothing.** Its environment is built from `--env-passthrough` and contains only the named variables, so a shim holding its own bearer token in the environment does not hand it to the server it supervises.

```bash
fold-stdio --env-passthrough GITHUB_TOKEN,HOME \
  --bearer-env SHIM_TOKEN --host 0.0.0.0 \
  -- npx -y @modelcontextprotocol/server-github
```

**A non-loopback bind requires a token.** Binding wider than `127.0.0.1` without `--bearer-env` is refused at startup (exit 2), not merely discouraged: the shim executes a process on demand and must never be an open exec-over-HTTP surface on a shared network. The container entrypoint binds `0.0.0.0`, so the published image requires a bearer by construction.

**Browser-driven attacks are refused.** The shim re-applies the protections the SDK's handler would have: a loopback listener rejects a foreign `Host` (DNS rebinding — the attack that matters most for a shim on a developer machine, since a rebound page is same-origin and CORS never fires), cross-origin requests are checked, and POSTs must be `application/json` so a no-preflight "simple" request cannot reach the child.

## Why a sidecar

Process supervision lives in the shim rather than in the gateway on purpose. The gateway's security posture rests on it never executing anything; the moment a `command` can arrive through config or discovery, the containment fields above stop meaning much. Keeping the exec in a separately-run binary, with the command fixed at argv, keeps that boundary intact.

Next: [/configuration/](/configuration/) for the upstream entry a shim sits behind, or [/deployment/](/deployment/) for running both in containers.
