# The real gateway, unmodified — pin the release the demo claims to be.
# Bumping this tag is only half a deploy: the container keeps serving the old
# image until `pnpm --filter @fold-run/demo run deploy` runs. Update
# expectVersion in apps/uptime/src/index.ts in the same commit — CI enforces
# it, and the monitor then catches a pin that shipped without a deploy.
FROM ghcr.io/fold-run/fold:v1.13.0
# Distroless ENTRYPOINT is ["/fold"]; bind beyond loopback for the container
# network. Config arrives via FOLD_CONFIG (set by the Container class).
CMD ["--host", "0.0.0.0", "--port", "8080", "--log-format", "json"]
