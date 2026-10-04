#!/usr/bin/env bash
# Runs the CI jobs from .github/workflows/ci.yml on Linux amd64 in Docker, with the same fonts, Node version and
# Postgres/MySQL services, so failures that only happen on the CI runner show up before pushing.
# Usage: scripts/ci-linux.sh [test|e2e|all]   (default: all)
# PW_ARGS="tests/e2e/x.spec.ts -g name" narrows the browser tests.
# PLATFORM=linux/arm64 runs natively on Apple silicon: much faster for functional tests. Screenshot baselines are
# amd64 (what CI uses), so the @visual tests run only on the default linux/amd64.
set -euo pipefail

JOB="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAYWRIGHT_VERSION="$(cd "$ROOT/apps/designer" && node -p "require('@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"
NODE_VERSION="22.22.1"
NET="open-reports-ci-$$"
PLATFORM="${PLATFORM:-linux/amd64}"

cleanup() { docker rm -f "$NET-pg" "$NET-mysql" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# The services share one network namespace with the job container, so tests reach them on localhost as in CI.
docker run -d --platform "$PLATFORM" --name "$NET-pg" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=reporting_test postgres:16 >/dev/null
docker run -d --platform "$PLATFORM" --name "$NET-mysql" --network "container:$NET-pg" \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=reporting_test -e MYSQL_USER=reporting -e MYSQL_PASSWORD=reporting mysql:8 >/dev/null
for _ in $(seq 1 90); do
  docker exec "$NET-pg" pg_isready -U postgres >/dev/null 2>&1 && docker exec "$NET-mysql" mysqladmin ping -proot --silent >/dev/null 2>&1 && break
  sleep 2
done

docker run --rm --platform "$PLATFORM" --network "container:$NET-pg" \
  -v "$ROOT:/src:ro" -e NODE_VERSION="$NODE_VERSION" -e JOB="$JOB" -e PLATFORM="$PLATFORM" -e PW_ARGS="${PW_ARGS:-}" -e CI=true -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  "$IMAGE" bash -euo pipefail -c '
    apt-get update -qq && apt-get install -y -qq fonts-noto-core poppler-utils xz-utils >/dev/null
    ARCH=$([ "$(uname -m)" = aarch64 ] && echo arm64 || echo x64)
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH}.tar.xz" | tar -xJ -C /opt
    export PATH="/opt/node-v${NODE_VERSION}-linux-${ARCH}/bin:$PATH"
    mkdir /work
    tar -C /src --exclude=node_modules --exclude=dist --exclude="*.tsbuildinfo" --exclude=.git --exclude=output \
      --exclude=test-results --exclude=test-output --exclude=docs/design --exclude=.claude -cf - . | tar -C /work -xf -
    cd /work
    corepack enable
    pnpm install --frozen-lockfile --reporter=silent
    pnpm -r --filter "./packages/**" build > /tmp/build.log 2>&1 || { tail -60 /tmp/build.log; exit 1; }
    pnpm --filter @reporting/server build > /tmp/server.log 2>&1 || { tail -60 /tmp/server.log; exit 1; }
    status=0
    if [ "$JOB" = test ] || [ "$JOB" = all ]; then
      echo "== schema consumers"; pnpm check:schema-consumers || status=1
      echo "== designer typecheck"; pnpm --filter @reporting/designer exec tsc --noEmit || status=1
      echo "== unit + integration tests"; pnpm -r --no-bail test 2>&1 | tee /tmp/test.log | grep -E "Test Files|Tests |FAIL|Error:" || true
      grep -q "FAIL\|ERR_PNPM" /tmp/test.log && status=1
      echo "== quick benchmark"; pnpm --filter @reporting/server bench:quick > /tmp/bench.log 2>&1 || { tail -30 /tmp/bench.log; status=1; }
    fi
    if [ "$JOB" = e2e ] || [ "$JOB" = all ]; then
      echo "== designer e2e"; (cd apps/designer && npx playwright test --grep-invert @visual --reporter=line $PW_ARGS) || status=1
      if [ "$PLATFORM" = linux/amd64 ]; then
        echo "== designer visual"; (cd apps/designer && npx playwright test --grep @visual --reporter=line) || status=1
      fi
    fi
    exit $status
  '
