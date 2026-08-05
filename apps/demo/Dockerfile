# The real gateway, unmodified — pin the release the demo claims to be.
FROM ghcr.io/fold-run/fold:v1.3.0
# Distroless ENTRYPOINT is ["/fold"]; bind beyond loopback for the container
# network. Config arrives via FOLD_CONFIG (set by the Container class).
CMD ["--host", "0.0.0.0", "--port", "8080", "--log-format", "json"]
