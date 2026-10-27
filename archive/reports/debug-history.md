> 历史资料：正文属于原版本快照，当前部署见[归档导航](../README.md)。

# Debug attempts, 2026-10-20

## Native Codex writer conflict and controller diagnosis, 2026-10-22

- Applied OpenAI Docs and systematic-debugging. Scoped native logs established actual `yuzu_qqbot` failures at `thread/resume`: an active writer already owned the stored thread. Desktop diagnostics showed the mapped QQ histories had been loaded. The old probe used a new ephemeral thread and therefore passed despite old-conversation failures.
- User-requested control experiment: direct safe switch to GPT-6 Luna, verified saved configuration and runtime model agree; user reproduced the same error. Model selection was applied correctly.
- Fix attempt 1: classify writer conflicts without persisting server text; retain safe method/code/time diagnostics. For a mapped source whose latest turn is explicitly completed/failed, fork through that turn, preserve the original and atomically continue the same QQ identity on a persistent replacement. Other errors and unfinished/uncertain history refuse automatic branching. Concurrent initialization shares one recovery.
- Synthetic live verification first exposed an incomplete source fixture: it had yielded a dynamic tool call, and a separate process saw that unfinished history as interrupted. Tightened the terminal-state guard and explicit lastTurnId boundary; revised fixture requires a real final response. GPT-6 Luna then passed retained-history recall, one recovery reused for the next turn, and inherited dynamic-tool round trip. Only the two generated synthetic threads were archived.
- Red/green regression passed for safe RPC framing, recovery, concurrent identity initialization and controller runtime reporting. Final checks: native10 cases, controller/route4 cases, related Node4 files all passed. A loopback fixture initially hit sandbox EACCES; rerunning with required local network permission passed without product changes.
- Deployed model plugin0.4.2 and controller2.5.1. Installed15 source files matched; persona, native config, original mappings and profile were preserved during code deployment. User's subsequent route change to DeepSeek was retained, then switched to GPT-6 Luna with explicit user selection for acceptance.
- Fresh production acceptance: user confirmed the previously failing QQ group now replies normally. Two mapped identities continued with their original histories retained; all3 mapping identity keys remain present; replacement threads are listed in Codex and their latest turns completed. Runtime reports ready, shared memory is healthy, and the actual console shows version2.5.1 with Codex/GPT-6 Luna selected. No private message bodies, IDs or credential values enter this report.
- User's D:\柚柚 workspace categorization was not modified; native cwd and Hy Memory stay at their configured shared paths. Continued threads may require UI regrouping.

## Companion package installation, 2026-10-21

- First 0.3.0 install reached Bot ready and actual no-msgId proactive sending succeeded, with an ID-bearing QQ receipt. New fiction diary was persisted.
- Final source hardening was repacked under the same 0.3.0 filename/version. Re-add reported Already up to date. Exact source/installed SHA256 inspection showed bridge.js and companion.js remained old, while unchanged files matched.
- Followed systematic-debugging before correction: archive-member bytes match new source, installed bytes do not; mismatch is at package extraction/cache, not the source, archive or QQ runtime.
- Fix attempt 1: publish the corrected local package under a distinct 0.3.1 version/tgz path, preserving all user data and subscription state. Will compare actual installed bytes after installation and observe live startup. No new application test suite is added or run.
- Validation passed: 0.3.1 caused pnpm to install a new package; actual installed bridge.js, companion.js, companion-state.js and package.json now match reviewed source bytes. Bot ready and model proxy ready were observed after restart. Existing diary, successful proactive receipt and subscription settings remained intact.

## QQ / current Codex chat relay, 2026-10-21

- Followed OpenAI Docs and the systematic boundary investigation: installed CLI exposes queue; existing desktop control socket is not available. This was a capability check, not a change to desktop processes or database files.
- Official codex queue returned a current-thread receipt. The diagnostic message subsequently arrived in this exact chat, confirming actual consumption rather than relying on the receipt alone.
- Installed companion 0.2.0 and a reproducible gateway registration patch. QQ startup reached Bot ready without errors. No desktop/web profile was changed.
- User paired from private QQ with an expiring code, then sent the bidirectional acceptance phrase. Private local state confirmed paired/enabled, CLI receipt, and successful QQ sends. The actual forwarded acceptance request arrived as a user message in this Codex chat; assistant replied 同步成功, and the QQ sender counter advanced with no delivery error.
- Default sandbox could not open Codex queue SQLite with WAL; elevated read-only inspection succeeded. No direct database writes were used. Inbound submission uses the supported CLI with argument arrays and no shell.
- No extra test suites were added or run for this feature. Verification used actual installation, existing service startup, user pairing, real queue delivery, and actual QQ transport receipts.

## Startup on 2026-10-21

- Managed Python and Node wrappers alive, memory ready, but QQ never reported ready. No source changes or credential changes were made before diagnosis.
- Boundary checks: PowerShell Tencent auth and gateway succeeded; the same requests from Node failed with UND_ERR_CONNECT_TIMEOUT. Windows system proxy is configured while Node proxy environment was absent.
- Minimal hypothesis check: enable Node 24's environment proxy support with the existing Windows loopback proxy; the same Node auth and gateway requests both passed. No credentials were printed.
- Fix attempt 1: startup script now inherits the Windows system proxy when explicit HTTP/HTTPS proxy variables are absent, enables Node environment proxy support, and bypasses localhost. Actual bot restart verification follows.
- Validation passed: after restarting the managed processes, the actual QQ log reported Bot ready. The first targeted proxy fix resolved the startup issue.

## Personality configuration on 2026-10-21

- First application exposed a YAML dialect mismatch: PyYAML's YAML 1.1 loader converted the existing reasoningEffort: off string into false. DSH reported that the model-default entry expected a string. QQ itself still came online; the model-default warning required correction.
- Root cause confirmed from the serialized configuration and DSH validation message. Fix: use YAML 1.2 boolean resolution for personality edits, restore the pre-edit backup, then reapply only the requested prompts. Verification follows.

## QQ image content-type error on 2026-10-21

- User screenshot shows web_fetch failing with WEB_UNSUPPORTED_CONTENT_TYPE after an image message. Source/config investigation found media.enabled=false and vision disabled; the original integration was intentionally text-only. The QQ message builder supplied an image URL as text, and there was no registered image-understanding tool.
- Followed systematic-debugging: inspected attachment assembly, vision-tool registration, actual attachment/LLM API compatibility, and provider model capabilities before changing settings.
- Capability diagnostic initially selected the device record instead of the default grant; inspected the official credential schema, selected the exact default account key, and successfully fetched /models without exposing token values. deepseek-flash advertises text and image inputs; deepseek-v4-pro is text-only.
- Fix attempt 1: enable official media download and qqbot_describe_image with deepseek-account/deepseek-flash; add explicit picture-tool routing to the persona. Existing model/personality/session settings are preserved. Live QQ image verification follows.
- Live evidence after fix 1: QQ downloaded a 2.1MB PNG and called qqbot_describe_image. One call returned "vision model returned no text"; a subsequent actual image-tool result completed without error. The provider source defaults unspecified reasoningEffort to high, while the vision helper sets only 1200 max tokens. Root cause of the intermittent empty result is consistent with reasoning using the short generation budget.
- Fix attempt 2: add reasoningEffort: off to the official vision helper via the existing pinned pnpm patch, keeping the main Agent's behavior separate. This directly controls the helper request instead of increasing an unbounded reasoning budget.
- Verification: updated pnpm patch installed successfully, installed vision source contains reasoningEffort: off, QQ returned to Bot ready with no startup validation error. User confirmed in live QQ: 已经能描述图片了. The earlier image-tool execution also contains a successful result in the persisted session.

- Prior turn: regular sandbox denied DSH_HOME writes/network; reviewed elevated checks now pass. npm versions read successfully.
- OCR attempt 1: Windows PowerShell 5 interpreted a UTF-8 smart quote inside a regex as corrupted source, causing a regex parse error. Fix 1 replaces the smart quote expression with an ASCII-only pattern; rerun pending.
- Fix 1 removed the regex syntax error, but extraction still failed. Systematic-debugging Phase 1 instrumentation found that WinRT OCR split the secret into separate whitespace-delimited words on the token command line; the old regex required a contiguous 20-character word. Hypothesis: normalize OCR whitespace before parsing the platform's fixed-length secret. Fix 2 applies only that normalization. Real screenshot script is the failing reproduction; validation pending.
- Fix 2 still failed. Character-category instrumentation (no letters/digits disclosed) proved OCR used fullwidth colon U+FF1A at the AppID/secret boundary. Fix 3, after reading and applying systematic-debugging, normalizes Unicode FormKC before the already-tested whitespace normalization.
- Unicode fix passed parsing. Tencent rejected OCR-rendered secret (100016); screenshot glyph ambiguities remained. User entered current credentials into the local masked WinForms dialog and Tencent verification passed; no further OCR credential guessing is used.
- Actual QQ/DSH private message/reply succeeded (user confirmed receiving a response to 111); first session log was materialized under the independent JSONL root.
- pnpm Windows patch-commit treated an absolute patches-dir as a relative component. Using profile-relative `patches` succeeded; installed QQ inbound code contains the three intended hooks.
- Outbox regression tests exposed Windows file locks: sqlite's connection context manager commits but does not close. A closing contextmanager fixed the reproduced WinError 32; queue restart/dedup/delete-barrier checks passed.
- First background DSH boot failed because DSH intentionally refuses DSH_HOME in a discovered .env. Confirmed in app-boot readEnvLayer/BOOTSTRAP_PREFIXES. DSH_HOME must remain in the launching environment; remove it from the .env template and deployed config, retaining the launcher fallback.
- One independent model probe returned 503 during the verification sequence; the same probe passed after the final installation/restart, without changing provider configuration. Real SDK acceptance passed again. Retain graceful failure behavior for transient provider errors.
- After restart, logs showed the first recall exceeding the companion's 5-second deadline. Inspection established SDK/model initialization occurred on the first request. Added a failing startup warmup regression, then SDK/local-model warmup plus a maximum 30-second wait before starting QQ. Python regression went from the expected missing-warmup failure to 8 passing tests. Actual cold-start readiness validation follows.


## 2026-10-21 虚构记忆索引

首次同库调用add_extracted仍自动reconcile，出现成功但无返回ID的情况，队列坚持未回读不算完成。按systematic-debugging查SDK writer/client后第一次修复：独立SDK子进程、数据库，仅对已核对虚构条目关闭reconcile和搜索去重；真实用户SDK保留默认冲突处理。迁移重新排队并只清理旧的派生fiction agent空间。实际5条全部写入回读、5条召回，错误及待处理0。通用低相似度查询有时无命中，查询原情景可返回记录，界面明确本地降级。没有第二次盲修。Windows python别名不能执行时改用项目既有venv。

## 2026-10-21 群问候漏回与格式故障

先按systematic-debugging取得真实SyntaxError/五分钟暂停和同模型52字符非JSON复现，再做第一次定向修复：最终文字协议、按成员呼唤排队、冷却延迟、控制优先和READY身份识别。实际两成员各一条QQ接受回执，安装14文件与源码一致，旧暂停解除。最新单次8846ms；不是固定延迟保证。没有第二次盲修，未运行应用测试套件。完整记录见GROUP_RELIABILITY.md和group-reliability-verification.json。

## 2026-10-22 控制台状态与页签

实际日志ReadAllText复现IOException，共享ReadWrite|Delete读取成功；首次定向修复为共享有界读取和失败时待确认状态。界面用TableLayoutPanel分开标题与页签。Windows PowerShell5实际函数确认QQ/记忆就绪，真实窗口截图确认绿色状态与四个标签。只重开控制台，没有重启机器人或修改用户配置。本次未运行配置保存或启停验收。


## 2026-10-22 控制台2.0

异步worker、侧栏与安全配置后端替代UI线程等待；旧人设保存误用自动变量Profile，改为显式校验qqbot路径。隔离副本10项检查覆盖配对/未知字段保留、冲突拒绝、未绑定群限制、YAML off、人设与流式保存、共享日志遮蔽和配置备份。真实UI首次Snapshot未载入，按systematic-debugging比较PS7与PS5发现piped null序列化长度4与0，修复为空对象显式JSON；真实窗口最终载入本机2953字符人设，底部已载入反馈和就绪状态可见。日志换行规范化为CRLF。截图工具将ToolTip当主窗口，改用C#内置null类名的FindWindow包装定位真实主窗，这不是产品故障。实际PS5后台三种只读动作均成功；没有主动停机或导出私人记忆。
## 2026-10-22 内置生图与固定形象

- 第一条QQ手动画图真实进入Codex、完成原生图片与正文回传。原生工具文件保存于USERPROFILE/.codex/generated_images，与进程CODEX_HOME可能不同；交付助手只放行这两个原生目录，继续验证格式和大小。
- 控制台2.1/插件0.5.6把生图设置从持续变化的任务文件拆开，UI原值保存后任务、配对和关闭的文字同步保持。隔离检查覆盖取消、超时、明确重发、防重复、参考哈希、私有预览与备份。
- 部署第一次在关闭控制台时被两秒退出检查中止；未停止机器人、未覆盖人设。按systematic-debugging只读复查发现旧窗口随后已正常退出，定向将退出等待改为最多12秒，再次部署成功。
- 自动界面检查最初用同名窗口标题，UIAutomation无按钮，原生查找也无按钮；只读边界诊断确认命中了ConsoleWindowClass启动外壳，children=0。定向按WindowsForms窗口类筛选真实Form，原生生图页与预览检查成功；不是产品按钮缺失。已恢复隐藏外壳。
- 第一版日常图裙子混入金边与蕾丝。只针对裙子调用内置编辑，第一次网络错误，第二次仅带原插画重试成功；没有改用API。最终原生图已取得QQ回执，正文原样，原事件来源与唯一发送记录匹配。

# 2026-10-22 — ChatGPT tool replay round-trip

- **Observed:** A basic ChatGPT account response worked and the model emitted a local namespace tool call. The follow-up request containing the tool result was rejected with HTTP 400 because its `function_call_output.call_id` had no matching `function_call` in the input.
- **Reproduction:** The streaming response emitted `response.output_item.done` for a function call, while `response.completed.response.output` was an empty array. The adapter stored the empty terminal array as replay state, dropping the completed call item.
- **Fix:** Retain completed output items by `output_index`, merge missing items into the terminal response replay, and use the reconstructed replay for the next turn. Added a regression that exercises the finish replay together with the corresponding tool result.
- **Verification:** 21 protocol checks passed; a real, non-private `ping` tool call and `pong` follow-up completed using the authorized `gpt-6.1-sol` account route. No QQ profile/model routing was changed during this protocol check.

## 2026-10-22 普通Chat网页：边界逐层定位

- 用户明确普通Chat而非Work；官方账号授权确实使用Work/Codex共享用量，旧理解已更正。正常Edge登录+本地扩展方案不复制Cookie或调用内部接口。
- 旧固定输入框选择器不适配新页面。按systematic-debugging在无登录本地HTML复现，再改为受约束的通用编辑器匹配，排除搜索/只读/歧义。
- 原assistant DOM属性不匹配。0.1.3按本轮nonce读取结构化回复，真实Chat短回复及两轮本机ping/pong通过。
- 首次QQ真人验收发现旧历史超过网页桥接上限。只读真实DSH持久事件，输出结构/长度而非正文；旧单条工具结果约11.5万字符。回归先复现，模型插件0.2.2按完整轮次控制发送上下文，保留system、当前轮和工具链，标注省略数量，持久历史与Hy库不变。
- QQ下一次网页已回复，回读超时。用户提供带Markdown反斜杠星号的JSON；本地DOM用例先失败，随后仅兼容final正文的标点转义，工具参数仍严格。长提示词折叠用例又定位完整提示词DOM匹配依赖，改为nonce筛选并排除原提示词中的JSON示例，扩展0.1.4全部DOM回归通过。
- 配套0.6.2修正模型状态命令的名称，避免browser-chat误显示DeepSeek。已部署并核对24个插件JS哈希，人设及两个群保留。真实QQ最终复测及新通道记忆写删/图片边界见chat-ui-verification.json；未通过的项目必须保留pending。
- 扩展0.1.4重载后，39233字符的合成长提示词在普通Chat真实回读成功，用户随后确认QQ正常收到回答。
- 后台新记忆仍持续RuntimeError重试。独立HTTPX只读对照复现：trust_env=True对8765/8766均RemoteProtocolError，trust_env=False均200，即使HTTP_PROXY等环境变量不存在，Windows系统代理仍被发现。按systematic-debugging新增SDK初始化失败回归后，仅为两个loopback端点注入显式AsyncHTTPTransport，真实库与虚构库共享，不改第三方包、系统代理或远程端点默认行为。Python11项通过，含不可达代理下真实本机HTTP请求；已只重启记忆服务，QQ和网页配对保留。真实记忆写删结果见最终报告。


## 原生Codex双路由，2026-10-22

通过官方App Server使用桌面真实Home，测试证明默认历史列表可见。没有复用浏览器Cookie或给旧API重命名。SDK首轮合成话术明确说“临时验收事实”，Hy按长期记忆过滤，改为稳定偏好后提炼成功；生产代码不改。第二次验收脚本访问本机模型代理漏带鉴权被401拒绝，补齐测试鉴权后双路由、同ID召回、隔离与删除均通过。所有合成事实已删除。Node/Python各13项隔离检查通过，原生工具往返、真实进程重启续接通过。安装JS29份哈希匹配，QQ用户两轮连续聊天确认正常。

## 2026-10-22 群内声称画好但没有图片

调查：实际images-state只有两条历史已交付任务，本次未创建任务；命令只识别画图冒号，授权和目标又硬编码c2c。回归先复现自然请求返回null。修复尝试1：自然意图识别、群绑定管理者授权、原群目标持久化、发送前复查、真实回执与重复保护；隔离模拟46项检查通过，未调用模型或QQ。部署和真实回执仍需单独核对。

## 2026-10-23 生图独立投递

群生图0.6.4真实验收已取得QQ图片回执，用户确认生成成功。随后指出生图误入维护对话：根因是submit复用了文字同步cfg.threadId。回归先证实错误目标；修复尝试1加入独立imageThreadId且保留原文字绑定，50项隔离检查覆盖独立队列目标、配置非法拒绝、群回传与撤权取消。按用户明确选择新建“柚柚·生图工作室”；真实工作室投递验证另存本机记录。

## 2026-10-23 记忆连续性与图片输入

调查：活动群已核对事件数为0；普通群模型未接虚构上下文，省略式追问未分流，旧情景只索引摘要。媒体与vision均已开启，视觉提供方codex/gpt-6-luna，但官方视觉工具的plugin来源消息被原生prepareInput过滤，复现CODEX_INPUT_MISSING。引用缓存不保留附件且在群门控后。修复尝试1分层处理：视觉辅助保留实际图块（12项模拟回归）；完整情景证据/旧索引新修订/追问（14项）；作用域图片引用缓存、直接图块（12项）；既有生图50项回归通过。实际模型与QQ验收记录独立保存，不能以模拟替代。首次检查受管进程已停止，已由既有启动器恢复。


## 2026-10-23 真实读书替代虚构读书

调查确认旧日常没有原书或阅读书签。按用户要求增加独立阅读账本，限定连续片段与原文证据，先保存后分享。首个真实导入已完成文本提取和存储，状态SELECT因indexed保留字报错；定向给别名加引号后复用既有书源继续，未重置数据。开发期间未新增或运行自动化测试；实际读取与部署状态另记。


### 阅读续接与原文编号（最终）

首读严格引用检查发现句子真实存在但页码错，改为显式分页后DeepSeek第一段保存与Hy回读成功。第二段摘要996字、问题6项超合同，补齐预算并允许一次格式修正后仍出现改写引文。按systematic-debugging重新审视架构，以程序原文引用编号替代让模型抄录；不放宽原文真实性检查。此后DeepSeek第二段真实续读、独立核对、Hy回读成功，原书进度2/128。新增紧凑阅读上下文支持省略追问，保留全部版本和旧笔记。37项隔离检查通过；本机原书路径、身份与失败候选不入Git。


## 2026-10-23：群里否认实际阅读

按systematic-debugging对比HTTP边界：私聊4段笔记/4段Hy确认，已绑定群为0，实际账本未丢失；原规则把本会话不可见误述成未导入。用户明确授权所有读过书籍/笔记共享到已绑定群后，新增阅读专属授权策略，服务端按已绑定身份解析读者，不接收模型指定来源身份。共享实时引用原笔记，原书签和Hy记录不复制；无授权仍隔离。群不控制源书签；普通书籍讨论优先真实阅读上下文，不落入旧虚构读书回忆。先记录红灯复现再修复，隔离阅读/授权/路由及旧记忆检查通过。首次旧剧情回归受Windows沙箱TEMP重命名限制，改用工作区独立临时目录后15项通过，未修改生产权限。

第四段最初JSON解析失败后未推进，既有后台重试随后正常完成，不是笔记丢失；本轮未修改阅读重试或模型配置。


## 2026-10-24：聊天只有引文，误要求重新导入原书

群共享修复后用户确认进度/讲述正常；随后请求逐段原文，模型只看见压缩笔记的两条引文，无法通过现有路径访问已导入的source chunks。红灯复现新增source_passage缺失与原文请求未路由。修复为阅读服务按服务端授权读取当前已读范围，程序校验原文哈希后直接回传最多500字；新source_bookmarks表只保存各会话取出原文位置，不覆盖原阅读账本。原书不重新导入，不向模型塞整本PDF，不从预训练知识补原文。
