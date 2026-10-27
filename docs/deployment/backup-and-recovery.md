# 备份与恢复

源码、凭证、真实数据需要分别保管。GitHub 仓库只用于恢复程序和固定依赖。

| 资料 | 本机位置（相对于 `app/`） | 恢复要求 |
|---|---|---|
| 服务令牌、QQ 应用凭证 | `.env`、`qq.credentials.json` | 仅通过私人备份或本机重新配置恢复 |
| OneBot 身份与群映射 | `data/transport/onebot.json` | 保持逻辑身份映射，令牌和监听地址适配当前电脑 |
| 真实原文、队列和群配置 | `data/` | 按同一份备份恢复，不按昵称合并空间 |
| 删除权威 | `.privacy/` | 独立保存，不能被旧备份覆盖或倒退 |
| Hindsight 数据 | 本机 Hindsight 数据与逻辑备份 | 按引擎备份流程恢复 |
| 登录与私人参考图 | DSH Home、QQ/NapCat 登录态、`data/character/` | 本机重新登录或使用自己的私人备份 |

控制台可管理配置备份和记忆导出。JSON 记忆导出不等同于完整运行数据备份，配置备份也不包含 QQ/DSH/Codex 登录凭证。

Hindsight 的备份、迁移和恢复说明见[记忆引擎契约](../reference/V2_3_HINDSIGHT_MEMORY.md)。原文恢复必须保留当前删除屏障，详见[隐私生命周期](../reference/V1_3_PRIVACY_LIFECYCLE.md)。

更换目录或重新获取源码时，先读[升级说明](upgrading.md)。恢复流程不自动重发 QQ 消息，也不以服务健康代替真实收发确认。
