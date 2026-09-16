# 部署文档 —— AI 视频制作智能体

本文档描述在腾讯云服务器（Ubuntu）上通过 Docker Compose 部署本项目，并通过域名 + HTTPS 对外访问。

- 部署方式：Docker Compose，在服务器上构建镜像（`up -d --build`）
- 组件：Next.js 应用 + MySQL 8.0（均为容器）+ 宿主机 Nginx 反向代理 + Let's Encrypt 证书
- 参考配置：4 核 4G / 40G SSD 足够运行
- 基础镜像：`node:20-bookworm`，Chromium 与系统依赖在构建时安装（不再用 1G+ 的 Playwright 官方镜像）

> 首次部署强烈建议先通读第 10 节「踩坑与经验总结」——境内网络环境下几乎每一步都要换国内源，否则会卡在各种超时上。

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
10. [踩坑与经验总结](#10-踩坑与经验总结)

## 1. 服务器准备

腾讯云控制台安全组放行 **80、443** 端口（22 保留给 SSH）。不要放行 3306。

安装 Docker（含 compose 插件）：

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
docker compose version   # 确认 compose 可用
```

**配置镜像加速器（必做，否则拉 docker.io 镜像会超时）**。境内直连 Docker Hub 极慢甚至失败，创建 `/etc/docker/daemon.json`：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com"
  ]
}
EOF
sudo systemctl restart docker
```

> `mirror.ccs.tencentyun.com` 是腾讯云容器镜像加速器，在腾讯云服务器上走内网、不消耗公网流量。验证：`docker run --rm hello-world` 能成功拉取即 OK。

安装 git：

```bash
sudo apt update && sudo apt install -y git
```

## 2. 拉取代码

```bash
git clone https://github.com/sunshine221/ai-video-agent.git
cd ai-video-agent
```

> **境内 clone GitHub 慢/失败**：加个加速前缀即可，例如
> `git clone https://ghfast.top/https://github.com/sunshine221/ai-video-agent.git`
> （加速站点可能不稳定，失效时换其它 GitHub 代理前缀）。克隆完成后建议把 remote 改回原始地址，方便后续 `git pull`：
> `git remote set-url origin https://github.com/sunshine221/ai-video-agent.git`

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

首次构建会拉取 `node:20-bookworm`、装依赖、下载 Chromium、装系统库并跑 `next build`，全流程约 5 分钟（换过国内源后）。Dockerfile 已内置国内源加速（apt 换腾讯云内网源、npm 换 npmmirror、Chromium/ffmpeg 二进制走 cdn.npmmirror.com），无需手动干预。启动后应用只监听 `127.0.0.1:3000`，MySQL 只监听 `127.0.0.1:3306`，都不直接对外。

> 分层缓存：浏览器二进制、系统依赖只依赖 `package.json`/playwright 版本，不依赖业务代码。改代码重新部署时这些重活命中缓存，只重跑 `next build`，几十秒完成。

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

先确认域名已解析到本服务器公网 IP（两条应一致）：

```bash
curl -s https://ipinfo.io/ip; echo   # 本机公网 IP
dig +short your-domain.com           # 域名解析结果
```

创建 `/etc/nginx/sites-available/your-domain.com`（把 `your-domain.com` 换成你的域名）：

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # 上传大文件（视频素材）放宽限制
    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # 生成/导出等长耗时任务，放宽超时
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        # SSE 流式生成（逐帧进度）：必须关闭响应缓冲，否则 nginx 会把进度事件
        # 攒在缓冲区里，前端在整个任务结束前看不到任何进度（表现为“卡住无反应”）。
        proxy_buffering off;
        proxy_cache off;
    }
}
```

启用站点、去掉默认站点并申请证书：

```bash
sudo ln -sf /etc/nginx/sites-available/your-domain.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 先测 80 端口反代是否通（应返回 307 跳转登录页）
curl -I http://your-domain.com

# certbot 自动改写配置加上 443 与证书，并配置自动续期
# 交互中：填邮箱 → 同意条款 → 询问是否重定向 HTTP→HTTPS 时选 2（Redirect）
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

完成后访问 `https://your-domain.com`，地址栏应带小锁。验证：

```bash
curl -I https://your-domain.com   # 307 跳转登录页
curl -I http://your-domain.com    # 301 自动跳 HTTPS
```

> 前提：域名已完成备案（腾讯云境内服务器要求），DNS 已解析到服务器公网 IP，且**腾讯云安全组已放行 80、443**。若 `curl -I http://your-domain.com` 卡住/超时，基本就是安全组没放行 80。

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

## 10. 踩坑与经验总结

本节记录首次部署实际踩到的坑与解决方案，核心结论：**境内网络环境下，从拉镜像到装依赖的每一步默认都会走境外源，几乎都要换国内源**。Dockerfile 里的加速已经内置，但服务器层面（Docker、git、apt）的加速需要手动配一次。

### 关键坑位一览

| 环节 | 症状 | 根因 | 解决 |
|------|------|------|------|
| 拉 docker.io 镜像 | `hello-world` / `node:20` 拉取 i/o timeout | 境内直连 Docker Hub 极慢 | 配 `/etc/docker/daemon.json` 加腾讯云镜像加速器（见第 1 节） |
| git clone GitHub | 连接被重置 / 超时 | GitHub 境内不稳定 | 用 `ghfast.top` 等加速前缀（见第 2 节） |
| `playwright install-deps`（apt 装系统库）| 卡在 `Get:.. deb.debian.org` 300s+ | Debian 官方源境内慢 | Dockerfile 已换腾讯云内网 apt 源，从 314s 降到 25s |
| `npm ci` 装 ffmpeg-static | `Request timed out after 30019ms` | ffmpeg 二进制默认从 GitHub 下载 | Dockerfile 已设 `FFMPEG_BINARIES_URL` 走 cdn.npmmirror.com |
| `next build` | `Environment variable not found: DATABASE_URL` | `/api/styles` 读库路由被静态预渲染 | 该路由已加 `export const dynamic = 'force-dynamic'` |
| Playwright 官方镜像 | `mcr.microsoft.com` 拉取极慢（1G+） | 官方镜像大且境外 | 改用 `node:20-bookworm` + 构建时装 Chromium |

### Dockerfile 里已内置的加速（无需再改）

- **apt 源**：`sed` 把 `deb.debian.org` / `security.debian.org` 换成 `mirrors.tencentyun.com`（deb822 格式，改的是 `/etc/apt/sources.list.d/debian.sources`）
- **npm 源**：`npm config set registry https://registry.npmmirror.com`
- **Chromium 二进制**：`PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`
- **ffmpeg 二进制**：`FFMPEG_BINARIES_URL=https://cdn.npmmirror.com/binaries/ffmpeg-static`

> 换源均指向腾讯云内网 / npmmirror，在腾讯云服务器上速度最快且不额外消耗公网流量。若换其它云厂商，把 `mirrors.tencentyun.com` 换成对应内网源即可（如阿里云 `mirrors.cloud.aliyuncs.com`）。

### 经验

1. **先配加速，再动手**。部署前先把 Docker 镜像加速器配好，能省掉后面反复超时的痛苦。
2. **善用分层缓存**。Dockerfile 已把「装依赖 / 下载浏览器 / 装系统库」和「业务代码」分层。只要不改 `package.json`，改代码重新部署只重跑 `next build`，几十秒完成，不会重新下载浏览器。
3. **构建慢先看卡在哪一步**。`docker compose up -d --build` 输出会显示当前在哪个 `RUN`，卡住基本都是某个源在境外。定位到具体命令再针对性换源，比盲目重试有效。
4. **密码别用特殊字符**。`.env` 里的 `MYSQL_ROOT_PASSWORD` 含 `@` `:` `/` 等字符会破坏 `DATABASE_URL` 拼接，也容易在 shell 里出问题。用字母数字组合最省心。
5. **改完 Dockerfile 记得提交**。服务器上临时改的加速配置要同步回仓库的 Dockerfile，否则下次全新部署又得重踩一遍。本项目的加速已全部提交，开箱即用。
6. **安全组是隐形坑**。Nginx 配好但外网访问不了，八成是腾讯云安全组没放行 80/443，先查这里。

### 安全提醒

- **API Key 轮换**：`.env` 里的 AI 网关 Key 若在任何日志/对话/截图中暴露过，务必去控制台重新生成并替换，然后 `docker compose up -d` 重启 app。
- **不要放行 3306**：MySQL 只绑定 `127.0.0.1`，远程访问一律走 SSH 隧道（见第 8 节）。
