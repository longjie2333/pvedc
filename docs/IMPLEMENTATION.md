# 实施与验收记录

已完成 Nitro 3 / React / SQLite / coss UI 平台，并部署到 PVE `r550`。

## 正式部署

- 校园网入口：`http://10.1.229.140:3000`
- PVE 服务：`pvedc.service`、`pvedc-gost.service`，代码 `/opt/pvedc`，数据 `/var/lib/pvedc`。
- 公网 Relay：`159.138.135.69:10000`，TLS 校验启用。
- 测试端口池：`11000–11010`；`11000` 是现有 gost 管理 API，已设为保留端口，学生可用 `11001–11010`。
- 现有 Nginx Proxy Manager 上游：`http://172.19.0.1:18081`，通过专用 gost 通道访问 PVE Web。
- 正式名单和资源为空，申请默认关闭；管理员首次访问保存 TOTP 密钥后，通过 Web 配置网络、默认规格及名单。
- 公网 Web 域名尚未指定；配置页面已提供反向代理参数及 Caddy 示例。

## 功能验收

- [x] Nitro 3 固定版本、React/Vite、SQLite WAL、共享 Zod 校验类型、coss UI。
- [x] 无环境变量首次访问自动生成 TOTP 文本/二维码；验证绑定后关闭初始化入口。
- [x] 环境变量初始化、管理员 TOTP、一小时访问 / 七天刷新双 JWT、会话撤销、限流和来源校验。
- [x] 名单 CRUD、UTF-8 CSV/表格粘贴导入导出、批量指定配置、直接学号认领。
- [x] 多配置、必选默认配置、名单指定优先、自选开关、未选择时使用默认配置。
- [x] NAT / 桥接、静态 IP 范围与排除地址、容量估算、事务预留。
- [x] Ubuntu / Debian 官方模板下载、主机名与 root 密码初始化、SSH。
- [x] CPU/内存/磁盘/流量、历史趋势、系统 TCP/UDP 监听端口。
- [x] 启动、关机、重启、同步改密、原配置/原 IP 重建、回收。
- [x] gost 后端 API、TCP/UDP 转发、端口范围/配额/归属控制、持久化与恢复。
- [x] 持久化任务、重试、失败资源回收、审计、网络任务取消和 SDN 锁恢复。
- [x] systemd、安装器、受限辅助程序、环境变量示例、操作和备份文档。

## 验证证据（2026-10-08 至 2026-10-09）

- `pnpm typecheck` 通过。
- `pnpm test`：39 项测试通过，覆盖分配优先级、最后地址并发、PVE 超时保留预留、回收、TOTP/JWT、导入事务、环境变量种子、gost 响应契约、SDN 锁归属及回滚。
- Playwright：管理员登录、名单录入/导入、网络/规格表单、默认配置、手机布局，以及首次自动 TOTP 绑定流程通过。
- 学生页面针对真实 PVE 实例检查，已显示实时状态和 SSH 监听端口；没有浏览器脚本错误或 NaN 指标。
- 真实 Debian NAT 实例与 Ubuntu 既有 VNet 桥接实例创建成功，学号主机名、root SSH、Ubuntu 出网验证成功。
- 名单指定的未发布 Ubuntu 配置覆盖学生提交的其他已发布配置，符合锁定规则。
- 平台与 root 同步改密成功，旧平台密码失效。
- 启动、关机、重启成功。
- 重建后 VMID、IP、配置、转发记录保持一致，系统盘测试文件被清除。
- 创建期间重启 Web 服务，原任务恢复成功，没有重复 VMID / IP。
- 公网 TCP SSH 与 UDP 回显在 `159.138.135.69:11001` 均成功；重启 PVE gost 后再次验证成功。
- Nginx Proxy Manager 容器经 Web 通道读取正式平台初始化状态成功。
- 测试 VMID `990000–990002`、测试转发、名单、网络、测试数据库和临时凭据已清理。
- PVE SDN 配置锁已释放；保留可用官方模板和平台自有的空 SDN 区域供正式配置使用。

## 联调中修复的问题

- PVE 自定义角色不能以保留的 PVE 名称开头，使用 `DistributionCenter`。
- 企业 APT 源需要订阅，安装器用临时 Debian 官方源安装项目依赖，不改写现有 PVE 源。
- PVE 直接访问 GitHub 下载受阻，安装器支持已校验本地发布包，并设置在线下载超时。
- PVE 的 `WARNINGS: n` 是成功完成状态，不能当作创建失败。
- PVE DELETE 参数通过查询串传递；非 JSON 错误响应不会泄漏上游内容。
- Ubuntu 首次启动等待 `basic.target` 并准备 `/run/sshd`，避免 SSH 初始化抢跑。
- gost `/config` 返回原始配置，`/config/services` 使用 `data` 包装，分别按实际接口解析。
- gost API 创建反向监听使用明确的 IPv4 监听地址，避免空主机地址被重复拼接。
- SDN 提交和回滚显式指定 `release-lock=1`；锁令牌随任务保存，辅助程序只检查归属，不返回令牌，也不强制解除其他操作者的锁。
- HTTPS 反代首次初始化采用受信任本机代理协议信息，Cookie 正确标记 Secure。

## 公网服务器变更

- `gost` 栈已改为 host 网络，保留 `gogost/gost:3.2` 镜像及现有认证和 `/runix` 挂载。
- 使用持久配置 `/opt/gost-pvedc/gost.json` 和证书目录 `/opt/gost-pvedc/tls`。
- Dockhand 中的原栈源文件已同步更新：`/app/data/stacks/local-huawei/gost/compose.yaml`。
- 原 NPM 代理 9、13 的 gost 上游改为 `172.19.0.1:10003`，保留原端口及其他配置。
- 原配置和 NPM 数据备份：公网主机 `/root/pvedc-gost-backup-20261008`。
- TLS SHA-256：`A2:4F:49:32:EE:A5:C4:2D:27:2B:BB:96:F4:08:54:52:33:F0:B1:D7:62:7C:E4:11:F3:C0:1F:D1:2D:B4:B0:C4`。

正式学生名单、获准的校园网地址段和公网 Web 域名属于管理员后续配置输入，不使用测试数据替代。
