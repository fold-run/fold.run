---
# Final identity — adopted 2026-08-06. Single source of truth.
name: fold
description: One governed endpoint between every MCP client and every MCP server.
colors:
  backplane: "#0c0d0d"
  rack: "#131415"
  trace: "#242628"
  signal: "#FAFAFA"
  static: "#94979E"
  live: "#00E599"
  live-deep: "#00cc88"
  pulse: "#34D59A"
  carrier: "#C9CBCF"
  down: "#ff4c79"
typography:
  display:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 6.5vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 3vw, 2.4rem)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  mono:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
  section-desktop: "64px"
  section-tablet: "48px"
  section-mobile: "32px"
  container: "68rem"
components:
  button-primary:
    backgroundColor: "{colors.live}"
    textColor: "{colors.backplane}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.signal}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
  card:
    backgroundColor: "{colors.rack}"
    rounded: "{rounded.md}"
    padding: "24px"
  code-panel:
    backgroundColor: "{colors.rack}"
    textColor: "{colors.signal}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
  link:
    textColor: "{colors.carrier}"
---

# Design System: fold

## 1. Overview

The final fold identity: near-black grounds (Backplane #0c0d0d, Rack panels
#131415, Trace hairlines #242628), one signature green (Live #00E599) reserved
for actions, active routes, and live-proof signals, IBM Plex Sans + Geist Mono
(both OFL, self-hosted). Surfaces are spaced rounded cards; CTAs are pills with
ink text; the hero carries a pointer-tracked aurora glow. The fold-line diagram
vocabulary (dashed routes, notch marks, the folded-corner mark) remains the
brand's drawing hand. Unified across fold.run and docs.fold.run.

## 2. Colors

### Primary
- **Live** `#00E599` — the one saturated move: primary pills (ink text, 11.7:1),
  active diagram routes, status-up, arrows, focus rings. **Live Deep** `#00cc88`
  hover. **Pulse** `#34D59A` soft accents in graphics only.

### Neutral
- **Backplane** `#0c0d0d` ground · **Rack** `#131415` cards/code · **Trace**
  `#242628` hairlines · **Signal** `#FAFAFA` text · **Static** `#94979E` muted
  (6.6:1) · **Carrier** `#C9CBCF` links/badges/kicker-meta.

### Named Rules
- Live doubles as the status-up color (green = alive = the proof-forward brand);
  **Down** `#ff4c79` is reserved for status failures only.
- Docs light theme: Paper ground with **Live Ink** `#1d7f5c` as text-accent (4.95:1).
- No gradients except the hero glow field; no new hues.

## 3. Typography

IBM Plex Sans (400/500/600/700) for all prose and display; Geist Mono for
everything operational (commands, config, status values, diagram annotations,
the kicker meta-line). Self-hosted woff2, font-display swap. Display weight 700,
heading 600. `text-wrap: balance` on h1–h3; 70ch measure.

- **Earned-mono rule** (unchanged): mono content must be runnable or live.
- Mixed-case headings; terminal periods on section H2s are brand voice.

## 4. Elevation

Hierarchy by background-step + 1px Trace borders; radius vocabulary 6/10/14px,
pills for actions. The hero glow field (blurred Live + faint blue radials,
pointer-tracked) is the one permitted luminous element.

## 5. Components

- **Buttons**: pill, 46px, Live fill + ink text (primary) or Trace outline +
  Signal text (secondary); trailing arrow glyph.
- **Cards**: Rack ground, 1px Trace border, 10px radius, 24px padding; grids
  spaced (24px gap), interactive cards carry a Live corner arrow.
- **Code panel**: Rack, 10px radius, Geist Mono, context tag + copy button.
- **Topology diagram**: fold-line vocabulary; active path in Live with grain
  arrow; nodes Rack with Trace strokes; aria-label required.
- **Chrome**: one header (mark + Docs-first nav + pill CTA) and one footer
  (brand column + Product/Deploy/Project + legal strip) on every page of both
  origins. The mark: square tile, Live folded corner, Live-Deep crease.

## 6. Do's and Don'ts

### Do:
- Reserve Live for action and proof; let the neutrals carry everything else.
- Embed receipts (live demo, status, conformance, caveated numbers).
- Draw topology in the fold-line vocabulary; author every diagram.

### Don't:
- No second saturated hue; no gradients outside the hero glow; no shadows on dark.
- No mono for marketing prose; no fabricated stats, logos, or badges.
- No per-origin theming; docs and marketing consume these tokens only.
