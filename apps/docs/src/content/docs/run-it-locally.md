---
title: Run it locally
description: Kick the tires in five minutes — one container, one config file, a real federated gateway on localhost.
---

<!-- Source: fold compose.yaml + README § Quick start — curate, don't fork; keep in sync with github.com/fold-run/fold -->

<!-- TODO: restore a hosted demo walkthrough when a public gateway endpoint exists. -->

Five minutes, no signup: run fold on localhost in front of a real MCP server
and watch federation, namespacing, and the health surfaces work. Everything
here is the same binary and config you'd [deploy to production](/deployment/).

## One upstream, one container

Point fold at any streamable-HTTP MCP server you can reach — one of your own,
or a public one:

```bash
cat > fold.config.json <<'EOF'
{
  "upstreams": [
    { "id": "docs", "url": "https://docs.mcp.cloudflare.com/mcp", "namespace": "docs" }
  ]
}
EOF

docker run --rm -p 8080:8080 \
  -e FOLD_CONFIG="$(cat fold.config.json)" \
  ghcr.io/fold-run/fold:latest --host 0.0.0.0
```

(Prefer Go? `go run github.com/fold-run/fold/cmd/fold@latest --config fold.config.json`
does the same without Docker — see [Getting started](/getting-started/).)

## Poke at it

```bash
# Health: per-upstream connectivity, latency, breaker state
curl -s http://localhost:8080/health | jq

# Prometheus metrics
curl -s http://localhost:8080/metrics | grep fold_requests_total
```

Then point any MCP client at `http://localhost:8080/mcp`. You'll see one
virtual server whose tools carry the `docs__` prefix — fold merged the
upstream's list and namespaced it on the way through. Drop the `namespace`
field (single upstream only) and fold runs passthrough: behavior through the
gateway matches hitting the upstream directly.

## docker compose, with room to grow

The repo ships a [`compose.yaml`](https://github.com/fold-run/fold/blob/main/compose.yaml)
for the local/single-host shape — config mounted read-only, JSON logs, and an
optional Redis profile for multi-instance state:

```bash
git clone https://github.com/fold-run/fold.git && cd fold
cp fold.config.example.json fold.config.json   # then trim it to taste
docker compose up
# several instances sharing state:
docker compose --profile redis up
```

The image is distroless — no shell inside — so check health from the host:
`curl -fsS http://localhost:8080/health`.

## Turn on governance

[`fold.config.example.json`](https://github.com/fold-run/fold/blob/main/fold.config.example.json)
is a full federated example: two upstreams with different credential
strategies (RFC 8693 token exchange and a static API key), required OAuth
with an issuer allowlist, a deny-by-default policy, audit to stdout, and
tracing. Validate any edit before running it:

```bash
go run github.com/fold-run/fold/cmd/fold@latest --validate --config fold.config.json
```

`fold --schema` prints the config's JSON Schema for editor completion. When
localhost looks right, the [deployment guide](/deployment/) takes the same
config to Docker, Kubernetes, or a VM — and the
[configuration reference](/configuration/) covers every block you just used.
