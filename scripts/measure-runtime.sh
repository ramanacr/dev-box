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

# Poll far more finely than the readiness budget. A 0.5s sleep cannot measure a 2s
# target to any useful precision, and it reports the sleep granularity rather than
# the application's startup time.
MAX_WAIT_SECONDS=15
POLL_INTERVAL=0.02
READY=0
DEADLINE=$(( $(date +%s) + MAX_WAIT_SECONDS ))

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if curl -fsS "http://127.0.0.1:${PORT}/readyz" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep "$POLL_INTERVAL"
done

END_TIME=$(date +%s%N)

if [ "$READY" -ne 1 ]; then
  echo "❌ Container failed to report ready within ${MAX_WAIT_SECONDS}s"
  docker logs "$CONTAINER_NAME"
  exit 1
fi

TOTAL_MS=$(( (END_TIME - START_TIME) / 1000000 ))
TOTAL_SECONDS=$(awk "BEGIN {printf \"%.3f\", $TOTAL_MS / 1000}")

# Separate container creation from application startup.
#
# The end-to-end number above includes the container runtime creating and starting
# the container, which on Docker Desktop is the dominant cost and has nothing to do
# with the application. The budget is about how fast the server becomes ready, so
# measure from the moment the runtime actually started the process.
STARTED_AT=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER_NAME" 2>/dev/null || echo "")
if [ -n "$STARTED_AT" ]; then
  STARTED_EPOCH_MS=$(awk -v ts="$STARTED_AT" 'BEGIN {
    # Parse RFC3339 with fractional seconds: 2026-09-12T08:30:00.123456789Z
    split(ts, a, "T");
    split(a[1], d, "-");
    sub(/Z$/, "", a[2]);
    split(a[2], t, ":");
    frac = 0;
    if (index(t[3], ".") > 0) { split(t[3], s, "."); sec = s[1]; frac = ("0." s[2]) + 0 } else { sec = t[3] }
    # mktime needs local time; StartedAt is UTC, so compute the UTC offset once.
    epoch = mktime(d[1] " " d[2] " " d[3] " " t[1] " " t[2] " " sec);
    offset = mktime(strftime("%Y %m %d %H %M %S", 0, 1)) - 0;
    printf "%d", (epoch - offset + frac) * 1000;
  }')
  SERVER_MS=$(( (END_TIME / 1000000) - STARTED_EPOCH_MS ))
  if [ "$SERVER_MS" -lt 0 ] || [ "$SERVER_MS" -gt "$TOTAL_MS" ]; then
    # Clock-skew or parsing trouble: fall back to the end-to-end figure rather than
    # reporting a number we cannot stand behind.
    SERVER_SECONDS="$TOTAL_SECONDS"
  else
    SERVER_SECONDS=$(awk "BEGIN {printf \"%.3f\", $SERVER_MS / 1000}")
  fi
else
  SERVER_SECONDS="$TOTAL_SECONDS"
fi

echo "✓ Ready ${TOTAL_SECONDS}s after 'docker run' (includes container creation)"
echo "✓ Ready ${SERVER_SECONDS}s after the container process started"

# The budget applies to application readiness.
BUDGET_SECONDS="${TOOLBOX_STARTUP_BUDGET:-2.0}"
if awk "BEGIN {exit !($SERVER_SECONDS > $BUDGET_SECONDS)}"; then
  echo "❌ Application readiness ${SERVER_SECONDS}s exceeds the ${BUDGET_SECONDS}s budget"
  exit 1
fi

STARTUP_SECONDS="$SERVER_SECONDS"

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
  "readiness_after_process_start_seconds": $SERVER_SECONDS,
  "readiness_after_docker_run_seconds": $TOTAL_SECONDS,
  "startup_budget_seconds": $BUDGET_SECONDS,
  "idle_memory": "$MEM_RAW",
  "status": "passed"
}
EOF

echo "✓ Runtime metrics saved to artifacts/runtime-metrics.json"
