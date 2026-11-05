# 可运行工程

这里是完整的部署工作目录。PowerShell 启动脚本、Python 服务和本地插件保留原有相对路径，可从本目录安装和运行。

先读[基础安装](../docs/deployment/windows.md)，再选择[官方 QQBot](../docs/deployment/official-qqbot.md)或[NapCat / OneBot](../docs/deployment/onebot-napcat.md)。

| 位置 | 用途 |
|---|---|
| `install-qqbot.ps1` / `install-hindsight.ps1` | 安装公共服务、QQ 插件与记忆引擎 |
| `start-all.ps1` / `stop-all.ps1` | 启停本项目受管服务 |
| `robot-control.ps1` | Windows 控制台 |
| `dsh-hymemory-plugin/` | QQ 传输、群参与、身份边界、记忆和工具钩子 |
| `hymemory_service.py`、`memory_*.py`、`hindsight_*.py` | 本机记忆服务与数据生命周期 |
| `dependency-locks/`、`patches/`、`packages/` | 固定依赖、QQ 插件补丁、当前业务插件包 |
| `examples/`、`.env.example` | 不含真实账号数据的配置模板 |
| `tools/`、`launcher-icons/` | 维护工具与启动图标 |
| `versions.json` | 当前组件版本与协议版本 |

```powershell
Set-Location <仓库路径>\app
.\start-all.ps1
.\stop-all.ps1
```

`.env`、`qq.credentials.json`、`data/`、`.privacy/`、`runtime/` 和本机登录态都由部署环境保管。详细说明见[配置与数据目录](../docs/deployment/configuration.md)。

当前公开源码、候选包和本机活动 profile 目标版本为 **0.22.46**。普通聊天快速响应，明确要求仔细复查时本轮升至 high 并重读相关来源；默认不预查长期记忆，模型缺少历史资料时再按需查询。普通回复保持单段。详见[维护交接](../docs/development/handoff.md)。

2026-11-04：0.22.42 新增会话附件和公开链接的 PDF 正文分页读取。扫描图片页不自动 OCR，真实 QQ 内容验收状态见维护交接。

2026-11-05：0.22.43 在生成消息的发送前统一为单段，删除已观察到的未请求诊断、自我复盘与无关追问；保留明确要求的格式和代码。部署及真实 QQ 验收见维护交接。

2026-11-05：0.22.44 默认不做入站长期记忆和模糊历史预查；当前上下文缺少过往信息、模型准备回答不知道或不记得时，再按需查询。明确查询命令保留，后台保存及隐私规则继续生效。

2026-11-05：0.22.45 为 OneBot 握手及机器人初始化期间的消息增加有界暂存，账号核验及 ready 完成后才交付；不修改模型或思考档位。

2026-11-05：0.22.46 增加按轮次思考选择、同一文件消息/上传通知配对去重，并修复历史搜索声明误拦。
