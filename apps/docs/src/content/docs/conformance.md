---
title: Conformance
description: The official MCP conformance suite runs through fold on every merge — 40/40 checks — and the gaps that remain are documented, not hidden.
---

<!-- Source: fold README § Conformant, provably + § Not implemented — curate, don't fork; keep in sync with github.com/fold-run/fold -->

A gateway's core promise is invisibility: behavior through fold must match
hitting the upstream directly. That's not a slogan — it's a test that gates
every merge.

## 40/40, on every merge

The official [`@modelcontextprotocol/conformance`](https://github.com/modelcontextprotocol/conformance)
suite runs against fold fronting the reference everything-server in CI —
**40/40 checks**, including the hard parts that cross the gateway in both
directions: sampling (`sampling/createMessage`), elicitation, logging,
progress notifications, and resource subscriptions bridged from upstream
servers back to the originating client.

- The `conformance` job in [CI](https://github.com/fold-run/fold/blob/main/.github/workflows/ci.yml)
  runs on every push and pull request, pinned to a conformance-suite commit in
  [`scripts/conformance.sh`](https://github.com/fold-run/fold/blob/main/scripts/conformance.sh)
  so results are reproducible; the pin is bumped deliberately.
- A scheduled workflow re-runs the suite unpinned against the latest MCP Go
  SDK every week and opens an issue when upstream movement changes a result —
  drift is detected, not discovered.
- Reproduce locally from a fold checkout: `make conformance` (needs node).

The wire protocol itself — streamable HTTP, request/response and SSE — is the
official [MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk)'s own
implementation on both the client-facing and upstream-facing sides. fold
never hand-rolls protocol framing, so protocol correctness tracks the SDK.

## Latency is a test too

Invisibility includes not being felt: the `bench` CI job gates every merge on
**added p50 latency < 5 ms** through the proxy path (a loose bound for shared
runners — typical local numbers are ~0.20 ms added p50). See
[Architecture](/architecture/) for what runs on the hot path.

## Not implemented — on purpose, on record

fold documents its gaps instead of hiding them:

- **SEP-2575 `subscriptions/listen` streams.** The Go SDK supports the
  2026-07-28 protocol on its streamable HTTP server only in stateless mode,
  which fold cannot use: session-keyed bridging (sampling, elicitation,
  per-client streams) requires stateful sessions. Clients on the legacy
  handshake — what the SDK negotiates against stateful servers today — get
  full notification fan-in (list-changed and resource-updated). A drift
  canary in fold's test suite fails the moment the SDK lifts the
  restriction, so the gap closes when it can. Federated *tasks* (get, list,
  cancel, result, update — with mint-affinity routing and probe fallback)
  **are** implemented.
- **Content inspection (DLP / PII filtering / prompt-injection detection).**
  Deliberately out of scope: inspecting bodies means buffering and rewriting
  traffic, which conflicts with the invisibility rule and the latency gate.
  fold's [security model](/security/) is structural instead — deny-by-default
  allowlists, per-principal invisibility, claim-gated rules, credential
  brokering, and a full audit trail to feed the SIEM that does the detecting.

The authoritative list lives in the
[README's "Not implemented" section](https://github.com/fold-run/fold#not-implemented)
and is updated whenever a gap opens or closes.
