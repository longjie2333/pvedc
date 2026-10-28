# 后台面板设计规范

本规范把 PVE Distribution Center 重构后的界面整理成一套可复用的后台面板标准，适用于「管理端 + 终端用户端」两类角色的中小型运维、资源分配类系统。规范中的数值和组件均取自本仓库的实际实现，文末给出参考文件，复用时可直接对照代码。

用语约定：**必须** 表示违反即视为缺陷；**应** 表示默认做法，偏离需有理由；**避免** 表示不推荐。

## 1. 设计原则

1. **布局先于文字。** 层级、分组和位置本身应能说明内容，不靠眉标、副标题或说明段落解释界面。只有说明「后果」或「口径」的文字才保留（例如「同步会重启服务」「估算不限制创建」）。
2. **一个强调色。** 品牌色只用于主按钮、选中态、进度条和图表首色；背景、卡片、边框保持中性。
3. **状态用语义色，不用品牌色。** 成功、进行中、警告、失败分别对应 success、info、warning、error，与品牌色解耦。
4. **主次分明。** 每个区域只有一个主操作；次要操作收入菜单；破坏性操作必须二次确认。
5. **同一信息只出现一次。** 页面标题、面包屑、Tab 名称和卡片标题不重复同一词。
6. **组件优先。** 先用 coss 原语与已有组合，不手写等价的交互；自定义 CSS 只处理组件覆盖不到的布局。

## 2. 技术基线

| 项 | 选型 |
| --- | --- |
| 组件库 | coss ui（基于 Base UI），registry `https://coss.com/ui/r/{name}.json` |
| 样式 | Tailwind CSS v4，设计变量写在 `:root` 并通过 `@theme inline` 暴露为工具类 |
| 图标 | lucide-react，默认 16px，跟随文字颜色 |
| 图表 | recharts 面积图 |
| 数据 | TanStack Query；命令型操作统一走一个 `useCommand` 封装（加载态、错误、成功 Toast、缓存失效） |

组件安装：

- **应** 从 registry JSON 取文件后只改写导入路径（`@/registry/default/ui/x` → `@/components/ui/x`，`lib/utils` → `@/lib/utils`），再逐个提交。
- **避免** 直接运行 `shadcn add` 覆盖已存在且被本地修改过的组件（如 `button`、`select`）。
- 依赖链需要一并带上：`sidebar` 依赖 `sheet`、`tooltip`、`use-media-query`；`group` 依赖 `separator`。

当前使用的组件：accordion、alert、alert-dialog、badge、breadcrumb、button、card、checkbox、combobox、dialog、field、fieldset、form、group、input、input-group、label、menu、meter、otp-field、pagination、radio-group、scroll-area、select、separator、sheet、sidebar、skeleton、spinner、switch、table、tabs、textarea、toast、tooltip。

## 3. 设计变量

### 3.1 颜色

中性色沿用 coss 默认值，只覆盖品牌相关变量。

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--primary` | `oklch(0.46 0.085 160)` | 主按钮、选中项、Meter、链接 |
| `--primary-foreground` | white | 主色上的文字 |
| `--ring` | `oklch(0.72 0.07 160)` | 焦点环 |
| `--background` / `--card` / `--popover` | white | 页面、卡片、浮层 |
| `--foreground` | neutral-800 | 正文 |
| `--muted-foreground` | neutral-500 与黑色 9:1 混合 | 次要文字、表头、标签 |
| `--border` | 黑色 8% | 分隔线、卡片边框 |
| `--input` | 黑色 10% | 输入框边框、Meter 轨道 |
| `--muted` / `--accent` | 黑色 4% | 代码块、悬停背景 |
| `--sidebar` | neutral-50 | 侧栏、终端用户端底色、登录表单侧底色 |
| `--sidebar-accent` | 黑色 5% | 导航选中背景 |
| `--chart-1` / `-2` / `-3` | `oklch(0.55 0.1 160)` / `oklch(0.62 0.13 250)` / `oklch(0.72 0.14 70)` | 图表系列：品牌绿、蓝、琥珀 |
| success / info / warning / destructive | emerald / blue / amber / red 500，文字用 700 | 状态与反馈 |

登录页品牌面板使用一组独立的深色值（只在该面板内使用，不进入全局变量）：底色 `oklch(0.3 0.05 160)`，文字 `oklch(0.95 0.01 150)`，强调字 `oklch(0.86 0.08 125)`，勾选图标 `oklch(0.82 0.09 125)`，副文字 `white/60`，列表 `white/75`。

换品牌时只需替换 `--primary`、`--ring`、`--chart-1` 和登录面板四个值，色相保持一致即可。

### 3.2 字体

- 正文：`'Segoe UI Variable Text', 'Segoe UI', 'Microsoft YaHei UI', system-ui, sans-serif`，基准 14px，行高 1.6。
- 等宽：`'Cascadia Mono', 'Cascadia Code', Consolas, monospace`，用于 IP、端口、学号/ID、MAC、命令、卷 ID。
- 数字列和指标值 **必须** 加 `tabular-nums`。

| 层级 | 样式 | 场景 |
| --- | --- | --- |
| 页面标题 h1 | `text-xl font-semibold` | 每页一个 |
| 实体标题 | `text-2xl font-semibold` | 详情页主体（如机器名） |
| 卡片标题 h2 | `text-lg font-semibold`；面板式卡片用 `text-base` | 卡片头 |
| 分组标题 legend | `text-sm font-semibold` | 表单分组 |
| 指标值 | `text-2xl font-semibold tabular-nums`；紧凑卡片 `text-lg` | KPI、指标卡 |
| 正文 / 控件 | `text-sm` | 表格、表单 |
| 辅助 | `text-xs text-muted-foreground` | 次行、说明、时间 |
| 登录主标语 | `text-3xl`，≥1024px `text-5xl`，`font-medium leading-tight tracking-tight` | 只在登录页 |

### 3.3 间距、圆角与阴影

| 项 | 值 |
| --- | --- |
| 页面区块间距 | `gap-6`（24px） |
| 卡片内边距 | 24px（`p-6`）；紧凑指标卡 16px，≥容器 lg 时 20px |
| 表格首末列 | 与卡片内边距对齐 24px（见 5.2） |
| 表单网格 | 两列，间距 20px；窄屏单列 |
| 表单分组之间 | 分隔线 + 上下各 20px |
| 圆角 | 卡片、弹窗 `rounded-2xl`；按钮、输入框、菜单 `rounded-lg`；子卡片、浮动条 `rounded-xl` |
| 阴影 | 卡片 `shadow-xs/5`；浮动操作条 `shadow-lg/5`；吸底保存按钮 `0 8px 24px 黑色 6%` |
## 4. 应用外壳

两类角色使用不同外壳，**不应** 共用同一套导航。

### 4.1 管理端：侧栏外壳

- coss `Sidebar variant="inset"`，宽 16rem，背景 `--sidebar`；内容区为白色圆角面板，四周留 8px。
- 侧栏头：品牌（28px 方形主色图标 + 平台名称），名称取自平台设置，不写死。
- 导航按用途分组，组与组之间只用留白区分，**不加** 组名。参考分组：日常（总览、名单、指导书）/ 资源（配置、网络、模板、转发）/ 运维（任务与审计、设置）。
- 需要关注的数量用 `SidebarMenuBadge` 显示，只在大于 0 时出现，使用 warning 文字色。
- 侧栏底：账户菜单（角色名 + 上下箭头），菜单内放退出登录。**不放** 头像和标语。
- 顶栏高 56px：`SidebarTrigger`（无障碍名称「切换导航」）+ 面包屑（控制台 › 当前页），下边框。
- 内容区：`max-w-7xl`，内边距 16px，≥640px 时 24px，区块间距 24px。
- 窄屏（<800px，见 9.1）侧栏变为 Sheet 抽屉；导航链接点击后 **必须** 关闭抽屉。

### 4.2 终端用户端：顶部导航外壳

适用于只有两三个页面的角色。

- 页面底色 `--sidebar`，顶栏 56px、吸顶、白色 80% + 背景模糊、下边框。
- 顶栏：品牌（窄屏只显示图标，名称保留为读屏文字）· 导航链接（当前项 `bg-accent font-medium`）· 右侧账户菜单（显示登录 ID + 箭头）。
- 导航 `nav` **必须** 有无障碍名称（如「学生导航」），链接不换行。
- 内容区 `max-w-5xl`，左右 16px / 24px，上下 24px。

### 4.3 登录页

- ≥1024px 左右分栏 5:6；左侧为品牌面板，右侧为表单。
- 品牌面板：品牌行 → 主标语（三行，末行用强调色）→ 副标语 → 三条特性（勾选图标）。右下角同心圆底纹：460px 圆、1px `white/5` 边框，外加两圈 `box-shadow` 扩散（56px 2.5%、112px 1.5%），`aria-hidden`。
- <1024px 品牌面板缩为表单上方的标语区，隐藏特性列表。
- 表单区：底色 `--sidebar`，内容宽 `max-w-sm` 居中。
- 同一角色的多种入口（登录 / 首次认领）用 Tabs，每个 Tab 只挂载自己的表单；另一角色的入口（管理员登录）放在表单下方，用链接样式按钮。
- 无 Tab 的模式（首次初始化、二次验证）用 h1 标题代替 Tab。
- **不放** 英文眉标、页脚、图标块和每种模式的说明段落。

## 5. 页面模板

### 5.1 页头

`PageTitle`：左侧 h1，右侧操作按钮组（主操作在最右）；不加眉标和描述。面包屑已显示所在位置，页头不再重复。

### 5.2 总览页

自上而下：

1. 页头。
2. 条件提示：系统未就绪时用 info `Alert`，右侧放跳转按钮。
3. **KPI 条**：一张卡片分四格，≥768px 竖线分隔；每格「标签 + 数值」，比值写成 `41 / 55`，分母用常规字重和次要色；需要处理的数量大于 0 时数值改用 warning 色。KPI 只放后端真实提供的数据，**不得** 用其他字段推算近似值。
4. **主图 + 侧栏卡**：`lg:grid-cols-[minmax(0,1fr)_320px]`。主图卡用 Tabs 切换指标，侧栏卡用 Meter 列出容量。
5. **主表**：卡片头带标题和本地搜索框。

### 5.3 列表页

- 页头：标题 + 导出 / 导入 / 新建。
- 卡片顶部工具行：左侧筛选（Radio Group 分段样式，显示各项数量），右侧搜索（窄屏占满一行）。
- 表格首列复选框，末列行菜单；有选择时显示底部批量操作条（见 7.1）。
- 空结果只显示标题「没有匹配的 X」，不加建议文案。
- 数据量为几百条以内且需要「全选当前结果」时，**应** 一次加载、前端筛选，不分页；需要服务端分页时，全选语义必须先定义清楚（当前页还是全部结果）。

### 5.4 卡片网格页（配置、网络等实体集合）

- `md:grid-cols-2`，间距 24px。
- 卡片头：名称（h2）+ 一行描述 + 右上角状态徽标。
- 卡片体：用 `dl` 列出关键参数；数值类参数大字号，地址类参数等宽字体并截断。
- 卡片底：操作按钮，次序为「编辑（outline）→ 主操作（default）→ 次要/危险操作（ghost）」。
- 口径说明放在网格下方，一行次要文字。

### 5.5 详情页 / 实体卡

- 实体卡头：标题（`text-2xl`）+ 状态徽标；副标题为 ID、规格名、运行时长等一行事实；右侧为操作。
- 实体卡体：事实列表 `dl`（标签 `text-xs` 次要色在上，值在下）；可复制的值后跟 `icon-xs` 复制按钮。
- 指标：两列、宽容器四列的紧凑指标卡，「标签 / 数值 / 32px 高的迷你图或 Meter」。
- 同一组件用于多个场景（如用户页与管理员弹窗）时，**必须** 用容器查询（`@container`）而不是视口断点排版。

### 5.6 设置页

- 每个设置分组一张卡片；输入框两列网格，开关单独成块放在分组底部。
- 保存按钮为右下角吸底的紧凑浮动条（`.sticky-actions`），**不应** 横跨整页遮挡表单。
- 不同功能区的设置分别保存，只提交本区字段。

### 5.7 编辑器类页面（左列表 + 右编辑区）

- 外框为单张卡片：左列 245px、底色 `--sidebar`，右侧编辑区；窄屏改为上下排列，列表限高滚动。
- 列表项：图标 + 标题（单行截断）+ 状态（`text-xs`）；当前项用 `aria-current` 标识并加 `--sidebar-accent` 背景。
- 底部工具条：左侧视图切换与开关，右侧删除（destructive-outline 图标按钮）与保存。
## 6. 组件规范

### 6.1 卡片（Card / Panel）

- 页面内容一律放在 coss `Card` 中，**不再** 使用自定义 `.panel` 类样式。
- 通用 `Panel` 包装：可选标题（h2，`text-base`）、可选描述、右侧操作；有标题时头部带下边框，内容自行控制内边距。
- 标题与页面标题或 Tab 重复时，**省略** 卡片标题，只保留卡片容器。
- 卡片描述只写会影响操作判断的信息；不写「在这里管理 X」类句子。

### 6.2 表格

- 表格作为卡片直接子元素时，首末列自动对齐卡片 24px 内边距（`@layer components` 中的规则，工具类仍可覆盖）。
- 双行单元格：主值在上，次值 `text-xs text-muted-foreground` 在下（如姓名 / 学号、规格 / 网卡数）。
- 地址、端口、ID 列用 `font-mono text-xs`；数值列 `tabular-nums`；缺省值显示 `—`。
- 宽表格在自身容器内横向滚动，页面本身 **不得** 出现横向滚动。
- 选中行设 `data-state="selected"`，由表格组件提供底色。

### 6.3 状态徽标

统一使用 `Status` 组件，徽标前带 6px 圆点（`bg-current`，`aria-hidden`）。状态到语义色的映射集中维护在一张表里：

| 语义 | 状态示例 |
| --- | --- |
| success | 已就绪、运行中、已完成、监听中 |
| info | 已预留、创建中、初始化中、重建中、回收中、排队中 |
| warning | 需要处理、待应用、已暂停 |
| error | 失败、不可用 |
| secondary（默认） | 已停止、已关闭、状态未知，以及未登记的文本状态（如「默认配置」「已下载」） |

非生命周期的标签（协议 TCP/UDP、已认领/未认领）用 `Badge variant="outline"` 或 `secondary`，不带圆点。

### 6.4 Meter 与图表

- 有上下限的量（CPU、内存、磁盘、地址池）用 coss `Meter`，轨道 6px 圆角；超过 80% 指示条改用 warning 色。标签与「已用 / 总量」同一行，数值右对齐。
- 趋势图用 recharts 面积图：高 220px；只画水平网格线；坐标轴无轴线无刻度线，刻度 11px 次要色；时间轴 `minTickGap=60`；面积填充为同色 22% → 0 渐变；描边 1.75px；关闭动画（`isAnimationActive={false}`）。
- 多指标用卡片头部 Tabs 切换，而不是平铺多张图；同一图中多系列时才显示图例。
- 迷你图（指标卡内）：高 32px，无坐标轴，描边 1.5px，填充 12%。
- 没有采样数据时显示空状态，不显示空坐标系。

### 6.5 按钮与菜单

- 每个区域最多一个 `default`（主色）按钮；次要用 `outline`；行内与工具条用 `ghost`；危险操作入口用 `destructive-outline` 或菜单内 `variant="destructive"`，执行按钮在确认弹窗里用 `destructive`。
- 卡片头、工具条中的按钮用 `size="sm"`；仅图标的按钮 **必须** 有 `aria-label`，名称包含操作对象（如「操作 陈思远」「复制公网入口」「上移 eth1」）。
- 行操作统一收入「⋯」菜单（`icon-sm` ghost 触发）；菜单中危险项放在分隔线之后。
- 互相关联的一组操作（关机 / 重启）用 `Group` 连在一起；按实时状态只显示可执行的项，状态未知时全部显示。

### 6.6 选择与切换

按语义选择原语，再套用分段外观：

| 意图 | 原语 |
| --- | --- |
| 切换内容面板 | Tabs（每个 Tab 对应一个面板） |
| 筛选值、单选表单值 | Radio Group + `segmentedControlItemVariants({ state: 'checked' })` |
| 页面导航 | 链接 + `aria-current` |
| 布尔设置 | Switch（在 `SwitchSetting` 块内） |
| 少量固定选项 | Select（`Choice` 封装） |
| 需要搜索或可自定义输入 | Combobox（远程搜索名单、规格预设 + 自定义） |

**避免** 用 Tabs 做筛选或导航。

### 6.7 表单

- 字段统一用 `Field` + `FieldLabel` + 控件 + `FieldDescription`/`FieldError`；封装 `TextField`、`Choice` 提供 `hideLabel`（标签仅读屏可见），用于有表头或前置标签的紧凑行。
- 弹窗和长表单按用途分组：`FormSection`（`Fieldset` + legend + 可选一行说明 + 右侧操作），组与组之间用分隔线。
- 组内用两列 `.form-grid`；字段与刷新按钮并排用 `.inline-field-action`。
- 可增删的行（网卡、端口规则）：行首等宽标签（如 `eth0`），中间控件，行尾上移 / 下移 / 删除图标按钮；有多列时加一行 `aria-hidden` 表头，每个输入框用逐行无障碍名称（「第 1 条转发容器端口」）。小屏改为两行。
- 每个开关独立成块（`SwitchSetting`：标签 + 一行说明 + 右侧开关），集中放在「选项」组，不与输入框混排。
- 多条校验错误合并为一个 error `Alert`，内含列表；保存按钮在有错误时禁用。
- 只在依赖项不满足时显示的字段（如非主网卡的网关）**应** 隐藏，而不是显示禁用框。

### 6.8 弹窗

- 普通编辑用 Dialog（`max-w-2xl`），破坏性操作用 AlertDialog；底部为「取消（ghost）+ 主操作」。
- 弹窗描述写清后果（「修改仅影响后续分配」「此操作将永久清空系统盘数据」）。
- 不可恢复的批量操作 **必须** 要求输入确认短语（如「删除 3 名学生」），短语与所选数量绑定，未输入一致前禁用确认按钮。
- 删除单个对象也 **必须** 用 AlertDialog，**不得** 使用 `window.confirm`。

### 6.9 反馈

| 场景 | 组件 |
| --- | --- |
| 区域内持久错误 / 成功 | `Feedback`（coss Alert；错误 `role="alert"`，成功 `role="status"`） |
| 操作完成、后台任务结果、复制 | Toast（`toastManager`，按任务 ID 去重合并） |
| 系统未就绪、需要配置 | info Alert + 跳转按钮 |
| 空数据 | `Empty`：图标 + 一句标题；只有首次引导才加一句说明 |
| 加载 | `Loading` 或 Skeleton；不在顶部插入会造成跳动的占位框 |
## 7. 交互模式

### 7.1 批量选择与底部操作条

- 表头复选框选中「当前筛选与搜索结果」，部分选中显示 indeterminate；修改搜索或筛选时清空选择。
- 选中后在列表下方出现 `role="toolbar"` 的操作条（`sticky bottom-4`，`rounded-xl`、浮层底色、`shadow-lg/5`，允许换行）：已选数量 · 反选 · 设置类菜单 · 同类操作菜单（如「电源」）· 危险操作（destructive 文字色）· 清空选择（✕）。
- 设置类菜单（如指定配置）点选即生效，错误用 Toast；危险操作进入确认弹窗。
- 受理结果在列表下方用一张结果卡展示每项「已提交 / 已跳过 / 未受理」及原因，并给出任务记录入口。

### 7.2 敏感值

- 密钥、认领码等在列表中默认显示为 `••••••`，逐行点击显示 / 隐藏（按钮带 `aria-pressed` 与含对象名的标签）；导出文件仍包含完整值。
- 凭据（如 API 调用头）只在用户点击「显示」时向服务端单独读取，离开页面不缓存，提供「隐藏」。

### 7.3 状态驱动的操作

- 只显示当前状态下可执行的操作；拿不到实时状态时显示全部，由服务端拒绝非法操作。
- 需要中断服务的变更（运行中改网络）先弹出确认，说明会关机、应用、再启动。

### 7.4 引导信息置顶

终端用户首先需要的说明（使用指南、连接方式）放在工作台最上方，默认展开未标记为折叠的篇目；没有内容时整块不显示。

## 8. 文案

- 页面标题、卡片标题用名词（「学生名单」「容量」「公网转发」）；按钮用动词或动宾（「导入名单」「应用网络」「关机并应用调整」）。
- 确认按钮写明动作：「确认删除学生」，不写「确定」。
- 状态文字两到四个字；错误信息说明原因和下一步（「可用 VMID 已用尽，请调整平台设置中的 VMID 范围」）。
- 数量与单位之间留空格（「32 GiB」「2 核」）；比例写作「41 / 55」；缺省值用「—」。
- **不写**：眉标（英文小标题）、页面副标题、「在这里…」类描述、页脚口号、与标签重复的占位符。

## 9. 响应式

### 9.1 断点

| 断点 | 行为 |
| --- | --- |
| < 640px（`sm`） | 内容区内边距 16px；顶栏品牌只显示图标；搜索框占满一行 |
| < 768px（Tailwind `md`） | KPI 改为两列且去掉竖线；卡片网格单列 |
| < 780px | `.form-grid` 单列（自定义 CSS） |
| < 800px（coss `useIsMobile`） | 管理端侧栏改为 Sheet 抽屉 |
| < 1024px（`lg`） | 登录页单列；总览主图与容量卡上下排列 |

### 9.2 容器查询

被多处复用、宽度不由视口决定的组件（实体卡、指标卡网格）用 `@container`。Tailwind v4 语法为 `@md:`（≥）与 `@max-md:`（<），**不是** `max-@md:`；写错的类不会生成。

### 9.3 防溢出

- 网格列 **必须** 写 `minmax(0, 1fr)`，不能只写 `1fr`，否则长文本（卷 ID、命令）会撑宽容器。
- 原生 `fieldset` 默认 `min-inline-size: min-content`，放进弹窗或网格时 **必须** 加 `min-w-0`。
- coss 的 Select 触发器默认最小宽度 144px，放进窄列时加 `min-w-0`。
- 验收时以 `document.documentElement.scrollWidth <= innerWidth` 检查页面级横向溢出，在 1440px 与 390px 各测一次。

## 10. 无障碍

- 每页一个 h1；卡片标题渲染为 h2（`CardTitle render={<h2/>}`）。
- 区块用 `section` + `aria-labelledby` 或 `aria-label`，使其成为可定位的 region（如「指导书」「网卡 eth0」）。
- 图标按钮必须有 `aria-label`；装饰图标、底纹 `aria-hidden`。
- 当前导航项、列表当前项用 `aria-current`；切换按钮用 `aria-pressed`。
- 视觉上省略的标签用 `sr-only` 保留给读屏（`hideLabel`），不要删除 label。
- 错误用 `role="alert"`，非紧急结果用 `role="status"`。
- 所有交互可用键盘完成；菜单、弹窗、Combobox 使用 Base UI 原语自带的焦点管理，不自行实现。
## 11. 已知陷阱

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 卡片头在窄容器里仍是两列 | `CardHeader` 的 `has-data-[slot=card-action]:grid-cols-[1fr_auto]` 是 `:has()` 选择器，特异性高于普通工具类 | 用重要性修饰：`@max-md:grid-cols-1!` |
| 容器查询类不生效 | 写成了 `max-@md:` | 改为 `@max-md:` |
| 弹窗出现横向滚动 | fieldset 的 min-content 最小宽度 / Select 最小宽度 / 网格 `1fr` | 见 9.3 |
| 打开弹窗后导航「消失」于无障碍树 | 模态弹窗会把其余内容设为不可访问 | 测试中不要在弹窗打开时断言背景元素可见 |
| Tabs 面板切换后状态丢失 | Base UI `TabsPanel` 默认卸载非当前面板 | 需要保留查询状态时加 `keepMounted` |

## 12. 验收清单

新增或修改页面时逐项确认：

- [ ] 页面只有一个 h1，没有眉标、副标题、页脚口号。
- [ ] 每个区域最多一个主色按钮；危险操作有确认弹窗。
- [ ] 状态全部通过 `Status` 映射，没有直接写颜色。
- [ ] 图标按钮都有含对象名的 `aria-label`。
- [ ] 1440px 与 390px 下页面无横向滚动；宽表格在自身容器内滚动。
- [ ] 复用组件在弹窗与整页中都按容器宽度正确换行。
- [ ] 空、加载、错误三种状态都有对应显示。
- [ ] 敏感值默认隐藏；凭据按需读取。
- [ ] 浏览器测试使用角色与无障碍名称定位（`getByRole`），不依赖样式类名。

## 13. 在新项目中复用

1. 复制 `src/styles.css` 中的变量块与通用规则（`.form-grid`、`.inline-field-action`、`.sticky-actions`、`.empty`、卡片内表格对齐规则），替换品牌色（3.1）。
2. 按第 2 节从 registry 引入组件，并复制 `src/hooks/use-media-query.ts`、`src/lib/segmented-control.ts`。
3. 复制共享组件 `src/components/common.tsx`（`PageTitle`、`Panel`、`Status`、`Feedback`、`Empty`、`Modal`、`TextField`、`Choice`、`FormSection`）与 `src/components/switch-setting.tsx`，按新项目的状态集修改 `stateNames` 与语义映射。
4. 以 `src/components/app-shell.tsx` 为模板改写导航分组与品牌。
5. 按第 5 节选页面模板，按第 12 节验收。

## 14. 参考实现

| 模式 | 文件 |
| --- | --- |
| 设计变量与通用样式 | `src/styles.css` |
| 管理端侧栏外壳、终端用户端顶栏外壳 | `src/components/app-shell.tsx` |
| 登录页（品牌面板、Tabs 入口） | `src/pages/auth.tsx` |
| 总览（KPI 条、Tabs 趋势图、Meter 容量卡、可搜索表格） | `src/components/admin-overview.tsx` |
| 列表页（Radio 筛选、批量操作条、行菜单、敏感值） | `src/components/student-roster.tsx` |
| 实体卡、紧凑指标卡、状态驱动操作、容器查询 | `src/components/resource.tsx` |
| 卡片网格页 | `src/pages/admin.tsx`（资源配置、网络） |
| 设置页与吸底保存 | `src/pages/settings.tsx` |
| 列表 + 编辑区 | `src/pages/guides.tsx` |
| 分组编辑弹窗、可增删行 | `src/pages/editors.tsx`、`src/components/resource-adjust.tsx` |
| 共享原语封装 | `src/components/common.tsx` |
| 引导信息置顶 | `src/components/student-guides.tsx`、`src/pages/student.tsx` |
| 浏览器验收写法 | `tests/browser/*.spec.ts` |

## 15. 尚未覆盖

- **深色模式未设计。** 品牌变量写在第二个 `:root` 块里，位置在 `.dark` 之后且特异性相同；若把 `.dark` 加在根元素上，主色仍会是浅色主题的品牌绿，其余变量却已切换为深色；启用前需要为 `.dark` 单独定义品牌变量并验证对比度。
- **断点未统一。** 表单网格的 780px 来自旧样式，coss `useIsMobile` 为 800px，Tailwind `md` 为 768px。实测 768–799px 之间侧栏已切换为抽屉、内容区正常占满宽度，没有布局错误，但新项目 **应** 统一为一个移动断点。
- 全局搜索（命令面板）、通知中心、多语言、表格列排序与列显隐尚无规范。
