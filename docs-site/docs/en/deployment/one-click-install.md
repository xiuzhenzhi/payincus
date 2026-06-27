# One-click Install

The recommended production path is `scripts/install-panel.sh`. The script downloads the PayIncus GitHub Release artifact, initializes the database and `.env`, creates systemd services, and configures separate Nginx sites for the user portal and admin console.

## Requirements

- A clean Linux server, preferably Debian or Ubuntu.
- root or sudo access.
- Two public domains:
  - User portal: `panel.example.com`
  - Admin console: `admin.example.com`
- A/AAAA records already point to the server.
- Public access to ports 80 and 443.

The default install directory is `/opt/incudal`. This is the real path used by the installer, systemd templates, OTA worker, and production release layout.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/VipMaxxxx/payincus/main/scripts/install-panel.sh -o install-panel.sh
sudo bash install-panel.sh
```

During installation, provide:

- User portal domain.
- Admin console domain.
- Initial admin email. Empty input defaults to `admin@payincus.local`.
- Initial admin password. Use a strong password in production.

## What It Does

- Installs Node.js, pnpm, PostgreSQL, Redis, Nginx, and systemd dependencies.
- Creates the database connection and `/opt/incudal/.env`.
- Downloads the latest GitHub Release artifact.
- Extracts PayIncus into `/opt/incudal`.
- Runs Prisma migrations and Prisma Client generation.
- Creates the `incudal` system user and `incudal-backend` service.
- Creates plugin, theme, OTA, certificate, cache, and log directories.
- Writes Nginx configuration for both domains.
- Sets `FRONTEND_URL`, `ADMIN_FRONTEND_URL`, `SITE_URL`, and `PAYMENT_CALLBACK_BASE_URL`.

## Upgrade and Uninstall

```bash
sudo bash install-panel.sh --upgrade
sudo bash install-panel.sh --uninstall
```

Upgrade preserves `.env`, certificates, plugins, themes, runtime cache, and OTA directories. Uninstall asks for confirmation before removing services and the install directory.

## Post-install Checks

```bash
systemctl status incudal-backend --no-pager
journalctl -u incudal-backend -n 100 --no-pager
```

Open:

```text
https://panel.example.com
https://admin.example.com
```

Run split deployment verification:

```bash
cd /opt/incudal/current 2>/dev/null || cd /opt/incudal
FRONTEND_URL=https://panel.example.com \
ADMIN_FRONTEND_URL=https://admin.example.com \
BACKEND_URL=http://127.0.0.1:3001 \
pnpm verify:split:host
```

If atomic OTA layout is enabled, the runtime directory is `/opt/incudal/current`; otherwise it is `/opt/incudal`.
