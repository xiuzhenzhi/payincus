# 一键安装

生产安装推荐使用 `scripts/install-panel.sh`。脚本会从 GitHub Release 下载 PayIncus 预构建包，初始化数据库和 `.env`，创建 systemd 服务，并配置用户端和管理端 Nginx 站点。

## 前置要求

- 一台干净的 Linux 服务器，推荐 Debian / Ubuntu。
- root 或 sudo 权限。
- 两个公网域名：
  - 用户端：`panel.example.com`
  - 管理后台：`admin.example.com`
- 域名 A/AAAA 记录已指向服务器。
- 服务器 80/443 端口可被公网访问。

默认安装目录是 `/opt/incudal`。这是当前安装脚本、systemd、OTA 和生产 release 布局使用的真实路径。

## 安装命令

```bash
curl -fsSL https://raw.githubusercontent.com/VipMaxxxx/payincus/main/scripts/install-panel.sh -o install-panel.sh
sudo bash install-panel.sh
```

安装过程中按提示输入：

- 用户端域名。
- 管理后台域名。
- 初始管理员邮箱，留空默认 `admin@payincus.local`。
- 初始管理员密码，生产必须使用强密码。

## 脚本会做什么

- 安装 Node.js、pnpm、PostgreSQL、Redis、Nginx 和 systemd 依赖。
- 创建数据库连接和 `/opt/incudal/.env`。
- 下载最新 GitHub Release artifact。
- 解压 PayIncus 到 `/opt/incudal`。
- 执行 Prisma migration 和 Prisma Client 生成。
- 创建 `incudal` 系统用户和 `incudal-backend` 服务。
- 创建插件、主题、OTA、证书、缓存和日志目录。
- 写入用户端和管理端 Nginx 配置。
- 设置 `FRONTEND_URL`、`ADMIN_FRONTEND_URL`、`SITE_URL` 和 `PAYMENT_CALLBACK_BASE_URL`。

## 升级和卸载

```bash
sudo bash install-panel.sh --upgrade
sudo bash install-panel.sh --uninstall
```

升级会保留 `.env`、证书、插件、主题、运行缓存和 OTA 目录。卸载会提示确认后删除安装目录和服务。

## 安装后检查

```bash
systemctl status incudal-backend --no-pager
journalctl -u incudal-backend -n 100 --no-pager
```

访问：

```text
https://panel.example.com
https://admin.example.com
```

执行生产 split 验证：

```bash
cd /opt/incudal/current 2>/dev/null || cd /opt/incudal
FRONTEND_URL=https://panel.example.com \
ADMIN_FRONTEND_URL=https://admin.example.com \
BACKEND_URL=http://127.0.0.1:3001 \
pnpm verify:split:host
```

如果你启用了原子 OTA 布局，当前运行目录是 `/opt/incudal/current`；旧布局则是 `/opt/incudal`。
