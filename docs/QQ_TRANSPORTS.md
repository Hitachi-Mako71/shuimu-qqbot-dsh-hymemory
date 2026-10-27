# QQ 接入方式：腾讯官方 Bot 与个人 QQ/OneBot

本仓库保留两种 QQ 接入方式。它们共用 DSH、`dsh-hymemory-qq`、群参与逻辑、Hindsight 和记忆隔离；差异只在 QQ 消息如何进入和离开 DSH。**一个运行实例一次只选择一种模式。**

| 模式 | 账号 | 收发链路 | 适用场景 |
|---|---|---|---|
| 官方 QQ Bot | 腾讯开放平台 Bot | Tencent QQ Bot SDK | 官方 Bot 应用、平台授权和群范围 |
| OneBot 11 | 本机个人 QQ | QQ 客户端 + NapCat Shell + loopback WebSocket | 用户已有个人 QQ，愿意在本机保持 QQ/NapCat 登录 |

两种模式均由 `start-all.ps1` 管理。`data/transport/onebot.json` 不存在或 `mode` 为 `official` 时走官方 SDK；只有 `mode` 为 `onebot` 时才启动 OneBot/NapCat。不要同时启动两份机器人进程或让两个模式监听同一账号。

## 公共基础安装

先完成 [Windows 从零部署](FROM_ZERO.md) 的环境准备、克隆、锁定依赖安装、DeepSeek 登录和本机 QQ 凭证配置。当前安装器会保留 Tencent DSH QQ 插件，因为它承载 DSH 的 QQ profile、事件和中间件；OneBot 模式通过项目补丁替换消息传输，不会改动其他 Harness profile。

```powershell
Set-Location D:\DeepSeekHarnessData\qqbot-hymemory
$env:DSH_HOME='D:\DeepSeekHarnessData\home'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\configure-qq-local.ps1
```

安装与账号配置均在本机完成。不要把 `.env`、`qq.credentials.json`、Harness 登录目录或 `data` 上传到 GitHub。

## 方案 A：腾讯官方 QQ Bot

### 准备

1. 在腾讯开放平台创建并配置 Bot，取得 AppID/AppSecret。
2. 在平台侧完成发布、测试成员、私聊权限和目标群权限设置。
3. 用 `configure-qq-local.ps1` 在本机验证并保存应用凭证。

### 选择官方模式并启动

新安装默认使用官方模式：不要创建 `data/transport/onebot.json`。如果此前启用过 OneBot，先停止服务并备份该私有文件，再编辑它，将模式改为：

```json
{
  "mode": "official"
}
```

然后启动：

```powershell
.\start-all.ps1
Get-Content .\logs\qqbot.out.log -Tail 30
```

确认日志出现 `Bot ready!`，再从已授权的测试私聊/群确认平台收发。群消息权限、审核状态和平台能力由腾讯开放平台控制。

## 方案 B：个人 QQ + NapCat/OneBot 11

### 准备本机组件

1. 准备可登录的个人 QQ 客户端。当前固定版本记录在仓库 `versions.json`。
2. 从 [NapCatQQ 官方发布页](https://github.com/NapNeko/NapCatQQ/releases) 获取与本机 QQ 版本相配的 NapCat Shell；不要把二进制或登录态提交仓库。
3. 将 NapCat 解压到项目目录下的子目录，例如 `D:\DeepSeekHarnessData\qqbot-hymemory\runtime\napcat\NapCatQQ`。目录中应有 `NapCatWinBootMain.exe`、`NapCatWinBootHook.dll`、`loadNapCat.js`、`napcat.mjs` 和 `qqnt.json`。
4. 在 NapCat 中启用 **Forward WebSocket Server**，只监听 `127.0.0.1`。设置随机访问令牌和端口；下例用 3001。不要把 WebSocket 或 NapCat WebUI 暴露到公网。

### 创建本机映射文件

复制 [`examples/onebot.json.example`](../examples/onebot.json.example) 到 `data/transport/onebot.json`，再按本机环境填写：

- `legacyAppId` 必须与本机 DSH QQ profile 的 `QQBOT_APPID` 相同。
- `selfId` 填登录用个人 QQ 号。
- `url` 填 NapCat Forward WebSocket 地址，需为 `ws://127.0.0.1:<端口>`；令牌由程序作为 `access_token` 查询参数加入。
- `token` 与 NapCat Forward WebSocket 配置一致，使用 64 位小写十六进制随机值。
- `napcatRoot` 指向项目 `runtime/napcat` **里面的 NapCat 子目录**；`qqExecutable` 填真实 QQ 客户端可执行文件绝对路径。
- `allowedGroups` 只列出明确允许的数字群号；`groups` 将每个群号映射到稳定逻辑群 ID。迁移时沿用原分区 ID；新群可使用 `ob-group-<群号>` 这样的稳定 ID。
- `users` 是可选的数字 QQ 号到逻辑用户 ID 映射。迁移旧记忆时必须填写原逻辑 ID；新用户可使用稳定独立 ID。未知成员由程序生成 `ob-user-<QQ号>`，不能按昵称继承身份。
- `mediaRoots` 仅填写需要读取的本机 QQ/NapCat 媒体缓存目录；不需要本地缓存附件时留空。

映射文件包含真实 QQ/群号和密钥，只留在本机。不要用公开仓库中的示例占位符直接启动，也不要把私有映射发到聊天或提交 PR。

### 启动和验证

确认 `mode` 为 `onebot`，再启动：

```powershell
.\start-all.ps1
Get-Content .\logs\napcat.out.log -Tail 30
Get-Content .\logs\qqbot.out.log -Tail 30
Invoke-RestMethod http://127.0.0.1:8765/health
```

首次登录时在本机 QQ/NapCat 窗口扫码。插件会调用 `get_login_info` 核对实际登录号；与 `selfId` 不一致时拒绝接入。`data/transport/status.json` 记录本地连接状态。OneBot 端口和访问令牌只应对 loopback 开放。停止时使用 `stop-all.ps1`，它仅停止本项目记录的 QQ/DSH、记忆及 NapCat 进程。

个人 QQ 模式的群访问范围由 `allowedGroups` 决定；账号映射和群记忆分区由本机配置决定。切换至官方模式前先停止服务，再将 `mode` 改为 `official` 或备份后移除 OneBot 配置；切换后重新启动并确认登录日志。

## 常见问题

- **Bot 未就绪**：检查所选模式、同一模式的账号是否已登录、平台权限或 OneBot 的 loopback URL/端口/令牌是否一致。
- **OneBot 登录账号不匹配**：将 `selfId` 改为本机明确授权的 QQ 号，然后重启；不要改群映射来绕过检查。
- **群无响应**：官方模式检查腾讯平台群权限；OneBot 模式检查 `allowedGroups`、`groups` 映射以及 QQ 客户端实际收到的群事件。
- **旧记忆不可见**：核对迁移后的 `legacyAppId`、用户与群逻辑 ID 是否与旧分区一致。不要把新旧账号仅凭昵称合并。
- **切换方案**：先 `stop-all.ps1`，修改私有 transport 配置，再 `start-all.ps1`；切换时不要复制 `data` 覆盖现有资料。

