> 当前版本0.8.0已移除读书、虚构记忆生成和自动日常配图；下方涉及旧资料的说明仅用于历史数据保管。

# 从零部署到 Windows

当前快照：控制台2.7.0、模型插件0.4.3、记忆插件0.8.0。默认先部署DeepSeek路由，再按需接入[原生Codex](NATIVE_CODEX.md)或[Chat工作通道](CHATGPT_CHAT_WORK.md)。读书和虚构记忆生成已移除。

本指南固定DSH 0.2.1-rc.2、QQ插件0.5.2、配套插件0.8.0、模型插件0.4.3、Hy Memory 2.0.4、控制台2.7.0。原机完成了真实账号探测、工具往返和服务启动；没有在另一台全新Windows上重复完整安装。可选生图和固定形象恢复见CODEX_IMAGES.md，三张私有参考图从本机配置备份另行恢复。

## 1. 准备软件与本机账号

- Windows，PowerShell 5.1 或更新版本，Git。
- Node.js 24；原机 24.11.1。需要可运行 `node`、`npm.cmd`。
- Python **3.12 x64**；原机是 DSH 附带的 3.12.14。普通 Python 3.12 也可建立环境；不要默认使用 3.13/3.14 以免二进制依赖不兼容。安装时启用 Python Launcher，或使用已知 Python 3.12 的绝对路径。
- pnpm 11.25.0。未安装时执行：

```powershell
npm.cmd install --global pnpm@11.25.0
node --version
pnpm.cmd --version
py -3.12 --version
```

- 一个 QQ 官方 Bot，准备 AppID、AppSecret，确认私聊/群聊发布范围或沙箱测试成员。登录 QQ 官方平台通过“扫码聊天”等入口添加机器人。
- 首先准备DSH的DeepSeek账号登录，以跑通默认对话与Hy Memory提炼链路。原生Codex为可选路由，需要已登录的本机Codex；Chat网页工作通道需浏览器、扩展与专用工作对话。各项登录与配对均在本机完成，令牌不保存在GitHub。本实现不假定DeepSeek提供Embedding API。
- 能连接 npm、PyPI、首次模型下载源、腾讯 Bot API 和 DeepSeek 模型服务的网络。代理问题见后面的排错。

## 2. 获取代码、固定目录

先确认目标目录不存在或是本项目 checkout；不要在已有数据目录上强行重新克隆。

```powershell
New-Item -ItemType Directory -Force D:\DeepSeekHarnessData | Out-Null
git clone https://github.com/Hitachi-Mako71/shuimu-qqbot-dsh-hymemory.git D:\DeepSeekHarnessData\qqbot-hymemory
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
$env:DSH_HOME='D:\DeepSeekHarnessData\home'
```

本仓库为公开源码仓库；推送修改需要相应GitHub权限。不要把PAT写进clone URL。

默认 D 盘目录适合照抄部署。换盘或换 Harness Home 时阅读 `docs/CONFIGURATION.md`，不要只改一个环境变量便假定所有后台入口都会沿用它。

## 3. 建立 Python 环境、准备依赖锁

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe tools\materialize-dependency-locks.py --part runtime --project . --dsh-home $env:DSH_HOME
```

上一步将仓库保存的 DSH runtime 的 `package.json/package-lock.json` 放到将安装的位置，帮助复用原机解析版本，不下载或启动服务。如果已经安装过且锁文件不同，工具会停止；有意覆盖锁文件时加 `--force`，旧锁会留备份。

## 4. 安装项目

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install-qqbot.ps1 -DshHome $env:DSH_HOME
```

安装脚本从自己的 `.venv` 运行，因而不依赖 PATH 上碰巧是哪一版 Python。它安装 Python SDK、固定 DSH、官方QQ插件、配套Cordis包与ChatGPT账号提供方，应用补丁，生成独立 `qqbot` profile 与本机随机接口token，并预热512维本地向量模型。不会替你登录ChatGPT或填写QQ Secret。

只修改专用 `qqbot` profile；原机的 `desktop/web` 不作为部署目标。重跑会保留数据与本机凭证，但会重新应用本仓库的 QQ profile 模板，手工改过 profile 时先备份。

可选：将原机 QQ 依赖锁转换为当前绝对/相对路径后严格安装，以对齐原机第三方依赖：

```powershell
.\.venv\Scripts\python.exe tools\materialize-dependency-locks.py --part profile --project . --dsh-home $env:DSH_HOME --force
Push-Location (Join-Path $env:DSH_HOME 'profiles\qqbot')
try { pnpm.cmd install --frozen-lockfile } finally { Pop-Location }
```

`dependency-locks` 保留原机的完整锁快照和完整性哈希；它不是另一个运行目录。恢复工具只支持快照对应的插件组合，发现额外插件会拒绝覆盖。不要把“安装已完成”当作 QQ 或模型已验收。

## 5. 选择聊天模型

先完成同一Harness Home中的DeepSeek登录，在控制台“对话模型”页选择DeepSeek / deepseek-flash，验证后保存并按提示启动。私聊、群聊和Hy Memory提炼代理共用该路由。可选原生Codex使用官方App Server，复用持久线程，并能在Codex软件查看QQ聊天，详见[NATIVE_CODEX.md](NATIVE_CODEX.md)。Chat网页工作通道仅处理最新任务和附件，不携带QQ记忆，使用同一个专用工作对话，详见[CHATGPT_CHAT_WORK.md](CHATGPT_CHAT_WORK.md)；它不是默认部署步骤。旧账号API验收文档仅作历史参考。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\robot-control.ps1
```

桌面控制台快捷方式可在安装完成后运行 `create-control-shortcut.ps1` 创建。完整授权细节和切回DeepSeek的步骤见 [ChatGPT账号提供方](CHATGPT_PLAN.md)。

## 6. 可选：登录 DSH DeepSeek 备用模型账号

**方式 A：已有 DSH 桌面版。** 打开桌面版账号设置完成登录，确认它使用的 Harness Home 与 `$env:DSH_HOME` 一致。要保留DeepSeek回退时，验证桌面版可使用 `deepseek-flash`。后台QQ进程必须使用同一个Home，才能读取该本机登录。只使用ChatGPT时可略过此步。

**方式 B：没有桌面版，使用仓库安装的 DSH Web。** 从项目目录打开独立的登录用 Web profile，避免覆盖已有 web 配置：

```powershell
$env:DSH_HOME='D:\DeepSeekHarnessData\home'
node .\runtime\node_modules\@deepseek-ai\dsh\lib\bin.js --profile qqbot-login --from-default-profile web --host 127.0.0.1 --port 8088
```

根据 DSH 输出的本机 URL 打开浏览器，在账号界面完成 DeepSeek 登录。启动 URL 含临时访问凭证，只在本机使用，不贴到聊天或 GitHub。确认账号和 `deepseek-flash` 可用后用 Ctrl+C 结束登录用 Web 进程。`--from-default-profile` 会重建该指定 profile，故这里专用名称为 `qqbot-login`；不要替换为已有 desktop/web。

如果未来版本的账号界面、账号服务或模型名称发生变化，以固定版本实际 UI 和官方说明为准。当前代码不是独立 API Key 方案；改用 API Key 需要同时调整 QQ 默认模型、视觉模型和记忆模型代理，不是只替换 `.env` 的一个值。

## 7. 本机填写并验证 QQ 凭证

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\configure-qq-local.ps1
```

在窗口输入 AppID 和当前 AppSecret，再点 `Verify and save`。Secret 是遮蔽输入；腾讯接口验证通过后保存到当前电脑的 `qq.credentials.json`，并限制文件权限。新机器不会预填原机 AppID。凭证失效、重置或复制错误时重新打开窗口验证。

不要把截图中 OpenClaw/Hermes 的接入命令混用到本项目。

## 8. 启动并创建桌面按钮

```powershell
.\start-all.ps1
.\create-control-shortcut.ps1
Get-Content .\logs\qqbot.out.log -Tail 20
Invoke-RestMethod http://127.0.0.1:8765/health
```

期望日志出现 `Bot ready!`，记忆健康报告 `sdk_ready`、`embedding_ready`。`start-all` 的输出只表示进程已创建，模型能否调用还需真实对话确认。桌面“柚柚机器人控制台”集中查看状态、启停和管理常用配置；关闭命令为 `.\stop-all.ps1`。

## 9. QQ 验收

1. 私聊发“验收QQ连接：请只回复连接成功”，确认消息往返。
2. 发“我偏好简洁回答”，等回复后用“记忆状态”查看队列，再发“查记忆 回答风格”。
3. 发 `/new`，再问回答风格偏好，验证新会话召回。
4. 用桌面按钮关闭再启动，重复查询。另给一个不应提炼为长期记忆的临时口令，单独验证短期会话恢复。
5. 更新为详细回答，确认冲突处理；按查询 ID 发“忘记：ID”，再次查询确认删除。
6. 群里 @机器人 查询同一私聊偏好，确认群里没有私聊记忆；有第二测试账号时再验证私聊隔离。
7. 发一张图片并问“图里有什么”，确认走图片描述而不是网页抓取。
8. 需要故障验收时短暂停记忆服务并发普通 QQ 消息，确认对话可降级、记忆命令报告未确认成功。

详细历史证据、SDK/合约测试的范围与运行方法在根目录 `acceptance-checklist.md`。真实模型调用有用量，请在明确需要验收时运行。

## 10. 人格、导出和可选 Codex 同步

新增陪伴功能：普通QQ对话打通后运行 `.\configure-companion.ps1 -Frequency High`，有已验证私聊时复用目标，否则将打印的“开启陪伴 配对码”发给水木。Codex可不安装。公主日记、共同片段、夜市/舞会/花园剧情和开关见 [陪伴说明](COMPANION.md)。高频会产生持续模型用量，夜间默认静默。

- 人格：编辑 `personality.md`，运行 `.\.venv\Scripts\python.exe .\personality_config.py`，再重启。
- JSON 导出：运行 `.\export-memory.ps1`，在 `exports` 查看；该命令暂停并恢复原先运行的服务。
- Codex 同步：安装并登录官方 Codex 桌面版，确认其 `codex.exe queue --help` 可用；新建或选择你希望绑定的聊天，取得聊天 UUID。在项目目录执行：

```powershell
.\configure-codex-relay.ps1 -ThreadId <这台电脑上要绑定的聊天UUID>
```

如果没有 PATH 中的 Codex，请把实际包含 `codex.exe` 的目录加入当前 PowerShell 的 PATH。若找不到唯一的记录，显式加 `-RolloutPath <该聊天的jsonl绝对路径>`；不能填写别的聊天记录。复制打印的 `开启Codex同步 配对码` 到水木私聊，15 分钟内有效。随后用“转告Codex：这是同步验收，请回复同步成功”实测往返。

不要沿用原机聊天 UUID 或拷贝原机 Codex 登录数据。需要 Codex 和机器人都在运行；消息入队不等于已处理，QQ 平台也可能限制主动推送。命令表见 README。

## 11. 网络与安装失败

- npm/PyPI DNS 失败：分别确认 DNS、代理、registry 可访问；先解决网络再重跑，改一个同样不可达的镜像没有帮助。
- Node 启动超时而 PowerShell 能访问：本项目 QQ 启动脚本会读取 Windows 系统代理、启用 Node 24 环境代理，并让 localhost 绕过代理。确认原机代理端口在新机器不被照抄为不存在的服务。
- 安装阶段 npm/pnpm 的代理与 QQ 运行阶段不同；如需要，请在当前终端为实际代理设置 HTTP_PROXY/HTTPS_PROXY，或使用本机包管理器的正常配置。
- 首次模型下载失败：检查模型源和 `data/models`；不能只有健康接口 `ok` 就认定向量模型已就绪。
- `ACCOUNT_SIGN_IN_REQUIRED`：检查同一 Harness Home 是否已登录及账号有效性；不要向日志输出 `.credentials.yaml`。
- `.env` 含 `DSH_HOME`：移除该行，改用启动环境设置。该规则由 DSH 自身检查。

仓库能重建程序。恢复旧会话/旧记忆需要你自己的私有数据备份，见 [备份与恢复](BACKUP_AND_RECOVERY.md)。


## 可选群友模式

完成基础收发后阅读GROUP_PARTICIPATION.md。在QQ群机器人设置里打开全量群消息选项，再由主人私聊“开启群友模式”取得一次性绑定码，到目标群@水木绑定。仅修改本地requireMention不能代替QQ平台下发权限。
