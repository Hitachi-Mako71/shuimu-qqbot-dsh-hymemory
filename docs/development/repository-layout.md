# 目录说明

| 位置 | 职责 |
|---|---|
| app/ | 可部署应用，安装/启停命令工作目录 |
| app/dsh-hymemory-plugin/ | 固定源码与可插拔对话引擎 |
| app/dependency-locks/、app/patches/ | 固定依赖和原始补丁 |
| app/packages/ | 当前源码对应的候选包0.22.23 |
| scripts/ | 仓库结构与发布边界检查 |
| docs/deployment/、docs/usage/ | 安装教程与日常操作指南 |
| docs/development/、docs/decisions/ | 开发说明、架构与决策 |
| docs/reference/ | 分版本协议参考 |
| research/notes/、research/tools/ | 研究笔记与需显式运行的实验工具 |
| archive/ | 历史包、停用模块与历史报告 |

本机源码与部署目录并列，见[工程维护](engineering.md)。运行配置、聊天、记忆、模型和临时实验均留在忽略目录；不应为了外观移动应用内部的运行路径。
