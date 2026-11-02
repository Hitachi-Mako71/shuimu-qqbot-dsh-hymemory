# PR04：引用关系与历史覆盖率

日期：2026-11-02。此阶段只增强源码中的引用来源证明和缺口标记，未接入参与模型。

## 变更

- OneBot 引用默认标记为 unresolved；仅在平台 `get_msg` 返回同群消息并完成现有身份归一化后，绑定当前事件的 `refMsgIdx` 作为已核验引用证明。
- Context Builder 只接受与当前事件引用 ID 完全相同的证明；缺失或不匹配的引用不会把引用正文或作者送入结构化上下文。
- 历史覆盖率附带 `history-incomplete`，引用未核实时附带 `quote-unresolved`；不声称恢复离线缺失的消息。
- 增加合成场景核验覆盖同引用证明、不匹配证明和未验证的跨群引用；现有发送及权限链路不变。

## 验证

已执行隔离模拟核验命令 `node --test tests/context-builder.test.mjs tests/onebot.test.mjs`，25/25 通过；`node scripts/check-repository.mjs`，errors=[]；`git diff --check` 通过。插件包 `dsh-hymemory-qq-0.22.25.tgz` 已安装到活动 profile，offline frozen-lock 检查通过；源码与安装目录 76 个文件逐项 SHA256 一致。受管启动后 DSH 使用 qqbot profile，OneBot ready，记忆健康 `ok/sdk_ready/embedding_ready=true`。本轮未发送人工 QQ 验收消息或调用真实模型。部署证据保存在 runtime `.run/deployment-evidence-0.22.25-20261102.json`，回滚备份位于 `.run/deployment-backups/0.22.25-20261102/`。

## 调试记录

- 第一次合成验证发现测试文件残留补丁标记，Node 报 `SyntaxError`；移除标记、重建测试文件后，25/25 通过。
- 两次 profile lockfile 更新尝试都因 profile 的 `pnpm-workspace.yaml` 指向不存在的 `profile/patches/` 路径而失败。定位后将路径改为指向 `app/patches/` 的相对路径，再运行 `pnpm install --lockfile-only --offline --ignore-scripts` 成功。
- 普通沙箱无法枚举受管 Windows 进程或访问 loopback 健康端口，导致先前的状态检查误报服务已停止。提升权限后确认 DSH、OneBot 与 memory 健康；受控前台诊断多启动的临时 memory 会话已用 Ctrl+C 结束，受管实例保持健康。此次部署使用受管 `stop-all.ps1` / `start-all.ps1`，无需改动启动架构。
- 部署证据收尾时发现 runtime `versions.json` 写入了转义换行文本；从部署前备份恢复版本清单，重新设置 0.22.25 字段后 JSON 解析通过，原 QQ patch 哈希保持不变。
