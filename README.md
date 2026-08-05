# fold.run

Web properties for [fold](https://github.com/fold-run/fold), the enterprise MCP gateway.

| App | Deploys to | Stack |
| --- | --- | --- |
| [`apps/site`](apps/site) | [fold.run](https://fold.run) | Astro, Cloudflare Workers static assets |
| [`apps/docs`](apps/docs) | [docs.fold.run](https://docs.fold.run) | Astro + Starlight (serves `/llms.txt`) |
| [`apps/uptime`](apps/uptime) | cron Worker | HTTP uptime checks + webhook alerts |

The gateway itself lives in [fold-run/fold](https://github.com/fold-run/fold); that repo's README is the
source of truth for features and configuration — docs pages here curate it, they don't fork it.

## Develop

```bash
pnpm install
pnpm -r build          # build every app
pnpm -r typecheck
pnpm lint              # biome
pnpm --filter @fold-run/docs dev   # local docs at localhost:4321
```

## Deploy

Each app deploys independently with wrangler (Cloudflare Workers static assets, custom domains
already attached to the workers `fold-site`, `fold-docs`, `fold-uptime`):

```bash
pnpm --filter @fold-run/site deploy
pnpm --filter @fold-run/docs deploy
pnpm --filter @fold-run/uptime deploy
```

## License

Apache-2.0
