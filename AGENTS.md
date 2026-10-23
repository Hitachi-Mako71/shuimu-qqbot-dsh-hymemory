# 给下一次部署或维护本项目的 Codex

## 先读

1. `docs/FROM_ZERO.md`：新电脑部署顺序、DSH 登录和 QQ 绑定。
2. `README.md`、`docs/ARCHITECTURE.md`、`docs/CONFIGURATION.md`。
3. `docs/HANDOFF.md`、`docs/DEBUG_HISTORY.md`、`acceptance-checklist.md`：已完成、实际验收及未测边界。

## 本项目约定

- 默认 Windows；项目 `D:\DeepSeekHarnessData\qqbot-hymemory`，Harness Home `D:\DeepSeekHarnessData\home`，只管理 `qqbot` profile。先检查环境，不假定路径存在或已登录。
- QQ 官方 Bot + `@tencent-connect/dsh-qqbot@0.5.2` + 本地 Cordis 插件 + Hy Memory 2.0.4。固定 DSH 0.2.1-rc.2，配套插件0.7.1、模型插件0.4.3、控制台2.6.0；不要无说明升级。
- 群/私聊身份隔离；自动召回在入站 Agent 前完成，自动写入在当前轮空闲后提交持久队列。不要只做可选的 MCP 搜索工具。
- 陪伴功能见 `docs/COMPANION.md`：虚构日常/剧情存data/companion，并写入独立Hy Memory库；底层人设、世界设定、情景、事件进度分层管理，详见docs/MEMORY_MANAGEMENT.md。真实用户记忆继续走原Hy Memory库。主动分享只发已配对私聊；高频20–30分钟考虑、每小时最多3条、默认23–09静默。暂停和平台拒绝必须生效，不能假报发送成功。未回复时按实际check-in计数降频，旧生活分享不能冒充已发问候；沉默不提炼成用户性格。
- 群友模式见docs/GROUP_PARTICIPATION.md：按群授权开启，群内任何人可关闭；非@接话只用无工具模型和本群短期缓存/Hy空间，不能读取主人私聊。保留SDK回声过滤、限频、关闭后取消发送、真实接收与回执统计。
- 私聊、群聊分别有记忆命名空间；不能把私聊长期记忆自动分享到群。
- 人格在 `personality.md`。PyYAML 编辑 DSH 配置时使用 `personality_config.PromptLoader/PromptDumper`，保证 YAML 1.2 的 `off` 为字符串。
- `.env` 不能包含 `DSH_HOME`。先设置启动环境；DSH 主程序不需要全局安装。
- QQ 与 Codex 同步为可选功能。只能配对用户私聊与一个指定聊天，入站使用 `codex queue`，出站只读该聊天新产生的 assistant commentary/final；不能读出或转发推理、工具日志、其他聊天。
- 凭证仅在本机官方登录或遮蔽输入窗口中填写。不要要求把 Secret、Token 发到聊天，不打印、不提交真实 `.env`、QQ 凭证或 DSH 登录文件。
- 完整源码和模板在仓库；真实记忆、会话、模型缓存、虚拟环境、node_modules 和 Codex 的机器绑定状态不随 Git 迁移。恢复旧记忆见 `docs/BACKUP_AND_RECOVERY.md`。
- 保留 desktop/web profile 原样。需要登录时优先使用相同 Harness Home 的桌面版；纯 CLI 方案使用独立 `qqbot-login` Web profile。
- 不要因用户只要求启动、上传或改提示词就额外运行测试。明确要求测试/验收时再运行现有测试，真实 SDK 验收会产生模型用量。
- Windows 删除/移动递归目录前核实绝对路径属于目标目录；启动后台程序时隐藏窗口。不要停止或修改无关进程。
- 上传前检查暂存区并扫描真实凭证值、压缩包内部及私有数据路径。使用 `.gitignore`，不能依赖私有仓库替代凭证保护。
- `dependency-locks` 是原机快照，不是可直接启动的 profile。可用 `tools/materialize-dependency-locks.py` 生成对应安装路径的锁文件。
- 桌面统一控制入口见 `docs/CONTROL_CONSOLE.md`；集中管理启停、主动消息、分群设置、人设及私聊流式输出。不要让快捷方式或设置界面回显Secret/Token。
- 控制台2.0的耗时操作在control-worker.ps1后台执行，配置由control_settings.py检查版本并保留未知字段。控制台更新只复制代码，不得覆盖用户在D盘编辑过的人设或运行配置。PowerShell5脚本保留UTF-8 BOM；无参数请求也必须显式序列化空对象，不能依赖piped null。
- 修改本地插件源码后，重新打包安装时必须递增插件版本和tgz文件名，并更新锁与文档。pnpm曾对同版本同路径新包显示Already up to date却沿用旧文件；完成前比较实际node_modules文件与源码哈希，不能只看CLI退出0。

## 调试兜底规则（用户要求）

- 生图见docs/CODEX_IMAGES.md。使用Codex内置工具，不能静默换API。日常配图带受保护外貌参考；data/character与图像任务是私人数据，不同步Git。控制台图片开关保存在images-settings.json，不能覆盖images-state.json或开启已关闭的文字同步。新机器私有参考图需另行恢复。
- 当前路线见docs/NATIVE_CODEX.md：DeepSeek和原生Codex两条可切换路由，共用Hy Memory与data/memory-workspace，保留身份隔离。Codex通过官方App Server复用桌面实际CODEX_HOME，DSH sessionId映射到持久线程，平常只追加新输入，重启resume；辅助模型调用用ephemeral线程。禁止恢复旧的逐条临时Chat网页方案；不得把旧chatgpt-plan API冒充原生Codex聊天。只读/操作本项目映射中的线程，不接触其他Codex聊天。

- 处理程序故障、测试失败或异常行为时，记录已执行的修复尝试。
- 如果两次不同的修复尝试在执行相关验证后仍未解决问题，则在第三次修复尝试前，必须调用并严格遵循 `superpowers:systematic-debugging`。
- 若该 skill 按其触发规则应更早调用，则立即调用，不必等满两次失败。若部署环境没有该 skill，先查找安装位置，不能假称已调用。

- 阅读见docs/READING.md：data/reading-workspace保存真实书源与逐段阅读账本，每次最多2400字符，默认45分钟一段；笔记/感悟/进度/Hy待办同事务，先核对再分享。旧虚构读书桥段不可倒填成实际阅读。保留全部逐段笔记和整体理解版本，群不读私聊书架。

## 完成标准

实际安装和启动后观察 `Bot ready!`，让用户从 QQ 验证私聊、群聊隔离、`/new` 与重启召回、更新偏好和删除。可选 Codex 同步必须实际收到 QQ 转达请求，并取得回程发送回执。区分“CLI 已入队”“聊天实际收到”“QQ 接口发送成功”和“用户设备已读”，不要把历史验收当成本机新验收。
