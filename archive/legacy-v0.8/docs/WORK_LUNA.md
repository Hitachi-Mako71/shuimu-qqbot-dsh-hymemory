> 历史资料：正文属于原版本快照，当前部署见[归档导航](../../README.md)。

> 历史路线：本页描述此前chatgpt-plan账号API。现已升级为[DeepSeek / 原生Codex双路由](NATIVE_CODEX.md)，Codex聊天会实际保存在Codex软件中。

# 柚柚使用 Work / Codex 的 Luna 模型

## 当前路线

用户于2026-10-22停止浏览器自动新建临时Chat方案，改选Luna。当前通过已有OpenAI官方账号授权使用 `chatgpt-plan / gpt-6-luna`，reasoning为账号支持的low。账号实际目录还列有 `gpt-5.6-luna`；没有静默切到Sol或Astra。

QQ → 腾讯DSH插件 → 按QQ身份持久保存的DSH Agent → 官方Work账号模型通道；Hy Memory继续自动召回/提炼，Embedding仍为本机模型。网页桥接服务已停止；正常运行不需要打开Edge或Chat标签页。会话和工具由现有DSH管理；不是控制Codex桌面里的某个聊天窗口。

该官方授权仍使用Work/Codex的账号用量，Luna不代表无限额度。模型范围以账号实时目录为准。官方资料：[模型目录与授权推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[ChatGPT模型](https://learn.chatgpt.com/docs/models?surface=app)。

## 记忆工作目录

当前目录：`D:\DeepSeekHarnessData\qqbot-hymemory\data\memory-workspace`。

- `AGENTS.md`：角色资料、身份边界、工具与记忆使用规则。
- `persona.snapshot.md`：创建目录时的本机人设快照；当前控制台/会话人设优先。
- `README.md`：本目录用途，可存放主人授权的可读笔记与任务文件。
- 真实长期记忆仍在 `data/hy-memory`，通过当前QQ身份的Hy Memory接口检索/写入；不把所有私聊/群聊数据库复制到共享文本。
- 原DSH会话仍在 `data/sessions`，新会话使用本工作目录。旧会话的cwd属于不可变持久头，因此迁移目录时仅需一次 `/new`；后续一直续接同一身份会话，重启也可恢复。已有旧记录不删除。

在新的部署中，先完成官方账号登录、刷新目录并验证Luna，再在控制台保存模型。设置工作目录：

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
.\.venv\Scripts\python.exe memory_workspace.py --project . --profile D:\DeepSeekHarnessData\home\profiles\qqbot
```

此工具只改独立qqbot的cwd，备份旧配置；保留人设、群配置、模型、未知字段和已有工作区笔记。重启后在QQ做一次 `/new`。不要删除旧记忆或每条消息重建会话。

## 验收与边界

2026-10-22：gpt-6-luna真实短回复、两轮本机ping/pong工具往返通过；用户在QQ完成 `/new` 后确认正常回复。只读真实持久后端确认已有新会话位于记忆工作区，旧会话仍保留。真实Hy Memory用独立合成身份完成提炼写入、语义召回、另一身份隔离和删除回查，测试事实已删除。

Python SDK的本机网络直连修复同时保留：当LLM与Embedding都为loopback时使用显式HTTP传输，避免Windows系统代理截获本机请求；不改系统代理和真实凭证。12项Python隔离测试通过。

尚未在Luna通道重新真人验证全部群友模式、多日主动分享、图片识别、平台限额及长任务。旧版本验收不能替代这些边界。详见根目录work-luna-verification.json。此轮不推送GitHub。
