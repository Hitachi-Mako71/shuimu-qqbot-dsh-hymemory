# 配置与数据目录

本页的路径均相对于 `app/`。两种接入方式见[部署导航](README.md)。

| 位置 | 内容 | 是否公开 |
|---|---|---|
| [`versions.json`](../../app/versions.json) | 固定组件和协议版本 | 是 |
| [`.env.example`](../../app/.env.example) | 环境变量模板 | 是 |
| [`examples/`](../../app/examples/) | OneBot 示例 | 是 |
| `.env` | 本机服务令牌与环境设置 | 否 |
| `qq.credentials.json` | 本机应用凭证 | 否 |
| `data/transport/onebot.json` | 个人 QQ、群映射和 OneBot 令牌 | 否 |
| `data/companion/` | 主动消息、群参与设置及控制者 | 否 |
| `data/evidence/` | 真实聊天原文与证据 | 否 |
| `data/workspaces/` | 按 QQ 身份隔离的工作文件和附件 | 否 |
| `data/codex-images/`、`data/character/` | 生图任务、绑定、角色参考 | 否 |
| `.privacy/` | 独立删除账本 | 否 |
| `runtime/`、`hindsight/` | 本机依赖、NapCat 和记忆引擎环境 | 否 |
| `logs/`、`exports/` | 运行日志和私人导出 | 否 |

`DSH_HOME` 默认 `D:\DeepSeekHarnessData\home`，由启动进程环境设置，不写入 `.env`。更换 Home 后，终端、快捷方式和控制台都应使用相同环境。

记忆服务监听 `127.0.0.1:8765`，模型代理监听 `127.0.0.1:8766`。修改端口需同步客户端与本机健康检查。除健康检查外，本机服务要求随机 bearer token。

`data/transport/onebot.json` 缺失或 `mode: official` 时使用官方 QQBot；`mode: onebot` 时使用 NapCat。OneBot 的 `legacyAppId`、用户与群逻辑 ID 决定旧记忆分区的对应关系，迁移时应逐项核对。

主聊天模型读取本机 `data/model-routing.json`；记忆提炼模型独立读取环境配置。Hindsight 和 embedding 的按需加载见[资源使用](../usage/performance.md)。

群控制者只管理被授权的群，不能因此访问成员私聊记忆。群/私聊分区、原文证据和删除规则见[技术参考](../reference/README.md)。
