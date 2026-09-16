# AI 视频制作智能体 —— 生产镜像
# 基于 docker.io 的 node 镜像（可走国内 registry 加速器），
# Chromium 及系统依赖在构建时用 playwright 安装，浏览器二进制走 npmmirror 加速。
# 分层设计：浏览器二进制与系统依赖只依赖 package.json / playwright 版本，
#   不依赖业务代码，因此改代码重新部署时这些重活都命中缓存，只重跑 next build。
FROM node:20-bookworm AS base

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# 换腾讯云内网 apt 源（deb822 格式），避免 playwright install-deps 从官方源慢速下载。
# 在腾讯云服务器上构建走内网，速度最快。
RUN sed -i 's|http://deb.debian.org|http://mirrors.tencentyun.com|g' /etc/apt/sources.list.d/debian.sources \
 && sed -i 's|http://security.debian.org|http://mirrors.tencentyun.com|g' /etc/apt/sources.list.d/debian.sources
RUN npm config set registry https://registry.npmmirror.com

# --- 依赖层：装全部依赖（含 devDependencies）+ 下载 Chromium 二进制 ---
# 仅依赖 package 文件；浏览器二进制从 npmmirror 下载，装到 /ms-playwright
FROM base AS deps
COPY package.json package-lock.json ./
# ffmpeg-static 安装时会额外下载 ffmpeg 二进制，默认从 GitHub 拉取（境内超时），
# 用 npmmirror 的镜像地址加速。
ENV FFMPEG_BINARIES_URL=https://cdn.npmmirror.com/binaries/ffmpeg-static
RUN npm ci
RUN npx playwright install chromium

# --- 构建层：生成 Prisma Client 并构建 Next.js ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build

# --- 运行层 ---
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000

# 先拷 node_modules，再装 Chromium 运行所需的系统库（apt）。
# 这两层只依赖 playwright 版本，不依赖业务代码，改代码时命中缓存。
COPY --from=builder /app/node_modules ./node_modules
RUN npx playwright install-deps chromium
# 复用 deps 阶段已下载的浏览器二进制，无需重新下载
COPY --from=deps /ms-playwright /ms-playwright

# 业务代码放最后，改动只影响这些层
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# 启动前执行数据库迁移（含风格预设 seed），随后启动 Next.js
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
