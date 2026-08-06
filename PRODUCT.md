<!-- _provenance: writtenBy=stardust:direct writtenAt=2026-08-06T14:42:00Z
     against: "bolder, more distinctive dev-tool brand; refs konghq.com, infisical.com;
     unified token layer across fold.run and docs.fold.run"
     TARGET strategy for the redesign. Current-state snapshot lives in stardust/current/PRODUCT.md. -->

# Product

## Register

brand

## Users

- **Platform / infrastructure engineers** evaluating an MCP gateway: fluent in MCP,
  OAuth, Kubernetes; allergic to marketing; convinced by running code, wire captures,
  and honest numbers. They arrive from GitHub, HN, or a colleague's Slack link.
- **Engineering leaders and security owners** who sign off on the boundary: need the
  governance story (auth, policy, audit) legible within one scroll, and third-party
  proof (conformance, status, benchmarks) one click away.
- **Hands-on developers** who will judge fold by whether `Get started` → running
  gateway takes under a minute. Mostly desktop; mobile readers skim the pitch and
  star the repo for later.

Scene sentence: an infra engineer, 11 p.m., dark terminal on one monitor and this
site on the other, deciding whether fold is credible enough to bring to the platform
team tomorrow.

## Product Purpose

fold is the enterprise MCP gateway: one governed endpoint between every MCP client
and every MCP server — federation, auth, policy, caching, and audit on the official
MCP Go SDK. The site's job: prove it works in public (live demo, open status,
conformance, honest benchmarks) and get an engineer running it in 60 seconds.

## Brand Personality

- **Proof-forward.** Every claim ships with its receipt: the demo is live, the
  status feed is open JSON, the benchmarks argue against their own numbers. The
  redesign amplifies this — proof surfaces become the visual centerpiece, not
  footnotes.
- **Terminal-native, now with a drawing hand.** Monospace remains operational
  content (real commands, real config, real status). New: the fold-line drawing
  vocabulary — topology and pipeline diagrams drawn like tailor's pattern paper
  (dashed fold lines, notch marks, grain arrows) — gives the brand an ownable
  visual signature beyond type.
- **Committed, not loud.** One signature green (Live #00E599) carries every
  action and proof signal across both origins; near-black instrument-panel
  neutrals carry everything else. IBM Plex Sans + Geist Mono. Pills for
  actions, rounded cards, a pointer-tracked glow in the hero — never
  gradients-as-decoration, mascots, or superlatives.

- **One surface.** Marketing and docs share one token layer, one header, one
  footer, one CTA verb. A gateway that federates N servers into one endpoint
  presents itself as one federated brand.

## Anti-references

- **Generic-2026-SaaS silhouette** (oversized hero + dual-button pair + sticky nav
  + serial footer): "bolder" must come from the fold-line motif and color
  commitment, not from inflating the template.
- **Cyan/purple gradient SaaS, glassmorphism, dark-mode-as-costume**: fold's dark
  is inherited and literal (a terminal-native product), never decorated.
- **Monospace-as-costume**: mono appears only where content is genuinely
  operational. Marketing prose never sets in mono.
- **Editorial-magazine cosplay** (display serifs, italic drop caps, "the
  journal" vocabulary): wrong register for a wire-protocol gateway.
- **Kong/Infisical as templates**: they calibrate energy (committed color,
  developer-credible surfaces, enterprise trust below developer proof), but any
  layout or palette lift that would read as either brand is a failure —
  distinctive means fold-shaped.

## Design Principles

1. **Show the wire.** Prefer a live surface (demo output, status row, conformance
   count) or an authored diagram over any abstract claim. If a section can embed
   proof, it must.
2. **Draw the fold.** Diagrams use the pattern-paper vocabulary: Trace hairlines,
   dashed fold-lines for routes, notch marks for policy points, Live green for
   the active path. This is the brand's signature; no stock illustration ever.
3. **One system, two grounds.** Dark Backplane is canonical (marketing, docs
   default); Paper-ground (docs light) uses the same hue family via Route Deep.
   Tokens are shared; nothing is themed per-origin.
4. **Say it once.** One CTA verb per destination, one header, one footer, one
   voice. New copy uses periods and colons over em-dashes; captured copy is
   preserved as content.
5. **Honest numbers or no numbers.** Every stat carries its caveat inline or
   links to its receipt. A number without provenance is removed, not styled.

## Accessibility & Inclusion

- Text ≥4.5:1 on its ground everywhere (Static lifted to ≈#a6aac2 on Backplane;
  Route Deep, not Route, for text-on-Paper).
- `:focus-visible` ring (2px Route) on every interactive element, both origins.
- Diagrams carry meaningful `<title>`/`aria-label` descriptions of the topology,
  not "diagram".
- Reduced-motion: any added motion ships with a `prefers-reduced-motion` fallback.
