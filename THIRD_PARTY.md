# 上游依赖与许可说明

本仓库保存本项目集成代码、版本配置和固定 QQ 插件补丁。第三方运行时和 SDK 在安装时通过各自包源获取；不上传 `node_modules`、Python 虚拟环境、模型权重或登录数据。

| 组件 | 版本/来源 | 用途 |
|---|---|---|
| DeepSeek Harness | `@deepseek-ai/dsh@0.2.1-rc.2` | Agent、Cordis 服务和会话持久化 |
| 腾讯官方 QQ 插件 | `@tencent-connect/dsh-qqbot@0.5.2` | QQ Bot 接入 |
| 腾讯 Hy Memory | `Tencent-Hunyuan/Hy-Memory@2.0.4` | 长期记忆 |
| FastEmbed | `0.9.0` | 本机 CPU 向量计算 |
| BAAI/bge-small-zh-v1.5 | 首次部署下载权重 | 中文 512 维向量模型 |
| Chroma / Kuzu | `1.5.9` / `0.11.3` | 本机存储依赖 |
| Codex 桌面版 | 用户本机安装和登录 | 用户明确请求时调用内置图片生成 |

所有第三方组件和模型均遵守其上游许可与服务条款。完整间接依赖版本见 `requirements-lock.txt` 和 `dependency-locks`。
