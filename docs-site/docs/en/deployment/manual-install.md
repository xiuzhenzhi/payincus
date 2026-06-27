# Manual Install

Manual deployment is for environments that already manage PostgreSQL, Nginx, systemd, TLS certificates and release operations. Production should still use two public frontend domains and a backend that listens only on localhost or an internal address.

This guide assumes:

```text
Install directory: /opt/incudal
User portal: https://panel.example.com
Admin console: https://admin.example.com
Backend: 127.0.0.1:3001
```

## Runtime Dependencies

The server needs Node.js 20+, pnpm, PostgreSQL, Nginx and systemd. Incus hosts and Agents can run on the same machine or separate machines.

```bash
corepack enable
corepack prepare pnpm@9.14.2 --activate
node -v
pnpm -v
```

## Directories and User

```bash
sudo useradd --system --home /opt/incudal --shell /usr/sbin/nologin incudal 2>/dev/null || true
sudo mkdir -p /opt/incudal/current /opt/incudal/releases /opt/incudal/update-logs
sudo chown -R incudal:incudal /opt/incudal
```

In the atomic OTA layout, `/opt/incudal/current` points to the active release. Manual deployments should use the same shape so the admin OTA workflow can be enabled later.

## Environment

Start from `.env.example` and configure production values. The minimum production set is:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
TRUST_PROXY=true
SERVE_STATIC_CLIENT=false

DATABASE_URL=postgresql://incudal:change_me@127.0.0.1:5432/incudal
JWT_SECRET=change_me_generate_with_openssl_rand_base64_48
COOKIE_SECRET=change_me_generate_with_openssl_rand_base64_48
ENCRYPTION_KEY=change_me_generate_with_openssl_rand_base64_48

FRONTEND_URL=https://panel.example.com
ADMIN_FRONTEND_URL=https://admin.example.com
SITE_URL=https://panel.example.com
PAYMENT_CALLBACK_BASE_URL=https://panel.example.com

VITE_API_BASE_URL=/api
VITE_CUSTOMER_BASE_URL=https://panel.example.com
VITE_ADMIN_BASE_URL=https://admin.example.com
```

Never set `RESET_DATABASE` in production. Enable payment, SMTP, Telegram, Turnstile, Lsky, extension marketplace, theme marketplace and OTA variables only after configuring the corresponding providers.

## Install Dependencies

```bash
pnpm install --frozen-lockfile
pnpm --filter server exec prisma generate
```

## Database Migration

```bash
pnpm --filter server exec prisma migrate deploy
```

Back up PostgreSQL before running production migrations. Do not use development reset commands on production data.

## Build

```bash
VITE_API_BASE_URL=/api \
VITE_CUSTOMER_BASE_URL=https://panel.example.com \
VITE_ADMIN_BASE_URL=https://admin.example.com \
pnpm build
```

Expected outputs:

```text
client/dist/user/index.html
client/dist/admin/index.html
server/dist/app.js
```

`pnpm build` also runs frontend boundary guards so the user and admin bundles are not mixed.

## Start Backend

For a temporary smoke run:

```bash
NODE_ENV=production \
HOST=127.0.0.1 \
PORT=3001 \
SERVE_STATIC_CLIENT=false \
FRONTEND_URL=https://panel.example.com \
ADMIN_FRONTEND_URL=https://admin.example.com \
SITE_URL=https://panel.example.com \
PAYMENT_CALLBACK_BASE_URL=https://panel.example.com \
node server/dist/app.js
```

Production should run the backend under systemd. See [systemd Service](/en/deployment/systemd). The service working directory should point at `/opt/incudal/current` and read environment variables from `/opt/incudal/.env`.

## Nginx

The user portal and admin console must use separate domains and static roots:

```text
panel.example.com -> /opt/incudal/current/client/dist/user
admin.example.com -> /opt/incudal/current/client/dist/admin
```

Proxy `/api/` and `/api/ws/` to the backend. See [Nginx Split Deployment](/en/deployment/nginx).

## Verification

```bash
FRONTEND_URL=https://panel.example.com \
ADMIN_FRONTEND_URL=https://admin.example.com \
BACKEND_URL=http://127.0.0.1:3001 \
pnpm verify:split:host
```

```bash
ENV_FILE=/opt/incudal/.env \
FRONTEND_URL=https://panel.example.com \
ADMIN_FRONTEND_URL=https://admin.example.com \
BACKEND_URL=http://127.0.0.1:3001 \
pnpm verify:production
```

Final production acceptance still requires real payment, real Incus/Agent, SMTP/notification, Turnstile, backup/restore and response-header proof. See [Production Checklist](/en/deployment/production-checklist).
