# 项目交接：让下次Codex接着做

## 用户目标和选定方案

QQ官方Bot已创建，用户希望通过QQ和DeepSeek Harness对话，跨会话保留偏好、事实和经验。本项目使用腾讯官方QQ插件和腾讯Hy Memory SDK，独立qqbot profile，不修改desktop/web。

**最初核心目标已完成并有原机实际验收：** QQ私聊收发、群触发、长期记忆自动召回/写入、记住/查询/忘记控制、`/new`与重启后的召回，以及群里没有私聊记忆。

后续已完成水木的人格、桌面启动/关闭、图片识别、JSON导出，以及QQ和当前Codex聊天的双向同步。本仓库为2026-10-21完整可部署快照。

## 原机实际环境

- Windows，Node24.11.1，pnpm11.25.0，Python3.12.14。
- 项目 `D:\DeepSeekHarnessData\qqbot-hymemory`，Harness Home `D:\DeepSeekHarnessData\home`。
- DSH0.2.1-rc.2，本地runtime启动；官方QQ0.5.2，原生Cordis配套0.2.0。
- Hy Memory2.0.4，FastEmbed0.9.0，Chroma1.5.9，Kuzu0.11.3；graph关闭。
- DSH本机账号 `deepseek-account/deepseek-flash` 负责对话、视觉和记忆提炼；本地BAAI/bge-small-zh-v1.5负责512维向量。
- 没有假定DeepSeek API提供Embedding；没有新增百炼向量API或独立DeepSeek API Key。
- 仅127.0.0.1的8765和8766；真实token、登录和用户数据在原机私有目录，不在Git。

## 关键实现选择

1. 固定官方QQ补丁，明确生命周期调用，不依赖模型自行想起检索。
2. Cordis systemPrompt.context的required上下文用于相关记忆，不覆盖当前用户指令。
3. 每轮结束只把当前用户证据提交SQLite WAL异步队列，避免逐token写入和重复assistant内容。
4. Hy Memory的模型调用回到Cordis已有账号，Python服务只提供SDK封装与本地Embedding。
5. 记忆空间按Bot+用户/群哈希；会话ID变化不影响记忆空间。
6. 删除检查命名空间、取消旧待提炼任务，防止迟到任务复活旧事实。
7. 图片复用官方视觉工具；辅助调用显式off reasoning。
8. Codex传话走官方CLI queue；回程仅只读指定聊天公开assistant消息，不能写Codex数据库。

## 已遇到的问题与决定

- 初始npm与镜像ENOTFOUND，网络恢复后用固定依赖完成安装。不能把安装失败当成已有profile。
- Windows中Node不自动继承系统代理，曾导致QQ不ready。修复启动器环境代理与localhost绕过后实际上线。
- DSH不允许.env携带DSH_HOME；放在启动环境。
- PyYAML YAML1.1曾把off写成false。改为专用YAML1.2加载/导出，不再通用safe_load+dump修改模型配置。
- SQLite连接上下文不会自动close，曾导致Windows文件锁。已改明确关闭。
- 冷启动第一次召回曾超时；服务提前预热SDK/Embedding，启动器等待最多30秒后允许降级。
- 图片URL被web_fetch拒绝MIME，原来media/vision关闭。开启官方图片下载与视觉工具后用户确认可描述图片。
- 视觉helper默认高强度思考可能耗尽短预算；补丁显式reasoningEffort off，主Agent独立配置。
- Codex桌面控制socket不可用，CLI queue可用。实际排队消息随后进入原聊天，避免把入队回执等同处理成功。

逐次尝试、诊断证据和历史验收见DEBUG_HISTORY与根目录报告。

## 实际验收与边界

- 原机历史Node6项、Python8项回归通过；合约测试含stub，独立真实SDK7项验证提炼、召回、冲突、隔离、删除、队列。日期和范围在报告里。
- 用户QQ确认：普通偏好可查、`/new`召回、服务重启召回、群里没有私聊记忆、图片可描述。
- 实际DSH JSONL后端只读打开非空会话，证明真实存储格式可读。重启前后仅依赖短期上下文的随机口令没有单独真人实测。
- JSON导出实际运行过，得到10条事实/画像、2个分区、无待提炼任务；内容未上传。
- Codex同步：用户从QQ配对并发送验收文本；该文本实际到达原Codex聊天，助手“同步成功”以及多条公开进展由QQ发送接口确认成功。没有用户设备已读回执。
- 第二真实QQ账号、Codex离线积压、QQ主动推送限额耗尽、超长回复分段未进行完整实测。
- 本轮GitHub归档没有重跑应用测试或在新Windows重装；新增部署辅助工具的全新机器流程待新部署时实际验收。

## 仍需按新环境决定

- 真实QQ AppID/Secret、新机DSH账号登录；不能从GitHub恢复凭证。
- 安装路径、Harness Home、网络/代理及端口占用。
- Codex同步的本机线程UUID和新配对；旧机绑定不提交。
- 是否恢复旧记忆和会话；恢复需要用户私有备份。
- `working`长任务记忆、图片事实长期记忆、Windows开机自启/守护、群内成员级私有记忆未实现。

## 新会话可直接使用的任务说明

“请阅读此仓库AGENTS.md、docs/FROM_ZERO.md和docs/HANDOFF.md，在当前Windows检查权限与网络后按固定版本部署。保留已有desktop/web profile；凭证只在本机输入。按原项目要求完成真实QQ消息往返、长期记忆自动写入/新会话召回/隔离/删除，并记录本次验收。需要Codex同步时绑定本次聊天，不能沿用原机线程或配对数据。”
