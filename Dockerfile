# AI 视频制作智能体 —— 生产镜像
# 基于官方 Playwright 镜像：自带 Chromium 与全部系统依赖，版本需与 package.json 中 playwright 对齐
FROM mcr.microsoft.com/playwright:v1.63.0-jammy AS base

# 让 Playwright 使用镜像内置的浏览器（/ms-playwright），避免再次下载
# 注意：base 阶段不设 NODE_ENV=production，否则 deps 阶段 npm ci 会跳过
# devDependencies（typescript / tailwindcss / postcss / prisma CLI 等），导致构建失败。
# NODE_ENV=production 只在最后的 runner 阶段设置。
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# --- 依赖层：先装全部依赖（含 devDependencies，构建需要）---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- 构建层：生成 Prisma Client 并构建 Next.js ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build

# --- 运行层：仅保留运行所需 ---
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# 启动前执行数据库迁移（含风格预设 seed），随后启动 Next.js
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
