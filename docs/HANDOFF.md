# 当前交接：V3.5.0 / 插件 0.22.6

仓库当前源码与本机已部署的 DSH + DeepSeek + Hindsight 实现对齐。QQ 传输层保留两条可选路径：Tencent 官方 QQ Bot，以及本机 QQ 客户端 + NapCat Shell + OneBot 11。两者共用同一份业务插件和记忆数据契约，配置步骤见 [QQ_TRANSPORTS.md](QQ_TRANSPORTS.md)。

Hindsight 和本地 embedding 按需启动，召回/提炼/删除需要时加载，服务空闲 5 分钟后释放。插件包含群聊多控制者、群级控制与生图权限检查；控制者只在所在群有效，不获得成员的私聊记忆。

从零安装见 [FROM_ZERO.md](FROM_ZERO.md)。当前固定组件见 `versions.json`；发布流程见 [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md)。本仓库不含本机账号、实际 QQ/群映射、授权、记忆、聊天、运行数据或 NapCat/QQ 二进制。安装与健康状态不等于 QQ 真人收发验收。

