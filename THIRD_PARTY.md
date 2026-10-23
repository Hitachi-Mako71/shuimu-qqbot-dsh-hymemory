# 上游依赖与许可说明

本仓库保存本项目编写的集成代码、版本配置及针对固定QQ插件的补丁；第三方运行时和SDK在安装时通过各自包源获取。不上传安装目录中的node_modules、Python虚拟环境、模型权重或DSH账号登录数据。模型插件tgz按其bundledDependencies声明捆绑JOSE 6.1.3（含MIT LICENSE.md和类型声明），用于可重建安装。

| 组件 | 固定版本/来源 | 用途 |
|---|---|---|
| DeepSeek Harness | `@deepseek-ai/dsh@0.2.1-rc.2` | Agent、Cordis服务、账号模型、会话持久化 |
| 腾讯官方QQ插件 | [tencent-connect/dsh-qqbot](https://github.com/tencent-connect/dsh-qqbot)，npm0.5.2 | QQ官方Bot接入 |
| QQ Node SDK | `@tencent-connect/qqbot-nodejs@1.0.5`，见pnpm锁 | 腾讯网关/消息发送 |
| 腾讯Hy Memory | [Tencent-Hunyuan/Hy-Memory](https://github.com/Tencent-Hunyuan/Hy-Memory)，pip2.0.4 | chat长期记忆 |
| Codex / Chat工作模型插件 | 本项目 `dsh-chatgpt-plan@0.4.3`；早期账号授权记录见专项文档 | 原生Codex App Server、专用Chat工作通道及历史账号适配器 |
| JOSE | `jose@6.1.3`，MIT，随ChatGPT提供方本地包捆绑 | 校验账号授权令牌与JWKS签名 |
| FastEmbed | 0.9.0 | 本地CPU向量计算 |
| pypdf | 6.1.3 | 本地逐页提取PDF文本；模型只接收当前阅读片段 |
| BAAI/bge-small-zh-v1.5 | 首次部署下载权重 | 中文512维向量模型 |
| Chroma / Kuzu | 1.5.9 / 0.11.3 | SDK本地存储依赖，当前图谱关闭 |
| GitHub / Codex CLI | 用户本机登录 | 仓库管理 / 可选聊天同步 |

所有第三方组件与模型的使用、再分发和服务用量遵守其上游许可及服务条款。完整间接依赖和完整性信息在requirements-lock及dependency-locks中。升级前重新核对插件扩展点、接口、模型输入能力和补丁兼容性。

本仓库未为用户私有项目擅自选择开源许可证。公开发布或再分发时，由项目所有者决定许可并保留上游要求的声明。
