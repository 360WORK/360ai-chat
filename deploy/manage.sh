#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Day-2 ops wrapper for the 360AI chat deployment.
# Always invokes docker compose with BOTH the base and override files, so you
# never have to remember the -f flags. Run from anywhere; it cd's to repo root.
#
#   ./deploy/manage.sh up            # build (if needed) + start everything
#   ./deploy/manage.sh deploy        # pull the CHAT_IMAGE from GHCR + start (no build)
#   ./deploy/manage.sh down          # stop everything
#   ./deploy/manage.sh restart       # restart the stack
#   ./deploy/manage.sh rebuild       # rebuild the api image + restart api
#   ./deploy/manage.sh pull-build    # git pull, rebuild api, restart api
#   ./deploy/manage.sh logs [svc]    # tail logs (all, or one service)
#   ./deploy/manage.sh ps            # service status
#   ./deploy/manage.sh backup        # dump mongo + tar data dirs to ./backups
#
# Two ways to ship the api image:
#   • BUILD ON BOX : `up` / `rebuild` / `pull-build`  (needs ~8GB RAM to build)
#   • PULL FROM CI : set CHAT_IMAGE=ghcr.io/360work/360ai-chat:latest in .env,
#                    then `deploy` (built by .github/workflows/deploy-image.yml).
#                    First time: `docker login ghcr.io` with a read:packages PAT.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose -f deploy-compose.yml -f deploy-compose.override.yml)

cmd="${1:-}"; shift || true

case "$cmd" in
  up)         "${COMPOSE[@]}" up -d --build ;;
  deploy)
    if ! grep -qE '^CHAT_IMAGE=.+' .env 2>/dev/null; then
      echo "✗ CHAT_IMAGE is not set in .env — set it to the GHCR tag to pull, e.g."
      echo "    CHAT_IMAGE=ghcr.io/360work/360ai-chat:latest"
      exit 1
    fi
    "${COMPOSE[@]}" pull api
    "${COMPOSE[@]}" up -d --no-build
    ;;
  down)       "${COMPOSE[@]}" down ;;
  restart)    "${COMPOSE[@]}" restart ;;
  rebuild)    "${COMPOSE[@]}" build api && "${COMPOSE[@]}" up -d api ;;
  pull-build) git pull --ff-only && "${COMPOSE[@]}" build api && "${COMPOSE[@]}" up -d api ;;
  logs)       "${COMPOSE[@]}" logs -f --tail=200 "$@" ;;
  ps)         "${COMPOSE[@]}" ps ;;
  backup)
    ts="$(date +%Y%m%d-%H%M%S)"
    dest="backups/$ts"
    mkdir -p "$dest"
    echo "→ mongodump …"
    "${COMPOSE[@]}" exec -T mongodb mongodump --archive --db=LibreChat \
      > "$dest/mongo-LibreChat.archive"
    echo "→ archiving data dirs …"
    tar czf "$dest/files.tgz" images uploads meili_data_v1.35.1 2>/dev/null || true
    echo "✓ backup written to $dest"
    ;;
  *)
    grep -E '^#|manage\.sh' "${BASH_SOURCE[0]}" | sed -n '2,20p'
    exit 1 ;;
esac
