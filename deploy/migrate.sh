#!/bin/bash
# ============================================================================
# pvedc 部署脚本（服务器侧）——可重复用于后续版本
# 对应方案：DEPLOY-2026-10-12-multi-network.md（第 1~5 步的服务器部分与回滚）
#
# 版本无关设计：备份时记录当前库版本（SCHEMA_BEFORE），演练时由新代码自动迁移出
# 目标版本（SCHEMA_AFTER）；数据基线用“全表行数 + 资源地址集合”通用比对，
# 不写死任何 schema 结构（v1 / v2 / 未来版本均可直接复用）。
#
# 子命令（按顺序执行；只有 backup / switch 与停机窗口有关）：
#   stage [源码包]   步骤1 服务器部分：解包到 STAGE 并 install/typecheck/build
#   backup           步骤2 停写 + 冷备（停机窗口开始；请先关闭资源申请）
#   rehearse         步骤3 用备份副本演练数据库迁移（零风险）
#   switch           步骤4 目录切换 + 启动（窗口结束；首次启动自动迁移）
#   verify           步骤5 自动核验（末尾列出必须人工完成的检查项）
#   rollback         回滚：恢复备份数据库与旧代码
#   status           只读查看当前部署状态
#
# 全局状态文件记录本次备份路径与各阶段标记，供后续子命令共用。
# ============================================================================
set -Eeuo pipefail
trap 'printf "!! 第 %s 行命令执行失败（退出码 %s）\n" "$LINENO" "$?" >&2' ERR

# ---------- 固定路径（与部署方案一致） ----------
APP=/opt/pvedc
STAGE=/opt/pvedc-stage
RUNTIME_BIN=/opt/pvedc-runtime/bin
APP_USER=pvedc
DATA=/var/lib/pvedc
ETC_DIR=/etc/pvedc
DB_FILE=$DATA/pvedc.sqlite
BACKUP_ROOT=/var/backups/pvedc
STATE_FILE=$BACKUP_ROOT/deploy-state.env
HELPER_INSTALLED=/usr/local/libexec/pvedc-helper
UNIT_FILE=/etc/systemd/system/pvedc.service
DEFAULT_TARBALL=/tmp/pvedc-src.tgz
SERVICE=pvedc.service
APP_URL=http://127.0.0.1:3000/

ASSUME_YES=0
FORCE=0
prog=$(basename "$0")

# —— 可复用配置（后续版本一般无需改动） ——
TMP_DB=/tmp/pvedc-migrate-check.sqlite
# 演练时导入的数据库模块，相对 stage 根目录；代码目录若调整可用 PVEDC_DB_MODULE 覆盖
DB_MODULE=${PVEDC_DB_MODULE-server/lib/db.ts}
# 构建产物必须包含的字符串标记（逗号分隔，防止部署错版本源码包）；置空可关闭：
#   PVEDC_EXPECT_MARKERS= ./pvedc-deploy.sh stage
EXPECT_MARKERS=${PVEDC_EXPECT_MARKERS-networkIds,student_keys}

# ============================================================================
# 通用工具
# ============================================================================
log()  { printf '\n== %s\n' "$*"; }
info() { printf '   %s\n' "$*"; }
warn() { printf '!! %s\n' "$*" >&2; }
die()  { printf '错误: %s\n' "$*" >&2; exit 1; }

require_root() { [ "$(id -u)" -eq 0 ] || die "请以 root 运行（需要操作 systemd 与数据文件）"; }
require_cmd()  { local c; for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "缺少命令: $c"; done; }

confirm() {
  if [ "$ASSUME_YES" -eq 1 ]; then return 0; fi
  local ans=""
  read -r -p "$1 —— 输入 yes 继续: " ans || { printf '\n'; die "无法读取确认输入（非交互场景请加 -y）"; }
  [ "$ans" = yes ] || die "已取消"
}

state_set() { printf '%s\n' "$1" >>"$STATE_FILE"; }
state_get() {
  [ -f "$STATE_FILE" ] || return 0
  grep "^$1=" "$STATE_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true
}

wait_service_active() {
  local tries=${1:-60} i
  for ((i = 0; i < tries; i++)); do
    if systemctl is-active --quiet "$SERVICE"; then return 0; fi
    sleep 1
  done
  return 1
}

wait_service_stopped() {
  local tries=${1:-30} i
  for ((i = 0; i < tries; i++)); do
    if ! systemctl is-active --quiet "$SERVICE"; then return 0; fi
    sleep 1
  done
  return 1
}

# 只允许删除脚本自己管理的目录
safe_rmrf_stage() {
  [ "$1" = "$STAGE" ] || die "拒绝删除非 stage 目录: $1"
  rm -rf -- "$1"
}
safe_rmrf_app() {
  [ "$1" = "$APP" ] || die "拒绝删除非应用目录: $1"
  rm -rf -- "$1"
}

# —— 版本无关的构建与数据比对工具 ——

# 构建产物标记检查（防止源码包版本不对）：EXPECT_MARKERS 为逗号分隔列表；置空跳过
check_markers() { # $1=构建文件 $2=info|die（die 模式缺失即失败，--force 可跳过）
  local file=$1 mode=$2
  if [ -z "$EXPECT_MARKERS" ]; then
    info "未配置构建标记检查（PVEDC_EXPECT_MARKERS 为空），跳过"
    return 0
  fi
  local -a marks
  IFS=',' read -r -a marks <<<"$EXPECT_MARKERS"
  local m c
  for m in "${marks[@]}"; do
    m=${m// /}
    [ -n "$m" ] || continue
    c=$(grep -a -c -- "$m" "$file" 2>/dev/null || true)
    if [ "${c:-0}" -gt 0 ]; then
      info "构建标记存在：$m（$c 处）"
    elif [ "$mode" = "die" ] && [ "$FORCE" -ne 1 ]; then
      die "构建产物缺少标记 $m —— 源码包可能不是目标版本；确认无误可加 --force"
    else
      warn "构建产物缺少标记 $m —— 请确认源码包版本是否正确"
    fi
  done
}

# 读取单个值（tr -d '\r'：兼容 Windows sqlite3.exe 的 CRLF 输出，便于本地核对）
db_val() { sqlite3 "$1" "$2" 2>/dev/null | tr -d '\r'; }

# 全表行数快照：每行 name=count（跳过 sqlite 内部表）——与 schema 结构无关
table_counts() {
  local db=$1 t
  sqlite3 "$db" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name" 2>/dev/null | tr -d '\r' |
    while IFS= read -r t; do
      [ -n "$t" ] || continue
      printf '%s=%s\n' "$t" "$(sqlite3 "$db" "SELECT count(*) FROM \"$t\"" 2>/dev/null | tr -d '\r' || printf '?')"
    done || true
}

# 比较两份 name=count 快照，输出差异行：TYPE<TAB>表<TAB>详情
counts_diff_awk() {
  awk -F= '
    NR == FNR { before[$1] = $2; next }
    { after[$1] = $2 }
    END {
      for (t in before) {
        if (before[t] == "?") printf "BEFORE_READFAIL\t%s\t%s\n", t, before[t];
        else if (!(t in after)) printf "MISSING\t%s\t%s\n", t, before[t];
        else if (after[t] == "?") printf "READFAIL\t%s\t%s\n", t, before[t];
        else if ((after[t] + 0) < (before[t] + 0)) printf "DECREASE\t%s\t%s->%s\n", t, before[t], after[t];
        else if ((after[t] + 0) > (before[t] + 0)) printf "INCREASE\t%s\t%s->%s\n", t, before[t], after[t];
      }
      for (t in after) if (!(t in before)) printf "NEW\t%s\t%s\n", t, after[t];
    }' "$1" "$2"
}

# 资源地址集合（通用提取）：对 resources 全表 dump 后抓 IPv4 字面量。
# 不依赖具体列——v1 的 ip 列、v2 的 networks JSON、未来的新结构都能覆盖。
extract_addresses() {
  sqlite3 "$1" "SELECT * FROM resources" 2>/dev/null | tr -d '\r' | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | sort || true
}

# 数据完整性检查：$1=升级前库 $2=升级后/当前库；输出 PASS/WARN/FAIL 行，有 FAIL 返回 1。
# 规则：任何表行数减少/表缺失/外键非空/地址集合变化 = FAIL；行数增加或新表 = WARN（正常写入）。
check_data_integrity() {
  local before_db=$1 after_db=$2 rc=0
  local tf_b tf_a diff
  tf_b=$(mktemp) || die "无法创建临时文件"
  tf_a=$(mktemp) || die "无法创建临时文件"
  table_counts "$before_db" >"$tf_b"
  table_counts "$after_db" >"$tf_a"
  diff=$(counts_diff_awk "$tf_b" "$tf_a")
  if [ -z "$diff" ]; then
    printf 'PASS 各表行数与升级前完全一致（%s 张表）\n' "$(grep -c . "$tf_b" || true)"
  else
    local kind name detail
    while IFS=$'\t' read -r kind name detail; do
      case "$kind" in
        MISSING)
          printf 'FAIL 表 %s 升级后不存在（升级前 %s 行）\n' "$name" "$detail"
          rc=1
          ;;
        DECREASE)
          printf 'FAIL 表 %s 行数减少（%s）\n' "$name" "$detail"
          rc=1
          ;;
        READFAIL)
          printf 'FAIL 表 %s 行数无法读取（升级前 %s 行），无法确认数据完整\n' "$name" "$detail"
          rc=1
          ;;
        BEFORE_READFAIL) printf 'WARN 升级前表 %s 行数即无法读取，跳过比对\n' "$name" ;;
        INCREASE) printf 'WARN 表 %s 行数增加（%s，通常为服务启动后正常写入）\n' "$name" "$detail" ;;
        NEW) printf 'WARN 新增表 %s（%s 行）\n' "$name" "$detail" ;;
        *) printf 'WARN 表 %s 行数变化（%s）\n' "$name" "$detail" ;;
      esac
    done <<<"$diff"
  fi
  rm -f "$tf_b" "$tf_a"

  local ab aa
  ab=$(extract_addresses "$before_db")
  aa=$(extract_addresses "$after_db")
  if [ -z "$ab" ] && [ -z "$aa" ]; then
    printf 'WARN 无法从 resources 表提取地址集合，请人工核对\n'
  elif [ "$ab" = "$aa" ]; then
    printf 'PASS 资源地址集合与升级前一致（%s 个）\n' "$(printf '%s\n' "$aa" | grep -c . || true)"
  else
    printf 'FAIL 资源地址集合与升级前不一致：\n'
    diff <(printf '%s\n' "$ab") <(printf '%s\n' "$aa") | sed 's/^/     /' || true
    rc=1
  fi

  local fk fk_rc=0
  fk=$(sqlite3 "$after_db" "PRAGMA foreign_key_check" 2>&1 | tr -d '\r') || fk_rc=$?
  if [ "$fk_rc" -ne 0 ]; then
    printf 'FAIL 外键检查无法执行：%s\n' "$fk"
    rc=1
  elif [ -z "$fk" ]; then
    printf 'PASS 外键检查为空\n'
  else
    printf 'FAIL 外键检查非空：\n%s\n' "$fk"
    rc=1
  fi
  return "$rc"
}

# ============================================================================
# 步骤1（服务器部分）：解包 + 构建
# ============================================================================
cmd_stage() {
  require_root
  require_cmd tar install chown runuser getent du stat grep cp
  local tarball=${1:-$DEFAULT_TARBALL}
  [ -f "$tarball" ] || die "找不到源码包 $tarball（先在本地打包并 scp 到 /tmp/，见 $prog help）"
  tar tzf "$tarball" >/dev/null 2>&1 || die "$tarball 不是有效的 tar.gz"
  [ -x "$RUNTIME_BIN/node" ] || die "未找到 $RUNTIME_BIN/node"
  [ -x "$RUNTIME_BIN/pnpm" ] || die "未找到 $RUNTIME_BIN/pnpm"

  log "步骤1：解包 $tarball → $STAGE（不影响正在运行的 $APP）"
  safe_rmrf_stage "$STAGE"
  install -d -m755 -o "$APP_USER" -g "$APP_USER" "$STAGE"
  tar xzf "$tarball" -C "$STAGE"
  chown -R "$APP_USER:$APP_USER" "$STAGE"

  local f
  for f in .env .npmrc; do
    if [ -f "$APP/$f" ]; then
      cp -a "$APP/$f" "$STAGE/$f"
      info "已复用正式环境文件 $APP/$f"
    fi
  done

  local home_dir
  home_dir=$(getent passwd "$APP_USER" | cut -d: -f6)
  [ -n "$home_dir" ] || die "系统用户 $APP_USER 不存在（需先完成 deploy/install.sh 初始化）"
  log "安装依赖 + 类型检查 + 构建（以 $APP_USER 身份，耗时较长）"
  runuser -u "$APP_USER" -- env HOME="$home_dir" PATH="$RUNTIME_BIN:$PATH" NODE_OPTIONS=--use-system-ca \
    bash -c "cd '$STAGE' && pnpm install --frozen-lockfile && pnpm typecheck && pnpm build"

  local build="$STAGE/.output/server/index.mjs"
  [ -f "$build" ] || die "构建失败：缺少 $build"
  check_markers "$build" info
  info "stage 就绪：$(du -sh "$STAGE" | cut -f1)，构建时间 $(stat -c '%y' "$build" | cut -d. -f1)"
  info "下一步：关闭资源申请后执行 $prog backup"
}

# ============================================================================
# 步骤2：停写 + 冷备（窗口开始）
# ============================================================================
cmd_backup() {
  require_root
  require_cmd sqlite3 sha256sum systemctl install du df awk stat cp
  [ -f "$DB_FILE" ] || die "找不到数据库 $DB_FILE"

  if [ -f "$STATE_FILE" ] && [ "$FORCE" -ne 1 ]; then
    warn "已存在部署状态 $STATE_FILE："
    sed 's/^/     /' "$STATE_FILE" >&2
    die "如需重新开始一轮 backup，用 --force（旧状态文件会改名保留）"
  fi

  install -d -m700 "$BACKUP_ROOT"
  local need_kb avail_kb
  need_kb=$(du -sk "$APP" "$DATA" 2>/dev/null | awk '{s+=$1} END{print s+0}')
  avail_kb=$(df -Pk "$BACKUP_ROOT" | awk 'NR==2{print $4}')
  if [ "$avail_kb" -lt $((need_kb + 1048576)) ]; then
    die "备份空间不足：约需 $((need_kb / 1024)) MiB + 1 GiB 余量，当前可用 $((avail_kb / 1024)) MiB"
  fi

  confirm "确认：1) 已在管理端关闭资源申请（registrationOpen=false）；2) 当前是 pve 正式服务器。将停止 $SERVICE 并开始冷备"

  local ts bk
  ts=$(date +%Y%m%d-%H%M%S)
  bk="$BACKUP_ROOT/$ts"
  install -d -m700 "$bk"
  if [ -f "$STATE_FILE" ]; then mv "$STATE_FILE" "$STATE_FILE.old-$ts"; fi
  : >"$STATE_FILE"
  chmod 600 "$STATE_FILE"
  state_set "TS=$ts"
  state_set "BK=$bk"
  info "备份目录：$bk"

  local was_active=0
  if systemctl is-active --quiet "$SERVICE"; then was_active=1; fi
  state_set "WAS_ACTIVE=$was_active"
  if [ "$was_active" -eq 1 ]; then
    log "停止 $SERVICE（pvedc-gost 保持运行，现有转发不中断）"
    systemctl stop "$SERVICE"
    wait_service_stopped 30 || die "$SERVICE 30 秒内未停止，请人工检查（systemctl status $SERVICE）"
  else
    warn "$SERVICE 当前不是 active，按已停止处理（回滚时不会自动启动）"
  fi
  state_set "STOPPED=1"

  log "SQLite 一致性备份 + 完整性校验"
  sqlite3 "$DB_FILE" ".backup '$bk/pvedc.sqlite'"
  local integ
  integ=$(sqlite3 "$bk/pvedc.sqlite" "PRAGMA integrity_check")
  [ "$integ" = "ok" ] || { warn "integrity_check 输出：$integ"; die "备份库完整性校验失败；服务保持停止，请人工处理"; }
  info "integrity_check = ok"

  log "归档代码 / 数据 / 配置（数据含 master.key、relay-ca.pem）"
  cp -a "$APP" "$bk/code-before"
  cp -a "$DATA" "$bk/data-before"
  cp -a "$ETC_DIR" "$bk/etc-pvedc"

  if [ -f "$DATA/master.key" ]; then
    sha256sum "$DATA/master.key" >"$bk/master.key.sha256"
  else
    warn "未找到 $DATA/master.key —— 无法记录其哈希，请人工确认数据完整性"
  fi

  : >"$bk/artifacts.sha256"
  local f
  for f in "$APP/.output/server/index.mjs" "$HELPER_INSTALLED" "$UNIT_FILE"; do
    if [ -f "$f" ]; then
      sha256sum "$f" >>"$bk/artifacts.sha256"
    else
      printf 'MISSING  %s\n' "$f" >>"$bk/artifacts.sha256"
    fi
  done

  stat -c '%U:%G %a' "$DB_FILE" >"$bk/db.stat"

  # 版本无关基线：当前库版本 + 全表行数 + 资源地址集合（不依赖具体 schema）
  local schema_before
  schema_before=$(db_val "$bk/pvedc.sqlite" "SELECT value FROM meta WHERE key='schema_version'" || true)
  [ -n "$schema_before" ] || die "无法从备份库读取 schema_version（$bk/pvedc.sqlite）"
  printf '%s\n' "$schema_before" >"$bk/schema-before.txt"
  state_set "SCHEMA_BEFORE=$schema_before"
  table_counts "$bk/pvedc.sqlite" >"$bk/counts-before.txt"
  extract_addresses "$bk/pvedc.sqlite" >"$bk/addresses-before.txt"

  state_set "BACKED_UP=1"
  log "备份完成：$bk（$(du -sh "$bk" | cut -f1)）"
  info "升级前 schema_version=$schema_before"
  info "升级前各表行数（$bk/counts-before.txt）："
  sed 's/^/     /' "$bk/counts-before.txt"
  local addr_n
  addr_n=$(grep -c . "$bk/addresses-before.txt" || true)
  if [ "${addr_n:-0}" -gt 0 ]; then
    info "升级前资源地址 ${addr_n} 个（$bk/addresses-before.txt）"
  else
    warn "未能从 resources 表提取到地址，请人工确认表结构"
  fi
  warn "停机窗口已开始：$SERVICE 保持停止，$STATE_FILE 记录在案"
  info "下一步：$prog rehearse（通过后立即 $prog switch）"
}

# ============================================================================
# 步骤3：迁移演练（对备份副本执行，零风险）
# ============================================================================
cmd_rehearse() {
  require_root
  require_cmd sqlite3 diff mktemp
  local bk
  bk=$(state_get BK)
  [ -n "$bk" ] && [ -f "$bk/pvedc.sqlite" ] || die "没有可用备份（先运行 $prog backup）"
  [ -f "$STAGE/.output/server/index.mjs" ] || die "缺少 $STAGE 构建（先运行 $prog stage）"

  local schema_before state_before
  schema_before=$(db_val "$bk/pvedc.sqlite" "SELECT value FROM meta WHERE key='schema_version'" || true)
  [ -n "$schema_before" ] || die "无法读取备份库 schema_version"
  state_before=$(state_get SCHEMA_BEFORE)
  if [ -n "$state_before" ] && [ "$schema_before" != "$state_before" ]; then
    die "备份库版本 $schema_before 与 backup 时记录的 $state_before 不一致，请人工核对"
  fi
  case "$schema_before" in
    '' | *[!0-9]*) die "schema_version 非数字：$schema_before" ;;
  esac

  local snippet="$STAGE/.pvedc-migrate-check.mjs"
  rm -f "$TMP_DB" "$TMP_DB-wal" "$TMP_DB-shm" "$snippet"
  cp "$bk/pvedc.sqlite" "$TMP_DB"

  # 演练脚本：用新代码打开副本，触发它自己的迁移逻辑；目标版本不写死，由迁移结果决定
  cat >"$snippet" <<NODE
const mod = await import("./$DB_MODULE");
const db = mod.openDatabase("$TMP_DB");
const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
console.log('SCHEMA=' + (row ? row.value : 'missing'));
db.close();
NODE

  local node="$RUNTIME_BIN/node"
  local major
  major=$("$node" -p 'process.versions.node.split(".")[0]')
  local -a strip=()
  if [ "$major" -lt 23 ]; then strip=(--experimental-strip-types); fi

  log "在副本 $TMP_DB 上执行真实数据迁移演练（$schema_before → ？由新代码决定）"
  local out rc=0
  out=$(cd "$STAGE" && "$node" "${strip[@]}" "$snippet" 2>&1) || rc=$?
  rm -f "$snippet"
  printf '%s\n' "$out" >"$bk/rehearse.out"
  [ "$rc" -eq 0 ] || {
    printf '%s\n' "$out"
    die "迁移演练执行失败（输出已存 $bk/rehearse.out）"
  }

  local schema_after
  schema_after=$(printf '%s\n' "$out" | grep '^SCHEMA=' | cut -d= -f2)
  case "$schema_after" in
    '' | *[!0-9]*)
      printf '%s\n' "$out"
      die "演练未返回有效 schema_version（$schema_after）"
      ;;
  esac
  [ "$schema_after" -ge "$schema_before" ] || die "演练目标版本 $schema_after 低于当前 $schema_before（代码比库旧？）"

  local di_out di_rc=0
  di_out=$(check_data_integrity "$bk/pvedc.sqlite" "$TMP_DB") || di_rc=$?
  printf '%s\n' "$di_out" | tee -a "$bk/rehearse.out"
  [ "$di_rc" -eq 0 ] || die "演练数据检查未通过（详见 $bk/rehearse.out）"
  rm -f "$TMP_DB" "$TMP_DB-wal" "$TMP_DB-shm"

  state_set "REHEARSED=ok"
  state_set "SCHEMA_AFTER=$schema_after"
  if [ "$schema_after" = "$schema_before" ]; then
    info "演练通过：本版本无 schema 迁移（保持 $schema_before），数据检查全部 PASS"
  else
    info "演练通过：schema $schema_before → $schema_after，数据检查全部 PASS"
  fi
  info "下一步：$prog switch（结束停机窗口）"
}

# ============================================================================
# 步骤4：切换目录 + 启动（窗口结束）
# ============================================================================
cmd_switch() {
  require_root
  require_cmd systemctl mv sha256sum journalctl sqlite3
  local ts bk
  ts=$(state_get TS)
  bk=$(state_get BK)
  [ -n "$ts" ] && [ -n "$bk" ] || die "没有部署状态（先运行 $prog backup）"

  if [ "$(state_get REHEARSED)" != "ok" ] && [ "$FORCE" -ne 1 ]; then
    die "演练未通过（rehearse 未执行或未成功）；确认要跳过可加 --force"
  fi
  [ -d "$APP" ] || die "$APP 不存在"
  [ -f "$STAGE/.output/server/index.mjs" ] || die "缺少 $STAGE 构建（先运行 $prog stage）"

  local before_dir="${APP}-before-$ts"
  [ -e "$before_dir" ] && die "$before_dir 已存在，疑似已切换过；请用 $prog status 核对"

  local schema sb
  sb=$(state_get SCHEMA_BEFORE)
  [ -n "$sb" ] || die "部署状态缺少 SCHEMA_BEFORE（先运行 $prog backup）"
  schema=$(db_val "$DB_FILE" "SELECT value FROM meta WHERE key='schema_version'" || true)
  [ "$schema" = "$sb" ] || die "线上库 schema_version=${schema:-无法读取}，与备份时（$sb）不符（可能已迁移过）"

  check_markers "$STAGE/.output/server/index.mjs" die

  # 方案要求本轮 helper 与仓库一致；不一致只提示，不自动重装
  local h1 h2
  h1=$(sha256sum "$HELPER_INSTALLED" 2>/dev/null | cut -d' ' -f1 || true)
  h2=$(sha256sum "$STAGE/deploy/pvedc-helper.py" 2>/dev/null | cut -d' ' -f1 || true)
  if [ -n "$h1" ] && [ -n "$h2" ] && [ "$h1" != "$h2" ]; then
    warn "helper 与仓库版本不一致：已安装=$h1 仓库=$h2"
    warn "方案预期本轮一致；若确有 helper 变更请人工确认后再启动（本脚本不自动重装）"
  fi

  confirm "步骤4：$APP → $before_dir ；$STAGE → $APP ；然后启动 $SERVICE（首次启动执行数据库迁移）"

  systemctl stop "$SERVICE"
  wait_service_stopped 30 || die "服务未能在 30 秒内停止，放弃切换"
  mv "$APP" "$before_dir"
  mv "$STAGE" "$APP"
  state_set "SWITCHED=1"
  state_set "SWITCHED_AT=$(date +%FT%T%z)"

  log "启动 $SERVICE（首次启动会执行数据库迁移，若有）"
  systemctl start "$SERVICE"
  if ! wait_service_active 60; then
    journalctl -u "$SERVICE" -n 50 --no-pager || true
    die "服务 60 秒内未 active；请检查上方日志后执行 $prog rollback"
  fi
  sleep 2
  if ! wait_service_active 5; then
    journalctl -u "$SERVICE" -n 50 --no-pager || true
    die "服务启动后又退出；请检查上方日志后执行 $prog rollback"
  fi
  info "切换完成，$SERVICE 已 active"
  info "下一步：$prog verify"
}

# ============================================================================
# 步骤5：自动核验
# ============================================================================
cmd_verify() {
  require_root
  require_cmd sqlite3 curl diff sha256sum systemctl journalctl mktemp
  local bk
  bk=$(state_get BK)
  [ -n "$bk" ] && [ -f "$bk/counts-before.txt" ] || die "没有备份基线（先运行 $prog backup）"
  if [ "$(state_get SWITCHED)" != "1" ] && [ "$FORCE" -ne 1 ]; then
    die "尚未执行 switch；若只是重新核验可加 --force"
  fi

  local summary=/tmp/pvedc-verify-summary.txt
  : >"$summary"
  local fails=0 warns=0
  note() { printf '%s\n' "$*" | tee -a "$summary"; }

  log "步骤5：自动核验（结果同时写入 $summary）"

  if systemctl is-active --quiet "$SERVICE"; then
    note "PASS 服务 $SERVICE active"
  else
    note "FAIL 服务 $SERVICE 不是 active"
    fails=$((fails + 1))
  fi

  local jlog
  jlog=$(journalctl -u "$SERVICE" -n 100 --no-pager 2>/dev/null | grep -iE 'error|fail|panic' || true)
  if [ -n "$jlog" ]; then
    note "WARN 最近 100 行日志含 error/fail/panic，请人工判断："
    printf '%s\n' "$jlog" | tee -a "$summary"
    warns=$((warns + 1))
  else
    note "PASS 最近 100 行日志无 error/fail/panic"
  fi

  local schema target sb
  target=$(state_get SCHEMA_AFTER)
  sb=$(state_get SCHEMA_BEFORE)
  schema=$(sqlite3 "$DB_FILE" "SELECT value FROM meta WHERE key='schema_version'" 2>&1 | tr -d '\r' || true)
  case "$schema" in
    '' | *[!0-9]*)
      note "FAIL 无法读取 schema_version：$schema"
      fails=$((fails + 1))
      ;;
    *)
      if [ -n "$target" ]; then
        if [ "$schema" = "$target" ]; then
          note "PASS schema_version=$schema（与演练目标一致）"
        else
          note "FAIL schema_version=$schema（演练目标为 $target）"
          fails=$((fails + 1))
        fi
      elif [ -n "$sb" ] && [ "$schema" -ge "$sb" ]; then
        note "PASS schema_version=$schema ≥ 升级前 $sb（未演练，无法校验精确目标版本）"
      else
        note "FAIL schema_version=$schema 低于升级前 ${sb:-未知}"
        fails=$((fails + 1))
      fi
      ;;
  esac

  local di_out di_rc=0
  di_out=$(check_data_integrity "$bk/pvedc.sqlite" "$DB_FILE") || di_rc=$?
  printf '%s\n' "$di_out" | tee -a "$summary"
  if [ "$di_rc" -ne 0 ]; then
    fails=$((fails + 1))
  fi

  if [ -f "$bk/master.key.sha256" ] && sha256sum -c "$bk/master.key.sha256" >/dev/null 2>&1; then
    note "PASS master.key 哈希与备份一致"
  else
    note "FAIL master.key 哈希与备份不一致（或备份未记录）"
    fails=$((fails + 1))
  fi

  local etcdiff
  etcdiff=$(diff -r "$bk/etc-pvedc" "$ETC_DIR" 2>&1 || true)
  if [ -z "$etcdiff" ]; then
    note "PASS /etc/pvedc 与备份一致"
  else
    note "FAIL /etc/pvedc 有差异："
    printf '%s\n' "$etcdiff" | tee -a "$summary"
    fails=$((fails + 1))
  fi

  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$APP_URL" || true)
  if [ "$code" = "200" ]; then
    note "PASS 首页 HTTP 200"
  else
    note "FAIL 首页 HTTP '${code:-无响应}'（预期 200）"
    fails=$((fails + 1))
  fi

  local fw_before fw_now
  fw_before=$(sqlite3 "$bk/pvedc.sqlite" "SELECT id||'|'||state FROM forwards ORDER BY id" 2>/dev/null | tr -d '\r' || true)
  fw_now=$(sqlite3 "$DB_FILE" "SELECT id||'|'||state FROM forwards ORDER BY id" 2>/dev/null | tr -d '\r' || true)
  if [ -z "$fw_before" ] && [ -z "$fw_now" ]; then
    note "WARN 无法读取转发表（列名可能不同），请人工核对转发状态"
    warns=$((warns + 1))
  elif [ "$fw_before" = "$fw_now" ]; then
    note "PASS 转发记录未变：$(printf '%s' "$fw_now" | tr '\n' ' ')"
  else
    note "WARN 转发记录有变化（可能为健康状态刷新），请人工确认："
    note "   升级前: $(printf '%s' "$fw_before" | tr '\n' ' ')"
    note "   当前:   $(printf '%s' "$fw_now" | tr '\n' ' ')"
    warns=$((warns + 1))
  fi

  note ""
  note "必须人工完成的检查项："
  note "  1) 管理员 TOTP 登录一次；只读点检：总览 / 宿主状态 / PVE 选项 / 任务分页 / 审计分页"
  note "  2) 页面确认 3 条转发显示正常"
  note "  3) 全部通过后：管理端重新开放资源申请（registrationOpen=true）"
  note "  4) 把备份路径 / 哈希 / 计数 / 本摘要追加到部署文档与 docs/UPGRADE.md"
  cp "$summary" "$bk/verify-summary.txt"

  if [ "$fails" -gt 0 ]; then
    die "核验存在 $fails 项 FAIL（摘要：$bk/verify-summary.txt），建议 $prog rollback"
  fi
  state_set "VERIFIED=ok"
  if [ "$warns" -gt 0 ]; then
    warn "关键项全部通过，但有 $warns 处 WARN 需人工确认（摘要：$bk/verify-summary.txt）"
  else
    info "自动核验全部通过（摘要：$bk/verify-summary.txt）"
  fi
}

# ============================================================================
# 回滚：恢复备份数据库与旧代码
# ============================================================================
cmd_rollback() {
  require_root
  require_cmd systemctl sqlite3 diff curl
  local ts bk
  ts=$(state_get TS)
  bk=$(state_get BK)
  [ -n "$ts" ] && [ -n "$bk" ] && [ -f "$bk/pvedc.sqlite" ] || die "没有可用备份（状态文件 $STATE_FILE）"

  local before_dir="${APP}-before-$ts"
  local swapped=0
  [ -d "$before_dir" ] && swapped=1

  local schema_now=""
  schema_now=$(db_val "$DB_FILE" "SELECT value FROM meta WHERE key='schema_version'" || true)

  # 仅当已切换或库已迁移（版本与备份时不同）时才需要恢复数据库
  local restore_db=0
  local schema_before_rb
  schema_before_rb=$(state_get SCHEMA_BEFORE)
  if [ "$(state_get SWITCHED)" = "1" ] || { [ -n "$schema_now" ] && [ -n "$schema_before_rb" ] && [ "$schema_now" != "$schema_before_rb" ]; }; then
    restore_db=1
  fi

  confirm "回滚：停止 $SERVICE；数据库恢复=$( [ "$restore_db" -eq 1 ] && echo 是 || echo 否 )；代码恢复=$( [ "$swapped" -eq 1 ] && echo 是 || echo 否 )（备份 $bk）"

  log "停止 $SERVICE"
  systemctl stop "$SERVICE"
  wait_service_stopped 30 || die "服务未能停止，放弃回滚"

  if [ "$restore_db" -eq 1 ]; then
    log "恢复数据库（删除迁移后的库文件，用备份还原）"
    rm -f "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
    cp -a "$bk/pvedc.sqlite" "$DB_FILE"
    if [ -f "$bk/db.stat" ]; then
      local owner perms
      owner=$(cut -d' ' -f1 "$bk/db.stat")
      perms=$(cut -d' ' -f2 "$bk/db.stat")
      chown "$owner" "$DB_FILE"
      chmod "$perms" "$DB_FILE"
    else
      chown --reference="$DATA" "$DB_FILE" || true
    fi
    info "数据库已恢复"
  else
    info "数据库未迁移（schema_version=$schema_now），保持原样"
  fi

  if [ "$swapped" -eq 1 ]; then
    log "恢复旧代码：$before_dir → $APP"
    safe_rmrf_app "$APP"
    mv "$before_dir" "$APP"
    info "旧代码已恢复"
  else
    info "$APP 未切换过，无需恢复代码"
  fi

  local was_active
  was_active=$(state_get WAS_ACTIVE)
  [ -n "$was_active" ] || was_active=1
  if [ "$was_active" = "1" ]; then
    log "启动 $SERVICE"
    systemctl start "$SERVICE"
    if ! wait_service_active 60; then
      journalctl -u "$SERVICE" -n 50 --no-pager || true
      die "回滚后服务未能启动，请人工检查！"
    fi
    local schema_after
    schema_after=$(db_val "$DB_FILE" "SELECT value FROM meta WHERE key='schema_version'" || true)
    if [ "$restore_db" -eq 1 ] && [ -n "$schema_before_rb" ] && [ "$schema_after" != "$schema_before_rb" ]; then
      warn "回滚后 schema_version=${schema_after:-无法读取}，预期 $schema_before_rb，请人工确认"
    fi
    local counts_after
    counts_after=$(table_counts "$DB_FILE")
    if [ "$counts_after" = "$(cat "$bk/counts-before.txt")" ]; then
      info "回滚后各表行数与备份一致"
    else
      warn "回滚后各表行数与备份有差异（可能含服务启动后的正常写入），请人工核对："
      diff <(cat "$bk/counts-before.txt") <(printf '%s\n' "$counts_after") | sed 's/^/     /' || true
    fi
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$APP_URL" || true)
    info "首页 HTTP ${code:-无响应}"
  else
    info "备份前服务处于停止状态，保持停止"
  fi

  state_set "ROLLED_BACK=1"
  state_set "ROLLED_BACK_AT=$(date +%FT%T%z)"
  info "回滚完成（备份保留在 $bk，未删除）"
}

# ============================================================================
# 状态（只读）
# ============================================================================
cmd_status() {
  if [ -f "$STATE_FILE" ]; then
    log "部署状态（$STATE_FILE）"
    sed 's/^/   /' "$STATE_FILE"
  else
    info "无部署状态文件（尚未执行本次部署）"
  fi

  local active="未知"
  if command -v systemctl >/dev/null 2>&1; then
    active=$(systemctl is-active "$SERVICE" 2>/dev/null || true)
  fi
  info "$SERVICE: ${active:-未知}"

  if [ -f "$DB_FILE" ] && command -v sqlite3 >/dev/null 2>&1; then
    info "schema_version: $(db_val "$DB_FILE" "SELECT value FROM meta WHERE key='schema_version'" || echo 未知)"
  fi

  if [ -d "$STAGE" ]; then
    info "stage 存在：$(stat -c '%y' "$STAGE" | cut -d. -f1)"
  else
    info "stage 不存在"
  fi
  local d
  for d in "$APP"-before-*; do
    [ -d "$d" ] && info "旧代码目录：$d"
  done
  if [ -d "$BACKUP_ROOT" ]; then
    info "最近备份："
    ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | head -n 3 | sed 's/^/     /' || true
  fi
}

# ============================================================================
# 用法与入口
# ============================================================================
usage() {
  cat <<EOF
用法: $prog <子命令> [-y] [--force]

子命令（按顺序执行；只有 backup / switch 与停机窗口有关）:
  stage [源码包]   步骤1(服务器侧): 解包并构建到 $STAGE（默认源码包 $DEFAULT_TARBALL）
  backup           步骤2: 停 $SERVICE + 冷备到 $BACKUP_ROOT/<时间戳>（停机窗口开始）
  rehearse         步骤3: 在备份副本上演练数据库迁移（不改线上；目标版本由新代码自动判定）
  switch           步骤4: 切换目录并启动（窗口结束；首次启动执行迁移）
  verify           步骤5: 自动核验（并输出人工检查清单）
  rollback         回滚: 恢复备份数据库与旧代码
  status           只读查看部署状态

选项:
  -y, --yes        跳过确认提示
  --force          跳过部分前置检查（未演练 / 构建标记缺失 / 重做 backup）

环境变量:
  PVEDC_EXPECT_MARKERS  覆盖构建产物标记检查（逗号分隔；置空则关闭）
  PVEDC_DB_MODULE       覆盖演练导入的数据库模块（默认 server/lib/db.ts）

完整流程（本地 Git Bash + 服务器 root）:
  # 本地：打包上传（在项目根目录执行）
  tar czf /tmp/pvedc-src.tgz -C <项目根> --exclude=node_modules --exclude=.output \\
    --exclude=.data --exclude=.env --exclude=test-results --exclude=playwright-report \\
    --exclude=.zcode --exclude=.zcodeignore .
  scp /tmp/pvedc-src.tgz <服务器>:/tmp/
  scp $prog <服务器>:/root/ && ssh <服务器> 'chmod 700 /root/$prog'

  # 服务器（root）
  /root/$prog stage
  # 在管理端关闭资源申请（registrationOpen=false）后:
  /root/$prog backup
  /root/$prog rehearse      # 通过后立即:
  /root/$prog switch
  /root/$prog verify
  # 验收不过: /root/$prog rollback
  # 验收通过后: 管理端重新开放申请，并在部署文档追加实际结果

说明:
  - 停机只发生在 backup 与 switch 之间（秒级到一两分钟）；pvedc-gost 转发全程不中断。
  - 数据目录 $DATA 与配置 $ETC_DIR 不在替换范围，只备份与校验。
  - 阶段标记记录在 $STATE_FILE，后续子命令依赖它。
  - 版本无关：备份时记录当前库版本（schema-before.txt），演练时由新代码自动迁移出
    目标版本（SCHEMA_AFTER）；数据基线为全表行数（counts-before.txt）+ 资源地址集合
    （addresses-before.txt），不写死 v1/v2 结构，可重复用于后续版本。
EOF
}

main() {
  local cmd="" arg=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -y | --yes) ASSUME_YES=1 ;;
      --force) FORCE=1 ;;
      -h | --help | help) usage; exit 0 ;;
      stage | backup | rehearse | switch | verify | rollback | status) cmd=$1 ;;
      *)
        if [ -z "$arg" ]; then arg=$1; else die "多余参数: $1"; fi
        ;;
    esac
    shift
  done
  [ -n "$cmd" ] || { usage; exit 2; }

  case "$cmd" in
    stage) cmd_stage "$arg" ;;
    backup | rehearse | switch | verify | rollback | status)
      [ -z "$arg" ] || die "$cmd 不接受额外参数: $arg"
      "cmd_$cmd"
      ;;
  esac
}

main "$@"
