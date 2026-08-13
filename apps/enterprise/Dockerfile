# The real gateway, unmodified — pin the release this gateway claims to be.
# Bumping this tag is only half a deploy: the container keeps serving the old
# image until `pnpm --filter @fold-run/enterprise run deploy` runs. Keep it in
# step with apps/demo/Dockerfile, and update expectVersion in
# apps/uptime/src/index.ts in the same commit — CI enforces it, and the monitor
# then catches a pin that shipped without a deploy.
FROM ghcr.io/fold-run/fold:v1.12.0
# Distroless ENTRYPOINT is ["/fold"]; bind beyond loopback for the container
# network. Config arrives via FOLD_CONFIG (set by the Container class).
CMD ["--host", "0.0.0.0", "--port", "8080", "--log-format", "json"]
