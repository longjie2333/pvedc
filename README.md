# PVE Distribution Center · 学生计算中心

面向毕业设计与课程实践的 LXC 自助分配平台。技术栈为 Nitro 3、React、SQLite、coss UI，运行在单个 PVE 主机上。

## 功能

- 管理员使用 TOTP 登录；首次访问生成文本密钥和二维码，使用访问/刷新双 JWT：访问有效一小时，七天内自动续期。
- 学生名单、CSV / 表格粘贴导入、指定配置、学号认领和密码登录。
- 多套资源规格、默认配置、管理员控制的学生自选模式。
- PVE 原生 LXC 创建：学号主机名、root 密码、静态 IPv4、Ubuntu / Debian。
- NAT（SDN Simple + SNAT）与现有网桥两种网络；IP、VMID、容量事务预留。
- 资源状态、CPU/内存/磁盘/流量、最近一小时趋势、TCP/UDP 监听端口。
- 启停、重启、同步改密、原配置原 IP 重建、管理员回收。
- gost v3 Relay + TLS / BIND 转发，后台代理 API，自动/指定公网端口。
- 持久化任务、审计日志、失败重试与服务恢复。

## 本地开发

需要 Node.js 22.23+，推荐 Node.js 24。安装依赖可能编译 `better-sqlite3`，因此需要 Python 和 C++ 构建工具。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://127.0.0.1:3000`。本地数据位于 `.data/`，不会上传到 PVE 或加入版本控制。

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

浏览器验收：

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test` 先构建当前源代码，再运行单元及真实 HTTP 集成测试。测试使用独立临时 SQLite 和本地端口 3108，不连接真实 PVE，不操作学生数据。实际 LXC 辅助操作需要在 PVE 上运行。

Nitro 3 当前使用固定 beta 版本，所有依赖由 `pnpm-lock.yaml` 锁定。不要将 Windows 构建产物复制到 Linux：SQLite 与 Argon2 包含平台相关原生模块，部署时在目标 Linux 构建。

## PVE 部署

已针对 PVE 9.2 / Debian 13、amd64 编写并验证安装器。将源代码放入 `/opt/pvedc`，以 root 执行：

```sh
bash /opt/pvedc/deploy/install.sh
```

安装器执行以下工作：

1. 从 Debian 官方源安装项目依赖，不改写现有 PVE 企业/非订阅源。
2. 安装独立 Node.js 24.21.0 运行时、pnpm 10.33.2 和 gost 3.3.0，并校验下载校验和。
3. 创建 `pvedc` 系统用户与 `pvedc@pve!web` API 身份，配置资源管理所需权限。
4. 安装 root 所有的受限辅助程序。sudoers 只允许执行该辅助程序；容器初始化、端口查询和改密会检查安装标记，另外仅提供 SDN 锁归属的只读检查，不返回锁令牌。
5. 在 PVE 上安装依赖、构建并启动 `pvedc.service`、`pvedc-gost.service`。

安装后访问 `http://PVE-IP:3000`。没有预设 TOTP 时，由管理员首次完成绑定，密钥仅在绑定阶段显示。保存好密钥后依次配置：

1. **平台设置**：核对本机 PVE API 连接与容量保留额度。
2. **系统模板**：下载 Ubuntu 或 Debian 官方模板，复制卷 ID。
3. **网络与地址池**：设置 NAT 或桥接，保存后应用网络。
4. **资源配置**：填写模板卷 ID、存储、CPU、内存、磁盘和网络，发布并设为默认。
5. **学生名单**：导入名单；有特殊需求的学生指定配置。
6. **平台设置**：开放认领，按需开启学生自选。
7. **公网设置**：填写 Relay 与 TLS 参数，在公网转发页应用 gost 配置。

桥接 IP 池必须是网络管理员允许使用、不会由 DHCP 分配给其他机器的地址段。平台避免与自身分配及 PVE 已登记静态地址冲突，不能发现校园网中所有未登记设备。

## 配置与认证

`.env.example` 列出了首次运行配置。环境变量仅用于新数据库的初始导入；数据库存在后，通过 Web 修改业务配置，环境变量不会覆盖已保存设置。

| 变量 | 用途 |
| --- | --- |
| `PDC_DATA_DIR` | 数据目录，开发默认 `.data`，安装后 `/var/lib/pvedc` |
| `PDC_TOTP_SECRET` | 可选 Base32 管理员密钥，省略则首次 Web 生成 |
| `PDC_MASTER_KEY` | 可选 Base64 编码的 32 字节主密钥，省略则自动生成 |
| `PDC_INITIAL_SETTINGS` | 首次业务配置 JSON，字段见 `shared/schema.ts` |
| `PDC_INITIAL_CONFIG` | 首次完整配置 JSON：`settings`、`networks`、`profiles`、`students`，配置与网络需提供稳定 `id` |
| `PDC_BOOTSTRAP_FILE` | 安装器生成的本机连接凭据 JSON |
| `PDC_PVE_URL` / `PDC_PVE_NODE` | PVE 地址与节点 |
| `PDC_PVE_TOKEN_ID` / `PDC_PVE_TOKEN_SECRET` | API Token |
| `PDC_PVE_CA` | PVE CA PEM 文本，安装器自动读取本机 CA |
| `PDC_GOST_API` / `PDC_GOST_USER` / `PDC_GOST_PASSWORD` | 本机 gost API |
| `PDC_PUBLIC_ORIGIN` | 公网 HTTPS 入口，例如 `https://compute.example.edu` |

平台密码使用 Argon2id；连接凭据和临时任务密码使用 AES-256-GCM。访问和刷新 JWT 分别保存在 HttpOnly Cookie 中；刷新 token 每次轮换，登录最长七天。通过数据库会话实现退出、禁用、改密和 TOTP 重绑后的即时撤销；过期刷新 token 的重用会撤销对应会话。

完整配置导入在单个事务内完成，只运行一次，不执行宿主网络变更。首次导入保持 `registrationOpen:false`，管理员在 Web 应用网络后再开放申请。初始设置优先级为：安装器文件 → `PDC_INITIAL_SETTINGS` → `PDC_INITIAL_CONFIG.settings` → 单项环境变量。

默认一人一台 LXC、IPv4、学生及管理员七天登录期限（一小时访问 token）、每人五条转发、CPU 不超分。默认保留宿主 2 CPU、4096 MiB 内存及每个使用存储 10 GiB，可通过 Web 调整。

## 分配与恢复规则

- 名单指定配置优先锁定；未指定时，自选模式可选择已发布配置；没有选择时使用默认配置。
- 指定配置失效或容量不足时阻止创建，不自动替换配置。
- 已有容器使用创建快照；编辑配置只影响新申请。
- 重建清空系统盘，保持 VMID、IP、配置和转发，重建过程中暂停转发。
- 在 Web 修改密码同时更新平台及 root；在容器内改 root 密码不会修改平台密码。
- 回收先撤销转发再删除容器，确认删除后才释放地址和容量。
- 请求超时或任务失败保留预留，任务显示“需要处理”；检查 PVE 任务和节点状态后重试。
- 平台只对有本安装标记的容器执行辅助操作和删除。不要手工移除该标记。

## 公网部署

公网服务器运行 gost v3 Relay + TLS，并启用 `handler.metadata.bind=true`。使用用户名和密码认证，配置有效的服务端证书。后端根据设置管理 PVE 上客户端的 `rtcp` / `rudp` 服务。

Web 入口拓扑：

```text
浏览器 HTTPS → 公网 Caddy → 127.0.0.1:18081
                              ↓ gost Relay + TLS
                         PVE gost → 127.0.0.1:3000
```

公网转发页生成 Caddy、Nginx Proxy Manager 上游参数和 Relay 配置示例。公网防火墙放行 HTTPS、Relay 连接端口及管理员划定的学生端口池。Web 绑定地址属于 Relay 所在的网络环境，支持 `0.0.0.0` 监听所有 IPv4 接口。Relay 在宿主机运行时，同机反代连接回环地址，Docker 反代连接宿主机网关；Relay 在 Docker 桥接网络运行时，建议绑定 `0.0.0.0`，同网络反代连接 Relay 容器名，网络外访问需要映射 Web 端口。学生端口池需要分别映射 TCP、UDP，调整平台端口池不会自动修改公网 Docker 或安全组。Caddy 示例按同宿主机部署生成，容器部署时需替换上游。gost 管理 API 默认在 PVE 侧监听回环地址。

TLS 认证必须启用；自签 CA 可在 Web 中填写 PEM，平台保存本机 CA 文件并交给 gost 校验。学生只填写自己的容器端口，后端固定目标为该学生的分配 IP。

在“公网转发 → 本机 gost API”中修改地址、用户名和密码后，点击“保存并同步到宿主机”。后台任务保存加密恢复快照、原子更新 API 配置并重启固定的 gost 服务，验证新接口后才更新平台连接设置。失败时恢复原配置；恢复失败可在任务记录重试。留空密码保留宿主机当前密码，其他 Relay 链和服务定义不受修改。API 地址支持本机 IPv4 HTTP 地址及路径前缀，`0.0.0.0` 监听通过本机回环地址验证。

管理员可按需显示或复制完整 Basic Auth 请求头；它是 Base64 编码。该值不会加入普通设置响应、审计或日志。首次安装可通过 `PDC_GOST_API`、`PDC_GOST_USER` 和 `PDC_GOST_PASSWORD` 初始化实际 gost API；已有配置在再次部署时保留。

## 运维和备份

```sh
systemctl status pvedc pvedc-gost
journalctl -u pvedc -u pvedc-gost --since '30 minutes ago'
```

持久化目录：

- `/var/lib/pvedc/pvedc.sqlite`：设置、名单、资源、任务、转发及审计。
- `/var/lib/pvedc/master.key`：数据解密和 JWT 派生密钥，必须与数据库配套备份。
- `/var/lib/pvedc/gost/gost.json`：gost 运行配置。
- `/etc/pvedc/`：受限权限的首次连接配置和安装身份。

一致性备份：停止 `pvedc` 与 `pvedc-gost`，备份 `/var/lib/pvedc` 和 `/etc/pvedc`，再启动两项服务。恢复时保留原安装身份与主密钥，不要用新密钥打开旧数据库。更新源码前也先执行同样备份。

此平台不提供 KVM、多节点调度、在线终端、快照或容器备份管理；如需备份学生系统盘，使用 PVE 自带备份功能。

## 当前验证进度

本轮增量升级的功能清单与验证结果见 [docs/UPGRADE.md](docs/UPGRADE.md)。`pnpm test` 包含 TypeScript 集成测试和 Python helper 权限测试，开发机需要 Python 3；也可单独运行 `pnpm test:helper`。

详细进度和尚未验证的行为记录在 `docs/IMPLEMENTATION.md`。功能存在不代表已经通过真实 PVE / 公网联调，请以该记录的验证证据为准。
