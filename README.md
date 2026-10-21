# QQ Bot + DeepSeek Harness + Hy Memory

**从 GitHub 在新电脑重建，请先阅读 [从零部署](docs/FROM_ZERO.md)。** 本仓库包含完整部署源码、人格、图标、补丁、依赖锁快照、历史验收和维护交接。真实凭证、私人记忆、聊天记录、模型缓存不随仓库上传。

文档：[架构与接口](docs/ARCHITECTURE.md) · [配置说明](docs/CONFIGURATION.md) · [备份恢复](docs/BACKUP_AND_RECOVERY.md) · [维护交接](docs/HANDOFF.md) · [文件索引](docs/FILE_INDEX.md) · [调试历史](docs/DEBUG_HISTORY.md)。

以下“已部署/已验证”描述的是 **2026-10-20～21 原电脑的历史状态**；克隆仓库后需要重新安装、登录、绑定和验收。

已在本机部署并运行。QQ 私聊收发、普通对话自动保存偏好、`/new` 后召回、服务重启后召回，以及群聊不读取私聊记忆，均已由用户在 QQ 验证。详细证据和测试范围见 [验收记录](acceptance-checklist.md)。

## 当前部署

| 项目 | 本机设置 |
|---|---|
| 项目与数据根目录 | `D:\DeepSeekHarnessData\qqbot-hymemory` |
| Harness Home | `D:\DeepSeekHarnessData\home` |
| 独立 profile | `qqbot` |
| DSH / QQ 插件 | `0.2.1-rc.2` / `@tencent-connect/dsh-qqbot@0.5.2` |
| 记忆 SDK / 场景 | `hy-memory==2.0.4` / `pro` 模式、`chat` 场景 |
| 对话和记忆提炼模型 | `deepseek-account / deepseek-flash`，复用已有 DSH 本地登录 |
| 向量模型 | 本地 CPU `BAAI/bge-small-zh-v1.5`，512 维，FastEmbed 0.9.0 |
| 运行环境 | Windows；Node 24.11.1；pnpm 11.25.0；Python 3.12.14 |

向量模型已下载并在 Windows 实际运行，不需要额外的 Embedding API Key。模型提炼仍需联网访问已有 DSH 账号对应的模型服务。

## 启动、停止

桌面已有两个快捷方式：绿色“启动水木机器人”和红色“关闭水木机器人”。双击即可在后台启动或关闭 QQ/DSH 与长期记忆服务，完成后会有中文提示。关闭保留会话和记忆数据。连续点击同一操作会避免重复创建服务。

需要重新创建桌面入口时，在项目目录执行 `create-desktop-shortcuts.ps1`。入口调用本项目的 `desktop-control.ps1`，图标在 `launcher-icons`。

在 PowerShell 运行：

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
.\start-all.ps1
.\stop-all.ps1
```

`start-all.ps1` 在后台隐藏窗口启动两个进程树，重复执行会跳过仍存活的受管进程。`stop-all.ps1` 先核对记录的 PID 和脚本路径，再停止这两个进程树。启动输出只表示进程已创建；确认上线请检查日志中的 `Bot ready!`。

2026-10-21 启动修复：QQ 启动脚本会沿用 Windows 系统代理（已有显式 HTTP/HTTPS 代理设置时优先保留），并为 Node 24 启用环境代理支持；本机记忆接口绕过代理。已解决系统代理可访问腾讯接口、Node 直连超时导致机器人迟迟不上线的问题。

前台排错可分别运行 `start-memory.ps1`、`start-qqbot.ps1`。先停止后台进程，避免端口或 QQ 连接冲突。`stop-memory.ps1` 只停止记忆服务，再执行 `start-all.ps1` 可补启动。

```powershell
Get-Content .\logs\qqbot.out.log -Tail 20
Get-Content .\logs\qqbot.err.log -Tail 20
Get-Content .\logs\memory.err.log -Tail 20
Invoke-RestMethod http://127.0.0.1:8765/health
```

启动脚本先等待 SDK 和向量模型预热，最长 30 秒，再启动 QQ。预热失败时仍启动 QQ，并允许记忆降级；后续请求会重试初始化。健康接口检查本地桥接和队列状态，不能单凭 `ok` 判断外部提炼模型可用。

## 在 QQ 使用

### 水木的人格

已配置公主般端庄优雅、温柔可爱、聪明善良、大方从容的交流风格。完整提示词在项目目录的 `personality.md`，私聊和群聊使用同一基础人格，群聊另有简洁、得体及记忆隔离的补充说明。

以后可以直接编辑该文件，然后运行以下命令应用并重启：

```powershell
.\.venv\Scripts\python.exe .\personality_config.py
.\stop-all.ps1
.\start-all.ps1
```

安装脚本也会从该文件生成 `directPrompt`、`groupPrompt`。原有会话和长期记忆保留；希望从新话题体验人设时可在 QQ 使用 `/new`。

### 消息命令

| 消息 | 作用 |
|---|---|
| 普通聊天，例如“我偏好简洁回答” | 当前轮回复结束后后台提炼重要信息 |
| `记住：我偏好简洁回答` | 同步等待 SDK 提炼写入，并显示当前记忆 |
| `记忆状态` | 查看后台队列；有 pending/running 时稍后再查 |
| `查记忆 回答风格` | 语义检索，并显示来源、ID、检索分数 |
| `查记忆` | 列出当前身份的记忆，最多 30 条 |
| `忘记：<ID>` | 删除当前身份的一条记忆，再查可验证 |
| `/new` | 使用官方 QQ 插件开启新会话，长期记忆保留 |

另支持 `/remember`、`/memory`、`/memory-status`、`/forget`。群聊默认需要 @机器人，群成员共同使用该群的记忆空间；群里执行“忘记”作用于该群记忆。

普通聊天写入是异步的。提炼会筛选重要信息，不保证每一句闲聊都生成一条记忆。更新偏好应明确说明替代关系，例如“以后请详细解释步骤，不再按之前的简洁偏好回答”。Hy Memory 的实际冲突处理已验收，但仍受模型判断影响，可用查询和删除命令纠正。

## 集成实现

1. 官方 QQ 插件处理 QQ 协议、群 @触发和会话管理。
2. 固定版本的 pnpm 补丁在消息进入 Agent 前调用本地记忆钩子，在 Agent 空闲后提交本轮用户消息。补丁同时移除了该入口的原始消息正文日志。
3. 原生 Cordis 插件注册 `systemPrompt.context`，把本轮检索到的事实、来源 ID 和分数加入上下文。记忆按资料处理，当前用户说法优先。
4. Python 本地服务封装真实 Hy Memory SDK。提炼通过 Cordis 的官方 `ctx.llm.stream` 调用已有 DSH 账号；向量计算走独立的本地模型。
5. 用户消息进入 SQLite WAL 队列，后台按 `chat` 场景写入；按 QQ message ID 去重，不逐 token 写入。队列中的任务在服务重启后恢复。

私聊空间为 `SHA256([AppID, c2c, OpenID])`，群空间为 `SHA256([AppID, group, GroupID])`。空间不使用会话 ID，因此 `/new` 和重启不改变记忆归属。读取和删除都检查身份；不会把私聊内容自动写入群空间。非 QQ Agent 不使用这些记忆钩子。

记忆服务与模型代理分别只监听 `127.0.0.1:8765`、`127.0.0.1:8766`，操作接口使用本机随机 bearer token。记忆检索失败会允许普通对话继续，记忆命令则报告“未确认成功”。

## 安装或重建

当前电脑已安装并绑定，正常使用只需要启动。重建时将本交付目录完整复制到目标项目目录，再运行安装脚本。需要 Node、npm、pnpm、Python 3.12，以及 npm、PyPI、首次下载模型时的 Hugging Face 网络连通性；已有 DSH 登录需位于所选 Harness Home。

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
$env:DSH_HOME='D:\DeepSeekHarnessData\home'
.\install-qqbot.ps1
.\configure-qq-local.ps1
.\start-all.ps1
```

安装脚本会停止本项目受管进程，安装固定版本的 DSH、官方 QQ 插件、本地 Cordis 包和 Python 依赖，应用固定补丁，配置独立 `qqbot` profile，生成本机随机 token，并预热向量模型。重装保留现有 `.env`、QQ 凭证和数据。首次覆盖 `qqbot` 的配置前保留一次备份；如已手工修改该 profile，请先自行备份。

`configure-qq-local.ps1` 打开本机遮蔽 Secret 的输入框，通过腾讯接口验证后才保存。凭证只写入本地 `qq.credentials.json`，启动时导入子进程环境。已有有效凭证无需再次输入。无需执行截图中的 OpenClaw/Hermes 命令。

`.env.example` 是模板；安装时替换 `__LOCAL_TOKEN__`。不要把 `DSH_HOME` 写入 `.env`，DSH 会拒绝含启动变量的文件；应在启动环境设置或使用脚本当前 D 盘默认值。迁移模型、端口或存储目录时，需同时调整 `.env` 和原生插件对应设置。

`requirements.txt` 固定直接依赖，安装脚本优先使用记录本机完整依赖的 `requirements-lock.txt`，`versions.json` 记录实际运行版本。QQ 插件补丁仅适用 0.5.2；升级前重新核对接口并验收。

## 数据、凭证和备份

### QQ 与当前 Codex 聊天同步

本地配套插件 0.2.0 增加可选同步。保持 Codex 桌面版和机器人运行，在项目目录执行 `configure-codex-relay.ps1 -ThreadId <当前聊天 UUID>`；它会找到该聊天的记录并打印 15 分钟有效的一次性配对命令。仅将命令发给水木的 QQ 私聊。已绑定时只能由该私聊开启；换用户需停机后在本地使用 `-Rebind` 重新设置。首次配对不自动导出旧聊天。

| QQ 私聊命令 | 作用 |
|---|---|
| `开启Codex同步 配对码` | 首次绑定当前 Codex 聊天与此 QQ 私聊 |
| `转告Codex：帮我看看现在的任务` | 通过本机 `codex queue` 向该聊天排队发消息 |
| `Codex状态` | 查看开关、最近活动、队列和推送错误 |
| `取Codex回复` | 用新的 QQ 回复窗口重试发送本地待转发回复 |
| `关闭Codex同步` | 停止转发，清空待转发内容；已入队的 Codex 请求不撤回 |
| `开启Codex同步` | 已绑定的私聊恢复同步，从恢复时的新内容开始 |

自动转发仅提取所绑定聊天新生成的 assistant commentary/final 完整正文，以“Codex 进展/回复”标记；不转发推理、工具调用、工具结果、用户消息或其他聊天。普通聊天仍交给水木；传话命令不进入长期记忆提炼。每次推送间隔至少 20 秒，长回复分段。只读该聊天的本机记录，不修改 Codex 数据库。配置、身份哈希、回复目标、游标和待发送正文存于 `data/codex-relay`，目录仅当前 Windows 用户和 SYSTEM 可访问，不进入交付压缩包。

“已排队”表示 Codex CLI 已返回入队回执，处理和完成以实际转回的回复为准。Codex 桌面版关闭或忙碌时可能延后处理；QQ 平台的回复窗口、主动消息权限、网络故障会影响即时推送。失败内容保留在本地，可发送“取Codex回复”刷新窗口重试。发送成功与本地落盘之间突然断电时可能重复一次，无法保证严格一次投递。更换聊天或日志轮换后需重新核对绑定；本功能不提供 QQ 端自动绕过 Codex 的权限确认。

### 导出 JSON 文字版

在项目目录运行 `export-memory.ps1`，默认生成 `exports\shuimu-memory-时间.json`。如原本正在运行，会短暂停止受管服务，导出完成后自动恢复。文件使用 UTF-8，可用记事本或 VS Code 打开。

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
.\export-memory.ps1
```

导出当前已保存、状态为 ACTIVE 的事实和画像，按 QQ 身份命名空间分组，保留记忆 ID、来源、时间和元数据。全量分页读取，不受 QQ“查记忆”30 条显示上限限制。默认排除专用验收测试数据；需要时加 `-IncludeTestData`。该 JSON 是可读的数据导出，不包含向量、聊天原文层、凭证或人格提示词，也不是可直接替代数据库的恢复包。尚未提炼完成的任务数记录在 `pending_extraction_jobs`。

导出文件保存在本机私有目录，已加入 Git 忽略规则；发布源码包不包含实际导出的个人记忆。

| 路径（项目目录内） | 内容 |
|---|---|
| `data\hy-memory` | Hy Memory 原始资料、提炼数据、向量数据库 |
| `data\models` | 本地向量模型缓存 |
| `data\outbox.sqlite3` | 待处理、完成和取消的写入任务 |
| `data\sessions` | DSH 压缩 JSONL 会话，负责已有会话恢复 |
| `data\memory-audit.jsonl` | 命名空间、检索来源 ID、渠道、分数和删除记录，不记录记忆正文 |
| `.env`、`qq.credentials.json` | 本机 token、QQ 凭证，不交付、不提交 Git |
| `.run\services.json` | 当前受管进程的 PID 和启动脚本路径 |
| `logs` | 当前进程日志；重新启动会重建相应输出文件 |

DSH 插件安装与 profile 配置另在 `%DSH_HOME%\profiles\qqbot`。`desktop`、`web` 配置未作为安装目标。

官方 QQ 插件还会在 `%USERPROFILE%\.dsh-qqbot\model-prefs.json` 保存 `/new` 后的当前会话映射等偏好；备份恢复时也应包含此文件，否则可能回到该 QQ 身份的默认旧会话。

备份时先 `stop-all.ps1`，再备份整个 `data`、本机凭证和 `qqbot` profile，避免复制打开的数据库。恢复后重新启动。目录包含私人对话和事实，按私有数据保管。Git 忽略规则已排除数据、凭证、模型、运行时和日志。

“忘记”删除的是选定的可召回记忆；不等于清除 QQ 历史、DSH 会话或 SDK 原始资料。删除时取消该身份旧的待写入任务，防止迟到的任务重新产生旧事实。这也会取消该身份尚未完成的其他事实提炼。后续用户再次表达同一事实时，仍可能形成新记忆。

## 排错

| 现象 | 检查与处理 |
|---|---|
| `ENOTFOUND`、依赖下载失败 | 分别检查 npm/PyPI/模型源的 DNS 和网络；恢复后重跑安装脚本。当前实际安装已成功。 |
| D 盘 `Access denied` | 使用对项目和 Harness Home 有写权限的 PowerShell；不必修改其他 profile。 |
| DSH 拒绝 `.env` 中的 `DSH_HOME` | 删除该行，在启动环境设置变量。 |
| QQ 未上线或凭证错误 | 看 `qqbot.err.log`；运行本地凭证验证窗口，不打印 Secret。确认未被其他进程重复连接。 |
| QQ 在线但模型无回复 | 检查所选 Harness Home 的 DSH 登录是否有效、模型网络是否可达。 |
| 写入尚未查到 | 查“记忆状态”；等待 pending/running 完成。自动提炼会忽略不重要内容。 |
| 检索慢或服务不可用 | 查 Python 错误日志、模型缓存、磁盘空间和本机 8765/8766 端口；普通 QQ 对话会降级继续。 |
| 群内无响应 | 在 QQ 平台确认群权限/发布范围，确保机器人在群内，发送消息时 @机器人。 |
| 误召回或旧偏好 | 使用返回的 ID 与审计记录核对来源；明确更正偏好，必要时按 ID 删除。 |

服务完全离线时，该轮无法送入服务端队列，不承诺补写；服务在线、后端暂时失败的已入队任务会重试。当前实现未接入 `working` 长任务经验和图片内容的长期记忆提炼。暂未配置 Windows 开机自启或服务守护。

2026-10-21 已开启 QQ 图片下载与官方 `qqbot_describe_image` 工具，视觉模型使用现有账号的 `deepseek-flash`。已向官方模型目录核对该模型支持 `text,image`。QQ 下载缓存位于 `%USERPROFILE%\.dsh-qqbot\media`，上限 20MB、保留 24 小时；单次视觉工具图片上限 10MB。人物、画面和图片文字交给视觉工具分析，`web_fetch` 继续用于网页文本。固定补丁同时让视觉调用使用 `reasoningEffort: off`，避免短输出额度被默认高强度思考耗尽而没有正文。图片分析可能增加模型用量。

## 验收与复查

详见 [验收记录](acceptance-checklist.md)。需要重跑真实 SDK 验收时：

```powershell
.\.venv\Scripts\python.exe .\acceptance-local.py --project . --result .\acceptance-local-results.json
node --test .\tests\identity.test.mjs .\tests\qq-memory.test.mjs
.\.venv\Scripts\python.exe -m unittest discover -s .\tests -p 'test_*.py'
```

真实 SDK 验收只使用专门的测试命名空间，包含实际提炼调用；会消耗模型额度。结果报告不包含 QQ 凭证或真实用户记忆正文。

官方资料：[DSH QQ 插件](https://github.com/tencent-connect/dsh-qqbot)、[Hy Memory](https://github.com/Tencent-Hunyuan/Hy-Memory)、[Hy Memory 环境变量](https://github.com/Tencent-Hunyuan/Hy-Memory/blob/main/docs/env_reference.md)。
