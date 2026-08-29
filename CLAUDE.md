# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Web properties for [fold](https://github.com/fold-run/fold), the enterprise MCP gateway. The gateway itself lives in fold-run/fold — that repo's README is the source of truth for features and configuration. Docs pages here **curate** that content, they don't fork it.

pnpm workspace (`apps/*` + `packages/*`), Node >= 22, all apps deploy to Cloudflare Workers:

- `apps/site` — marketing site at fold.run. Astro with `@astrojs/mdx` + `@astrojs/sitemap`, static-only, served via Workers Static Assets (worker `fold-site`). Blog posts and changelog entries are **content collections** in `src/content/{blog,changelog}` (schemas in `src/content.config.ts`), not hand-written pages: the blog index, `/rss.xml`, `/llms.txt` and the sitemap all render from them, so adding a post is one file. Routes beyond the landing page: `blog/[...slug].astro`, `changelog.astro`, `rss.xml.ts`, `llms.txt.ts`.
- `apps/docs` — docs.fold.run. Astro + Starlight, with `starlight-llms-txt` emitting `/llms.txt` + `/llms-full.txt`. Static-only, no worker entrypoint (worker `fold-docs`). Content is markdown/MDX in `apps/docs/src/content/docs/`; the sidebar is defined in `apps/docs/astro.config.mjs` — new pages must be added there.
- `apps/uptime` — cron Worker (`fold-uptime`, every 5 min) in a single file, `apps/uptime/src/index.ts`. HTTP checks on site and docs plus an MCP initialize round trip against the demo; state in one Durable Object (`UptimeMonitorDO`, SQLite-backed); `/status` serves a JSON snapshot (CORS-open, rendered by the site's `/status` page); optional `ALERT_WEBHOOK` secret gets a POST on up↔down transitions (down = 2 consecutive failures). Targets are the hardcoded `TARGETS` list; the DO prunes state for targets removed from that list.
- `apps/demo` — demo.fold.run: the unmodified fold Go binary (image pinned in `apps/demo/Dockerfile`) in a **Cloudflare Container** behind worker `fold-demo`. A single named instance preserves fold's session-keyed clients; the federation config is inline in `apps/demo/src/index.ts` (`FOLD_CONFIG` env). Deploying needs local Docker running.
- `apps/demo-tasks` — the demo's `jobs__*` upstream: a Go MCP task server (`main.go`, official MCP Go SDK — the only Go code in this repo) in a Cloudflare Container behind worker `fold-demo-tasks`. Mints tasks in the tool result's `_meta["task"]` (what fold's affinity pin reads) and serves `tasks/*` via the SDK's custom-method mechanism, mirroring fold's own pattern. Job state is in-memory and ephemeral by design. `pnpm --filter @fold-run/demo-tasks build` runs `go vet` + `tsc`.
- `packages/tokens` (`@fold-run/tokens`) — the single home for design token values (`src/vars.css`) and the self-hosted `@font-face` block (`src/fonts.css`). Both origins import it: `apps/site` in `Base.astro`, `apps/docs` in `src/styles/fold.css`, which maps the tokens onto Starlight's `--sl-*` variables rather than restating hexes. **Change a colour here, not in an app.** The `.woff2` binaries stay in each app's `public/fonts/` because the two sites are separate origins; only the declarations are shared. The docs light ramp is deliberately local to `fold.css`: it is hand-tuned rather than a mirror of the dark ramp.

## Commands

```bash
pnpm install
pnpm -r build                       # build every app
pnpm -r typecheck                   # tsc --noEmit (site/uptime), astro check (docs)
pnpm lint                           # biome check .
pnpm fmt                            # biome check --write .
pnpm --filter @fold-run/docs dev    # local docs at localhost:4321
pnpm --filter @fold-run/site dev
```

There are no tests; CI (on push/PR) runs build + typecheck + lint.

### Deploy

Manual only — from a laptop or the Deploy workflow in the Actions tab. Note the `run`: pnpm's built-in `deploy` command shadows the script name.

```bash
pnpm --filter @fold-run/site run deploy
pnpm --filter @fold-run/docs run deploy
pnpm --filter @fold-run/uptime run deploy
```

Custom domains are attached via `custom_domain: true` routes in each `wrangler.jsonc` — wrangler owns DNS + TLS, so deploys need a zone-scoped Cloudflare API token for fold.run.

## Conventions

- Shared tooling versions (typescript, biome, wrangler, workers-types) come from the pnpm catalog in `pnpm-workspace.yaml` — reference them as `"catalog:"` in app package.json files.
- Biome formats and lints: 2-space indent, 100-char lines, single quotes, trailing commas. `noExplicitAny` is an error; non-null assertions are allowed.
- Docs use `.mdx` where components are needed; `remark-gfm` is wired into the MDX pipeline in `astro.config.mjs` because Astro doesn't apply GFM to `.mdx` by default (markdown tables would render as literal pipes).
- Site CSS is layered: `@fold-run/tokens` (values) → `src/styles/base.css` (document defaults) → `primitives.css` (the shared class vocabulary: `.wrap`, `.btn`, `.chip`, `.code-panel`, `.closing`) → `chrome.css` (header, mega menu, footer). Page-specific section styles stay in the page. Note the cascade: **`primitives.css` outranks a page's own `<style is:global>`**, so a page-level override of a primitive will silently lose; change the primitive instead.
- Shared site components live in `src/components`: `Closing.astro` (the CTA band on every page), `CodePanel.astro`, `Wordmark.astro`. `src/lib/nav.ts` holds `LINKS` (cross-surface URLs) plus the header's nav tree; `src/lib/seo.ts` holds `SITE` and the per-page metadata. Add a surface once, in `nav.ts`.
- Three MDX traps the site has already hit, all load-bearing: Astro **collapses whitespace in slotted children** and MDX **markdown-parses the children of a multi-line JSX block**, so `CodePanel` takes its code as a `code` string prop rather than as children; `{` starts an expression in MDX, so a literal brace in prose needs `&#123;` (or a real brace inside a code span, where MDX does not evaluate) and a pinned heading id is written `\{#some-id\}`; and `smartypants` is off in `apps/site/astro.config.mjs` because it rewrote authored straight quotes and got one pair backwards.
- Changelog entries are **curated from fold's own `CHANGELOG.md`**, not written for the website: the entry title is the release's headline and each bullet is the bolded lead of one of its bullets, verbatim, with the full notes linked on GitHub. Do not invent release copy (DESIGN.json voice: "Every stat carries caveat or receipt-link inline").
- Heading ids in site posts come from `rehype-slug` + `rehype-autolink-headings`. `apps/site/rehype-heading-id.mjs` lets a heading pin an explicit slug, which is how the migrated posts kept their original deep links; a fragment is the one link a server cannot redirect.
