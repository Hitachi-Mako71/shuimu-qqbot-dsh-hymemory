# 目录说明

| 目录 | 职责 |
|---|---|
| `app/` | 完整可运行工程；安装和管理命令的工作目录 |
| `app/dsh-hymemory-plugin/` | 当前 QQ 业务插件与 OneBot 适配 |
| `app/dependency-locks/` | runtime 和 qqbot profile 依赖锁 |
| `app/patches/` | 官方 QQ 插件的固定版本补丁 |
| `app/packages/` | 当前 0.22.6 插件归档 |
| `app/examples/` | 安全配置模板 |
| `docs/deployment/` | 基础安装、两种 QQ 接入、配置、升级、备份 |
| `docs/usage/` | 日常使用与管理 |
| `docs/development/` | 架构、维护和发布 |
| `docs/reference/` | 分版本技术契约 |
| `archive/legacy-v0.8/` | 已停用的模型/网页桥接、旧测试和旧插件包 |
| `archive/reports/` | 历史验收、测量与旧发布清单 |

`app/` 内部保持已部署工程的相对路径，避免仅为仓库展示而修改 Python 导入、PowerShell 启动链和固定包结构。历史模块不参与当前安装器。

真实运行目录如 `app/data/`、`app/.privacy/`、`app/runtime/`、`app/logs/` 均受忽略规则保护，不属于源码目录。
