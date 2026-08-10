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
  carrier: "#E0E0E0"
  action: "#FFFFFF"
  action-hover: "#D4D4D4"
  trace-bright: "#3D3D3D"
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
  sm: "0px"
  md: "2px"
  lg: "2px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
  section: "clamp(3rem, 5.2vw, 5.5rem)"
  section-lg: "clamp(4rem, 7.5vw, 7.5rem)"
  section-sm: "clamp(2rem, 3vw, 2.75rem)"
  container: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.backplane}"
    rounded: "{rounded.md}"
    padding: "0 22px"
  button-secondary:
    backgroundColor: "transparent"
    borderColor: "{colors.trace-bright}"
    textColor: "{colors.signal}"
    rounded: "{rounded.md}"
    padding: "0 22px"
  card:
    backgroundColor: "{colors.rack}"
    borderColor: "{colors.trace}"
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

Near-black grounds (Backplane #121212, Rack panels #1a1a1a, Trace hairlines
#2b2b2b), IBM Plex Sans + Geist Mono (both OFL, self-hosted), and one drawn
wordmark. Every corner is machined at 2px, buttons included. Surfaces are flat
panels on hairlines; elevation is a background step, never a shadow and never a
gradient border. The fold-line diagram vocabulary (dashed routes, notch marks,
grain arrows) is the brand's drawing hand. Unified across fold.run and
docs.fold.run.

**The rule the system turns on: Live is a proof signal, not a colour scheme.**
Acid lime #D6FF00 is licensed to things that are actually running, measured,
current, or focused — status readouts, the active route in a topology drawing,
the focus ring, the mark's turned facet. It is never an action, never a bullet,
never a decorative arrow, never a syntax-highlight class. Actions run on the
neutral ramp: a Signal-white fill with Backplane ink, which is the brightest
element on any given page and needs no hue to win. When Live carried the buttons
*and* the arrows *and* the card corners *and* every JSON key in the docs, it had
stopped signalling anything; /status is the page where it is allowed to be
everywhere, because there every mark of it is a live reading.

## 2. Colors

### Neutral — carries the interface
- **Backplane** `#121212` ground · **Rack** `#1a1a1a` cards/code · **Rack Hi**
  `#212121` hover step · **Trace** `#2b2b2b` hairlines · **Trace Bright**
  `#3D3D3D` hover borders · **Signal** `#FFFFFF` text (18.7:1) · **Static**
  `#BCBCBC` muted (9.9:1) · **Carrier** `#E0E0E0` links/labels (14.2:1).

### Action — the brightest neutral, not a colour
- **Action** `#FFFFFF` fill with Backplane ink (18.7:1); **Action Hover**
  `#D4D4D4`. Secondary actions are transparent on a Trace Bright hairline.

### Live — proof only
- **Live** `#D6FF00`. The complete licensed list: status-up readouts, the active
  route and grain arrow in a topology drawing, `:focus-visible` rings, the brand
  mark's turned facet, and the footer's live status dot. Anything not on that
  list takes a neutral.
- **Down** `#ff4c79` is reserved for status failures only — the one hue outside
  the palette, and status semantics are its only license.
- Live never carries text on a light ground (1.16:1 on Paper) and never carries
  light text on a dark one — it is a fill, and fills take ink.
- Docs light theme: Paper ground with **Live Ink** `#5a6b00` (5.9:1) standing in
  for Live wherever the proof signal has to survive the theme flip.
- No gradients anywhere; no new hues. Code syntax themes run on the neutral ramp
  (keys at Signal, values at Static, structure receding) — a config key is not
  proof, and docs are mostly config.

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

Hierarchy by background-step + 1px Trace borders. **One radius: 2px, on every
surface including buttons.** A pill beside a machined panel is the single
loudest inconsistency a system like this can carry, and it read as a hobby
project. There is no luminous element: the hero's blurred Live/blue radials and
its pointer-tracked lit grid were removed, leaving a static ruled sheet.

## 5. Components

- **Wordmark**: drawn SVG, never set in a webfont. Monoline geometric grotesk on
  a 19-unit ascender: 3-unit stroke, 12-unit x-height, round overshoot on the o
  and d bowls, sidebearings tuned per shape pair (round-to-straight 2.4,
  straight-to-round 2.6). Carries `currentColor`. It appears **alone** — there
  is no pictorial mark beside it in any header on either origin. A square tile
  next to bold body text is two unrelated objects, which is what the old lockup
  was; the drawn letters are one. A folded-plane monogram (a plane creased on a
  diagonal, the lower facet in Live) survives only where the wordmark cannot
  fit: favicon, apple-touch-icon.
- **Buttons**: 44px, 2px radius, no trailing arrow. Primary is an Action fill
  with ink text; secondary is transparent on a Trace Bright hairline. Both
  variants share one box.
- **Cards**: Rack ground, 1px Trace border, 2px radius, 24px padding; hover
  lifts one background step and brightens the border. No gradient hairlines.
- **Code panel**: Rack, 2px radius, Geist Mono, context tag + copy button.
- **Topology diagram**: fold-line vocabulary; active path in Live with grain
  arrow; nodes Rack with Trace strokes; aria-label required.
- **Proof band**: ruled columns divided by hairlines. Not cards.
- **Capability index**: a verb rail beside hairline-separated rows. Not a grid.
- **Chrome**: one header (wordmark + Docs-first nav in Static + one solid
  neutral CTA) and one footer (brand column + Product/Deploy/Project + legal
  strip) on every page of both origins.

## 6. Do's and Don'ts

### Do:
- Reserve Live for proof; let the neutrals carry every action and everything else.
- Embed receipts (live demo, status, conformance, caveated numbers).
- Draw topology in the fold-line vocabulary; author every diagram.
- Vary band height across a page (`section`, `section-lg`, `section-sm`); equal
  bands read as a list rather than as a composition.

### Don't:
- No second saturated hue; no gradients; no shadows on dark; no glow.
- No pill radii, no radius other than 2px.
- No trailing arrow on buttons; a glyph after every link points at nothing.
- No grid of identical cards where a ruled table would carry the same content.
- No mono for marketing prose; no fabricated stats, logos, or badges.
- No per-origin theming; docs and marketing consume these tokens only.
