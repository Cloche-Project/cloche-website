#!/usr/bin/env bash
set -euo pipefail

IMAGE="localhost/cloche-website:dev"
PORT="${PORT:-8080}"

cd "$(dirname "$0")"

echo "==> Building $IMAGE"
podman build -t "$IMAGE" -f Containerfile .

echo ""
echo "==> Serving on http://localhost:$PORT (Ctrl+C to stop)"
podman run --rm -it -p "$PORT:80" "$IMAGE"
