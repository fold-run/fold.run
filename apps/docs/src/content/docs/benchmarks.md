---
title: Benchmarks
description: What fold measures about its own overhead and throughput, how CI gates it, and how to reproduce every number on this page.
---

<!-- Source: fold docs/benchmarks.md + bench/latency_test.go + tools/perf — curate, don't fork; keep in sync with github.com/fold-run/fold -->

Every performance number fold publishes traces to a runnable instrument in the repo. If a claim doesn't resolve to something on this page, treat it as a bug and [say so](https://github.com/fold-run/fold/issues).

## Two instruments

[`bench/latency_test.go`](https://github.com/fold-run/fold/blob/main/bench/latency_test.go) measures **added latency on the proxy path**: the same client calls the same upstream — an in-process echo server built from the official MCP Go SDK — directly and through a real gateway; 200 warmup + 2,000 measured sequential calls per side, comparing p50s. The `bench` CI job runs it on every merge and **fails the build if added p50 exceeds 5 ms** — deliberately loose for shared GitHub runners; it gates regressions, not records.

[`tools/perf`](https://github.com/fold-run/fold/blob/main/tools/perf/main.go) measures **throughput and tail latency** for one instance under a concurrency sweep: three processes (driver, the real `fold` binary, fixture upstream — never sharing a scheduler), where each "connection" is a full official-SDK client session doing sequential calls, retries disabled. Every stage runs direct and through-fold, so the upstream's own ceiling is visible and the gap between them is the honest cost.

## The numbers

**Added latency** (the gate's instrument):

| Measurement | Value | Environment |
|---|---|---|
| Added p50 (CI gate) | **< 5 ms**, enforced every merge | Shared GitHub Actions runner |
| Added p50 (typical) | **~0.20 ms** | Apple Silicon, in-process upstream |
| Gateway p99 (typical) | **≈ 0.57 ms** | Same run |

**Throughput** (`tools/call`, namespaced mode, v1.3.0 — Apple M4 Pro, loopback, zero errors across the sweep):

| Connections | Direct req/s | Through fold | fold p50 | fold p99 | Retention |
|---|---|---|---|---|---|
| 8 | 12,796 | **8,038** | 0.9 ms | 2.0 ms | 63% |
| 64 | 14,551 | **9,263** | 6.2 ms | 19.0 ms | 64% |
| 256 | 22,878 | **13,379** | 16.7 ms | 60.1 ms | 58% |

Passthrough mode measures within noise of namespaced. `tools/list` through fold runs at ~42,000 req/s, at parity with direct — that's the list cache absorbing reads inside its TTL, not proxy throughput; quote `tools/call`. Raw sweep JSON is [in the repo](https://github.com/fold-run/fold/tree/main/launch).

## Reading the numbers honestly

- **This measures fold's added work, not your deployment.** Loopback transport, a trivial echo upstream — the instruments isolate what the gateway adds (routing, policy, audit accounting, proxying via the official SDK) from everything they can't control (your network, your upstream's latency). Your end-to-end numbers are your upstream's numbers plus roughly the tables' gap.
- **Retention is the honest throughput framing.** The direct column is an in-process SDK server doing near-zero work per call; fold adds a full second hop through the same SDK. Against a real upstream doing real work, the relative overhead shrinks toward the latency gate's ~0.2 ms.
- **Sessions are the unit of concurrency.** Each load-test connection is a full SDK client session, with fold holding a per-client upstream session behind it — the deployment-realistic shape, not an artificial socket storm. One untuned instance, default config.
- **The gate and the typical number are different things.** 5 ms is a regression tripwire that has to survive noisy shared runners; ~0.2 ms is what the same instrument reports on quiet hardware. Quote the second, rely on the first.
- **Don't benchmark the [demo](/try-the-demo/).** demo.fold.run is rate-limited, containerized on fractional-vCPU hardware, and fronted by Cloudflare — it demonstrates federation, not fold's ceiling. The harness is one command; run that instead.

In production, the same questions are answered continuously by the [`fold_request_duration_seconds` and `fold_upstream_request_duration_seconds` histograms](/operations/#metrics) — the difference between them is the gateway's share of every real request.

## Reproduce it

```bash
git clone https://github.com/fold-run/fold && cd fold
make bench                                  # latency gate — what CI runs every merge
make loadtest                               # throughput sweep (8/64/256 connections)
FOLD_LOAD_MODE=passthrough make loadtest    # single-upstream mode
```

The gate prints p50/p90/p99 for both paths and a one-line `BENCH_RESULT`; the sweep prints the table above and a headline, with knobs for connections, duration, scenarios, JSON output, and driving an already-running deployment (`FOLD_LOAD_FOLD_URL`). The [`bench` job](https://github.com/fold-run/fold/blob/main/.github/workflows/ci.yml) on any merge is the public receipt, alongside [conformance](/conformance/); full methodology lives in the repo's [docs/benchmarks.md](https://github.com/fold-run/fold/blob/main/docs/benchmarks.md).
