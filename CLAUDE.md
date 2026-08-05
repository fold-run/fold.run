# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Web properties for [fold](https://github.com/fold-run/fold), the enterprise MCP gateway. The gateway itself lives in fold-run/fold — that repo's README is the source of truth for features and configuration. Docs pages here **curate** that content, they don't fork it.

pnpm workspace (`apps/*`), Node >= 22, all apps deploy to Cloudflare Workers:

- `apps/site` — marketing site at fold.run. Plain Astro, static-only build served via Workers Static Assets (worker `fold-site`).
- `apps/docs` — docs.fold.run. Astro + Starlight, with `starlight-llms-txt` emitting `/llms.txt` + `/llms-full.txt`. Static-only, no worker entrypoint (worker `fold-docs`). Content is markdown/MDX in `apps/docs/src/content/docs/`; the sidebar is defined in `apps/docs/astro.config.mjs` — new pages must be added there.
- `apps/uptime` — cron Worker (`fold-uptime`, every 5 min) in a single file, `apps/uptime/src/index.ts`. HTTP checks on site and docs; state in one Durable Object (`UptimeMonitorDO`, SQLite-backed); `/status` serves a JSON snapshot; optional `ALERT_WEBHOOK` secret gets a POST on up↔down transitions (down = 2 consecutive failures). Targets are the hardcoded `TARGETS` list; the DO prunes state for targets removed from that list.

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
