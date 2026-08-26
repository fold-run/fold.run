---
title: Benchmarks
description: What fold measures about its own overhead and throughput, how CI gates it, and how to reproduce every number on this page.
---

<!-- Source: fold docs/benchmarks.md + bench/latency_test.go + tools/perf — curate, don't fork; keep in sync with github.com/fold-run/fold -->

Every performance number fold publishes traces to a runnable instrument in the repo. If a claim doesn't resolve to something on this page, treat it as a bug and [say so](https://github.com/fold-run/fold/issues).

## The instruments

[`bench/latency_test.go`](https://github.com/fold-run/fold/blob/main/bench/latency_test.go) measures **added latency on the proxy path**: the same client calls the same upstream — an in-process echo server built from the official MCP Go SDK — directly and through a real gateway; 200 warmup + 2,000 measured sequential calls per side, comparing p50s. The `bench` CI job runs it on every merge and **fails the build if added p50 exceeds 5 ms** — deliberately loose for shared GitHub runners; it gates regressions, not records.

[`tools/perf`](https://github.com/fold-run/fold/blob/main/tools/perf/main.go) measures **throughput and tail latency** for one instance under a concurrency sweep: three processes (driver, the real `fold` binary, fixture upstream — never sharing a scheduler), where each "connection" is a full official-SDK client session doing sequential calls, retries disabled. Every stage runs direct and through-fold, so the upstream's own ceiling is visible and the gap between them is the honest cost.

Both of those default to one upstream exposing one trivial tool, which isolates proxy overhead but exercises none of the work that scales with federation size. Two Go benchmarks cover that separately — `BenchmarkFederatedListTools` for the merge path and `BenchmarkResolveTenant` for tenant lookup — measured gateway-side, with no network and no client SDK in the number. Isolating them matters: an end-to-end profile attributes most of its allocations to schema validation inside the *calling* client's SDK, which is not fold's cost to claim or to fix.

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

Passthrough mode measures within noise of namespaced. Raw sweep JSON is [in the repo](https://github.com/fold-run/fold/tree/main/launch).

Quote `tools/call`, not `tools/list`: the second rides the list cache and is bound by how big the response is, which is the table further down.

**Federation cost** (`tools/list`, gateway-side, warm caches — measured 2026-08-07): what one merged list costs the gateway itself, with no network and no client SDK in the measurement — fan-out, per-principal policy filter, namespace rewrite, and cursor fingerprint.

| Federation | Tools in list | ns/op | B/op | allocs/op |
|---|---|---|---|---|
| 1 upstream × 10 tools | 10 | 1,322 | 640 | 16 |
| 5 upstreams × 20 tools | 100 | 4,718 | 3,341 | 31 |
| 20 upstreams × 50 tools | 1,000 | **25,169** | 21,866 | 83 |
| 20 × 50, deny-by-default policy with globs | 1,000 | 44,903 | 21,863 | 83 |

Two properties worth stating because both were once false: a warm list-cache hit is **~55 ns and one allocation regardless of list size** — the parsed form is memoized rather than re-decoded per request — and **policy filtering allocates nothing**, which the last two rows show directly: identical allocation counts, so filtering 1,000 tools per principal is CPU only.

**Tenant resolution** (measured 2026-08-09): every authenticated request resolves its principal to at most one [tenant](/tenancy/), and it cannot stop at the first match, because refusing an ambiguous match means seeing every match. So the question is how many tenants a config can hold before that shows up in the latency gate.

| Tenants declared | One claim = one value | One group | Compound (issuer + claim + group) |
|---|---|---|---|
| 10 | 106 ns | 39 ns | 387 ns |
| 100 | 97 ns | 42 ns | 3,756 ns |
| 1,000 | 96 ns | 41 ns | 43,142 ns |
| 10,000 | **97 ns** | **41 ns** | **392,680 ns** |

Zero allocations in every cell, at every size. The two single-dimension shapes are **flat in the number of tenants** — ten thousand resolve as fast as ten — because each is a map lookup: the claim index is keyed by what the tenant requires and probed with the principal's value, the group index by what the principal holds. Before that index existed, the same 10,000-tenant document measured **450 µs per request**, which against a gateway whose whole added p50 is ~200 µs is not a rounding error but the dominant cost of the request.

The third column is what stays linear, at ~39 ns per declaration, and it's stated rather than buried: a selector combining conditions is matched one at a time, so keep those in the tens. Per-customer tenancy wants one claim or one group — which is what an IdP asserts about a customer anyway.

**Throughput** (`tools/list`, by federation shape, 64 connections) is **payload-bound, not gateway-bound**: the numbers move with how many tools are in the response, not with fold's routing work.

| Federation | Tools returned | Direct req/s | Through fold | fold p50 | fold p99 |
|---|---|---|---|---|---|
| 1 × 1 | 1 | 19,500 | **24,083** | 2.2 ms | 9.1 ms |
| 5 × 20 | 100 | 5,246 | **1,830** | 31.5 ms | 91.6 ms |
| 20 × 50 | 200 (one page of 1,000) | 2,749 | **1,069** | 54.8 ms | 143.5 ms |

Read that table with care, in two places. The direct column serves *one* upstream's tools while fold serves the merged page, so the columns encode different payloads and their ratio is **not** a retention figure — at 20 × 50, fold returns a 200-tool page against direct's 50. And fold exceeding direct in the first row is the list cache absorbing reads inside its TTL, not proxy throughput. The gateway's own share of this work is the 25 µs in the federation-cost table; the rest is JSON encoding and transport on both sides. The one honest cross-shape statement: fold's `tools/list` throughput falls ~22× as the federation grows from 1 tool to 1,000, and it is the response size doing that.

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

# Federation size is a variable, not a constant — set the shape:
FOLD_LOAD_UPSTREAMS=20 FOLD_LOAD_TOOLS=50 make loadtest

# Gateway-side costs, no network in the measurement:
go test ./gateway -run '^$' -bench BenchmarkFederatedListTools -benchmem
go test ./gateway -run '^$' -bench BenchmarkResolveTenant -benchmem -count=5
```

The gate prints p50/p90/p99 for both paths and a one-line `BENCH_RESULT`; the sweep prints the table above and a headline, with knobs for connections, duration, scenarios, JSON output, and driving an already-running deployment (`FOLD_LOAD_FOLD_URL`). The [`bench` job](https://github.com/fold-run/fold/blob/main/.github/workflows/ci.yml) on any merge is the public receipt, alongside [conformance](/conformance/); full methodology lives in the repo's [docs/benchmarks.md](https://github.com/fold-run/fold/blob/main/docs/benchmarks.md).
