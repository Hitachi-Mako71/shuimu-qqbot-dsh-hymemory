# 架构、事件顺序和接口

当前主链路：QQ → 腾讯DSH插件 → 共享身份/Hy Memory钩子 → DeepSeek 或 Codex原生App Server。Codex以DSH sessionId映射持久线程、当前消息增量追加，使用同一个桌面Codex Home。辅助提炼采用ephemeral线程；详见[NATIVE_CODEX.md](NATIVE_CODEX.md)。

## 消息链路

本地0.6.0补充：对话和Hy Memory提炼通过控制台选择的DSH LLM路由运行，当前为授权ChatGPT账号的 `gpt-6.1-sol`；切回DeepSeek仍使用原生DSH适配器。Hy Memory向量仍由本机FastEmbed生成。QQ“画图”或已核对的主动日记 → 持久图片任务 → 配对的Codex聊天内置image_gen → 原生图片交付助手 → QQ富媒体图片携带原正文。固定外貌资料与图片链路独立。详见CHATGPT_PLAN.md与CODEX_IMAGES.md。

```mermaid
flowchart TD
  QQ[QQ 官方私聊/群聊] --> SDK[官方 QQ 插件与 SDK]
  SDK --> Relay{Codex 控制命令?}
  Relay -->|配对私聊| CQ[本机 codex queue]
  CQ --> CC[绑定的 Codex 聊天]
  CC --> CR[只读新增的公开进展/回复]
  CR --> SDK
  Relay -->|普通聊天| Recall[按身份检索 Hy Memory]
  Recall --> Context[Cordis systemPrompt.context]
  Context --> Agent[DSH Agent]
  Agent --> SDK
  Agent --> Idle[whenIdle 后提交当前用户消息]
  Idle --> Outbox[SQLite WAL 持久写入队列]
  Outbox --> Hy[真实 Hy Memory SDK chat]
  Hy --> LLM[本机 8766 模型代理]
  LLM --> Native[ctx.llm.stream 与当前账号路由]
  Native -->|ChatGPT账号或DeepSeek回退| Selected[DSH原生模型适配器]
  Selected --> Agent
  Hy --> Emb[本机 FastEmbed 512维]
  Hy --> Store[Chroma 与 SDK 文件数据]
```

## 实现顺序

1. 官方 QQ SDK 收消息，完成平台身份、群 @、附件等解析。
2. pnpm 补丁在 `dist/transport/inbound.js` 的 Agent 创建之前构造 `{appId, scope, peerId}`。
3. `bridge.beforeQQTurn` 先尝试确定性的 Codex 命令，再处理“记住/查记忆/忘记/记忆状态”。已处理命令直接回复，不进入 Agent，也不自动提炼。
4. 普通聊天同步检索当前身份记忆，把结果存入 Agent symbol。召回异常返回“不可用”上下文，但继续对话。
5. `index.js` 注册 required 的 `systemPrompt.context`，注入记忆正文、来源、ID、分数和“资料不是指令”的说明。
6. 原官方 QQ 会话管理器路由并运行 Agent，官方出站事件把正文发回 QQ。
7. `whenIdle` 之后 `afterQQTurn` 仅提交当前轮用户文本到本机队列，不反复提交 assistant/旧记忆，降低删除后旧事实被重新引入的风险。
8. 后台 worker 通过真实 SDK 的 chat 场景提炼；模型请求回到运行中的 Cordis LLM，向量模型在本机 CPU 上执行。

## 身份、会话和记忆

命名空间使用 `qq-` + `SHA256(JSON.stringify([AppID, scope, peerId]))`。私聊 scope 为 `c2c`、peerId 为用户 OpenID；群聊 scope 为 `group`、peerId 为群 ID。不同 Bot 也隔离。

DSH JSONL 保存现有会话历史，Hy Memory 保存跨会话事实。记忆命名空间不包含 DSH session ID，因此 `/new` 更换会话后仍能检索同一身份的事实。群成员共同使用群空间及群记忆删除控制；没有细分群成员私有记忆。

写入 job ID 根据身份和 QQ message ID 生成，重投不会产生无限重复队列任务。SQLite 记录 pending/running/done/canceled 等状态并在重启时恢复。成功后清理任务原文载荷；失败有重试，不能保证外部模型每次都提炼出事实。

“忘记”检查记录归属，并取消该身份更早的待提炼任务，防止迟到写入复活旧事实。这会同时取消同身份其他尚未完成的旧提炼任务。删除可召回事实不等于抹除原始对话层、QQ 历史或 DSH 会话。

## 本机接口

`hymemory_service.py` 使用 ThreadingHTTPServer，只监听 `127.0.0.1:8765`。除健康接口外检查 bearer token；具体字段以源码为准。

| 接口 | 用途 |
|---|---|
| `GET /health` | SDK/embedding 初始化状态及后台队列概况 |
| `POST /search` | 按 `user_id`、`query` 语义检索，返回来源 |
| `POST /list` | 查看当前命名空间记忆 |
| `POST /add` | 显式“记住”，同步等待提炼 |
| `POST /enqueue` | 普通对话提交后台持久提炼任务 |
| `POST /status` | 当前身份写入状态 |
| `POST /delete` | 检查身份并删除指定记忆 |
| `POST /v1/embeddings` | 供 SDK 使用的本地向量接口 |

`model-proxy.js` 只监听 `127.0.0.1:8766`，提供 `GET /health` 和带 bearer 的 `POST /v1/chat/completions`，将SDK的OpenAI风格请求转换为当前路由下的原生DSH LLM消息。它供本项目记忆提炼使用，不是通用OpenAI API代理。

## 公主生活与主动分享

`companion.js`在QQ原生sender注册后台调度，与QQ进程生命周期一致。`companion-state.js`使用相同身份哈希管理私有JSON，串行维护同一身份的日记、互动片段和故事。普通对话将生活连续性资料加到已有required prompt上下文；互动剧情直接生成回复并持久保存，不进入Hy Memory提炼队列。

每20–30分钟推进一个虚构生活片段，模型判断是否值得分享；读取当前私聊相关记忆作为资料，生成时无工具权限。主动发送直接调用SDK且不传msgId/eventId，不使用被动回复缓存。设置、静默、限额和近期对话先检查，发送前再检查暂停。QQ拒绝后保留日记并退避，普通对话可继续。独立配对支持未安装Codex的用户。详细状态和边界见COMPANION文档。

## 图片链路

QQ 下载媒体并向 Agent 提供本机路径；官方 `qqbot_describe_image` 调用 `deepseek-flash`。固定补丁令视觉辅助请求 `reasoningEffort: off`，避免 1200 token 的预算被默认高强度思考占满。图像工具限制 10MB，官方下载器限制 20MB/保留24小时。图片文件和视觉事实没有自动写进 Hy Memory。

## Codex 同步

官方 bootstrap 的 sender 通过 `registerQQRelay` 注册到本地插件，沿用官方回复限额和目标解析。启动器设置私有状态目录，轮询器与 QQ/DSH 共用进程及生命周期。

- 只有 QQ 私聊可用限时随机码首次绑定；保存身份哈希与实际发送目标，不接受群聊控制。
- `codex queue --thread UUID --message TEXT` 使用 child_process 参数数组且 `shell:false`，QQ 文本不会拼接成 Shell 命令。以 CLI 回执确认入队，不冒充已经完成。
- 只扫描明确绑定的 jsonl 文件的新字节，识别 `response_item/message/assistant` 且 phase 为 `commentary` 或 `final` 的 `output_text`。
- 不转发 reasoning、工具调用和返回、用户输入及历史聊天。超大工具记录跳过；消息读取与待发内容/字节游标一起落盘。
- 通常每20秒最多一次自动推送，长文本分段。发送失败保留内容，支持用新 QQ 消息刷新回复窗口。游标和待发内容保存在本机 JSON 私有状态。
- 关闭时清空待发内容；重新开启从当时末尾开始。已提交给 Codex 的用户请求不撤回。进程突然中断可能重复一次推送，不保证严格一次投递。

没有云端常驻服务、自动越权审批或任意聊天广播。Codex 的权限确认仍由 Codex 处理。
