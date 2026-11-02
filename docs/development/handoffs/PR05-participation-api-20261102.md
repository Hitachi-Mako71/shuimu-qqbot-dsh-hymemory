# PR05 本地参与决策 API

- 插件版本：0.22.27
- 新增 `participation-model.js`，默认 mock 固定返回 SILENT，不加载训练 schema，不调用 DeepSeek，不提供文本或发送权限。
- 决策标签、reasonCode、confidence 和 modelVersion 均严格校验；输入上限 32,768 字符，默认超时 600ms、上限 10 秒。
- 超时、取消、拒绝、非法 JSON、NaN、未知标签、额外字段和过长输入都 fail closed 为 SILENT。
- 合成场景核验：`node --test app/tests/participation-model.test.mjs`，7 项全部通过；这不代表真实 QQ 测试。
- 本 PR 不连接 `consider()`，不改变机器人参与策略；未进行训练、模型下载或真实 QQ 内容验收。

## 执行记录

- 元数据生成脚本首次因嵌套模板字符串引号冲突而在解析阶段中止，未写入文件；改用行数组表示文档后成功生成，并通过 JSON、锁文件与打包验证。

- 修正版补上取消信号在监听器注册间隙的竞态检查，并限制自定义超时不超过 10 秒；新增竞态回归用例通过。

- 部署排查记录：0.22.27 包锁曾在 tarball 生成前执行，文件缺失；先打包后锁更新通过。活动 profile 路径匹配错误曾写入相对路径并解析至错误的 DSH_HOME packages 目录；对照 profile 既有绝对路径、解析结果和 tarball 位置后，修正为绝对路径，离线锁更新与 frozen 安装通过。服务在此次安装中受管停止，完成后已恢复。
- 文档记录脚本两次因 JavaScript 引号/模板字符串语法中止，均在执行前解析失败、未改动文件；改用数组文本后写入并核验 JSON。
