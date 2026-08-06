---
# _provenance: writtenBy=stardust:direct writtenAt=2026-08-06T14:44:00Z
# TARGET design system (Mode A brand-faithful; current state in stardust/current/DESIGN.md).
# Hex format retained per brand-faithful inversion (captured surface + Stitch compliance).
name: fold (variant B — Brass & Ink · Chivo)
description: One governed endpoint between every MCP client and every MCP server.
colors:
  backplane: "#0c0d0d"
  rack: "#131415"
  trace: "#242628"
  signal: "#FAFAFA"
  static: "#94979E"
  brass: "#d9a441"
  brass-deep: "#a87c1f"
  brass-soft: "#ecd9a8"
  paper: "#ffffff"
  up: "#00E599"
  down: "#ff4c79"
typography:
  display:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 6.5vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  heading:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 3vw, 2.4rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  mono:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 450
    lineHeight: 1.55
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
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
    backgroundColor: "{colors.brass}"
    textColor: "{colors.backplane}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.brass-soft}"
    rounded: "{rounded.md}"
    padding: "11px 19px"
  card:
    backgroundColor: "{colors.rack}"
    rounded: "{rounded.lg}"
    padding: "20px 24px"
  code-panel:
    backgroundColor: "{colors.rack}"
    textColor: "{colors.signal}"
    typography: "{typography.mono}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  badge:
    textColor: "{colors.brass-soft}"
    typography: "{typography.mono}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  link:
    textColor: "{colors.brass-soft}"
---

# Design System: fold

## 1. Overview

Terminal-native dark system, unified across fold.run and docs.fold.run. Backplane
ground (#0c0d0d) with Rack panels one step lighter, separated by Trace hairlines —
hierarchy by background-step, never by shadow. One indigo (Route) carries every
action on both origins; Route Deep is the same hue for light grounds (docs light
theme on Paper). The signature is the **fold-line drawing vocabulary**: diagrams
drawn like tailor's pattern paper — dashed fold-lines for routes, notch marks for
policy points, grain arrows for direction — in Trace with Route for the active
path. Bolder than the current site through type conviction (800-weight display,
modular scale) and color commitment, never through gradients or noise.

## 2. Colors

### Primary
- **Brass** `#d9a441` — every primary action, active diagram paths, focus rings; buttons carry ink text (8.6:1).
  On dark grounds only (3.9:1 on Backplane as large/bold graphic color; never
  small text on Paper).
- **Brass Deep** `#a87c1f` — hover/active depth; ink text at 5.2:1 on dark.
- **Brass Soft** `#ecd9a8` — links, badges, kicker labels, secondary emphasis (13.9:1).

### Neutral
- **Backplane** `#0c0d0d` — canonical page ground, both origins.
- **Rack** `#131415` — panels, cards, code surfaces.
- **Trace** `#242628` — 1px hairlines, borders, fold-line diagram strokes.
- **Signal** `#FAFAFA` — primary text on dark. **Static** `#94979E` — muted text
  (lifted from captured #9a9db5 for ≥5.2:1 AA headroom).
- **Paper** `#ffffff` — docs light-theme ground only (brand-faithful retention).

### Named Rules
- **Up** `#00E599` / **Down** `#ff4c79` are **reserved** to live status semantics
  (status page rows, uptime badges). Never decorative, never charts-in-general.
- No gradients. No new hues. Warmth and energy come from Route density, not
  added colors.

## 3. Typography

Switzer (display + body; Alliance No.2-genre neo-grotesque, ITF free license) and JetBrains Mono — type re-direct 2026-08-06 against the user reference infisical.com (which ships the commercial Alliance No.2 + JetBrains Mono). Prototypes @import Fontshare/Google; migrate self-hosts woff2.

### Hierarchy
Modular scale, major-third (1.25), fluid via clamp():
- Display (home hero): 800 weight, clamp(2.6rem → 4.5rem), -0.025em, lh 1.02
- H2: 700, clamp(1.7rem → 2.4rem) · H3: 700, 1.25rem · body: 1rem/1.6
- Mono 0.875rem/1.55 for anything operational: commands, config, status values,
  tool prefixes, diagram annotations. Never marketing prose.
- `text-wrap: balance` on h1–h3; body measure capped at 70ch.

### Named Rules
- **Earned-mono rule:** a mono block must contain runnable or live content
  (command, config, wire capture, status value). If it can't be copy-pasted or
  observed live, it isn't mono.
- Mixed-case headings everywhere (captured convention: 0% uppercase). Terminal
  periods on section H2s ("See it live.") are brand voice — keep.

## 4. Elevation

Flat by conviction. Background-step (Backplane → Rack) plus 1px Trace borders do
all elevation work. No shadows on dark; docs light theme may keep Starlight's two
soft shadows only where Starlight requires them. Radius vocabulary: machined 0 / 2px corners (user re-direct 2026-08-06; replaces both the captured fragmentation and the interim 4/8/12px). The folded-corner clip is the only shape accent.

## 5. Components

### Buttons
- **Primary**: Route fill, white text, 8px radius, 12×20px padding, weight 600.
  Hover: Route Deep fill. One primary per viewport.
- **Secondary** (new — the captured site had none): transparent, 1px Trace
  border, Carrier text; hover raises border to Carrier. Replaces bare-link
  secondary actions.

### Cards / Containers
- Rack ground, 1px Trace border, 12px radius. Problem-cluster cards carry a
  fold-line glyph (24px, Trace stroke, Route active segment) — never icon-font
  or emoji.

### Code panel (signature)
- Rack ground, 12px radius, mono 0.875rem, language/context tag top-right in
  Carrier badge style, copy button on hover. Contents are always real (earned-
  mono rule).

### Topology diagram (signature)
- Inline SVG in the fold-line vocabulary: nodes as small Rack rounded-rects with
  mono labels, routes as dashed Trace lines folding into the gateway node, the
  active path in Route with a grain arrow, notch marks at policy/auth points.
  Carries an `aria-label` describing the topology. Used: home hero band, docs
  architecture, blog posts where routing is discussed.

### Navigation
- One header on every page of both origins: fold wordmark (fold-line letterform
  SVG) left; Live demo · Use cases · Blog · Status · GitHub right; primary
  "Get started" button. Sticky on docs (Starlight convention), static on
  marketing. One footer: wordmark, © + Apache-2.0, docs / GitHub / Conformance /
  Blog / Status columns — identical everywhere.

### Inputs
- Docs search (Starlight): restyled with Trace border, Rack ground, 8px radius,
  Route focus ring. 2px Route `:focus-visible` ring on all interactive elements.

## 6. Do's and Don'ts

### Do:
- Embed proof: live demo output, status rows, conformance counts, honest caveats
  attached to every number.
- Draw topology in the fold-line vocabulary; one authored diagram per key surface.
- Commit to Route: section-level color moments (a Route-drenched CTA band) beat
  scattered accent dots.
- Keep captured copy voice: short declaratives, mixed case, no superlatives.
  New copy prefers periods and colons over em-dashes.

### Don't:
- No gradients, glassmorphism, stock illustration, mascots, or photography.
- No mono for marketing prose; no fabricated stats, logos, or testimonials.
- No per-origin theming: docs and marketing draw from this file's tokens only.
- No new hues beyond the palette above; Up/Down never leave status semantics.
- Don't inflate the template (96px+ display, triple CTA) to read "bolder" —
  boldness is motif + color commitment here.
