# PR06 群参与决策路由

- 插件版本：0.22.28
- 在群候选、频率、冷却、暂停及速率硬规则后，`groupRecall()` 前接入参与决策路由。
- `participation.mode` 由 conversation-policy 读取；合法值为 `off`、`shadow`、`mock`、`pilot`，缺省或非法值均为 `off`。
- `off` 不调用 A，继续现有流程；`shadow` 只记录 decision/reasonCode/modelVersion/时间，不影响现有流程。
- `mock/pilot` 只有 SPEAK 继续原有 recall/DeepSeek/交付链；SILENT 和 WAIT 在 PR07 前保守结束。
- 平台 @、点名和已识别追问仍走原 Agent；SPEAK 不绕过候选、隐私、授权、发送限额及回执检查。
- 测试：PR05+PR06 及相关群路由回归共 94/94 通过；仓库结构检查 398 文件、0 错误。
- 本机部署版本：0.22.28；源码与安装目录各 78 个文件 SHA256 一致，profile frozen-lock 安装通过。
- 启动后 OneBot ready，记忆服务 ok/sdk_ready/embedding_ready 均为 true；本机参与模式为 off。
- 未发送 QQ 验收消息、未进行真实模型内容验收、未训练或下载模型；回滚包备份保存在本机 `.run/deployment-backups/0.22.28-20261102`。
