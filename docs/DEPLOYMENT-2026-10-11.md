# 正式线上覆盖记录（2026-10-11）

## 目标

将 `dev` 当前版本覆盖到 PVE 正式服务，保留正式数据库、主密钥、TOTP、名单、资源、转发和历史任务，并完成校内 API 与公网 Relay 的真实验证。

## 覆盖前基线

- 本地分支：`dev`，提交 `3068207`（文档提交；运行代码基线为其父提交 `b7966de`）。
- 本地验证：`pnpm typecheck`、生产构建、78 项 Vitest、6 项 Python helper 测试通过。
- PVE 服务：`pvedc`、`pvedc-gost` 均 active；代码目录 `/opt/pvedc`；数据目录 `/var/lib/pvedc`；Node v24.21.0。
- 备份：`/var/backups/pvedc/upgrade-20261011-120324`，包含旧代码、正式数据、`/etc/pvedc`、systemd unit、helper 和 SHA-256 清单。
- 备份时只读统计为 55 名学生、8 台资源、7 条转发、3 个规格、2 个网络、137 条任务、435 条审计。备份后的资源变化来自管理员手动批量回收/删除，已由审计和任务记录确认，没有回滚这些合法操作。

## 覆盖操作

- 在 `/opt/pvedc-stage` 上传当前源代码，复用 Linux 依赖后通过 `NODE_OPTIONS=--use-system-ca` 完成远端依赖安装和构建。
- Linux Nitro 构建成功；产物包含当前指南、Milkdown、SSR、初始化转发和管理端功能。
- 停止两个服务，将旧目录保留为 `/opt/pvedc-before-20261011-121252`，再将 stage 目录切换为 `/opt/pvedc`。
- 更新 `/usr/local/libexec/pvedc-helper`、`pvedc.service`、`pvedc-gost.service`，执行 daemon-reload 并重新启动；两个服务均 active。
- 未运行会重置正式配置或凭据的初始化脚本；`/var/lib/pvedc`、`/etc/pvedc` 和 Relay 配置保持原位置。

## 校内线上验证

- `http://127.0.0.1:3000/` 返回 HTTP 200。
- `/api/setup/status` 返回已初始化；未登录 `/api/auth/session` 正常返回匿名状态；`/api/public/roster` 返回开放认领状态和名单搜索结果。
- 使用正式 TOTP 做一次管理员登录后，只读调用总览、宿主状态/历史、PVE 网络/存储选项、资源状态、任务分页和审计分页，均成功。
- 当前验证统计：55 名学生、2 台资源、3 条转发、3 个规格、2 个网络；任务第一页 20/147，审计第一页 20/459；PVE 上 VMID 1001、1004 均为 running。
- 主密钥文件保持不变；服务日志未发现 error、fail、panic 或 exception。

## 公网 Relay 与现有转发验证

- 当前公网 Relay 实际为 `hw` 上 host 网络的 `gost` 容器（`gogost/gost:3.2`），配置为 TLS Relay `159.138.135.69:10000)，API 为 `10001/hw`。旧会话中的 `gost1` 桥接拓扑不再作为现状使用。
- Relay 证书 SHA-256 与 PVE `/var/lib/pvedc/relay-ca.pem` 一致，TLS 校验保持开启。
- 现有生产转发 `60001`、`60002`、`60003` 均可从公网建立 TCP 连接并返回 HTTP 200；对应 PVE gost 服务和数据库记录均为 ready。
- 测试端口约束 `11002–11010` 已遵守；当前 Relay 未暴露这些端口，本轮没有擅自新增 Docker 映射、重建容器或恢复公网域名。

## 回滚点与后续

- 若需要回滚，先停止服务，再用备份目录恢复 `/opt/pvedc`、helper/unit；正式数据库和主密钥以备份前后实际时间线为准，不使用隔离测试副本。
- 旧代码目录和正式备份暂时保留，待用户确认后再清理。
- 本记录只保存非敏感验证摘要，不保存 TOTP、密码、Cookie、Basic Auth 或私有状态文件内容。
