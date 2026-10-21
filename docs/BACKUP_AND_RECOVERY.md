# 备份、迁移和恢复

## GitHub 已保存的内容

应用源码、Python/Node依赖版本和锁快照、QQ补丁、配置模板、人设、桌面按钮及图标、导出工具、Codex同步、历史验收和排错资料。可以据此安装一套新的运行环境，重新登录并绑定机器人。

## 原机私有内容及位置

| 内容 | 原机位置 | 新电脑如何处理 |
|---|---|---|
| QQ Secret | 项目 `qq.credentials.json` | 本机窗口重新输入/验证 |
| 本机接口随机token | 项目 `.env` | 新安装自动生成，所有本机接口使用一致值 |
| DSH账号登录 | Harness Home中的官方凭证文件 | 使用DSH官方界面重新登录 |
| 旧记忆与原始SDK资料 | 项目 `data/hy-memory` | 使用自己的私有备份恢复 |
| 持久提炼队列 | `data/outbox.sqlite3`及相关数据库文件 | 停机备份完整数据目录后恢复 |
| 旧DSH会话 | `data/sessions` | 使用私有备份恢复 |
| 用户最近会话映射 | `%USERPROFILE%\.dsh-qqbot\model-prefs.json` | 停机后私有备份；平台身份仍需匹配 |
| Codex同步私聊/线程绑定 | `data/codex-relay` | 新机新线程重新配对，避免误绑定 |
| 已导出的个人记忆 | 项目 `exports` | 作为私有文件保管 |
| 媒体、模型缓存 | `.dsh-qqbot/media`、`data/models` | 可重新下载，按需要私有备份 |

这些内容没有放入GitHub仓库。仓库也不保存原始聊天截图、Codex会话日志和GitHub登录令牌。

## 原机备份流程

1. 使用桌面红色按钮或 `stop-all.ps1` 停止本项目受管进程。
2. 将整个 `data`、本机 `.env`、QQ凭证、专用 `qqbot` profile 和 `.dsh-qqbot/model-prefs.json` 复制到自己控制的备份位置。数据库停止后再复制，避免只取主文件遗漏WAL。
3. 保留一份本次Git提交ID、`versions.json`、依赖锁和项目路径说明。
4. 凭证和记忆备份按私人资料保存；若需要云备份，使用自己管理的加密方式。
5. 按原流程重新启动，确认Bot ready。

不要复制正在打开的Chroma/SQLite数据库作为唯一备份。恢复到已存在数据的目标时，先完整备份目标，核实路径，不能直接递归覆盖或删除。

## 新电脑恢复旧数据

1. 先按FROM_ZERO部署同一快照，保持程序停止。
2. 将旧 `data` 恢复到目标，保留SDK和向量模型512维、集合名 `qq_chat_512` 的对应关系。
3. 新机重新配置模型登录及QQ凭证，使用同一个Bot和对应QQ OpenID。更换Bot会改变命名空间，旧数据不会自动转移到新Bot身份。
4. 恢复必要的QQ会话映射。账号、群、Bot变化时先检查目标关系，不能把私人数据映射成群共享。
5. Codex同步重新生成配对，不沿用旧机器的rollout路径、线程ID或运行PID。
6. 不恢复旧 `.run/services.json` 和任何旧进程PID；交给启动器重新生成。
7. 启动后分别验收长期记忆、当前会话、群私聊隔离和删除。模型或SDK版本变化会影响提炼结果，不能只根据文件存在认定成功。

## 可读JSON导出

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
.\export-memory.ps1
```

默认全量分页导出当前ACTIVE事实/画像，保留身份命名空间分组、ID、来源及元数据，排除专用验收数据。结果在 `exports/shuimu-memory-时间.json`，ACL限制为当前用户和SYSTEM。支持 `-Namespace`、`-IncludeTestData`，具体参数见脚本。

脚本会暂停原本运行的受管服务，并在finally恢复。JSON不包含原始对话层、向量、人设或凭证；目前没有配套导入器，数据库恢复需要完整私有备份。未完成提炼任务数包含在导出元信息中。

## 回滚代码

停止受管服务，保存数据，切回明确的Git提交，再按该提交依赖安装和补丁版本恢复。不要用旧SDK强行打开已被新SDK迁移的数据。当前归档保留配套插件0.4.3的tgz、早期版本包和可重建源码；历史0.1.0包没有作为当前部署入口。


## 0.4.3 虚构长期记忆

停机后完整备份 data/companion，包含 worlds、journals、people、fiction-index.sqlite3 和独立 hy-memory 数据库。运行中不可只复制SQLite主文件而漏掉WAL。原真实记忆JSON导出不含虚构库；设定和日记JSON可直接查阅，完整恢复仍需配套索引与数据库。详见MEMORY_MANAGEMENT。
