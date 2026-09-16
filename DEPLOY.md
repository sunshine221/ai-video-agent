# 部署文档 —— AI 视频制作智能体

本文档描述在腾讯云服务器（Ubuntu 22.04）上通过 Docker Compose 部署本项目，并通过域名 + HTTPS 对外访问。

- 部署方式：Docker Compose，在服务器上构建镜像（`up -d --build`）
- 组件：Next.js 应用 + MySQL 8.0（均为容器）+ 宿主机 Nginx 反向代理 + Let's Encrypt 证书
- 参考配置：4 核 4G / 40G SSD 足够运行

---

## 目录

1. [服务器准备](#1-服务器准备)
2. [拉取代码](#2-拉取代码)
3. [配置环境变量](#3-配置环境变量)
4. [构建并启动](#4-构建并启动)
5. [配置 Nginx 与 HTTPS](#5-配置-nginx-与-https)
6. [创建账号](#6-创建账号)
7. [日常更新](#7-日常更新)
8. [数据库备份与远程访问](#8-数据库备份与远程访问)
9. [常见问题](#9-常见问题)

## 1. 服务器准备

腾讯云控制台安全组放行 **80、443** 端口（22 保留给 SSH）。不要放行 3306。

安装 Docker（含 compose 插件）：

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
docker compose version   # 确认 compose 可用
```

安装 git：

```bash
sudo apt update && sudo apt install -y git
```

## 2. 拉取代码

```bash
git clone https://github.com/sunshine221/ai-video-agent.git
cd ai-video-agent
```

## 3. 配置环境变量

以 `.env.example` 为模板创建 `.env`：

```bash
cp .env.example .env
```

编辑 `.env`，重点填写以下项：

| 变量 | 说明 |
|------|------|
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码，换成强随机串 |
| `MYSQL_DATABASE` | 数据库名，默认 `ai_video` |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | 文本模型网关（OpenAI 兼容协议），必填 |
| `IMAGE_API_BASE_URL` / `IMAGE_API_KEY` | 图片生成（用图片模式才需要） |
| `NEXTAUTH_SECRET` | 会话加密密钥，用 `openssl rand -base64 32` 生成 |
| `NEXTAUTH_URL` | 必须是你的正式域名，如 `https://your-domain.com` |

> **重要**：`.env` 里的值**不要加引号**。应用启动时会把「以引号开头的值」判为无效，且 compose 对引号处理与版本有关。写成 `AI_API_KEY=sk-xxx` 而不是 `AI_API_KEY="sk-xxx"`。

> `DATABASE_URL` 无需手动填 —— compose 会自动用 `MYSQL_ROOT_PASSWORD`/`MYSQL_DATABASE` 拼装成容器内网地址覆盖它。

生成 `NEXTAUTH_SECRET`：

```bash
openssl rand -base64 32
```

## 4. 构建并启动

```bash
docker compose up -d --build
```

首次会下载 Playwright 基础镜像（1G+）并构建，耗时较久。启动后应用只监听 `127.0.0.1:3000`，MySQL 只监听 `127.0.0.1:3306`，都不直接对外。

查看日志确认迁移成功、应用就绪：

```bash
docker compose logs -f app
```

看到 Next.js `ready` 且无 migrate 报错即可。本机自测：

```bash
curl -I http://127.0.0.1:3000
```

启动时会自动执行 `prisma migrate deploy`，套用建表迁移并写入 5 套内置风格预设（幂等，重复启动不会重复插入）。

## 5. 配置 Nginx 与 HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

创建 `/etc/nginx/sites-available/ai-video`（把 `your-domain.com` 换成你的域名）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 导出的 MP4 / 上传较大，放开体积限制（对应 next.config 的 20mb）
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 生成/导出是 SSE 长任务：关闭缓冲、加长超时
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

启用站点并申请证书：

```bash
sudo ln -s /etc/nginx/sites-available/ai-video /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# certbot 自动改写配置加上 443 与证书，并配置自动续期
sudo certbot --nginx -d your-domain.com
```

完成后访问 `https://your-domain.com`。

> 前提：域名已完成备案（腾讯云境内服务器要求），且 DNS 已解析到服务器公网 IP。

## 6. 创建账号

系统为邮箱密码登录。打开 `https://your-domain.com/login`，通过页面注册入口创建第一个账号即可。

## 7. 日常更新

代码更新后，在服务器项目目录执行更新脚本：

```bash
bash scripts/deploy.sh
```

脚本会依次完成：**备份数据库 → git pull → 重建重启容器 → 清理旧镜像**（仅保留最近 7 个数据库备份）。

或手动执行：

```bash
git pull
docker compose up -d --build
docker image prune -f
```

数据不会丢：MySQL 数据在 `mysql_data` 卷，生成的图片/音频/导出在宿主机 `./data`。

> 关于库表变更：`prisma migrate deploy` 只执行新增的迁移，加字段等操作对历史数据安全；涉及删列/改列时需先审查迁移 SQL。每次更新前脚本会自动备份，可放心操作。

### 回滚到上一次版本

`deploy.sh` 每次重建前会把当前镜像保存为 `ai-video-agent:rollback`（只保留最近一次）。新版本出问题时，一键切回：

```bash
bash scripts/rollback.sh
```

脚本会把回滚镜像重新标为 `:latest` 并用 `--no-build` 启动（不重新构建，秒级切换）。

> 注意：回滚只切换**应用镜像**，不回滚数据库。若新版本执行过破坏性迁移（删列/改列），需配合 `backups/` 下对应时间点的备份用 `mysql` 命令恢复数据。

## 8. 数据库备份与远程访问

### 手动备份 / 恢复

```bash
# 备份
docker compose exec mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" ai_video > backup.sql

# 恢复
docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ai_video < backup.sql
```

### 远程访问（SSH 隧道，推荐）

MySQL 只绑定服务器本地回环（`127.0.0.1:3306`），公网无法直连，通过 SSH 隧道安全访问。

在**本地电脑**建立隧道：

```bash
ssh -L 13306:127.0.0.1:3306 root@你的服务器公网IP -N
```

隧道开启时，本地工具连 `127.0.0.1:13306`、用户 `root`、密码为 `.env` 里的 `MYSQL_ROOT_PASSWORD`、库名 `ai_video` 即可。

Navicat / DBeaver 用户可直接在连接设置的「SSH」标签页配置隧道，无需手敲命令：常规页填 `127.0.0.1:3306` + root，SSH 页填服务器公网 IP + 22 端口 + SSH 登录凭据。

## 9. 常见问题

**构建时内存不足（OOM）**
4G 内存一般够用。若仍失败，可临时加 swap：
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

**磁盘占满**
定期清理：`docker image prune -f`、`docker builder prune -f`，并清理 `data/exports/` 下旧的 MP4。查看占用：`docker system df`、`du -sh data/*`。

**应用起不来 / 报缺少环境变量**
检查 `.env` 里 `DATABASE_URL`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 是否齐全，且值**没有引号**。看日志：`docker compose logs app`。

**AI 网关连不上**
确认服务器能访问 `AI_BASE_URL`。若网关在境外且直连不稳，需在服务器上配置代理。

**登录后跳转异常**
检查 `NEXTAUTH_URL` 是否填成了正式的 `https://域名`，而非 `localhost`。
