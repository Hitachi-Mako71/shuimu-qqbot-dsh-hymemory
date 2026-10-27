# 当前维护交接

当前应用为 V3.5.0 / 业务插件 0.22.6。运行源码、安装脚本、依赖锁和当前插件包统一位于 `app/`，固定组件见 [`versions.json`](../../app/versions.json)。

QQ 收发保留腾讯官方 Bot 与个人 QQ + NapCat/OneBot 11 两条路径；选择方式见[部署导航](../deployment/README.md)。两者共用身份与记忆契约，不自动合并不同账号或群的记忆。

Hindsight 和 embedding 按需启动，相关工作空闲 5 分钟后释放。群可配置多个精确授权的控制者，权限仅限当前群。Codex 仅处理独立生图任务，文字对话继续使用 DeepSeek。

旧 ChatGPT/网页桥接、旧测试、历史安装包和验收记录位于 `archive/`，不由当前安装器加载。恢复旧资料前先核对版本和数据生命周期。
