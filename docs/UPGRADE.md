# 管理平台升级验收清单

本轮在 `dev` 分支实施，每项独立提交。以本地代码覆盖 PVE 部署，保留正式数据、配置及主密钥，不合并主分支。

## 功能与验证

- [x] coss 组件审查：表单、弹窗、Checkbox、独立开关设置块、键盘及移动端。
- [x] Toast：操作结果、复制与导入导出、任务提交及最终状态，轮询去重。
- [x] OTP Field：全部 TOTP 流程自动提交、防重、失败聚焦及保存密钥确认。
- [x] 我的学号 Combobox：远程搜索、名单限定、选中项保留。
- [x] 双 token：一小时访问、七天绝对期限、轮换并发、撤销、前端续期。
- [x] 任务与审计：服务端分页、查询栏、学生隔离、总览移除整批任务。
- [x] gost 配置迁移至公网转发，分区保存。
- [x] gost API 宿主同步：真实修改地址、用户名、密码成功；端口冲突后自动恢复原接口。
- [x] 按需显示/复制 API Basic Auth，禁止普通响应、审计和日志泄露凭据。
- [x] Relay Web 监听支持 0.0.0.0，真实 11010 Web 通道验证通过；部署说明区分宿主机与 Docker 网络。
- [x] PVE 网络/存储/模板选择；NAT 自动命名；规格 Combobox 预设及自定义。
- [x] 宿主状态、存储及一小时性能曲线。
- [x] 学生全选反选、批量电源/回收/删除；删除自动清理机器及转发。
- [x] 结构化监听端口；管理员进程名/PID；学生隐藏表格、对象 Select 与手动端口。
- [x] 本地构建、类型、集成测试及浏览器验收。
- [x] 隔离真实 PVE/gost 联调；备份、校内部署、正式数据和链路复核。按用户最终要求暂不恢复公网域名。

## 固定产品决策

- 两端登录最长七天，从首次登录计算；访问 token 一小时，刷新轮换。
- 全选/反选作用于当前搜索结果，改搜索条件清空选择。
- 批量包含启动、关机、重启、回收、删除；删除自动回收，不增加批量改密或重建。
- 新 NAT 自动创建 VNet；桥接选已有网桥/VNet。
- 学生转发可选监听服务，也可手动填写协议和端口。
- 每个开关单独成块，输入框与开关分区。
- API 调用凭据为 `Authorization: Basic Base64(username:password)`，明确标注编码。
- 线上代码差异不并入本地；不支持的历史任务只读展示。

## 提交及验证记录

实现时逐项记录完成证据；没有完成验证的事项保持未勾选。

- 独立开关设置块、coss Checkbox 和登录入口 Button 已替换，`pnpm typecheck` 通过；整体键盘及移动端验收随浏览器回归执行。
- Toast 接入统一命令、复制与导出，提交任务按 ID 跟踪最终结果。任务查询权限隔离 HTTP 集成测试通过（11 项）；全套基线 39 项通过。浏览器反馈验收待执行。
- 旧测试的纯数字学号已改为符合现有规则的字母前缀学号，没有修改线上学号规则。
- OTP 完成 `pnpm typecheck`、构建和两条 Playwright 流程；覆盖首次绑定错误恢复、未满六位不提交、完成后只提交一次，以及旧/新密钥自动重绑。修正设置刷新导致重绑状态丢失的问题。
- 认领 Combobox 支持姓名/学号远程搜索、键盘选择、班级展示、无匹配禁止提交；SQL 限量查询替代整批名单读取。构建、类型检查、认领 Playwright 和 12 项 HTTP 集成测试通过。
- 双 token：独立 sessions 模块和新增刷新状态表；全套 47 项 Vitest 通过，5 条浏览器回归通过，另补测到期前续期后 session 专项 3 项通过。覆盖并发请求共用刷新、认证失败回登录、错误密码不刷新，以及旧 token 重用撤销。
- 任务/审计使用 SQL 分页和筛选、独立 Tabs、每页 20/50/100 条、状态/学号/操作者/日期查询。总览只返回待处理数量，学生范围由服务端锁定；未知历史任务拒绝重试。全套 52 项 Vitest 与 7 条 Playwright 测试通过，含切换标签停止隐藏分页轮询。
- gost 配置已集中到公网转发，平台与公网表单只提交各自字段；设置编辑与目录编辑分离，TOTP 重绑独立管理状态。类型、构建和 7 条 Playwright 通过，包括页面位置与保存字段边界验证。
- Web 绑定地址接受 `0.0.0.0`；Caddy 示例连接回环地址，Docker 反代明确提示填写宿主机网关。类型、构建、53 项 Vitest 通过；真实 Relay 监听验证随隔离联调完成。
- Basic Auth 通过独立管理员 GET 接口按需读取，页面显示/复制完整 Authorization 请求头，可隐藏且离开后不缓存。54 项 Vitest、7 条 Playwright 通过；另增加真实后台任务失败 Toast 流程，管理员专项通过。
- gost API 同步实现持久化检查点和加密全配置快照；应用以自身权限写入配置，helper 只允许重启固定服务并校验安装身份。包含端口冲突、真实 HTTP Basic 验证、失败回滚、中断恢复、旧平台密码不一致时保留宿主实际密码的测试。`pnpm test`：62 项 Vitest + 3 项 Python 测试通过；7 条 Playwright 通过。部署脚本支持首次 API 环境变量并保留已存在配置的实际地址。
- PVE 选项：桥接过滤活动网桥/VNet，存储按 rootdir/vztmpl 筛选，模板按发行版及已下载状态筛选；Web 保存重新验证选择。NAT 自动生成八字符 VNet 名称并保留已有名称。类型、构建、66 项 Vitest + 3 项 Python、7 条浏览器回归及额外网桥选择用例通过。
- CPU、内存、系统盘使用 coss Combobox，含常用预设及合法整数自定义项。浏览器实际保存 6 核 / 3072 MiB / 12 GiB 并核验数据库 API 返回；类型、构建、7 条浏览器回归通过。
- 总览新增宿主 CPU、内存、交换空间、系统盘、存储、负载及运行时间，并展示一小时 CPU/内存/网络曲线。节点采样独立缓存，不读取每台容器配置；失败保留带时间戳的旧样本并显示异常。类型、构建、68 项 Vitest + 3 项 Python、7 条浏览器回归通过。
- 监听端口转换为进程名/PID 数组，移除地址 scope 后缀并合并重复监听。学生不显示或轮询端口表格，只在添加转发时读取，使用对象 Select 自动选择协议并保留手动入口。类型、构建、5 项 Python、9 条浏览器测试通过，包括 UDP 选择与手动端口。
- 学生名单独立组件支持当前搜索结果全选/反选、批量指定及电源/回收/删除。删除先停用账号并撤销会话，复用回收任务并保留失败检查点；完成后保存身份快照，重新导入同学号不会获得旧任务权限。批量进度通过聚合接口查询并合并 Toast。73 项 Vitest + 5 项 Python、9 条浏览器测试通过，含部分失败、转发清理、重启恢复、确认文字及实际名单删除。
- 最终组件审查补全 FieldError、输入类型与根节点 portal isolation，修复 coss 默认边框的主题继承；删除未使用导入与旧总览样式，并启用 noUnusedLocals/noUnusedParameters。9 条浏览器回归通过，已查看桌面总览与移动端对象 Select 截图，无横向溢出。
- 部署前只读核对：正式名单 55 人、资源 6 台、转发 3 条；gost API 地址和凭据与配置一致，四个 gost 服务均 ready。正式端口范围已由管理员改为 11000–65535（11000 保留），必须保留；本轮公开地址为 https://lxc.longjie233.top。

## 后续实施注意

### 2026-10-12 多网络资源配置与管理员调整机器（本地开发与测试）

- 目标一：资源配置支持绑定多个网络；目标二：管理员后台可调整已认领/已创建机器的网络（已有网络配置或自定义）与规格，改网络前需要关机确认。两项按用户要求各自独立提交：`d48bba1`（多网络）、`a1df70a`（调整机器）。
- 数据模型：`profileSchema.networkId` → 有序 `networkIds`（1–8，去重）；新增 `machineNetworkSchema`（iface、networkId、name、bridge、cidr、ip、gateway、dns、vlan、mac）；`Resource` 由单 `ip/network` 改为 `networks: MachineNetwork[]`。`profileSchema` 与 `Resource` 中不再保留旧字段。
- 库升级：数据层此前无迁移机制，本轮把 `openDatabase()` 的 `schema_version` 升为 `2`，检测到 `'1'` 时在**单个事务内**重建 `profiles`（去掉 `network_id` 列、spec 内 `networkId`→`networkIds` 数组）与 `resources`（`network_id/ip/network` 合并为 `networks` JSON 数组），写库前后不暴露半成品；升级函数先 `foreign_keys=OFF`，结束 `PRAGMA foreign_key_check` 校验并恢复。新增 `tests/db-upgrade.test.ts` 用 v1 结构库验证升级结果与幂等（第二次打开不再重写）。
- 创建链路：`budgetFor()` 对每个网络各取首个空闲地址（任一网络无地址则容量为 0，`ip` 取各网络最小值）；`allocate()` 写入 interfaces 数组；worker `create` 生成 `net0..netN`（仅 net0 带 `gw=`，`nameserver` 取主网络 DNS），`create-wait` 从 PVE 读回实际分配的 MAC 写入快照。占用检测（`inventory.occupiedIps`）扫描所有资源的全部网卡地址、宿主接口与所有 PVE 访客 `net\d+`。
- 调整机器：`POST /api/admin/resources/:id/adjust`（`server/lib/adjust.ts`）。选择已有网络时按地址池分配（地址未变则保留），自定义时校验 bridge 存在且支持 VLAN、CIDR/IP 在网段内、网关仅第一块网卡；MAC 支持保持/指定/自动三种模式。磁盘只能扩容、CPU/内存不得超过宿主保留后的可用额度。新增 `adjust` 任务状态机：pending →（网络变更且运行中）adjust-stop/stop-wait → adjust-apply（`PUT /config` + 必要时 `PUT /resize`，扩容按实时容量取增量，重试不重复）→ adjust-verify（读回校验后落库）→ adjust-start/start-wait → adjust-finish（主 IP 变化触发 forward-sync）；已在 `shared/activity.ts` 与 `task-recovery.ts` 注册。尚未创建容器时直接改写快照。
- 前端：配置编辑器改为网卡增删/排序列表；机器详情新增“网络接口”面板与“调整配置”入口（`src/components/resource-adjust.tsx`，运行中改网络弹出关机确认 AlertDialog）；名单、导出、转发目标统一使用第一块网卡地址。
- 本地验证：`pnpm typecheck` 通过；`pnpm test` 通过（20 个文件 98 项 Vitest，含 `db-upgrade`、`multi-network`、`adjust` 新增用例；6 项 Python helper 测试）；Playwright `admin`（含双网络配置保存断言）、`claim`、`ports`、`activity`、`session` 及新增 `adjust`（3 条：仅规格免确认、运行中改网确认关机、停机自定义网桥含 MAC）通过。`guides.spec.ts` 两条在未改动的 HEAD 上同样失败（Milkdown 编辑器步骤超时），属既有问题，未在本轮修改。
- 本轮数据集变化：内部测试仅使用本地临时 SQLite；未连接、未修改任何线上/隔离环境数据；未部署、未推送、未合并 `master`。线上库首次以新版本启动前必须备份 `.data`/`/var/lib/pvedc` 的 sqlite（含 WAL）。
- 下列事项本轮未验证，需部署验收时确认：真实 PVE 上多次 `PUT /lxc/{vmid}/config` 的网络切换与 MAC 生效、`resize` 的实际容量变化、运行中 container 的优雅关机与自动恢复、现有线上 v1 数据库升级后的登录/任务/转发连续性。

### 2026-10-12 认领密钥（本地开发与测试）

- 目标：名单支持可选认领密钥；密钥为空时认领无需填写，非空时必须正确填写。管理端可查看、可编辑、随 CSV 导入导出。
- 实现：新增 `student_keys` 表（`seal()` 加密存储、外键级联删除），`shared/schema.ts` 增加 `claimKey` 校验（trim、1–64 位、字母或数字开头，仅字母数字与 `.` `_` `-`），`server/lib/claim-key.ts` 提供加解密与常量时间比较，`allocate()` 在认领分支按同一模式（事务外快速失败 + 事务内二次校验）检查密钥，公开接口 `public/claim` 接受可选 `claimKey`。
- 公开名单：`GET /api/public/roster` 仅新增布尔 `keyRequired`，不返回密钥；`admin/overview` 与导出使用 `adminStudents()`（含 `claimKey`），其余接口仍返回不含密钥的 `Student`。
- 导入语义：CSV 含 `认领密钥`/`claimKey` 列时该列为权威（留空清除、缺列保留原值），与 `配置ID` 列先例一致；导出新增 `认领密钥` 列。
- 重置认领保留密钥，界面文案已注明；密钥限流为每学号 8 次 / 5 分钟（`rate_limit` 现有机制）。
- 库结构：数据层仍无迁移机制，`CREATE TABLE IF NOT EXISTS` 引导会在已有库（含本地 `.data/pvedc.sqlite` 与线上升级库）启动时自动建表。本轮用本地开发库副本验证：旧结构启动后自动出现 `student_keys`，原有学生数据不变。
- 本地验证：`pnpm typecheck`、构建、87 项 Vitest（含新增 `tests/claim-key.test.ts` 8 项与 HTTP 集成用例）、6 项 Python helper 测试、Playwright（claim 与 admin 两条 spec）通过；`guides.spec.ts` 两条失败在未改动的 HEAD 上同样复现，属既有问题，未在本轮修改。
- 本轮按用户要求只做本地开发与测试：未部署、未覆盖线上、未做线上/隔离 PVE 联调、未推送、未合并主分支。

## 后续实施注意（历史）

- gost API 专用接口为 `POST /api/admin/gost/api`，普通设置接口已禁止直接修改 API 地址/用户/密码。`gost()` 支持显式候选配置用于验证。
- API 更新任务阶段：pending → api-apply → api-verify → 完成；失败转 api-rollback，恢复成功后任务失败且可重新提交，恢复失败则保留 attention 检查点。配置快照在 SQLite job.secret 中加密保存。
- 所有功能已实施并逐项提交到 `dev`，未合并 `master`。正式数据与历史待处理任务保留，线上代码以本地版本覆盖。

### 真实联调隔离安排

- 使用 `/opt/pvedc-upgrade-stage`、`/var/lib/pvedc-upgrade-test`、独立 `pvedc-upgrade` / `pvedc-upgrade-gost` 服务和本机 3111 端口，先检查路径/端口没有被其他任务使用。
- 测试 helper 单独安装为 root 所有的 `/usr/local/libexec/pvedc-upgrade-helper`，仅将固定 gost 服务名改为测试服务。测试进程通过仅部署环境可设置的 `PDC_HELPER_PATH` 指向它，sudoers 单独授权此固定路径，避免旧正式 helper 与新端口协议混用。
- 读取现有 PVE/Relay 凭据仅用于初始化私有测试配置，生成独立测试管理员密钥、数据库及加密主密钥，不复制正式名单/会话。容器 helper 的安装身份保持一致，测试 VMID 使用已确认空闲的 990000 段，并在每次清理前验证测试学号和 VMID。
- 正式公网域名为 `lxc.longjie233.top`；正式三个公网端口为 50806、50516、50702。测试优先使用 11010（Web）、11009（TCP）、11008（UDP），操作前再次检查未占用。
- 真实用例应包含 Debian NAT、Ubuntu 现有 VNet 桥接、结构化监听、宿主指标、gost API 同步/恢复、0.0.0.0 Web 监听、公网 TCP/UDP 和批量删除；清理测试资源后再备份与部署正式版本。

### 2026-10-10 最终验收与部署

- Linux 最终构建成功，75 项 Vitest、6 项 Python helper 测试通过；本地严格类型检查、9 条 Playwright 回归通过。新增真实浏览器流程验证学生仪表盘、移动端端口对象选择器、管理员 OTP 自动提交、宿主指标及进程名/PID；校内正式浏览器验证总览、公网设置、审计分页。
- Debian NAT（990000）和 Ubuntu 已有 VNet 桥接（990001）均完成实际创建、学号主机名与 root 密码登录验证，确认指定的未公开规格优先于学生提交的规格。宿主指标与网络、存储、模板选项均返回真实数据。
- 在仅使用 11002–11010 的约束下，11009 完成公网 SSH 登录，11008 完成 UDP 随机数据回显，11010 的 Web 通道返回初始化状态。gost API 地址、用户名、密码同步及冲突回滚在实际服务上通过；有转发记录时再次验证同步与回滚。
- 公网实际 Relay 为 Docker 桥接网络中的 `gost1`。经用户明确批准，重建容器并仅新增 `11008:11008/udp`；保留 22 个 TCP 映射、镜像 ID、认证、挂载、网络别名与 IP，并更新 Dockhand 管理的 Compose 文件。首次重建的固定 IP 参数被 Docker 拒绝，恢复原容器网络后改用原有动态分配方式，最终 IP 保持不变。
- 重建生成的新 Relay 自签证书通过可信 SSH 获取，并更新平台信任配置；TLS 校验始终启用。PVE 的 `web` token 启用了权限分离但缺少 token ACL，已补上现有 `DistributionCenter` 角色，保留权限分离。
- 实际批量关机、启动、重启、回收、删除和部分失败处理通过。测试名单、机器、配置、VNet、服务、helper 及 sudo 授权清理完成；原有 SDN zone 保持不变。
- 部署前备份位于 PVE 的 `/var/backups/pvedc/upgrade-20261010-110921`，包含原代码、数据、配置、服务与 helper。55 名学生、6 台资源、4 条转发、2 个规格、1 个网络、56 条原任务均保留；管理员 TOTP 与主密钥逐字节一致。仅 Relay 信任证书和 Web 绑定地址按本次联调更新；正式端口池仍为 11000–65535，保留 11000。
- 原始 134 个源码文件及 helper 校验通过。正式管理员 TOTP 登录、访问/刷新 Cookie、宿主 24 CPU 指标、PVE 选项及任务/审计每页 20 条验证通过。现有五项 gost 服务均为 ready；已有四条学生转发记录未更改端口或目标。
- 校内入口：`http://10.1.229.140:3000`。用户明确选择暂不恢复 `lxc.longjie233.top`，已删除的反代记录保持不动。公网 Docker 只映射当前声明的端口，正式端口池内其余端口仍需管理员后续配置 Docker 映射及安全组，本轮未在测试范围外增加映射或探测。
- 切换到双 token 后，原单 token 会话需要重新登录一次；后续访问 token 一小时自动刷新，首次登录的绝对有效期为七天。
