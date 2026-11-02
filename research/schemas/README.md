# 参与决策标注协议 v1

状态：草案，仅用于后续离线研究；不是生产消息格式，也不代表已获语料许可。

JSON Schema：[participation-v1.json](participation-v1.json)。每条记录描述一个候选话轮：给定近期对话上下文，标注此刻应主动发言（SPEAK）、等待更多上下文（WAIT）或保持沉默（SILENT）。当前只定义协议，不收集或生成聊天样本。

## 字段约定

- `schemaVersion` 固定为 `participation-v1`。破坏性变更新建主版本，保留旧 schema 与原标注，不覆盖迁移。
- `sampleId`、`sourceId`、`groupKey`、`messageId`、`speakerId`、`annotatorId` 均为不含账号信息的不透明 ID。群切分键应由隔离环境生成的带密钥伪名化值；映射与密钥不进入研究数据或仓库。
- `split.partition` 声明 train/development/test/shadow；`groupKey` 与粗粒度 `timeBlock` 用于按群及时间隔离，防止相邻消息泄漏。切分需在样本冻结前确定。
- `authorization.status` 必须为 authorized，`basis` 记录授权依据类别，`deidentified` 与每条消息的 `textReviewed` 必须为 true。JSON Schema 无法证明授权真实性或完成隐私脱敏；两项均须有采集前流程与人工复核，缺证时不入库。
- `source` 记录来源、许可和来源类别。公开语料仍须遵守其许可；私人语料只能在明确授权后使用。`synthetic` 仅作流程调试，不能作为真人自然度验收数据。
- `attachmentsPresent` 只记是否存在附件，不记录图像、文件、URL、平台索引或本地路径。拒绝 QQ 号、群号、昵称、凭证、原始事件、日志和记忆记录；不能因 schema 接受文本就跳过人工去标识。
- 标签与 reason code 使用固定枚举。WAIT/SILENT 的细分边界由标注指南解释；不确定时标为 UNCERTAIN，不强行伪造高置信标签。

## 安全边界与后续验收

采集器若未来获准开发，必须位于群/来源授权、身份核验、脱敏和隐私检查之后；保留 source→derived 样本映射，删除来源时能定位删除派生记录。不得挂在保留 raw event 的 OneBot 入口直接落盘。

P02 当前交付仅为 schema 与规范。真实语料采集、模型调用、训练和线上 shadow 不属于此交付。后续标注指南和验证器应先用人工构造的合成 fixture 检查 schema 正反例，再考虑任何真实数据。
