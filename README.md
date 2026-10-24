# 柚柚 QQ Bot · DeepSeek Harness · Hy Memory

当前维护版本：配套插件 **0.8.0**，控制台 **2.7.0**，模型插件 **0.4.3**。

按用户要求，读书功能和虚构日常/剧情/虚构记忆生成已移除。后台不再读取书籍、生成日记、推进虚构事件或向虚构记忆库写入。原有私人书籍和历史数据保留在本机，不进入GitHub，也不注入新聊天。

## 保留的功能

- QQ私聊、群聊及可开关的群友模式。
- DeepSeek和原生Codex路由，共用当前QQ身份的Hy Memory；Codex聊天可在本机Codex查看。
- Chat网页独立工作通道，只处理当前任务和附件，不携带聊天记忆。
- 真实聊天偏好/事实自动写入、按身份召回、更新、删除及JSON导出；群与私聊隔离。
- 图片识别、引用图片识别、手动调用Codex内置生图与固定角色形象。
- 可暂停的轻问候，保留免打扰、限频和等待回复规则；不生成虚构生活或记忆。
- 桌面统一控制台：启停、模型、群聊、人设、手动生图、日志、备份与导出。

## 使用

桌面打开“柚柚机器人控制台”。命令行入口：

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
.\start-all.ps1
.\stop-all.ps1
```

| QQ命令 | 作用 |
|---|---|
| 记住：内容 / 查记忆 关键词 / 记忆状态 | 管理当前身份的真实长期记忆 |
| 忘记：ID | 删除已查到的记忆 |
| 当前模型 / 模型状态 | 查看本机实际路由配置 |
| 群友模式状态 / 开启群友模式 / 关闭群友模式 | 查看、配对或关闭群聊参与 |
| 画图：描述 / 生图状态 | 手动生图及状态 |
| 暂停主动消息 / 恢复主动消息 / 主动消息状态 | 轻问候开关 |

读书、原文共读、公主日记、虚构生活设定和互动剧情入口已经下线；普通文学讨论不受限制，但不能声称执行了已移除的后台功能。

## 从零部署与维护

从新电脑开始请先读[从零部署](docs/FROM_ZERO.md)，再读[配置](docs/CONFIGURATION.md)、[架构](docs/ARCHITECTURE.md)和[交接](docs/HANDOFF.md)。需要原有记忆，必须另行恢复自己的[私人备份](docs/BACKUP_AND_RECOVERY.md)。

专项说明：[控制台](docs/CONTROL_CONSOLE.md) · [群友模式](docs/GROUP_PARTICIPATION.md) · [原生Codex](docs/NATIVE_CODEX.md) · [Chat工作通道](docs/CHATGPT_CHAT_WORK.md) · [手动生图](docs/CODEX_IMAGES.md) · [轻问候](docs/COMPANION.md)。

仓库包含源码、当前插件包、依赖锁、部署说明和脱敏历史验收。Git历史中的旧功能记录不代表当前功能。真实凭证、账户登录、书籍、私人记忆、聊天、角色参考图片、运行日志和模型缓存不上传。当前功能删减未新增或运行应用测试；运行与安装证据见feature-removal-verification.json。
