---
# Final identity — adopted 2026-08-06. Single source of truth.
name: fold
description: One governed endpoint between every MCP client and every MCP server.
colors:
  backplane: "#121212"
  rack: "#1a1a1a"
  trace: "#2b2b2b"
  signal: "#FFFFFF"
  static: "#BCBCBC"
  live: "#D6FF00"
  live-deep: "#b4d600"
  pulse: "#E9FF80"
  carrier: "#E0E0E0"
  down: "#ff4c79"
typography:
  display:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 4.6vw + 0.6rem, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.021em"
  title:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 1.6vw + 1.3rem, 2.375rem)"
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: "-0.014em"
  subtitle:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.008em"
  heading:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.008em"
  lead:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0.01em"
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0.01em"
  meta:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.02em"
  mono:
    fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.7
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
  section-desktop: "72px"
  section-tablet: "48px"
  section-mobile: "32px"
  container: "72rem"
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

The final fold identity: near-black grounds (Backplane #121212, Rack panels
#1a1a1a, Trace hairlines #2b2b2b), one signature acid lime (Live #D6FF00) reserved
for actions, active routes, and live-proof signals, IBM Plex Sans + Geist Mono
(both OFL, self-hosted). Surfaces are spaced rounded cards; CTAs are pills with
ink text; the hero carries a pointer-tracked aurora glow. The fold-line diagram
vocabulary (dashed routes, notch marks, the folded-corner mark) remains the
brand's drawing hand. Unified across fold.run and docs.fold.run.

## 2. Colors

### Primary
- **Live** `#D6FF00` — the one saturated move: primary pills (ink text, 16.2:1),
  active diagram routes, status-up, arrows, focus rings. **Live Deep** `#b4d600`
  hover. **Pulse** `#E9FF80` soft accents in graphics only.

### Neutral
- **Backplane** `#121212` ground · **Rack** `#1a1a1a` cards/code · **Trace**
  `#2b2b2b` hairlines · **Signal** `#FFFFFF` text (18.7:1) · **Static** `#BCBCBC`
  muted (9.9:1) · **Carrier** `#E0E0E0` links/badges/kicker-meta (14.2:1).

### Named Rules
- Live doubles as the status-up color (lime = alive = the proof-forward brand);
  **Down** `#ff4c79` is reserved for status failures only — the one hue outside
  the four-color palette, and status semantics are its only license.
- Live never carries text on a light ground (1.16:1 on Paper) and never carries
  light text on a dark one — it is a fill, and fills take ink.
- Docs light theme: Paper ground with **Live Ink** `#5a6b00` as text-accent (5.9:1).
- No gradients except the hero glow field; no new hues.

## 3. Typography

IBM Plex Sans (400/500/600/700) for all prose and display; Geist Mono for
everything operational (commands, config, status values, diagram annotations,
the kicker meta-line). Self-hosted woff2, font-display swap.

**Ramp** — 14 · 16 · 18 · 20 · 24 · 30–38 · 40–56. Sizes that sit next to each
other are at least a 1.25 step apart (body 16 → card heading 20 → section head
30+). Lead prose at 18 and headings at 20 are held apart by weight and colour,
not by size.

**Weights** — 400 prose · 500 UI labels (nav, footer links, badges) · 600 every
heading from the display down to card headings · 700 reserved for the wordmark
and the proof numerals. The display step is 600, not 800: at 56px the size
carries the hierarchy, and the lighter weight is what reads institutional
rather than launch-day.

**Leading and tracking** — light type on a dark ground reads lighter, so every
step carries more leading than it would on paper (body 1.65) and body-size
prose gets +0.01em. Tracking goes negative as size grows (-0.021em display,
-0.014em title, -0.008em headings) and positive at meta size (+0.02em).

**Measure** — prose 70ch, lead paragraphs 64ch, captions 34ch. Section heads
run as a split band: title in a 26rem column, standfirst beside it on the same
first baseline.

- **Earned-mono rule** (unchanged): mono content must be runnable or live.
- Mono carries `tabular-nums slashed-zero` wherever it sets a number — stats,
  latencies, versions, dates — so figures line up down a column and read as
  measurements.
- Mixed-case headings; terminal periods on section H2s are brand voice.
- `text-wrap: balance` on h1–h4, `pretty` on prose. A heading whose balanced
  break splits a phrase takes an authored `<br>` at the sentence instead.

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
