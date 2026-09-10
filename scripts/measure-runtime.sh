#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-developer-toolbox:dev}"
PORT="${2:-18080}"
CONTAINER_NAME="toolbox-benchmark-$$"

echo "Measuring runtime metrics for $IMAGE..."

# Cleanup on exit
trap 'docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true' EXIT

START_TIME=$(date +%s%N)

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "127.0.0.1:${PORT}:8080" \
  -e TOOLBOX_BIND_ADDRESS="0.0.0.0" \
  "$IMAGE" >/dev/null

echo "Waiting for /readyz endpoint..."

MAX_WAIT=5
READY=0
for i in $(seq 1 $MAX_WAIT); do
  if curl -fsS "http://127.0.0.1:${PORT}/readyz" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

END_TIME=$(date +%s%N)
STARTUP_DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
STARTUP_SECONDS=$(awk "BEGIN {print $STARTUP_DURATION_MS / 1000}")

if [ "$READY" -ne 1 ]; then
  echo "❌ Container failed to report ready within $MAX_WAIT seconds"
  docker logs "$CONTAINER_NAME"
  exit 1
fi

echo "✓ Server ready in ${STARTUP_SECONDS}s"

# Settle for 2 seconds
sleep 2

# Measure idle memory
MEM_RAW=$(docker stats --no-stream --format "{{.MemUsage}}" "$CONTAINER_NAME" | awk '{print $1}')
echo "Idle container memory usage: $MEM_RAW"

mkdir -p artifacts
cat <<EOF > artifacts/runtime-metrics.json
{
  "image": "$IMAGE",
  "startup_seconds": $STARTUP_SECONDS,
  "idle_memory": "$MEM_RAW",
  "status": "passed"
}
EOF

echo "✓ Runtime metrics saved to artifacts/runtime-metrics.json"
