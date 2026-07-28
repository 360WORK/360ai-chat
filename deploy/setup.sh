#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-command bootstrap for the 360AI chat deployment on a fresh server.
#
#   git clone <repo> /opt/chat360 && cd /opt/chat360
#   ./deploy/setup.sh
#
# What it does (idempotent — safe to re-run):
#   1. checks Docker + Compose are present
#   2. creates the data / bind-mount directories
#   3. ensures librechat.yaml exists
#   4. creates ../.env from .env.example + a production overlay with FRESH
#      secrets (only on first run; never clobbers an existing .env)
#   5. tells you the 3 values to fill in, then how to launch
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

say()  { printf '\033[1;36m→ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# --- 1. prerequisites -------------------------------------------------------
command -v docker >/dev/null || { warn "Docker not found. Install: curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { warn "Docker Compose v2 plugin not found."; exit 1; }
ok "Docker + Compose present"

# --- 2. data directories ----------------------------------------------------
say "Creating data / bind-mount directories"
mkdir -p images uploads logs data-node meili_data_v1.35.1 skill backups
ok "Directories ready"

# --- 3. librechat.yaml ------------------------------------------------------
if [ ! -f librechat.yaml ]; then
  if [ -f librechat.example.yaml ]; then
    cp librechat.example.yaml librechat.yaml
    ok "librechat.yaml created from example"
  else
    printf 'version: 1.2.8\ncache: true\n' > librechat.yaml
    warn "No librechat.example.yaml found — wrote a minimal librechat.yaml"
  fi
fi

# --- 4. .env ----------------------------------------------------------------
gen()   { openssl rand -hex "$1"; }

if [ -f .env ]; then
  ok ".env already exists — leaving it untouched"
else
  say "Building .env from .env.example + production overlay"
  cp .env.example .env

  JWT_SECRET="$(gen 32)"; JWT_REFRESH_SECRET="$(gen 32)"
  CREDS_KEY="$(gen 32)";  CREDS_IV="$(gen 16)"
  MEILI_MASTER_KEY="$(gen 32)"

  cat >> .env <<EOF

# ============================================================================
# 360AI production overrides (appended by deploy/setup.sh — last value wins)
# ============================================================================
CHAT_DOMAIN=chat.360ai.com
ACME_EMAIL=ops@360ai.com
DOMAIN_CLIENT=https://chat.360ai.com
DOMAIN_SERVER=https://chat.360ai.com

HOST=0.0.0.0
PORT=3080
TRUST_PROXY=1

# Build the api image on this box (default). To instead PULL a CI-built image
# from GHCR, uncomment and use \`./deploy/manage.sh deploy\`:
# CHAT_IMAGE=ghcr.io/360work/360ai-chat:latest

JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
CREDS_KEY=${CREDS_KEY}
CREDS_IV=${CREDS_IV}
MEILI_MASTER_KEY=${MEILI_MASTER_KEY}

OPENID_ISSUER=https://360ai.com
OPENID_CLIENT_ID=
OPENID_CLIENT_SECRET=
OPENID_CALLBACK_URL=/oauth/openid/callback
OPENID_SCOPE=openid profile email
OPENID_USE_PKCE=true
OPENID_AUTO_REDIRECT=true
EOF
  chmod 600 .env
  ok ".env created with fresh secrets (chmod 600)"
fi

# --- 5. next steps ----------------------------------------------------------
echo
say "Almost done. Edit ./.env and set these before launching:"
cat <<'EOF'
    CHAT_DOMAIN        e.g. chat.360ai.com   (also update DOMAIN_CLIENT/SERVER)
    ACME_EMAIL         Let's Encrypt contact
    OPENID_ISSUER      production 360AI issuer, e.g. https://360ai.com
    OPENID_CLIENT_ID   production Passport client id
    OPENID_CLIENT_SECRET (only if not using PKCE)

  Provider side (in the 360ai / hire-suite Laravel app):
    • Passport client redirect URI = https://<CHAT_DOMAIN>/oauth/openid/callback
    • add that client id to TRUSTED_CLIENT_IDS  (auto-skips the consent screen)
    • php artisan optimize:clear

  DNS: point an A record  <CHAT_DOMAIN> → this server's IPv4  before launching
       (Caddy needs it resolvable to issue the TLS cert).
EOF
echo
say "Then launch (builds our fork + starts everything incl. auto-TLS):"
echo "    ./deploy/manage.sh up"
echo "    ./deploy/manage.sh logs api      # watch startup"
echo "    curl -sI https://<CHAT_DOMAIN>/health"
