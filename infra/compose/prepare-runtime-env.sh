#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../.." && pwd)
runtime_env="$script_dir/runtime.env"
app_env_value="${ASSET_HUB_APP_ENV_FILE:-}"
if [ -z "$app_env_value" ] && [ -f "$runtime_env" ]; then
  app_env_value=$(awk -F= '$1 == "ASSET_HUB_APP_ENV_FILE" { print substr($0, index($0, "=") + 1); exit }' "$runtime_env")
fi
if [ -n "$app_env_value" ]; then
  case "$app_env_value" in
    /*) app_env="$app_env_value" ;;
    *) app_env="$script_dir/$app_env_value" ;;
  esac
else
  app_env="$repo_root/.env"
fi

if [ ! -f "$app_env" ]; then
  echo "missing $app_env; copy the production integration credentials before deployment" >&2
  exit 1
fi

for key in DATABASE_URL S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY; do
  if ! grep -q "^${key}=." "$app_env"; then
    echo "missing required value ${key} in $app_env" >&2
    exit 1
  fi
done

if [ -f "$runtime_env" ]; then
  chmod 600 "$runtime_env"
  echo "keeping existing $runtime_env"
  exit 0
fi

umask 077
token() {
  openssl rand -hex 32
}

cat >"$runtime_env" <<EOF
NAS_BIND_IP=100.87.115.78
# Compose env file containing production database/object-store/model credentials.
ASSET_HUB_APP_ENV_FILE=./app.env
# Published by GitHub Actions; use an immutable sha-* tag when pinning a release.
IMAGE_TAG=latest
WEB_DEBUG_PORT=3700
API_DEBUG_PORT=3701
COMPUTE_DEBUG_PORT=3702
PUBLIC_GATEWAY_DEBUG_PORT=3704
INTERNAL_TOKEN=$(token)
WORKER_TOKEN=$(token)
COMPUTE_TOKEN=$(token)
PUBLIC_GATEWAY_TOKEN=$(token)
PUBLISH_HMAC_SECRET=$(token)
EOF

echo "created $runtime_env"
