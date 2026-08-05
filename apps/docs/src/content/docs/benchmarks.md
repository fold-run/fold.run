---
title: Benchmarks
description: What fold measures about its own overhead, how CI gates it on every merge, and how to reproduce it — including the numbers fold deliberately doesn't claim yet.
---

<!-- Source: fold bench/latency_test.go + README § Observability ("Latency, measurably") — curate, don't fork; keep in sync with github.com/fold-run/fold -->

Every performance number fold publishes traces to a runnable instrument in the repo. If a claim doesn't resolve to something on this page, treat it as a bug and [say so](https://github.com/fold-run/fold/issues).

## The instrument

[`bench/latency_test.go`](https://github.com/fold-run/fold/blob/main/bench/latency_test.go) measures the only number a gateway can't hand-wave: **added latency on the proxy path**. The same client calls the same upstream — an in-process echo server built from the official MCP Go SDK — twice: directly, and through a real gateway constructed with `gateway.New`. Each side runs 200 warmup calls and 2,000 measured sequential calls; the instrument compares p50s and prints p50/p90/p99 for both paths.

The `bench` CI job runs it on every merge and **fails the build if added p50 exceeds 5 ms**. That bound is deliberately loose for shared GitHub runners — in the instrument's own words, it gates regressions, not records.

## The numbers

| Measurement | Value | Environment |
|---|---|---|
| Added p50 (CI gate) | **< 5 ms**, enforced every merge | Shared GitHub Actions runner |
| Added p50 (typical) | **~0.20 ms** | Apple Silicon, in-process upstream |
| Gateway p99 (typical) | **≈ 0.57 ms** | Same run |

## Reading the numbers honestly

- **This measures fold's added work, not your deployment.** Loopback transport, a trivial echo upstream — the instrument isolates what the gateway adds (routing, policy, audit accounting, proxying) from everything it can't control (your network, your upstream's latency). Your end-to-end numbers are your upstream's numbers plus roughly what's in the table.
- **It's a latency instrument, not a throughput one.** Calls are sequential by design. **fold publishes no requests-per-second figure** — there is no load-test harness in the repo yet, and no throughput claim should be extrapolated from this page. When one ships, its numbers will land here with the same reproduce-it-yourself standard.
- **The gate and the typical number are different things.** 5 ms is a regression tripwire that has to survive noisy shared runners; ~0.2 ms is what the same instrument reports on quiet hardware. Quote the second, rely on the first.

In production, the same question is answered continuously by the [`fold_request_duration_seconds` and `fold_upstream_request_duration_seconds` histograms](/operations/#metrics) — the difference between them is the gateway's share of every real request.

## Reproduce it

```bash
git clone https://github.com/fold-run/fold && cd fold
make bench
# or directly — the test skips unless FOLD_BENCH=1:
FOLD_BENCH=1 go test ./bench -run TestAddedLatencyGate -v
```

The run prints p50/p90/p99 for the direct and proxied paths and a one-line `BENCH_RESULT` summary. The same command is what CI executes — the [`bench` job](https://github.com/fold-run/fold/blob/main/.github/workflows/ci.yml) on any merge is the public receipt, alongside [conformance](/conformance/).
