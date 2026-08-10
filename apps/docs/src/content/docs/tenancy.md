---
title: Tenancy
description: Group principals into tenants and govern them as one — a shared allowance, a shared rate-limit bucket, a bounded view of the federation, and a name in the audit trail.
---

<!-- Source: fold README § tenants + docs/design-tenancy.md — curate, don't fork; keep in sync with github.com/fold-run/fold -->

A tenant is a named set of principals plus the governance that applies to them as a group. Before tenants existed, "team A sees these tools, gets this allowance, and appears separately in audit" had to be assembled from four unrelated mechanisms, and the word *tenant* appeared nowhere in the config, the audit stream, or the metrics.

The line the design holds above all: **a tenant groups principals, it does not authenticate them.** It is derived from the verified principal, never presented alongside a token, and never a trust anchor. [Policy](/configuration/#policy) remains the authority on what may be invoked.

Tenancy is additive by construction. Declare no tenants and a deployment behaves exactly as it did before the feature existed.

```jsonc
"tenants": [
  {
    "id": "acme",
    "subjects": { "claims": { "org_id": "acme-prod" } },  // same shape policy rules use
    "budget": { "period": "month", "upstreamCalls": 500000 },
    "rateLimit": { "requestsPerMinute": 2000 },           // one bucket for the whole tenant
    "upstreams": ["billing", "crm"]                        // optional: all upstreams if omitted
  }
]
```

| Field | Default | Notes |
|---|---|---|
| `id` | — | Lowercase alphanumeric + hyphens. Appears in every audit event the tenant's principals produce, and as the `tenant` label on `fold_tenant_*` metrics. |
| `subjects` | — | Required. Which principals belong, using the same shape policy rules use (`groups`, `subs`, `issuers`, `claims`). A tenant with no selector would capture every caller, so it is rejected. |
| `budget` | none | `{ period, upstreamCalls }` for the tenant as a whole. Charged in upstream invocations, only for calls that reach an upstream; exhaustion mints `-32044` naming the tenant. |
| `rateLimit` | none | `{ requestsPerMinute }`, one bucket shared by the tenant's principals; over it, `429` with `Retry-After`. |
| `upstreams` | all | Optional visibility subset by upstream id, evaluated before policy. |

Unlike [`server.budget`](/consumption/), tenants are **reloadable** — tenants change when a customer signs up, so a reload must be able to add one.

## One allowance and one bucket per team

This is the distinction that motivates the whole object. `server.rateLimit.perPrincipalPerMinute` gives each *person* a bucket, so ten agents on one team hold ten allowances between them. A tenant's `rateLimit` is one bucket shared by all of them — which is what "team A cannot flood team B" actually means.

The two orderings are deliberate and opposite:

- **Budgets charge narrowest-first** — upstream → tenant → server — so a refusal never spends a wider allowance.
- **Rate limits check widest-first** — global → tenant → per-principal — so a flood is refused before it costs any routing work.

## Visibility bounds the fan-out, not the result

`upstreams` filters which upstreams a tenant's callers reach, and it is evaluated **before** policy. The filtering happens at the fan-out, which has consequences worth knowing:

- An upstream outside the subset is **never asked**. It costs no request, no budget, and no partial-failure entry when it is down.
- A named invocation against it is refused ahead of the policy engine with `-32042`.
- `tasks/*` is the exception: those answer "no upstream owns that id" rather than a denial, matching the posture that path already takes for another principal's task. Where a refusal would reveal existence, it doesn't.
- A viewer's [console](/console/) shows *their* tenant's federation, not the operator's — closing the one place a dashboard could show a customer the topology its own traffic is refused.

## One tenant per principal, and ambiguity is refused

A principal belongs to at most one tenant. Where two selectors overlap, fold **refuses** rather than picking: assigning a caller by precedence would hand them another tenant's allowance and visibility the day someone reorders a list.

Some overlap is catchable at validation. Some is only decidable against a real principal — two selectors that collide for only some callers — and that is caught at request time and refused there. An unmatched principal has no tenant and is governed exactly as before tenancy existed.

## Resolution cost

Resolution is a map lookup for the two selector shapes a per-customer document repeats — one claim equalling one value, or one group. They are indexed at snapshot time, keyed from opposite sides: the claim index by what the tenant requires, the group index by what the principal holds.

Ten thousand tenants resolve in **97 ns with zero allocations**, the same as ten; a linear scan cost 450 µs at that size. Compound selectors still scan, so keep those in the tens. Methodology and the full table: [/benchmarks/](/benchmarks/).

## In the record

With tenants configured, the dimension appears in both observability surfaces:

- **Audit** — `tenant` on every event its principals produce, denials included.
- **Metrics** — `fold_tenant_requests_total{tenant,outcome}` and `fold_tenant_upstream_calls_total{tenant}`, the second counting the unit a tenant budget is charged in, so an allowance can be watched being spent.

These are new metric *names* rather than a `tenant` label added to the existing ones. Label sets are frozen by the [compatibility contract](/embedding/#what-is-api), and a new label would break every dashboard built on them.

Next: [/consumption/](/consumption/) for how budgets are charged and metered, or [/configuration/](/configuration/) for the rest of the document.
