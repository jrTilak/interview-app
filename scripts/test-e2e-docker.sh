#!/usr/bin/env sh

set -eu

compose_file="docker-compose.test.yml"

cleanup() {
	docker compose -f "$compose_file" down --volumes
}

trap cleanup EXIT INT TERM
docker compose -f "$compose_file" up --detach --wait
pnpm --filter @interview-desk/nestjs-server test:e2e
