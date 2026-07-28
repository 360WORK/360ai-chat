# Deploying chat.360ai to Hetzner as a 360AI subdomain

> Runbook for standing up this **LibreChat fork** on a Hetzner server, served at a
> subdomain of the 360AI platform (e.g. `https://chat.360ai.com`), authenticating
> against the 360AI OIDC provider.

---

## TL;DR — the easy path (already wired up)

Everything below is automated by files committed to the repo. On a fresh Ubuntu
Hetzner box with Docker installed:

```bash
git clone <repo> /opt/chat360 && cd /opt/chat360
./deploy/setup.sh            # creates dirs, .env with fresh secrets, librechat.yaml
nano .env                    # fill CHAT_DOMAIN, ACME_EMAIL, OPENID_* (setup.sh prints which)
./deploy/manage.sh up        # builds our fork + starts chat + DB + search + RAG + auto-TLS
```

That's it — Caddy fetches a Let's Encrypt cert for the subdomain automatically.
Files that make this work:

| File | Role |
|---|---|
| `deploy/setup.sh` | one-command bootstrap (secrets, dirs, `.env`) |
| `deploy/manage.sh` | day-2 ops: `up` / `down` / `logs` / `rebuild` / `pull-build` / `backup` |
| `deploy-compose.override.yml` | builds our fork, adds Caddy, disables bundled nginx |
| `deploy/Caddyfile` | reverse proxy + automatic HTTPS for the subdomain |
| `deploy/env.production.example` | reference for the `.env` overlay setup.sh writes |
| `.github/workflows/deploy-image.yml` | CI: build the image + push to GHCR so the box only pulls (§4a) |

Two things you still do by hand (they live outside this repo): **DNS** (§1) and the
**provider-side Passport client + `TRUSTED_CLIENT_IDS`** (§5). The rest of this doc
explains what these files do and how to size/secure the box.

> Note: `npm run start:deployed` only loads `deploy-compose.yml`, so it **skips**
> the override — always use `./deploy/manage.sh` (it passes both `-f` files).

---

## 0. Key facts that shape this deploy (read first)

1. **This is a fork with custom 360AI code.** You **cannot** use the upstream
   prebuilt images (`registry.librechat.ai/danny-avila/librechat-*`) — they don't
   contain our onboarding / acumen / signals / OIDC changes. You **must build our
   own image** from `Dockerfile.multi` (target `api-build`, `EXPOSE 3080`).
2. The repo ships two compose files:
   - `docker-compose.yml` — dev (pulls upstream dev image). **Not for us.**
   - `deploy-compose.yml` — prod topology (api + nginx + mongo + meilisearch +
     vectordb + rag_api). **We edit this to build locally instead of pulling.**
   - `npm run start:deployed` / `stop:deployed` wrap `deploy-compose.yml`.
3. Services in the stack: `api` (Node 24), `mongodb` (8.0.20, `--noauth`),
   `meilisearch` (v1.35.1), `vectordb` (pgvector), `rag_api`.
4. **"Subdomain of another platform"** = the 360AI Laravel app is the identity
   provider. Chat gets its **own** DNS A-record → the Hetzner box; the Laravel app
   can live anywhere. The provider must register the production callback URL and
   trust our client ID (see §5).

---

## 1. Provision the Hetzner server

- **Type:** Hetzner Cloud **CPX31** (4 vCPU / 8 GB) minimum; **CPX41** (8 GB→16 GB)
  if RAG/embeddings + Meili see real traffic. LibreChat + Mongo + Meili + pgvector
  in one box is comfortable at 8 GB, tight at 4 GB.
- **OS:** Ubuntu 24.04 LTS.
- **Volume:** attach a Hetzner Volume (≥40 GB) for `mongo`, `meili`, `pgdata`,
  `uploads`, `images`, `logs` bind-mounts — keeps data off the boot disk and
  snapshottable.
- **Firewall (Hetzner Cloud Firewall):** inbound `22` (SSH, lock to your IP),
  `80`, `443` only. **Do not** expose 27017/7700/8000/3080.
- Point DNS: create an **A record** `chat.360ai.com → <server IPv4>` (and AAAA for
  IPv6) at whoever runs 360AI DNS. TTL 300 while testing.

Harden: create a non-root sudo user, disable password SSH, `ufw` mirroring the
cloud firewall, enable `unattended-upgrades`.

---

## 2. Install runtime

```bash
# Docker Engine + compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after
```

Clone the fork (deploy key or PAT for the private repo):

```bash
git clone git@github.com:<org>/chat.360ai.git /opt/chat360
cd /opt/chat360
git checkout main   # or the release branch you cut
```

---

## 3. Reverse proxy + TLS — Caddy in a container (shipped in `deploy-compose.override.yml`)

The bundled `client/nginx.conf` expects **you to supply certs** on disk
(`/etc/nginx/ssl/nginx.crt`) — manual Let's Encrypt renewal. Instead the override
runs **Caddy as a container** in the same stack: it owns 80/443, gets an automatic
Let's Encrypt cert for the subdomain, auto-renews, and proxies to `api:3080` over
the internal docker network. No host-level proxy to install.

`deploy/Caddyfile` (already committed) reads the domain/email from `.env`:

```
{
	email {$ACME_EMAIL}
}
{$CHAT_DOMAIN} {
	encode zstd gzip
	reverse_proxy api:3080
	request_body { max_size 100MB }
}
```

> Alternative if you'll host **many** 360AI services on this box:
> **Coolify** (self-hosted PaaS) or **Traefik** with Docker labels — a UI + git-push
> deploys + per-app TLS. For just this app, the shipped Caddy service is less overhead.

---

## 4. Compose overrides (build our fork, add Caddy, drop bundled nginx)

`deploy-compose.override.yml` (committed) does three things on top of
`deploy-compose.yml`. **Compose does NOT auto-merge it onto `deploy-compose.yml`**
(auto-merge only applies to the default `docker-compose.yml`), so every command
must pass both `-f` files — `deploy/manage.sh` does this for you.

```yaml
services:
  api:
    image: chat360/librechat:latest       # OUR fork, not the upstream image
    build: { context: ., dockerfile: Dockerfile.multi, target: api-build }
    ports: !override ["127.0.0.1:3080:3080"]   # loopback-only; Caddy fronts it
  client:
    profiles: ["disabled"]                 # switch off the bundled nginx
  caddy:
    image: caddy:2-alpine                  # 80/443 + auto Let's Encrypt
    # …ports, Caddyfile mount, caddy_data volume
```

> `!override` (Compose v2.24+) *replaces* the inherited `3080:3080` published port
> instead of appending — without it you'd get a duplicate-port error. The
> `get.docker.com` script installs a new-enough Compose.

Build + run (or just `./deploy/manage.sh up`):

```bash
docker compose -f deploy-compose.yml -f deploy-compose.override.yml up -d --build
```

> Building on a 4 GB box can OOM the client bundle. Either use CPX31+, lower the
> `NODE_MAX_OLD_SPACE_SIZE` build arg (the override sets `3072`), add swap, **or**
> use the CI image (§4a) so the box never builds. CI-pull is the cleaner long-term path.

### 4a. CI-built image (recommended) — the box only pulls

`.github/workflows/deploy-image.yml` builds the `api-build` stage and pushes it to
GHCR (`ghcr.io/360work/360ai-chat`) on every push to `main`, on `vX.Y.Z` tags, and
on manual dispatch. Tags: `latest`, `<branch>`, `sha-<short>` (immutable — pin prod
to this), and semver on releases. Nothing to configure — `GITHUB_TOKEN` already has
`packages: write`.

On the server, switch from build-on-box to pull:

```bash
# one-time: authenticate to GHCR (package is private) with a read:packages PAT
echo <PAT> | docker login ghcr.io -u <github-user> --password-stdin

# in .env, point at the tag you want:
CHAT_IMAGE=ghcr.io/360work/360ai-chat:latest      # or sha-<short> to pin

./deploy/manage.sh deploy     # pulls that image + starts, no local build
```

`CHAT_IMAGE` is read by `deploy-compose.override.yml`; when unset it falls back to a
local build (`./deploy/manage.sh up`). Roll out a new version later with just
`./deploy/manage.sh deploy` (re-pulls `latest`) — or bump the pinned `sha-` tag.

---

## 5. Production `.env` (the part that actually differs)

Copy `.env.example` → `.env` and set, at minimum:

```bash
HOST=0.0.0.0                 # inside the container (compose already sets this)
PORT=3080
DOMAIN_CLIENT=https://chat.360ai.com
DOMAIN_SERVER=https://chat.360ai.com
TRUST_PROXY=1                # REQUIRED behind Caddy/Traefik/nginx

# --- Fresh secrets (do NOT reuse the local dev values in the repo) ---
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
CREDS_KEY=<openssl rand -hex 32>
CREDS_IV=<openssl rand -hex 16>
MEILI_MASTER_KEY=<openssl rand -hex 32>

# --- OIDC against the PRODUCTION 360AI provider ---
OPENID_ISSUER=https://360ai.com            # production issuer, not 360ai.test
OPENID_CLIENT_ID=<prod Passport client id>
OPENID_CLIENT_SECRET=<prod secret, if non-PKCE>
OPENID_CALLBACK_URL=/oauth/openid/callback
OPENID_SCOPE=openid profile email
OPENID_USE_PKCE=true
OPENID_AUTO_REDIRECT=true
# NODE_EXTRA_CA_CERTS not needed in prod — real Let's Encrypt cert on 360ai.com
```

### Provider side (in the `360ai` / hire-suite Laravel app) — do BEFORE first login
1. Register a **production** Passport OIDC client whose redirect URI is
   `https://chat.360ai.com/oauth/openid/callback`.
2. Add that client ID to **`TRUSTED_CLIENT_IDS`** so consent is auto-skipped
   (`app/Models/Passport/Client.php` → `skipsAuthorization()`), else users hit an
   "Authorize" screen.
3. Ensure `OidcClaims` emits a production `picture` URL (uploaded photos resolve to
   `https://360ai.com/storage/...`, not `.test`).
4. `php artisan optimize:clear` on the provider after edits.

---

## 6. First-boot checklist

```bash
docker compose -f deploy-compose.yml -f deploy-compose.override.yml ps   # all healthy
docker compose ... logs -f api                                           # watch startup
curl -sI https://chat.360ai.com/health                                   # via Caddy → 200
```

- Hit `https://chat.360ai.com` → should redirect straight to 360AI login
  (`OPENID_AUTO_REDIRECT`), bounce back, and provision the user.
- If you see an "Authorize" screen → client ID missing from `TRUSTED_CLIENT_IDS`.
- If callback 400s → redirect URI mismatch in the Passport client.
- Create the first user / verify Mongo persistence survives
  `docker compose restart`.

---

## 7. Ops

- **Backups:** nightly `mongodump` + `tar` of `meili_data*`, `pgdata`, `uploads`,
  `images` → Hetzner Storage Box (`bpb`/`rsync`). Snapshot the Volume weekly.
- **Updates:** `git pull` → rebuild `api` → `docker compose up -d api`
  (or pull the new CI image). `npm run update:deployed` exists but is upstream's
  flow; our fork build path (§4) is what to automate.
- **Logs/monitoring:** `logs/` bind-mount; optionally wire the OTEL vars in
  `.env`. Add Hetzner/UptimeRobot check on `/health`.
- **Secrets:** keep `.env` `chmod 600`, out of git (already gitignored). Consider
  Docker secrets or SOPS if the team grows.

### Container registry is private (internal only)

This is an internal tool — **nothing about the image is public.**

- The GHCR image (`ghcr.io/360work/360ai-chat`) is **created private by default**,
  inheriting access from the private `360WORK/360ai-chat` repo. The image path
  appearing in the workflow / compose / this doc is just an address, not access —
  an unauthenticated pull is rejected (`denied`). Pulling requires
  `docker login ghcr.io` with a `read:packages` PAT (§4a).
- **Verify once after the first push:** repo → **Packages** → `360ai-chat` →
  **Package settings** → Visibility = **Private**; under **Manage Actions access**
  confirm only the intended repos/teams are listed.
- **Belt-and-suspenders (do this):** GitHub has no "force private on push" flag, so
  the real guardrail is org-level — **Org → Settings → Packages → Package creation →
  disable public package creation**. With that on, no member can publish a public
  package by accident, ever. Recommended for an internal-only org.

---

## 8. Decision summary

| Choice | Recommendation | Why |
|---|---|---|
| Image source | **CI → GHCR, box pulls** (§4a); on-box build as fallback | Fork ≠ upstream image; avoids build RAM on the box |
| Registry visibility | **Private** (default) + org "disable public package creation" | Internal tool — never public |
| TLS / proxy | **Caddy container** (or Coolify if multi-app) | Auto Let's Encrypt for one subdomain, no host setup |
| `client` nginx container | **Disable** | Caddy replaces it; avoids double proxy + manual certs |
| DB | Bundled Mongo/Meili/pgvector on the box | Fine at this scale; move Mongo to Atlas only if HA needed |
| Server | **CPX31 (8 GB)** + attached Volume | Full stack in one box; Volume = snapshottable data |
