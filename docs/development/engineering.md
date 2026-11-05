# 工程维护与本机目录

可维护源码与GitHub保持同一结构，本机推荐：

| 目录 | 用途 |
|---|---|
| D:/DeepSeekHarnessData/qqbot-hymemory-source | 干净源码Git工作副本，日常修改与提交入口 |
| D:/DeepSeekHarnessData/qqbot-hymemory | 现有部署目录，保存运行依赖、配置和数据 |
| D:/DeepSeekHarnessData/home | DSH专用profile与登录环境 |

目录整理不直接部署；现有快捷方式和启动入口继续指向部署目录。源码app/内部路径是安装契约，不能单独移动Python模块、PowerShell启动链或包结构。

## 日常流程

1. 从源码工作副本修改；新增研究工具放research/tools/，维护工具放scripts/或app/tools/。
2. 从仓库根目录运行 node scripts/check-repository.mjs。
3. 检查Git差异，提交并同步；在单独的发布任务中更新部署。
4. 用版本号、包哈希、安装核对和实际回执分别记录状态。

只改目录和文档不会重建插件或重启进程。当前源码/候选包目标为0.22.46；发布时核对本机活动profile版本及安装哈希。研究模块的额外规划、检索与复核仍默认关闭，不从历史验收推断当前自然度。

## 使用的工程思想与skill

- [Twelve-Factor配置分离](https://12factor.net/config)及[构建、发布、运行分离](https://12factor.net/build-release-run)：源码可公开，配置和数据留在运行环境。这里是Windows本机工程，不强制套用云平台部署。
- [Diátaxis](https://diataxis.fr/)：第一次安装是教程，群管理是操作指南，协议是技术参考，架构与决策是解释。
- [ADR](https://adr.github.io/)：保留单个关键决定的原因、代价和后果，见[本次决策](../decisions/0001-source-deployment-and-research.md)。
- [Superpowers writing-plans](https://github.com/obra/superpowers/tree/main/skills/writing-plans)：参考任务拆解方式。
- [systematic-debugging](https://github.com/obra/superpowers/tree/main/skills/systematic-debugging)：故障先复现和定位；沿用AGENTS中的两次失败兜底规则。
- [verification-before-completion](https://github.com/obra/superpowers/tree/main/skills/verification-before-completion)：完成前读取实际验证结果。此次使用该流程，不为目录整理安装或自动运行额外代理框架。
