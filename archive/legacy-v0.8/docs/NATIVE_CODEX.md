> 历史资料：正文属于原版本快照，当前部署见[归档导航](../../README.md)。

# DeepSeek / Codex 双路由

当前版本：控制台2.5.1、模型插件0.4.2、记忆插件0.6.3。腾讯QQ插件仍为0.5.2，DSH仍为0.2.1-rc.2。

## 切换

打开桌面“柚柚机器人控制台”→“对话模型”。选择：

- **DeepSeek · 原本路由**：使用已保存的原DeepSeek账号模型。
- **Codex · 原生会话**：使用本机Codex登录，默认GPT-6 Luna，也可选择账号实际提供的5.6 Luna。先刷新连接、验证所选模型，再保存切换。

保存后普通文本和记忆提炼跟随路由；顶部提示重启时，点击“重启以应用设置”，让图片识别等固定入口一起更新。没有自动改用其他模型或免费额度绕行。Codex仍适用账号自身用量限制。

## 共用的记忆

两条路由访问**同一个**`data/hy-memory`数据库和同一个`data/memory-workspace`工作目录，不做两份副本。记忆身份仍由QQ AppID、私聊/群聊类型、对端标识派生，**不含模型路由**。同一身份切换后继续召回；其他用户、群不能因此获得私聊记忆。虚构生活仍独立存放在`data/companion`及独立Hy Memory空间，不混入真实用户事实。

`data/memory-workspace`是可读工作目录，不是所有身份的明文记忆汇总。正常召回、写入、查询和删除仍走现有Hy Memory接口。

## 在Codex中看QQ聊天

控制台点击**在Codex查看聊天**，打开记忆工作目录，在Codex历史中查找 **柚柚QQ · …**。控制台同时显示最近创建的聊天名称。

实现使用官方Codex App Server，不是给账号API改名。一个DSH会话对应一个持久Codex线程；后续消息调用`turn/start`追加，进程重启后调用`thread/resume`续接。`/new`才产生新的对应线程。不会每条消息打开Chat网页或临时对话。

切回DeepSeek期间，DeepSeek的逐条消息保存在DSH会话中；它们不会伪装成Codex生成记录。再次切回Codex时续接该身份原线程，并使用当前人设和Hy记忆。后台记忆提炼、日常规划等辅助模型请求采用不落桌面历史的临时线程；群友模式接话使用按群持久线程。普通私聊/群聊的DSH会话与群友模式的后台接话线程分别保存。

Codex桌面端载入历史时也可能持有线程写入锁，并非只有发送消息才会占用。机器人遇到明确的`active writer`冲突时，会先检查原线程最后回合；已结束则通过官方`thread/fork`保留该身份历史、建立一次持久续接并原子更新映射，后续消息继续追加在此线程，标题带“续接N”。原线程与其历史完整保留，不删除、不跨QQ身份拼接，也不改用其他模型。若原线程仍在执行任务，则提示稍后重试。

在Codex界面移动会话到其他工作空间，不会自动迁移Hy Memory数据库或修改机器人`config.json`里的`cwd`。应分别核对界面归类、实际工作目录、共享记忆目录；恢复出的续接条目可能需要在界面重新归类。

## 新机器配置

先安装并登录Codex。模型插件安装后执行：

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
.\.venv\Scripts\python.exe configure-native-codex.py --project . --codex-home D:\CodexData\.codex --codex-path C:\Users\你的用户名\.codex\bin\codex.exe
```

路径应改成本机实际安装和**桌面Codex实际使用的Home**。工具只在不存在时创建`data/codex-work/config.json`；不覆盖已有设置，不读取或复制账号凭证。控制台“刷新Codex连接”也会尝试自动定位。账号应由Codex自己完成登录。

私有配置包含`codexPath`、`codexHome`和`cwd`。`threads.private.json`保存DSH会话到Codex线程的映射，`models.json/status.json/probe.json`保存本机模型目录及验证状态。上述文件全部位于Git忽略的`data`中。备份长期记忆不等于备份Codex聊天；恢复原生聊天还需自行保留实际Codex Home及线程映射。

## 排错与边界

- 连接失败：确认Codex登录、所配Home、网络和控制台的模型验证；不会静默降级为网页或旧账号API。
- 模型探针通过但QQ失败：探针采用新临时线程，不能证明旧会话可恢复。控制台分别显示账号检查时间、模型探针时间和最近实际QQ回合结果；`runtime.json`只保存错误码、RPC方法、数值状态和时间，不保存输入、凭证或线程标识。最近实际回合失败时顶部显示“Codex对话异常”。
- `CODEX_THREAD_BUSY`：另一入口仍持有线程写入锁；只对已结束的原会话进行保留历史续接。其他RPC错误不会触发新建线程兜底，查看控制台显示的调用方法和错误码。
- QQ一直等待：取消当前回合；取消会中断对应的Codex回合，不中止整个Codex桌面程序。
- 找不到历史：在控制台查看聊天名称，打开配置的工作目录；两端必须指向相同Codex Home。仅处理本项目映射中的线程，不扫描或转发其他聊天。
- App Server由DSH子进程管理，关闭机器人会关闭本项目子进程，保留线程与记忆。
- 动态工具通过DSH原有执行/审批链路往返；机器人会话关闭继承的账号连接器、浏览器和本机shell工具，不自动开放桌面账号全部工具。
- 原生线程的工具目录在首次创建时确定；插件新增或删除工具后，必要时在QQ执行一次`/new`更新。模型切换、普通聊天和进程重启不需要逐条`/new`。
- 本机验证范围见`native-codex-verification.json`。新增路径尚未重新真人验收所有群友接话、图片和多日主动日常。

官方协议：[Codex App Server](https://learn.chatgpt.com/docs/app-server)。本机协议与CLI版本0.162.0-alpha.17.2生成的JSON Schema核对。
