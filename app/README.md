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
