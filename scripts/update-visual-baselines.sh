#!/usr/bin/env bash
# Regenerates the Linux screenshot baselines for apps/designer/tests/e2e/visual.spec.ts inside the same
# Playwright image CI uses, so local and CI rendering match. Needs Docker. Usage: scripts/update-visual-baselines.sh
# VERIFY=1 compares against the committed baselines instead of rewriting them (what CI does).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAYWRIGHT_VERSION="$(cd "$ROOT/apps/designer" && node -p "require('@playwright/test/package.json').version")"
IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"
NODE_VERSION="22.22.1"
SNAPSHOTS="apps/designer/tests/e2e/visual.spec.ts-snapshots"

mkdir -p "$ROOT/$SNAPSHOTS"
docker run --rm --platform linux/amd64 \
  -v "$ROOT:/src:ro" -v "$ROOT/$SNAPSHOTS:/out" \
  -e NODE_VERSION="$NODE_VERSION" -e SNAPSHOTS="$SNAPSHOTS" -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 -e CI=true -e VERIFY="${VERIFY:-}" \
  "$IMAGE" bash -euo pipefail -c '
    apt-get update -qq && apt-get install -y -qq fonts-noto-core poppler-utils xz-utils >/dev/null
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" | tar -xJ -C /opt
    export PATH="/opt/node-v${NODE_VERSION}-linux-x64/bin:$PATH"
    mkdir /work
    tar -C /src --exclude=node_modules --exclude=dist --exclude="*.tsbuildinfo" --exclude=.git --exclude=output --exclude=test-results \
      --exclude=docs/design --exclude=.claude -cf - . | tar -C /work -xf -
    cd /work
    corepack enable
    pnpm install --frozen-lockfile --reporter=silent
    pnpm -r --filter "./packages/**" build > /tmp/build.log 2>&1 || { tail -40 /tmp/build.log; exit 1; }
    pnpm --filter @reporting/server build > /tmp/server.log 2>&1 || { tail -40 /tmp/server.log; exit 1; }
    cd apps/designer
    if [ -n "$VERIFY" ]; then
      cp /out/*-linux.png tests/e2e/visual.spec.ts-snapshots/
      npx playwright test --grep @visual --reporter=line
    else
      npx playwright test --grep @visual --update-snapshots=all --reporter=line
      cp tests/e2e/visual.spec.ts-snapshots/*-linux.png /out/
    fi
  '
[ -n "${VERIFY:-}" ] && echo "Linux baselines match" || echo "Linux baselines written to $SNAPSHOTS"
