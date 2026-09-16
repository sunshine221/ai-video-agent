#!/usr/bin/env bash
# ============================================================
# AI 视频制作智能体 —— 一键更新部署脚本
# 用途：日常代码更新时在服务器上执行，自动完成
#   备份数据库 -> 拉取最新代码 -> 重建并重启容器 -> 清理旧镜像
# 首次部署请参考 DEPLOY.md，本脚本仅用于「已部署过」的更新场景。
# 用法：cd ai-video-agent && bash scripts/deploy.sh
# ============================================================
set -euo pipefail

# 切到脚本所在项目根目录（scripts 的上一级）
cd "$(dirname "$0")/.."

echo "==> [1/5] 检查 .env"
if [ ! -f .env ]; then
  echo "错误：未找到 .env 文件，请先参考 DEPLOY.md 配置好 .env 再运行。" >&2
  exit 1
fi

# 从 .env 读取数据库配置（用于备份）。去掉可能存在的引号。缺省值与 docker-compose.yml 保持一致。
MYSQL_ROOT_PASSWORD=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//')
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-password}
MYSQL_DATABASE=$(grep -E '^MYSQL_DATABASE=' .env | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//')
MYSQL_DATABASE=${MYSQL_DATABASE:-ai_video}

echo "==> [2/5] 备份数据库 ($MYSQL_DATABASE)"
mkdir -p backups
BACKUP_FILE="backups/backup_$(date +%Y%m%d_%H%M%S).sql"
if docker compose ps --status running 2>/dev/null | grep -q mysql; then
  docker compose exec -T mysql \
    mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" > "$BACKUP_FILE"
  echo "    已备份到 $BACKUP_FILE"
  # 只保留最近 7 个备份
  ls -1t backups/backup_*.sql 2>/dev/null | tail -n +8 | xargs -r rm -f
else
  echo "    MySQL 容器未运行，跳过备份（可能是首次启动）。"
fi

echo "==> [3/6] 拉取最新代码"
git pull

echo "==> [4/6] 保留当前镜像用于回滚"
# 把当前的 ai-video-agent:latest 打成 :rollback（只保留最近一次）
if docker image inspect ai-video-agent:latest >/dev/null 2>&1; then
  docker tag ai-video-agent:latest ai-video-agent:rollback
  echo "    已保存回滚镜像 ai-video-agent:rollback"
else
  echo "    未找到当前镜像，跳过（可能是首次构建）。"
fi

echo "==> [5/6] 重建并重启容器"
docker compose up -d --build

echo "==> [6/6] 清理悬空镜像与构建缓存（保留 :rollback）"
# prune 只清理无标签的悬空镜像，:rollback 有标签会被保留
docker image prune -f
docker builder prune -f

echo ""
echo "==> 部署完成，当前容器状态："
docker compose ps
echo ""
echo "查看应用日志：docker compose logs -f app"
