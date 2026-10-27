# 上游依赖与许可说明

本仓库保存项目集成源码、版本配置和固定 QQ 插件补丁。第三方运行时、SDK、QQ / NapCat 程序和模型权重由部署者从各自上游获取，登录数据不随源码发布。

| 组件 | 固定版本或来源 | 用途 |
|---|---|---|
| DeepSeek Harness | `@deepseek-ai/dsh@0.2.1-rc.2` | Agent、Cordis 和会话 |
| Tencent DSH QQ 插件 | `@tencent-connect/dsh-qqbot@0.5.2` | QQ 接入层与官方 Bot 传输 |
| NapCat Shell | 当前部署 `4.18.41` | 可选的个人 QQ / OneBot 11 传输 |
| Hindsight | `1.1.0` | 当前长期记忆引擎 |
| pg0 / FlashRank | `0.15.2` / `0.2.10` | 本机数据库与重排依赖 |
| Hy Memory SDK | `2.0.4` | 兼容接口与保留的历史库支持 |
| FastEmbed / BAAI 中文向量模型 | `0.9.0` / `bge-small-zh-v1.5` | 本机向量计算 |
| Codex 桌面版 | 用户本机安装和登录 | 明确请求的内置图片生成 |

所有第三方组件和模型适用其各自的上游许可与服务条款。完整固定信息见 [`app/versions.json`](app/versions.json)、[Python 依赖锁](app/requirements-lock.txt)、[Hindsight 依赖锁](app/requirements-hindsight-lock.txt)和[包管理锁](app/dependency-locks/)。
