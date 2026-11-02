# PR03：结构化群聊上下文本机部署

日期：2026-11-02。插件版本：0.22.24。

## 已部署

- 新增授权历史读取与上下文构造；普通群聊 `consider()` 在原有候选硬规则之后使用结构化输入。
- `conversation-policy.json` 的 `groupContext.mode` 已设为 `structured`；既有策略字段保持不变。
- 原发送候选、隐私与权限检查、来源关联及平台回执路径保持原样。
- 本机专用 qqbot profile 安装 0.22.24；76 个安装文件与部署源码逐项 SHA256 一致，profile frozen lock 检查通过。
- 通过受管 `start-all.ps1` 启动。记忆服务健康检查 `ok/sdk_ready/embedding_ready=true`；QQ/DSH 进程使用 `qqbot` profile，启动时间晚于 0.22.24 包安装。

## 验证范围

- 新增及相关合成路由/隐私测试：71 项通过。
- 仓库结构检查：`errors=[]`；`git diff --check` 通过。
- 未发送人工 QQ 验收消息；未运行手动模型或内容质量验证。部署不代表自然度验收。

回滚使用 `.run/deployment-backups/0.22.24-20261102/` 中的本机策略备份，并通过受管流程恢复旧插件包。详细哈希、进程与健康证据保存在受限 `.run` 目录。