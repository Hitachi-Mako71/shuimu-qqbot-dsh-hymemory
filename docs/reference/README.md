# 技术参考

这里保留分版本设计契约，用于理解实现与维护边界。正文中的旧版本号、当时的验收计数和命令示例属于对应阶段；当前部署入口见[部署导航](../deployment/README.md)，命令默认从 `app/` 执行。

| 主题 | 说明 |
|---|---|
| 身份与工作目录 | [身份边界](V1_1_IDENTITY_BOUNDARIES.md) |
| 原文与删除 | [证据原文](V1_2_EVIDENCE_JOURNAL.md) · [删除生命周期](V1_3_PRIVACY_LIFECYCLE.md) |
| 记忆和历史查询 | [近期接续](V2_0_RECENT_CONTEXT.md) · [历史回源](V2_1_HISTORY_EVIDENCE.md) · [Hindsight](V2_3_HINDSIGHT_MEMORY.md) |
| 时钟和课表 | [时区](V3_0_CLOCK.md) · [私聊课表](V3_2_TIMETABLE.md) |
| 主动与群聊 | [主动私聊](V3_2_1_PROACTIVE.md) · [活跃群](V3_2_2_GROUP_ACTIVE.md) · [自定义群节奏](V3_2_3_GROUP_ACTIVITY.md) |
| 平台与策略 | [OneBot](V3_3_ONEBOT.md) · [聊天策略](V3_4_CONVERSATION_POLICY.md) · [连发与回复对象](V3_5_TURN_STRATEGY.md) |

其他修复和细节记录保留在本目录；历史测量与故障记录见 [archive/reports/](../../archive/reports/README.md)。
