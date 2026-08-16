#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir"

./prepare-runtime-env.sh
docker compose --env-file runtime.env -f production.yml config --quiet
docker compose --env-file runtime.env -f production.yml build
docker compose --env-file runtime.env -f production.yml up -d --remove-orphans
docker compose --env-file runtime.env -f production.yml ps

