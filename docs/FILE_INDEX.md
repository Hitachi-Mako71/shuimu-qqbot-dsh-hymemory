# 文件索引

下表覆盖本快照的完整项目文件。根目录脚本均以项目目录为基准，可直接部署。

| 文件 | 用途 |
|---|---|
| `.env.example` | 完整本机变量模板，无真实凭证 |
| `.gitattributes` | 跨平台行尾及补丁哈希稳定设置 |
| `.gitignore` | 凭证、数据、会话、运行时与导出排除规则 |
| `acceptance-checklist.md` | 项目文件 |
| `acceptance-command-results.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `acceptance-local-results.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `acceptance-local.py` | 真实SDK验收；明确请求时运行，会调用模型 |
| `acceptance-outage-results.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `acceptance-restart-results.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `acceptance-session-storage-results.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `AGENTS.md` | 下一次Codex的执行和调试规则 |
| `CHANGELOG.md` | 功能变更时间线 |
| `codex-relay-verification.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `companion-verification.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `configure-codex-relay.ps1` | 指定Codex聊天并生成限时配对码 |
| `configure-companion.ps1` | 项目文件 |
| `configure-profile.py` | QQ profile模板生成、补丁与人格应用 |
| `configure-qq-local.ps1` | 本机遮蔽凭证输入、腾讯验证与受限保存 |
| `create-desktop-shortcuts.ps1` | 生成当前用户桌面的启动/关闭快捷方式 |
| `dependency-locks/qqbot-profile/package.json` | 原机固定版本锁/依赖配置快照 |
| `dependency-locks/qqbot-profile/pnpm-lock.yaml` | 原机固定版本锁/依赖配置快照 |
| `dependency-locks/qqbot-profile/pnpm-workspace.yaml` | 原机固定版本锁/依赖配置快照 |
| `dependency-locks/runtime/package-lock.json` | 原机固定版本锁/依赖配置快照 |
| `dependency-locks/runtime/package.json` | 原机固定版本锁/依赖配置快照 |
| `desktop-control.ps1` | 带互斥与中文反馈的桌面启停控制器 |
| `desktop-shortcuts.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `docs/ARCHITECTURE.md` | 专项部署、配置、交接或排错说明 |
| `docs/ARCHIVE_VERIFICATION.json` | 专项部署、配置、交接或排错说明 |
| `docs/BACKUP_AND_RECOVERY.md` | 专项部署、配置、交接或排错说明 |
| `docs/COMPANION.md` | 专项部署、配置、交接或排错说明 |
| `docs/CONFIGURATION.md` | 专项部署、配置、交接或排错说明 |
| `docs/DEBUG_HISTORY.md` | 专项部署、配置、交接或排错说明 |
| `docs/FROM_ZERO.md` | 专项部署、配置、交接或排错说明 |
| `docs/HANDOFF.md` | 专项部署、配置、交接或排错说明 |
| `dsh-hymemory-plugin/bridge.js` | 身份与自动记忆钩子、显式命令入口 |
| `dsh-hymemory-plugin/codex-relay.js` | 双向同步、配对、游标与待发队列 |
| `dsh-hymemory-plugin/companion-state.js` | 插件源码 |
| `dsh-hymemory-plugin/companion.js` | 插件源码 |
| `dsh-hymemory-plugin/cordis.patch.yml` | Cordis服务注册补丁 |
| `dsh-hymemory-plugin/index.js` | Cordis插件与prompt扩展点 |
| `dsh-hymemory-plugin/model-proxy.js` | 原生DSH模型代理 |
| `dsh-hymemory-plugin/package.json` | 插件版本与导出声明 |
| `dsh-qqbot.patch.yml` | 独立qqbot profile配置模板 |
| `export-memory.ps1` | 暂停/恢复服务，导出并限制文件权限 |
| `export_memories.py` | 离线分页导出ACTIVE事实与画像 |
| `hymemory_service.py` | Hy Memory SDK、本地HTTP服务、模型预热及向量接口 |
| `import-local-config.ps1` | 读取本机配置并设置启动环境 |
| `install-qqbot.ps1` | 固定版本依赖安装、专用profile配置与模型预热 |
| `launcher-icons/start.ico` | 已生成的桌面图标 |
| `launcher-icons/stop.ico` | 已生成的桌面图标 |
| `memory-export-verification.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `memory_outbox.py` | SQLite持久写入队列、幂等、重试与删除屏障 |
| `packages/dsh-hymemory-qq-0.2.0.tgz` | 配套插件归档包；当前版本安装会从源码重新打包 |
| `packages/dsh-hymemory-qq-0.3.1.tgz` | 配套插件归档包；当前版本安装会从源码重新打包 |
| `patch-qq-plugin.py` | 对固定官方插件生成明确生命周期/视觉/同步钩子 |
| `patches/@tencent-connect__dsh-qqbot@0.5.2.patch` | 官方QQ0.5.2的合并unified diff |
| `personality-application.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `personality.md` | 水木的完整可编辑人格 |
| `personality_config.py` | 仅应用人格，保持YAML1.2与off字符串 |
| `qq-image-verification.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `README.md` | 日常运行说明与文档导航 |
| `repository-manifest.json` | 本提交文件的Git规范化内容SHA256/SHA1清单（不含本文件自身） |
| `requirements-lock.txt` | 原机完整Python依赖冻结 |
| `requirements.txt` | 直接Python依赖版本 |
| `start-all.ps1` | 隐藏启动受管服务、记录PID、等待预热 |
| `start-memory.ps1` | 前台启动Python记忆服务 |
| `start-qqbot.ps1` | 代理和凭证环境、QQ/DSH启动 |
| `stop-all.ps1` | 核对启动脚本和PID后停止服务进程树 |
| `stop-memory.ps1` | 只停止本项目记忆服务 |
| `tests/identity.test.mjs` | 既有回归/合约测试源码；未在本次归档重跑 |
| `tests/qq-memory.test.mjs` | 既有回归/合约测试源码；未在本次归档重跑 |
| `tests/test_bridge.py` | 既有回归/合约测试源码；未在本次归档重跑 |
| `tests/test_outbox.py` | 既有回归/合约测试源码；未在本次归档重跑 |
| `THIRD_PARTY.md` | 上游依赖和许可边界 |
| `tools/create-launcher-icons.py` | 维护辅助工具；先看下方说明 |
| `tools/diagnose-qq-start.mjs` | 维护辅助工具；先看下方说明 |
| `tools/inspect-account-models.py` | 维护辅助工具；先看下方说明 |
| `tools/inspect-image-tool-events.mjs` | 维护辅助工具；先看下方说明 |
| `tools/materialize-dependency-locks.py` | 维护辅助工具；先看下方说明 |
| `verification-results.json` | 原机历史配置/验收元数据，不含记忆正文和凭证 |
| `verify-session-storage.mjs` | 通过真实DSH后端只读验收会话存储 |
| `versions.json` | 实际版本及QQ补丁哈希 |

## tools的使用范围

- `materialize-dependency-locks.py`：转换归档锁文件到当前项目路径，见FROM_ZERO。不会安装或启动服务，覆盖需显式force并留备份。
- `inspect-account-models.py`：从指定DSH_HOME读取官方账号记录，只向官方模型目录请求能力，只输出模型ID/输入模态。结果写本机data/diagnostics。需项目venv的PyYAML及已登录账号；不打印token。
- `inspect-image-tool-events.mjs`：只读实际DSH持久会话，输出视觉工具调用/成功状态元信息；使用实际toolCallId，不打印图片描述或工具错误正文。可传项目目录参数。
- `diagnose-qq-start.mjs`：原机网络诊断，默认使用D盘路径，从本机凭证请求腾讯鉴权/网关，只输出布尔或错误类型；换目录需修改路径。直接运行Node时需要自己提供实际环境代理。不是启动器。
- `create-launcher-icons.py`：可选重新生成已随仓库提供的图标，额外需要Pillow。普通安装不用运行。

源码、模板和锁文件可在Git中管理；运行工具生成的data、logs、exports不提交。历史验收不代表新机器已通过。
