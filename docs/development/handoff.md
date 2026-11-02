# 当前维护交接

当前应用为 V3.5.0；源码与本机活动 profile 均为插件 0.22.28。PR04 引用校验、PR05 决策 API 及 PR06 三档路由已部署（参与模式默认 off），安装目录 78 个文件与源码逐项 SHA256 一致，OneBot 当前 ready，记忆服务 `ok/sdk_ready/embedding_ready=true`。PR05 A0 mock 固定安静；PR06 的 shadow/mock 需本机显式启用，当前为 off；用户在两个已启用群触发真实消息；普通档群 ambient 回复及活跃群 direct 回复均有 OneBot accepted 回执。参与模式为 off，未覆盖 shadow/mock；未评估回复内容质量。部署记录保存在本机运行目录 `.run/deployment-evidence-0.22.28-20261102.json`（不纳入 Git），PR06 实现见[参与决策路由](handoffs/PR06-participation-routing-20261102.md)，PR05 实现见[本地参与决策 API](handoffs/PR05-participation-api-20261102.md)，此前 PR04 记录见[PR04 引用校验](handoffs/PR04-quote-coverage-20261102.md)。

QQ 收发保留腾讯官方 Bot 与个人 QQ + NapCat/OneBot 11 两条路径；选择方式见[部署导航](../deployment/README.md)。两者共用身份与记忆契约，不自动合并不同账号或群的记忆。

Hindsight 和 embedding 随服务启动预热，空闲不再自动释放。群可配置多个精确授权的控制者，权限仅限当前群。Codex 仅处理独立生图任务，文字对话继续使用 DeepSeek。

旧 ChatGPT/网页桥接、旧测试、历史安装包和验收记录位于 `archive/`，不由当前安装器加载。恢复旧资料前先核对版本和数据生命周期。

独立对话引擎、测试与候选状态见[说明](dialogue-engine.md)。源码与包验证不代表真人自然度通过。
