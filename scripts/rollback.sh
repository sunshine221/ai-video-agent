#!/usr/bin/env bash
# ============================================================
# AI 视频制作智能体 —— 回滚到上一次镜像 + 恢复数据库
# 用途：新版本部署后出问题时，切回上一次构建的镜像，并恢复
#   deploy.sh 在上次更新前自动做的数据库备份。
#   - 镜像：deploy.sh 每次重建前会保存 ai-video-agent:rollback
#   - 数据：backups/ 下最近一次备份即为「上次更新前」的库状态
# 用法：cd ai-video-agent && bash scripts/rollback.sh
# 警告：恢复数据库是覆盖性操作，会用备份覆盖当前库！执行前有确认提示。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker image inspect ai-video-agent:rollback >/dev/null 2>&1; then
  echo "错误：未找到回滚镜像 ai-video-agent:rollback，无法回滚。" >&2
  echo "（回滚镜像会在下一次执行 deploy.sh 重建时生成。）" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "错误：未找到 .env 文件。" >&2
  exit 1
fi

# 从 .env 读取数据库配置（去掉可能存在的引号）。缺省值与 docker-compose.yml 保持一致。
MYSQL_ROOT_PASSWORD=$(grep -E '^MYSQL_ROOT_PASSWORD=' .env | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//')
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD:-password}
MYSQL_DATABASE=$(grep -E '^MYSQL_DATABASE=' .env | head -n1 | cut -d= -f2- | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//')
MYSQL_DATABASE=${MYSQL_DATABASE:-ai_video}

# 找到最近一次备份
LATEST_BACKUP=$(ls -1t backups/backup_*.sql 2>/dev/null | head -n1 || true)

echo "即将执行回滚："
echo "  - 镜像：ai-video-agent:rollback -> :latest"
if [ -n "$LATEST_BACKUP" ]; then
  echo "  - 数据库：用 $LATEST_BACKUP 覆盖当前 $MYSQL_DATABASE 库"
else
  echo "  - 数据库：未找到 backups/ 下的备份，将只回滚镜像，不动数据库"
fi
echo ""
read -r -p "确认继续？该操作会覆盖当前数据库，输入 yes 继续：" CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "已取消。"
  exit 0
fi

echo "==> [1/4] 将回滚镜像标记为当前镜像"
docker tag ai-video-agent:rollback ai-video-agent:latest

# 关键顺序：先起 MySQL 并恢复数据库，再起 app。
# 否则旧镜像 app 启动时的 prisma migrate deploy 会先面对「新版 schema」，
# 若这次回滚正是因破坏性迁移，会导致迁移历史不一致、app crash-loop。
echo "==> [2/4] 仅启动 MySQL"
docker compose up -d --no-build mysql

echo "    等待 MySQL 就绪..."
for i in $(seq 1 30); do
  if docker compose exec -T mysql mysqladmin ping -h localhost -uroot -p"$MYSQL_ROOT_PASSWORD" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ -n "$LATEST_BACKUP" ]; then
  echo "==> [3/4] 恢复数据库（$LATEST_BACKUP）"
  docker compose exec -T mysql \
    mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < "$LATEST_BACKUP"
  echo "    数据库已恢复。"
else
  echo "==> [3/4] 跳过数据库恢复（无备份）"
fi

echo "==> [4/4] 启动 app（用回滚镜像，不重新构建）"
# 此时数据库已恢复为旧版状态，app 的 migrate deploy 与旧镜像迁移历史一致
docker compose up -d --no-build

echo ""
echo "==> 回滚完成，当前容器状态："
docker compose ps
echo ""
echo "查看应用日志：docker compose logs -f app"
