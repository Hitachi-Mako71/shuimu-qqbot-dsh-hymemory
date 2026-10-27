# 发布与部署维护

以下路径相对于 `app/`。

1. 对照 `versions.json`、当前源码和实际部署确认变更范围。
2. 修改 `dsh-hymemory-plugin/` 源码时递增版本，重新生成 `packages/dsh-hymemory-qq-<version>.tgz`；仅调整仓库目录和文档不需要重建运行插件。
3. 将实际 profile 清单和锁转换为仓库相对路径，更新 `dependency-locks/qqbot-profile/`。模板路径仍以应用目录为基准。
4. 部署前备份公开代码和 profile 包管理文件；凭证、群绑定、原文与 `.privacy/` 账本独立保管。
5. 安装后比较业务源码与 `node_modules/dsh-hymemory-qq` 的哈希，再通过受管入口恢复服务。
6. 发布前检查实际提交树和压缩包内容，确认没有真实账号映射、凭证、聊天、记忆、附件或日志。

分别记录源码变更、插件安装、服务健康和真实 QQ 收发。历史测试/验收记录只保留在对应快照，不作为新发布的验证结果。调试时记录已执行的修复和相关验证，遵循根目录 [AGENTS.md](../../AGENTS.md)。
