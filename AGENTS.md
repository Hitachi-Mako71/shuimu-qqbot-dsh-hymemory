# 维护柚柚 QQ Bot

先读README.md、docs/FROM_ZERO.md、docs/CONFIGURATION.md、docs/HANDOFF.md。

- Windows，默认项目D:\DeepSeekHarnessData\qqbot-hymemory，Harness Home D:\DeepSeekHarnessData\home；只管理qqbot profile，不改desktop/web或其他聊天。
- DSH0.2.1-rc.2、官方QQ插件0.5.2、Hy Memory2.0.4、本地插件0.8.0、模型插件0.4.3、控制台2.7.0。固定版本见versions.json。
- 用户已明确移除读书与虚构记忆生成。不得自动恢复源书阅读、共读、虚构日常、故事事件、虚构库写入或自动日常配图。旧本机数据保留但不加载；旧Git历史不作为当前启用依据。
- 当前保留真实聊天Hy Memory、群/私聊身份隔离、模型路由、群友模式、视觉、手动生图和轻问候。自动记忆只提交当前用户证据，不把旧assistant虚构内容重新提炼。
- 用户喜欢温柔、可爱、端庄、聪明善良的公主人设，名字柚柚，旧名水木，昵称含公主/大肥鱼；不要把角色风格写成发生过的日常经历。
- 修改生产配置只更改请求涉及的字段。人格通过personality_config的YAML1.2 Loader/Dumper应用，保持off字符串。保留已有登录、群绑定、路由、聊天和真实记忆；不重复安装已有依赖。
- 凭证仅在本机官方登录/遮蔽窗口填写，不打印或要求发到聊天。Git排除真实.env、QQ/DSH/Codex授权、书籍、记忆、会话、参考图片、任务、模型与运行目录。上传前检查暂存区、真实凭证值及压缩包内部。
- 本地插件源码改动后打包安装必须递增版本及tgz文件名，安装后比较node_modules与源码哈希。依赖锁可用tools/materialize-dependency-locks.py转换路径。
- Windows递归移动/删除前核对目标绝对路径；后台启动隐藏窗口，只停止本项目受管进程。PowerShell5脚本保留UTF-8 BOM。
- 用户未要求测试/验收时，不新增或运行应用测试。安装/健康状态不等于QQ真人收发验收，也不等于设备已读。
- Codex同步只操作本项目绑定聊天，转发公开assistant进展和回复，不转发推理、工具日志、其他聊天或凭证。手动生图走独立工作室，真实QQ回执后才算交付。

## 调试兜底规则

- 处理程序故障、测试失败或异常行为时，记录已执行的修复尝试。
- 如果两次不同的修复尝试在执行相关验证后仍未解决问题，则在第三次修复尝试前，必须调用并严格遵循superpowers:systematic-debugging。
- 若该skill按其触发规则应更早调用，则立即调用，不必等满两次失败；找不到skill时不能假称已调用。
