#!/bin/bash
# pvedc 版本更新脚本（服务器侧，root 执行）
#   stage [源码包]  解包到 /opt/pvedc-stage 并构建，不影响线上
#   upgrade         停机 → 备份 → 迁移检查 → 切换目录并安装 helper 与 unit → 启动新版本
#   rollback        恢复最近一次 upgrade 前的数据库、代码、helper 与 unit
#   status          查看服务、库版本、stage 与备份
set -Eeuo pipefail
trap 'printf "!! 第 %s 行失败（退出码 %s）\n" "$LINENO" "$?" >&2' ERR

APP=/opt/pvedc
STAGE=/opt/pvedc-stage
NODE=/opt/pvedc-runtime/bin/node
DATA=/var/lib/pvedc
DB_FILE=$DATA/pvedc.sqlite
BACKUP_ROOT=/var/backups/pvedc
SERVICE=pvedc.service
HELPER=/usr/local/libexec/pvedc-helper
UNIT=/etc/systemd/system/pvedc.service
GOST_UNIT=/etc/systemd/system/pvedc-gost.service
ROSTER_URL=http://127.0.0.1:3000/api/public/roster
version_sql="SELECT value FROM meta WHERE key='schema_version'"

log() { printf '\n== %s\n' "$*"; }
warn() { printf '!! %s\n' "$*" >&2; }
die() {
  printf '错误: %s\n' "$*" >&2
  exit 1
}

# $2 为需要输入的确认词，默认 yes
confirm() {
  local word=${2:-yes} answer=''
  read -r -p "$1，输入 $word 继续: " answer || true
  [ "$answer" = "$word" ] || die '已取消'
}

# 启动服务并等待接口可用；接口会读库，比首页 200 更能说明服务正常
start_and_check() {
  systemctl start "$SERVICE"
  local i
  for ((i = 0; i < 60; i++)); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$ROSTER_URL" || true)" = 200 ]; then return 0; fi
    sleep 1
  done
  journalctl -u "$SERVICE" -n 50 --no-pager || true
  return 1
}

# $1 为不带扩展名的库路径：检查完整性与外键，各表行数写入 $1.counts
db_check() {
  local result
  result=$(sqlite3 "$1.sqlite" 'PRAGMA integrity_check')
  [ "$result" = ok ] || die "${1##*/}.sqlite integrity_check：$result"
  result=$(sqlite3 "$1.sqlite" 'PRAGMA foreign_key_check')
  [ -z "$result" ] || die "${1##*/}.sqlite foreign_key_check 非空：$result"
  result=$(sqlite3 "$1.sqlite" "SELECT group_concat(printf('SELECT %Q, count(*) FROM \"%w\"', name, name), ' UNION ALL ') FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  sqlite3 "$1.sqlite" "$result" >"$1.counts"
}

# 备份目录名为纯数字时间戳，按名字排序取最后一个
latest_backup() {
  local dirs=("$BACKUP_ROOT"/[0-9]*-[0-9]*)
  [ -d "${dirs[-1]}" ] && printf '%s\n' "${dirs[-1]}"
  return 0
}

cmd_stage() {
  local tarball=${1:-/tmp/pvedc-src.tgz} home
  [ -f "$tarball" ] || die "找不到源码包 $tarball"
  home=$(getent passwd pvedc | cut -d: -f6) || die '系统用户 pvedc 不存在，先完成 deploy/install.sh'

  log "解包 $tarball → $STAGE"
  rm -rf -- "$STAGE"
  install -d -m755 "$STAGE"
  tar xzf "$tarball" -C "$STAGE"
  if [ -f "$APP/.env" ]; then cp -a "$APP/.env" "$STAGE/.env"; fi
  chown -R pvedc:pvedc "$STAGE"

  log '安装依赖、类型检查、构建（以 pvedc 身份）'
  runuser -u pvedc -- env HOME="$home" PATH="${NODE%/*}:$PATH" NODE_OPTIONS=--use-system-ca \
    bash -c "cd '$STAGE' && pnpm install --frozen-lockfile && pnpm typecheck && pnpm build"
  [ -f "$STAGE/.output/server/index.mjs" ] || die '构建产物缺失'
  log "stage 就绪；下一步：bash $STAGE/deploy/migrate.sh upgrade"
}

cmd_upgrade() {
  [ -f "$STAGE/.output/server/index.mjs" ] || die "缺少 $STAGE 构建，先执行 stage"
  case "$(curl -s --max-time 5 "$ROSTER_URL" || true)" in
    *'"open":true'*) confirm '资源申请仍开放，停机期间学生申请会失败' y ;;
  esac
  cmp -s "$STAGE/deploy/pvedc-helper.py" "$HELPER" || echo "   将更新 $HELPER"
  cmp -s "$STAGE/deploy/pvedc.service" "$UNIT" || echo "   将更新 $UNIT"
  cmp -s "$STAGE/deploy/pvedc-gost.service" "$GOST_UNIT" ||
    warn "$GOST_UNIT 与新版本不同；重启 pvedc-gost 会中断转发，本脚本不安装，需要时手动更新"

  local ts bk
  ts=$(date +%Y%m%d-%H%M%S)
  bk=$BACKUP_ROOT/$ts
  confirm "将停止 $SERVICE，备份到 $bk，检查迁移后切换到新版本"

  log "停止 $SERVICE（pvedc-gost 不停，转发不中断）"
  systemctl stop "$SERVICE"
  # 切换目录前任何失败都回到旧版本运行
  trap 'warn "更新未完成，重新启动旧版本"; systemctl start "$SERVICE" || true' EXIT

  log "备份到 $bk"
  install -d -m700 "$BACKUP_ROOT" "$bk"
  cp -a "$DATA" "$bk/data"
  cp -a /etc/pvedc "$bk/etc"
  cp -a "$HELPER" "$bk/pvedc-helper"
  cp -a "$UNIT" "$bk/pvedc.service"

  log '用新代码迁移备份库副本并检查'
  sqlite3 "$DB_FILE" ".backup '$bk/before.sqlite'"
  db_check "$bk/before"
  cp "$bk/before.sqlite" "$bk/after.sqlite"
  (cd "$STAGE" && "$NODE" --no-warnings --input-type=module \
    -e "const { openDatabase } = await import('./server/lib/db.ts'); openDatabase(process.argv[1]).close();" \
    "$bk/after.sqlite") || die '新代码打开备份库副本失败'
  db_check "$bk/after"
  echo "   schema_version $(sqlite3 "$bk/before.sqlite" "$version_sql") → $(sqlite3 "$bk/after.sqlite" "$version_sql")；integrity_check、foreign_key_check 通过"
  local changed
  changed=$(awk -F'|' 'NR == FNR { a[$1] = $2; next } { b[$1] = $2 }
    END {
      for (t in a) if (!(t in b)) print "   " t ": " a[t] " → 无此表"; else if (a[t] != b[t]) print "   " t ": " a[t] " → " b[t]
      for (t in b) if (!(t in a) && b[t] != 0) print "   " t ": 无此表 → " b[t]
    }' "$bk/before.counts" "$bk/after.counts")
  if [ -n "$changed" ]; then
    printf '   行数变化：\n%s\n' "$changed"
    confirm '迁移后行数有变化，确认是新版本有意为之'
  else
    echo "   $(wc -l <"$bk/before.counts") 张表行数一致"
  fi

  log "切换：$APP → $APP-before-$ts，$STAGE → $APP，安装 helper 与 $SERVICE unit"
  mv "$APP" "$APP-before-$ts"
  mv "$STAGE" "$APP"
  trap - EXIT
  install -m755 "$APP/deploy/pvedc-helper.py" "$HELPER" && install -m644 "$APP/deploy/pvedc.service" "$UNIT" &&
    systemctl daemon-reload || die "安装 helper 或 unit 失败，执行 bash $APP/deploy/migrate.sh rollback"
  log '启动新版本（启动时迁移线上库）'
  start_and_check || die "新版本启动失败，执行 bash $APP/deploy/migrate.sh rollback"
  log "更新完成；登录管理端点检后重新开放资源申请。回滚：bash $APP/deploy/migrate.sh rollback"
}

cmd_rollback() {
  local bk ts
  bk=$(latest_backup)
  [ -n "$bk" ] || die "$BACKUP_ROOT 下没有备份"
  ts=${bk##*/}
  [ -d "$APP-before-$ts" ] && [ -f "$bk/before.sqlite" ] || die "最近的备份 $bk 没有对应的切换记录，无需回滚"
  [ -f "$bk/pvedc-helper" ] && [ -f "$bk/pvedc.service" ] || die "$bk 缺少 helper 或 unit 备份"
  confirm "将停止 $SERVICE，用 $bk 还原数据库、helper 与 unit，$APP-before-$ts 还原代码；更新后写入的数据会丢失"

  systemctl stop "$SERVICE"
  rm -f -- "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
  install -m600 -o pvedc -g pvedc "$bk/before.sqlite" "$DB_FILE"
  install -m755 "$bk/pvedc-helper" "$HELPER"
  install -m644 "$bk/pvedc.service" "$UNIT"
  systemctl daemon-reload
  rm -rf -- "$APP"
  mv "$APP-before-$ts" "$APP"
  start_and_check || die '回滚后服务未能启动，请人工检查'
  log "回滚完成（备份保留在 $bk）"
}

cmd_status() {
  echo "服务：$(systemctl is-active "$SERVICE" || true)"
  echo "库版本：$(sqlite3 "$DB_FILE" "$version_sql" 2>/dev/null || echo 无法读取)"
  echo "stage：$([ -f "$STAGE/.output/server/index.mjs" ] && echo 已构建 || echo 无)"
  local bk
  bk=$(latest_backup)
  if [ -n "$bk" ]; then
    echo "最近备份：$bk$([ -d "$APP-before-${bk##*/}" ] && echo '（可回滚）')"
  fi
  local dir
  for dir in "$APP"-before-*; do
    if [ -d "$dir" ]; then echo "旧代码：$dir"; fi
  done
}

case "${1:-}" in
  stage | upgrade | rollback | status)
    [ "$(id -u)" -eq 0 ] || die '请以 root 运行'
    command -v sqlite3 >/dev/null || die '缺少 sqlite3，先执行 apt-get install sqlite3'
    "cmd_$1" "${@:2}"
    ;;
  *)
    cat <<EOF
用法: bash migrate.sh <子命令>
  stage [源码包]  解包到 $STAGE 并构建（默认 /tmp/pvedc-src.tgz），不影响线上
  upgrade         停机、备份到 $BACKUP_ROOT/<时间戳>、迁移检查、切换目录并安装 helper 与 unit、启动新版本
  rollback        还原最近一次 upgrade 前的数据库、代码、helper 与 unit
  status          查看服务、库版本、stage 与备份

本地打包上传:
  git archive --format=tar.gz -o /tmp/pvedc-src.tgz HEAD
  scp /tmp/pvedc-src.tgz <服务器>:/tmp/
EOF
    exit 2
    ;;
esac
