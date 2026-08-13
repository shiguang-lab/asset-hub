#!/usr/bin/env bash
# 启动全部 5 个应用（web/api/worker/compute-worker/public-gateway）
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
mkdir -p .data
pnpm dev
