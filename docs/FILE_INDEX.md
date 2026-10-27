# 仓库目录索引

当前发布：V3.5.0 / 插件 0.22.6。该索引描述当前支持的源码与部署入口；历史验证记录不代替当前部署说明。

| 路径 | 用途 |
|---|---|
| `dsh-hymemory-plugin/` | DSH QQ 中间件、记忆、工具、群控制、生图与双传输适配 |
| `install-qqbot.ps1` | 安装锁定的 DSH、Tencent QQ 插件与项目业务插件 |
| `start-all.ps1` / `stop-all.ps1` | 启停本项目受管服务 |
| `start-qqbot.ps1` | 按本机 `data/transport/onebot.json` 选择官方或 OneBot 传输 |
| `start-napcat.ps1` / `stop-napcat.ps1` | 仅在 OneBot 模式启停本项目 NapCat 进程 |
| `install-hindsight.ps1` / `start-memory.ps1` | 安装及运行 Hindsight 记忆服务 |
| `versions.json` | 固定依赖、产品和传输协议版本 |
| `dependency-locks/` | DSH runtime 和 qqbot profile 的锁文件 |
| `packages/dsh-hymemory-qq-0.22.6.tgz` | 当前本地 QQ 业务插件归档 |
| `docs/QQ_TRANSPORTS.md` | 腾讯官方 QQ Bot 与个人 QQ/OneBot 两种部署方案 |
| `docs/FROM_ZERO.md` | Windows 从零部署步骤 |
| `docs/CONFIGURATION.md` | 本机配置和数据边界 |
| `examples/onebot.json.example` | 不含真实账号信息的 OneBot 配置模板 |

本机凭证、OneBot 映射、QQ 登录态、记忆、会话、附件、模型缓存、日志和 NapCat/QQ 二进制不属于公开仓库。

