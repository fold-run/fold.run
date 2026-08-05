---
title: Try the live demo
description: Walk through demo.fold.run — three public MCP servers behind one governed endpoint, including federated tasks and the live console.
---

<!-- Source: the demo's own config (fold.run repo, apps/demo) — every request below was verified against the running gateway; keep in sync with the deployed federation -->

`https://demo.fold.run/mcp` is a real fold gateway — the unmodified release binary — federating three public MCP servers. No signup, no key: point any MCP client (or `curl`) at it. Rate-limited, unauthenticated, no warranty; the monitor on [fold.run/status](https://fold.run/status/) MCP-pings it every five minutes.

| Namespace | Upstream | Notes |
|---|---|---|
| `cfdocs__*` | Cloudflare's MCP docs server | A real third-party upstream |
| `git__*` | GitMCP | A public 2025-era server on the session handshake — behind the gateway, just another namespace |
| `jobs__*` | fold-demo-tasks | A task-minting server (Go, on the official SDK); where the [federated-tasks story](https://fold.run/blog/federating-mcp-tasks/) runs live |

Every example below is plain `curl`. Responses arrive as a one-event SSE body — read the `data:` line.

## 0. Open a session

fold's client side is the official Go SDK's streamable HTTP server, so requests ride a session: `initialize` once, capture the `Mcp-Session-Id` response header, send it on everything after.

```bash
DEMO=https://demo.fold.run/mcp
SID=$(curl -s -D - -o /dev/null -X POST $DEMO \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2026-07-28","capabilities":{},"clientInfo":{"name":"me","version":"0"}}}' \
  | grep -i mcp-session-id | tr -d '\r' | cut -d' ' -f2)

curl -s -o /dev/null -X POST $DEMO -H "mcp-session-id: $SID" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
```

The `initialize` result already shows the gateway working: `serverInfo.name` is `fold`, and the instructions line names the three namespaces.

## 1. One virtual server

```bash
curl -s -X POST $DEMO -H "mcp-session-id: $SID" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

One merged tool list — `cfdocs__*`, `git__*`, and `jobs__*` side by side. fold fanned the request out to all three upstreams, namespaced the names, and merged the results in one page (deterministic order, cursor-paginated past `routing.pageSize`). If an upstream were down you'd still get the other two, with the failure named in `_meta["run.fold/partialFailure"]` instead of a dead endpoint. Repeat calls inside the TTL are served from the [list cache](/configuration/).

## 2. Start a long-running job

```bash
curl -s -X POST $DEMO -H "mcp-session-id: $SID" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"jobs__start_job","arguments":{"label":"my job","seconds":15}}}'
```

The minted task rides the result's `_meta`, origin-tagged by the gateway:

```json
{ "result": {
    "_meta": {
      "task": { "taskId": "demo-job-2", "status": "working", "label": "my job", "remainingMs": 14999, "createdAt": "…" },
      "pollIntervalMs": 1000,
      "run.fold/upstream": "demo-tasks"
    },
    "content": [{ "type": "text", "text": "started demo-job-2 (\"my job\", 15s) — poll it with tasks/get" }] } }
```

Because the mint is visible in `_meta`, fold pinned `taskId → upstream` affinity as the response passed through — and a tool call is a tool call, so deny-by-default policy would have applied at mint and the call is in the audit trail.

## 3. Poll it — fold routes to the owner

```bash
curl -s -X POST $DEMO -H "mcp-session-id: $SID" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tasks/get","params":{"taskId":"demo-job-2"}}'
```

`tasks/list` shows the merged view across the whole federation — your job in task-id order, with `_meta["run.fold/partialFailure"]` naming the two upstreams that don't speak tasks at all:

```bash
curl -s -X POST $DEMO -H "mcp-session-id: $SID" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tasks/list"}'
```

No tool name, no routing hint — fold resolves the owner from its affinity index, or by a read-only probe across upstreams for a task it never saw minted (try it: task ids survive sessions, so `tasks/get` from a brand-new session still finds the owner). Mutating methods are never fanned out; `tasks/cancel` and `tasks/result` locate first, then act on the owner alone. The mechanism is the subject of [the launch post](https://fold.run/blog/federating-mcp-tasks/).

## 4. The 2025-era upstream you address the same way

```bash
curl -s -X POST $DEMO -H "mcp-session-id: $SID" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"git__fetch_generic_documentation","arguments":{"owner":"modelcontextprotocol","repo":"servers"}}}'
```

GitMCP speaks the 2025-era session handshake. fold — built on the official Go SDK on both sides of the proxy — holds its own client session to it, so from where you're standing it's just another namespace in the same tool list, behind the same governance.

## 5. Watch it in the console

Open **[demo.fold.run/console](https://demo.fold.run/console/)** — the read-only [fold console](/console/), enabled in the demo's config. The dashboard shows the three upstreams, their breaker state, and the deployment facts live; the test console is a plain MCP client against the same `/mcp` endpoint you've been curling, governed and audited like any other caller.

## Run this yourself

The demo is assembled from one config — the same shape as any fold deployment ([configuration reference](/configuration/)):

```jsonc
{
  "upstreams": [
    { "id": "cf-docs",    "url": "https://docs.mcp.cloudflare.com/mcp", "namespace": "cfdocs" },
    { "id": "gitmcp",     "url": "https://gitmcp.io/docs",              "namespace": "git" },
    { "id": "demo-tasks", "url": "https://tasks.fold.run/mcp",          "namespace": "jobs" }
  ],
  "server": {
    "rateLimit": { "requestsPerMinute": 300 },
    "console": { "enabled": true }
  }
}
```

`go run github.com/fold-run/fold/cmd/fold@latest --config fold.config.json` gives you the same thing in front of your own servers — see [Getting started](/getting-started/).
