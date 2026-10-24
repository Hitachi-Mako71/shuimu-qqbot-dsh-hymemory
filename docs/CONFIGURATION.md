> 当前版本0.8.0已移除读书、虚构记忆生成和自动日常配图；下方涉及旧资料的说明仅用于历史数据保管。

# 配置和依赖说明

当前双路由实现和配置以 [原生Codex / DeepSeek](NATIVE_CODEX.md) 为准：控制台2.5.1，模型插件0.4.3，记忆插件0.6.6。旧账号API和网页记录为历史。

## 默认目录

| 目录/文件 | 谁生成、保存什么 |
|---|---|
| `D:\DeepSeekHarnessData\qqbot-hymemory` | 本项目代码与数据根目录 |
| `D:\DeepSeekHarnessData\home` | DSH Harness Home、模型账号登录、profiles |
| `%DSH_HOME%\profiles\qqbot` | 官方与本地插件依赖、补丁、独立配置 |
| `.venv`、`runtime/node_modules` | Python 和固定 DSH 的本机依赖 |
| `data/hy-memory` | SDK 数据、事实、画像、向量数据库 |
| `data/chatgpt-plan` | 本机ChatGPT OAuth凭证、模型目录与验证状态；禁止提交Git或公开分享 |
| `data/chatgpt-chat` | 普通Chat本机桥接令牌、一次性配对和探测状态；不包含在公开源码或配置备份 |
| `data/model-routing.json` | 本机对话/记忆模型路由和DeepSeek回退值 |
| `data/models` | 512维 CPU 向量模型缓存 |
| `data/outbox.sqlite3` | 后台写入队列 |
| `data/sessions` | 持久 DSH 会话 |
| `data/memory-audit.jsonl` | 检索来源、分数和删除审计，不记记忆正文 |
| `data/codex-relay` | 私聊配对、聊天绑定、游标、待发送正文 |
| `data/companion` | 主人配对、群绑定、轻问候与互动限流状态；旧日记数据不再加载 |
| `exports` | 用户手动导出的私有 JSON |
| `.run/services.json` | 受管启动器 PID 与脚本路径 |
| `logs` | 当前进程日志，启动时会重建输出 |
| `%USERPROFILE%\.dsh-qqbot` | 官方 QQ 模型/会话映射及媒体缓存 |

## 本机配置文件

`install-qqbot.ps1` 首次从 `.env.example` 生成 `.env`，用随机本机 token 替换 `__LOCAL_TOKEN__`，设置 ACL。已有 `.env` 不覆盖。不要把模板占位符当成可用凭证。

`configure-qq-local.ps1` 将当前 Bot 的 AppID/Secret 保存为 `qq.credentials.json`，启动器导入子进程。原机 AppID不固化在仓库窗口内；已有本机配置时只预填 AppID。

DeepSeek模型登录由DSH官方账号功能写入Harness Home；ChatGPT账号令牌由专用提供方写入 `data/chatgpt-plan`。**DSH_HOME仅设置在进程环境，不写进 .env**。`import-local-config.ps1` 默认回落到原机D盘路径。换Home后，桌面入口新建的PowerShell也必须拿到正确环境：可给Windows当前用户持久设置DSH_HOME，重新登录或重启相应应用；或审核并修改启动器默认值。

## 环境变量

完整键名在 `.env.example`。修改后重启 QQ/记忆进程。

| 变量 | 含义 |
|---|---|
| `MEMORY_BRIDGE_TOKEN` | 8765/8766 本机访问的随机 bearer，不能提交 |
| `MEMORY_BRIDGE_URL` | Node 插件访问 Python 的 loopback URL |
| `MEMORY_BRIDGE_PORT` | Python监听端口，可覆盖默认8765；改动时同步客户端与健康检查 |
| `MEMORY_BRIDGE_DATA_DIR` | 项目数据根目录，默认 `./data` |
| `MEMORY_MODE` | 当前 `pro` 模式 |
| `MEMORY_DATA_DIR`、`MEMORY_PERSIST_DIR` | SDK 文件根目录和向量持久目录 |
| `MEMORY_COLLECTION_NAME` | 当前 `qq_chat_512`，维度变化时不能沿用旧集合 |
| `MEMORY_ENABLE_GRAPH` | 当前 false，未验收图谱功能 |
| `MEMORY_ENABLE_INTENTION` | 当前 false，未扩展意图检测 |
| `MEMORY_LOG_LLM_CONTENT`、`MEMORY_PIPELINE_TRACE_ENABLED` | 当前 false，避免持久记录模型正文 |
| `MEMORY_LLM_API_KEY` | 指向本机模型代理时使用相同本机随机 token；不是 DeepSeek API Key |
| `MEMORY_LLM_BASE_URL` | `http://127.0.0.1:8766/v1` |
| `MEMORY_LLM_MODEL` | SDK 请求的模型名，当前 deepseek-flash |
| `MEMORY_LLM_TIMEOUT`、`MEMORY_LLM_MAX_RETRIES` | SDK 模型超时和重试 |
| `MEMORY_LLM_MAX_TOKENS`、`MEMORY_AGENT_MAX_TOKENS` | 提炼模型输出预算 |
| `MEMORY_DSH_PROVIDER`、`MEMORY_DSH_MODEL` | 原生代理实际调用的 provider/model |
| `MEMORY_DSH_PORT` | 原生模型代理端口，默认8766 |
| `MEMORY_EMBEDDER_API_KEY` | 供 SDK 使用的本机 token |
| `MEMORY_EMBEDDER_BASE_URL` | 指向8765的 `/v1` 向量接口 |
| `MEMORY_EMBEDDER_MODEL`、`MEMORY_LOCAL_EMBEDDING_MODEL` | 默认 BAAI/bge-small-zh-v1.5 |
| `MEMORY_EMBEDDING_DIMS` | 512，需与实际模型/集合维度一致 |
| `MEMORY_EMBEDDER_TIMEOUT` | 本机向量接口超时 |
| `HF_HUB_DISABLE_XET`、`HF_HUB_DISABLE_SYMLINKS_WARNING` | Windows 首次模型下载配置 |
| `QQBOT_TOKEN_BASE_URL` | 启动脚本固定为 `https://bots.qq.com` |
| `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` | QQ 网络代理；localhost必须绕过代理 |
| `NODE_USE_ENV_PROXY` | Node24启动时按代理设置启用 |
| `QQBOT_CODEX_RELAY_DIR` | QQ启动器设置为本项目 `data/codex-relay` |
| `QQBOT_COMPANION_DIR` | QQ启动器设置为本项目 `data/companion`，ACL及配对由configure-companion建立 |
| `QQBOT_CHATGPT_DIR` | QQ启动器设置为本项目 `data/chatgpt-plan`，供原生模型适配器定位授权凭证 |
| `QQBOT_CHAT_UI_DIR` | QQ启动器设置为本项目 `data/chatgpt-chat`，供普通Chat适配器定位本机桥接令牌 |
| `QQBOT_MODEL_ROUTING_FILE` | QQ启动器设置为本项目 `data/model-routing.json`，由控制台保存 |

端口8765当前也出现在 Python 服务、启动预热、导出/诊断脚本；8766也出现在模型代理默认值和模板。变更端口应检查源码所有引用，再改客户端/健康检查，不能只修改上表一个键。

Windows的HTTPX可在没有HTTP_PROXY环境变量时发现系统代理。memory_network.py为Hy Memory真实聊天库生成配置；当LLM和Embedding地址都为loopback时，仅SDK客户端使用显式直连传输，避免本机请求被送入代理。远程端点保留SDK默认代理行为，不更改系统设置或凭证。`MEMORY_LLM_MODEL`在本机兼容代理中只是请求名，实际模型依据data/model-routing.json路由。

## 固定版本与锁

`versions.json` 记录原机实际版本和 QQ 补丁 SHA256；`requirements-lock.txt` 保存完整 pip freeze。`dependency-locks/runtime` 保存npm锁；`dependency-locks/qqbot-profile`保存PNPM锁与本地配套插件、ChatGPT模型提供方的依赖清单。原机默认路径出现在锁快照内，转换工具会替换到当前安装位置。

`packages`归档当前配套插件0.6.2与ChatGPT提供方0.2.2。提供方随包捆绑JOSE 6.1.3，避免从零部署时再单独下载此依赖。依赖锁快照包含专用profile的本地插件组合。普通Chat网页使用额外的本机端口8767，见 [Chat网页桥接](CHATGPT_CHAT.md)；它的令牌和一次性配对码保存在私有data目录。

## Profile 与人设

`dsh-qqbot.patch.yml` 使用 `__PROJECT_DIR__` 替换绝对安装路径；QQ 身份字段为 `__FROM_ENV__`。`configure-profile.py` 设置 pnpm patchedDependencies，写专用 profile，并从 `personality.md` 生成私聊/群聊提示词。

群聊 `requireMention:true`，回复不流式；空闲/处理超时当前各30分钟。人设为水木，公主般端庄优雅、温柔可爱、聪明善良大方。修改提示词后运行人格脚本并重启，不必重装数据库。

`patch-qq-plugin.py` 仅支持官方0.5.2；最终 unified diff 在 `patches`。改补丁时必须同时更新哈希、依赖锁和文档，避免静默升级或重复注册。
