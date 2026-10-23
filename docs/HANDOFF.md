# 2026-10-23 上传快照交接

本次归档包含此前本地完成的控制台、路由、群聊、生图、识图和阅读书房。下文旧小节的“未推送／当前”描述均属于各次开发记录；最新状态以本节、README和versions.json为准。原书、真实笔记、聊天、凭证和角色参考图不在仓库，需通过私人备份恢复。本次上传不运行应用测试、不重新安装或修改生产配置。

## 最新运行记录

DeepSeek/deepseek-flash为当前路由。真实首读和续读2段、Hy回读2段，原书共128段；原PDF480页，第1页经目视确认封面。使用程序引用编号，所有旧笔记保留。37项隔离检查通过；控制台ReadingStatus与安装后的QQ阅读函数可取真实笔记，尚未声称QQ设备已收到主动分享。阅读目录data/reading-workspace为私人数据，不进Git。控制台2.6.0、本地插件0.7.1；模型插件0.4.3。

# 当前开发：阅读书房0.7.1／控制台2.6.0

见READING.md。新增reading_library.py、control_reading.py和插件reading.js。实际原书在私有data/reading-workspace，禁止打包到Git；读书不再走虚构日常。首段实际读取与Hy回读状态须独立观察；不继承旧识图/聊天验收为阅读验收。未推送GitHub。

# 项目交接：让下次Codex接着做

## 当前补充：Chat网页工作路由已重新启用并验收，2026-10-22

用户要求普通Chat网页只处理QQ工作任务，不携带柚柚人设、QQ聊天历史或Hy Memory；专用工作对话复用，不逐条新建。该路由已在控制台保留为“Chat网页 · 无QQ上下文工作”，仅在用户选择并重启后使用。Edge扩展0.2.1已重新加载并确认，专用工作页需保持前台；两次后台探针超时，前台探针实际回复并通过。随后临时切换Chat工作路由，QQ真实收到了`qq-chat-work-check.txt`附件，D盘工作区副本内容正确。测试后已恢复`deepseek-account/deepseek-flash`并重启，QQ和Hy Memory就绪。未推送GitHub。详情见CHATGPT_CHAT_WORK.md与chat-work-verification.json。

原“历史：普通Chat网页通道”指携带人设/历史的通用网页聊天桥接；它仍停用。当前启用的是独立无QQ上下文的工作任务路由，两者不要混淆。

当前双路由实现和配置以 [原生Codex / DeepSeek](NATIVE_CODEX.md) 为准：控制台2.5.1，模型插件0.4.3，记忆插件0.6.6。旧账号API和网页记录为历史。

## 当前：Work授权 GPT-6 Luna，2026-10-22

**以本段为当前状态。** 用户明确叫停每条新建临时Chat的方案，已停止网页桥接，改选官方Work账号授权的chatgpt-plan/gpt-6-luna（low）。真实短回复和两轮本机工具往返通过，用户在QQ完成一次/new后确认正常回复。只读持久后端确认新会话已位于data/memory-workspace，旧会话保留。此目录的人设快照与规则文件由memory_workspace.py创建；该工具只改qqbot的cwd，保留配置和已有笔记。真实Hy Memory通过Luna完成合成身份写入、召回、另一身份隔离、删除回查并清理测试事实。QQ和记忆已上线，不需要Edge保持打开。详见WORK_LUNA.md及work-luna-verification.json。

这条路线使用既有官方账号模型接口，QQ会话与工具由DSH持久管理；不要误称为控制某个Codex桌面窗口。用户授权Work/Codex用量，但指定Luna，不擅自换Sol/Astra。不要重新打开旧网页桥接、重复要求配对或覆盖人设。此轮不推送GitHub。

## 历史：普通Chat网页通道，已按用户要求停用

用户明确要求普通Chat，不使用官方账号授权的Work/Codex共享用量。当前模型插件0.2.2、配套0.6.2、控制台2.3.0、扩展0.1.4，生产路由chatgpt-chat/browser-chat，QQ与记忆ready。正常Edge已登录、扩展已配对；真实短回复、两轮ping/pong、39233字符长提示词回读成功，用户确认QQ已正常收到回复。已修复长历史窗口、Markdown正文转义及折叠提示词回读，人设/原始会话/Hy库保留。另定位到Python HTTPX将loopback走Windows系统代理，新增memory_network.py，仅当LLM和Embedding都为loopback时给SDK显式直连传输；真实用户库和虚构库共用该配置，不改系统代理。11项Python隔离回归通过，真实新路由记忆写删验收见chat-ui-verification.json。不要重新安装已有依赖、覆盖人设或重新配对。旧小节都是历史，此轮不推送GitHub。

## 本地追加：控制台2.0（未推送）

WinForms侧栏、状态卡与后台worker。robot-control.ps1负责界面，control-worker.ps1执行受管操作，control_settings.py处理配置CAS/原子替换、日志脱敏和配置ZIP。支持重启、群备注、未保存提醒、Ctrl+S、日志及既有记忆JSON导出入口。控制台版本独立为2.0.0，Cordis仍0.5.4。Windows PowerShell5须BOM，空请求必须显式空对象JSON；不能只在PS7下验证。部署只复制代码，保留D盘人设及用户数据。隔离副本10项检查、PS5实际Status/Snapshot/Logs和真实窗口已核对；本轮没有主动停机、重启或导出私人记忆。详见CONTROL_CONSOLE.md和control-console-verification.json。


## 本地追加：0.5.4群回复可靠性，尚未推送

本机当前配套插件0.5.4、腾讯官方QQ插件仍0.5.2。同上下文只读复现确认旧JSON解析错误造成五分钟静默；改收最终文字、按成员排队、冷却延迟、控制命令优先处理，以及从READY补充自身@识别。已实际取得两位成员各一条命名呼唤回复回执，用户同时查询了状态；14个安装文件匹配，QQ在线、错误日志为空。最新单次接话8846ms，其中QQ发送4015ms，不承诺固定速度。详见GROUP_RELIABILITY.md与group-reliability-verification.json。旧小节为历史。

## 本地追加：0.5.1回复速度，尚未推送

实测检索约83/84ms，短模型1058ms；旧群接话13.25秒。正式QQ会话仍有思考块，说明旧默认off未落实；已用QQ Agent作用域agent/request扩展覆盖最终请求，并启用私聊原生流式。群6秒debounce改固定800ms，精简上下文，明确称呼时不套90秒普通插话冷却，小时上限保留。已重新安装启动、实际14文件源码哈希匹配；真实效果记录见response-speed-verification.json，不能把部署当成真人提速完成。详情RESPONSE_SPEED.md。

## 本地追加：0.5.0群友模式，尚未推送

已部署按群开关、全量群事件观察、短期多人上下文和限频非@接话。QQ群端开关由用户找到并打开，用户完成私聊配对码/目标群绑定并发送普通消息；本机观察到GROUP_MESSAGE_CREATE和一条QQ接受的非@接话回执。原来的私聊人设和Hy链路保持，群友模式只用本群空间、无任务工具。完整命令、数据与边界见GROUP_PARTICIPATION.md。不要把上线或回执等同已读，未运行应用测试套件，不宣称第二群或一小时限频已经实测。

## 当前更新：0.4.3

本机现已安装0.4.3，底层人格、世界设定、情景和事件分层；虚构记忆经来源核对写入隔离的Hy库。未回复时先45分钟轻问候，再4小时、再隔日；用户回来重置等待，角色日常可私下继续。等待信息不写成用户长期性格。分层详情、命令、数据和实际范围见MEMORY_MANAGEMENT.md。保留一段旧日记待核对，不能当权威事实。本次归档已获用户明确授权；后续上传仍按当次用户要求执行。

## 用户目标和选定方案

最新追加：用户要求水木持续经历虚构日常并主动分享，可接受每小时两三条。0.3.1已安装、默认20–30分钟考虑、每小时最多3条、23–09静默，并取得无msgId/eventId的真实主动推送成功回执。日记、真实互动片段、夜市/舞会/花园剧情分别保存，详见COMPANION文档；完整一小时频率和全部剧情尚未真人验收。

QQ官方Bot已创建，用户希望通过QQ和DeepSeek Harness对话，跨会话保留偏好、事实和经验。本项目使用腾讯官方QQ插件和腾讯Hy Memory SDK，独立qqbot profile，不修改desktop/web。

**最初核心目标已完成并有原机实际验收：** QQ私聊收发、群触发、长期记忆自动召回/写入、记住/查询/忘记控制、`/new`与重启后的召回，以及群里没有私聊记忆。

后续已完成水木的人格、桌面启动/关闭、图片识别、JSON导出，以及QQ和当前Codex聊天的双向同步。本仓库为2026-10-21完整可部署快照。

## 原机实际环境

- Windows，Node24.11.1，pnpm11.25.0，Python3.12.14。
- 项目 `D:\DeepSeekHarnessData\qqbot-hymemory`，Harness Home `D:\DeepSeekHarnessData\home`。
- DSH0.2.1-rc.2，本地runtime启动；官方QQ0.5.2，原生Cordis配套0.4.3。
- Hy Memory2.0.4，FastEmbed0.9.0，Chroma1.5.9，Kuzu0.11.3；graph关闭。
- DSH本机账号 `deepseek-account/deepseek-flash` 负责对话、视觉和记忆提炼；本地BAAI/bge-small-zh-v1.5负责512维向量。
- 没有假定DeepSeek API提供Embedding；没有新增百炼向量API或独立DeepSeek API Key。
- 仅127.0.0.1的8765和8766；真实token、登录和用户数据在原机私有目录，不在Git。

## 关键实现选择

1. 固定官方QQ补丁，明确生命周期调用，不依赖模型自行想起检索。
2. Cordis systemPrompt.context的required上下文用于相关记忆，不覆盖当前用户指令。
3. 每轮结束只把当前用户证据提交SQLite WAL异步队列，避免逐token写入和重复assistant内容。
4. Hy Memory的模型调用回到Cordis已有账号，Python服务只提供SDK封装与本地Embedding。
5. 记忆空间按Bot+用户/群哈希；会话ID变化不影响记忆空间。
6. 删除检查命名空间、取消旧待提炼任务，防止迟到任务复活旧事实。
7. 图片复用官方视觉工具；辅助调用显式off reasoning。
8. Codex传话走官方CLI queue；回程仅只读指定聊天公开assistant消息，不能写Codex数据库。

## 已遇到的问题与决定

- 初始npm与镜像ENOTFOUND，网络恢复后用固定依赖完成安装。不能把安装失败当成已有profile。
- Windows中Node不自动继承系统代理，曾导致QQ不ready。修复启动器环境代理与localhost绕过后实际上线。
- DSH不允许.env携带DSH_HOME；放在启动环境。
- PyYAML YAML1.1曾把off写成false。改为专用YAML1.2加载/导出，不再通用safe_load+dump修改模型配置。
- SQLite连接上下文不会自动close，曾导致Windows文件锁。已改明确关闭。
- 冷启动第一次召回曾超时；服务提前预热SDK/Embedding，启动器等待最多30秒后允许降级。
- 图片URL被web_fetch拒绝MIME，原来media/vision关闭。开启官方图片下载与视觉工具后用户确认可描述图片。
- 视觉helper默认高强度思考可能耗尽短预算；补丁显式reasoningEffort off，主Agent独立配置。
- Codex桌面控制socket不可用，CLI queue可用。实际排队消息随后进入原聊天，避免把入队回执等同处理成功。

逐次尝试、诊断证据和历史验收见DEBUG_HISTORY与根目录报告。

## 实际验收与边界

- 原机历史Node6项、Python8项回归通过；合约测试含stub，独立真实SDK7项验证提炼、召回、冲突、隔离、删除、队列。日期和范围在报告里。
- 用户QQ确认：普通偏好可查、`/new`召回、服务重启召回、群里没有私聊记忆、图片可描述。
- 实际DSH JSONL后端只读打开非空会话，证明真实存储格式可读。重启前后仅依赖短期上下文的随机口令没有单独真人实测。
- JSON导出实际运行过，得到10条事实/画像、2个分区、无待提炼任务；内容未上传。
- Codex同步：用户从QQ配对并发送验收文本；该文本实际到达原Codex聊天，助手“同步成功”以及多条公开进展由QQ发送接口确认成功。没有用户设备已读回执。
- 第二真实QQ账号、Codex离线积压、QQ主动推送限额耗尽、超长回复分段未进行完整实测。
- 本轮GitHub归档没有重跑应用测试或在新Windows重装；新增部署辅助工具的全新机器流程待新部署时实际验收。

## 仍需按新环境决定

- 真实QQ AppID/Secret、新机DSH账号登录；不能从GitHub恢复凭证。
- 安装路径、Harness Home、网络/代理及端口占用。
- Codex同步的本机线程UUID和新配对；旧机绑定不提交。
- 是否恢复旧记忆和会话；恢复需要用户私有备份。
- `working`长任务记忆、图片事实长期记忆、Windows开机自启/守护、群内成员级私有记忆未实现。

## 新会话可直接使用的任务说明

“请阅读此仓库AGENTS.md、docs/FROM_ZERO.md和docs/HANDOFF.md，在当前Windows检查权限与网络后按固定版本部署。保留已有desktop/web profile；凭证只在本机输入。按原项目要求完成真实QQ消息往返、长期记忆自动写入/新会话召回/隔离/删除，并记录本次验收。需要Codex同步时绑定本次聊天，不能沿用原机线程或配对数据。”


## 本地0.5.2昵称及速度补充

用户从已配对QQ请求“大肥鱼”也能叫到水木。已同时写入人格与protected.nicknames，群触发、快速跟话及模型上下文共用该列表；已安装上线、14文件哈希一致。0.5.1实际QQ样本已补齐：群接话3507ms；私聊2988ms、首正文2737ms且无思考块。未把单次样本称为稳定性能承诺。未推送GitHub，未新增/运行应用测试套件。


## 本地0.5.3：正式名字柚柚

用户明确取名柚柚。已更新personality、protected.name/previous_name/nicknames、群识别/提示、主动日常和新记录标签；旧名水木指同一人，大肥鱼和公主继续回应。不要把旧记忆里的水木当另一人，不改写原始历史或身份哈希。见CHARACTER.md。私聊/群聊人格已核对，14源文件匹配并重新上线。本地未推送。
## 2026-10-22 本地0.5.6 / 控制台2.1

已安装17个配套插件文件且逐文件SHA256一致。控制台新增生图开关、限额、超时、任务取消、预览、人工确认重发；真实Windows PowerShell5接口已读取、原值保存与预览，真实窗口核对生图页与已生成图。固定形象按用户图一冬装造型、图二左侧蓝发角色脸，原图与合成参考放私有data/character，与底层性格、情景记忆分离。新增configure-character.py供从零恢复；配置ZIP包含私有参考图，不能上传公开仓库。

手动画图已有QQ回执。自动调度已提出并保存一段银杏叶书签日记、申请配图；其待办跨本次真实重启恢复，以内置工具完成固定形象图，QQ已接受图片和原正文，一条唯一发送记录与原eventId对应。取消、静默、忙碌、超时和发送未确认主要通过隔离检查覆盖，未模拟真实QQ平台封禁；账号额度、Codex离线长时间运行和持续多天人物一致性不保证。图片仍需人工审美核对，已纠正一次裙子装饰漂移。此次无GitHub推送，保留本机2953字符人设、关闭的文字同步和用户自行更改的生图限额。\n
