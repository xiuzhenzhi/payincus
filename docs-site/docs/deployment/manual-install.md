# 手动部署

手动部署适合已有 PostgreSQL、Nginx、systemd、证书和运维流程的环境。生产环境仍推荐前后台双域名、后端只监听内网或本机地址。

以下示例假设：

```text
安装目录：/opt/incudal
用户端域名：https://panel.example.com
后台域名：https://admin.example.com
后端地址：127.0.0.1:3001
```

## 运行依赖

服务器需要 Node.js 20+、pnpm、PostgreSQL、Nginx 和 systemd。Incus 节点和 Agent 可以在同机或独立机器上部署。

```bash
corepack enable
corepack prepare pnpm@9.14.2 --activate
node -v
pnpm -v
```

## 目录与用户

```bash
sudo useradd --system --home /opt/incudal --shell /usr/sbin/nologin incudal 2>/dev/null || true
sudo mkdir -p /opt/incudal/current /opt/incudal/releases /opt/incudal/update-logs
sudo chown -R incudal:incudal /opt/incudal
```

原子 OTA 布局下，`/opt/incudal/current` 指向当前 release。手动部署也建议使用这个结构，后续可以直接接入后台 OTA。

## 环境变量

复制 `.env.example` 后按 [环境变量](/deployment/environment) 配置生产值。最低必须配置：

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

生产不要设置 `RESET_DATABASE`。支付、SMTP、Telegram、Turnstile、Lsky、扩展市场、主题市场和 OTA 变量按实际业务逐项开启。

## 安装依赖

```bash
pnpm install --frozen-lockfile
pnpm --filter server exec prisma generate
```

## 数据库迁移

```bash
pnpm --filter server exec prisma migrate deploy
```

如果是生产迁移，先备份 PostgreSQL，再执行迁移。不要在生产使用开发 reset 命令。

## 构建

```bash
VITE_API_BASE_URL=/api \
VITE_CUSTOMER_BASE_URL=https://panel.example.com \
VITE_ADMIN_BASE_URL=https://admin.example.com \
pnpm build
```

构建后应存在：

```text
client/dist/user/index.html
client/dist/admin/index.html
server/dist/app.js
```

`pnpm build` 会同时运行前端边界守卫，防止用户端和后台构建产物混用。

## 后端启动

临时启动可以直接运行：

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

生产必须交给 systemd 管理，参考 [systemd 服务](/deployment/systemd)。服务工作目录应指向 `/opt/incudal/current`，环境变量从 `/opt/incudal/.env` 读取。

## Nginx

用户端和后台必须使用不同域名和不同静态目录：

```text
panel.example.com -> /opt/incudal/current/client/dist/user
admin.example.com -> /opt/incudal/current/client/dist/admin
```

`/api/` 和 `/api/ws/` 反代到后端。模板见 [Nginx 分离部署](/deployment/nginx)。

## 验证

部署完成后执行：

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

最终生产验收仍需要真实支付、真实 Incus/Agent、SMTP/通知、Turnstile、备份恢复和响应头 proof，详见 [生产验收](/deployment/production-checklist)。
