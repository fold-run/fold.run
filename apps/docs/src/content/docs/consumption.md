---
title: Budgets & metering
description: Cap consumption over a calendar period, and record what was spent — upstream invocations, items served, and usage an upstream reports.
---

<!-- Source: fold README § server.budget + § v1.7.0 changelog + docs/design-consumption.md — curate, don't fork; keep in sync with github.com/fold-run/fold -->

A rate limit answers "how fast", and it forgets. A **budget** answers "how much this month", and it remembers: an allowance over a calendar period that accumulates until the period rolls over.

Both exist because they refuse different things. A sliding window smooths a burst and then forgets it happened, which is the correct behaviour for protecting an upstream from a stampede and the wrong one for bounding a month's spend.

Budgets are **absent by default**. A default allowance is a default outage waiting for a busy month.

## Where a budget can sit

```jsonc
{
  "server": {
    "budget": { "period": "month", "upstreamCalls": 2000000 }
  },
  "upstreams": [
    { "id": "crm", "url": "...", "budget": { "period": "day", "upstreamCalls": 50000 } }
  ],
  "tenants": [
    { "id": "acme", "subjects": { "groups": ["acme"] }, "budget": { "period": "month", "upstreamCalls": 500000 } }
  ]
}
```

| Scope | Field | Reloadable |
|---|---|---|
| The whole gateway | `server.budget` | No — construction-wired, like the rest of `server` |
| One upstream | `upstreams[].budget` | Yes |
| One tenant | `tenants[].budget` | Yes — see [/tenancy/](/tenancy/) |

`period` is `hour`, `day`, or `month`, UTC-aligned. `server.budget` is construction-wired deliberately: an allowance must not be widenable under a running gateway by editing config.

They are charged **narrowest-first** — upstream → tenant → server — so a refusal never spends a wider allowance.

## The unit is upstream invocations

Not client requests. One `tools/list` fans out to every upstream in the federation, so counting client requests would price a list the same as a ping.

This is also why budgets are checked **where the invocation really happens**, after the session is in hand. A rate limit, an open circuit, or a failed connect never spends the allowance — without that, an upstream down for a month would burn tens of thousands of units on calls nobody served.

## Exhaustion

An exhausted budget mints **`-32044`** with the `budget_exhausted` audit outcome. It is distinct from `-32040` (rate limit) because the remedies differ: a rate limit clears in seconds, a budget not until the period rolls over.

The error message names **the reset instant** rather than a retry delay. A client backing off by a monthly reset would sleep for a fortnight.

## Metering

Three additive audit fields record what fold observed, and nothing it did not:

| Field | Meaning |
|---|---|
| `upstreamCalls` | Upstream invocations this request caused — the unit budgets are charged in. |
| `itemsServed` | What a list handed *this* caller, after policy filtering. |
| `usage` | Carried verbatim from an upstream's result `_meta`. fold reports it, it does not compute it. |

Alongside them, `fold_request_upstream_calls` is a histogram of the fan-out per request, which makes the cost of a list visible in its own right.

**There is no tokenizer in the gateway.** fold governs MCP consumption, not model spend. An installation that needs both runs both.

## Shared state, and failing open loudly

A budget is only one allowance across a fleet if the instances share state — set `server.redisUrl` (or `REDIS_URL`). The gateway warns at startup when a budget is configured without it.

When a budget check cannot reach shared state, it degrades to **per-instance enforcement rather than to none**, and says so via `fold_budget_degraded_total`.

Alert on any non-zero rate on that counter. It means the fleet is not enforcing one allowance — three instances degrade into three copies of the budget.

Next: [/tenancy/](/tenancy/) for per-customer allowances, or [/operations/](/operations/) for the metrics and audit fields in full.
