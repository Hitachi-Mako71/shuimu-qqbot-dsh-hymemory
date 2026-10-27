# 柚柚 QQ Agent

基于 DeepSeek Harness 的 QQ 聊天助手，使用 Hindsight 管理真实聊天记忆。支持腾讯官方 QQ Bot，以及个人 QQ + NapCat / OneBot 11 两种接入方式。

**当前版本：V3.5.0 · 业务插件 0.22.6 · Windows**

## 选择接入方式

| 接入方式 | 需要准备 | 部署文档 |
|---|---|---|
| 腾讯官方 QQ Bot | 腾讯开放平台 Bot、AppID / AppSecret、平台群权限 | [部署官方 QQBot](docs/deployment/official-qqbot.md) |
| 个人 QQ + NapCat / OneBot 11 | 个人 QQ、本机 QQ 客户端、NapCat，以及当前启动器需要的应用配置 | [部署 NapCat / OneBot](docs/deployment/onebot-napcat.md) |

两种方式共用对话、记忆、群控制和生图功能，一个运行实例选择一种传输方式。第一次部署请先完成 [Windows 基础安装](docs/deployment/windows.md)。

## 主要能力

- **聊天与记忆**：DeepSeek 对话、Hindsight 长期记忆、近期原文接续和带来源的历史查询。
- **群聊参与**：按群授权、接话档位、自定义节奏、真实成员 @ 和多个群控制者。
- **图片能力**：图片识别，以及用户明确请求的 Codex 内置生图。
- **本机管理**：Windows 控制台、课表、时区、主动消息和记忆删除生命周期。
- **按需加载**：Hindsight 与 embedding 在需要时启动，工作空闲 5 分钟后释放。

## 从这里开始

| 目标 | 入口 |
|---|---|
| 安装并运行 | [部署导航](docs/deployment/README.md) |
| 配置群聊、生图和记忆 | [使用指南](docs/usage/README.md) |
| 查看配置与备份规则 | [配置说明](docs/deployment/configuration.md) · [备份与恢复](docs/deployment/backup-and-recovery.md) |
| 阅读源码、维护和发布 | [开发文档](docs/development/README.md) |
| 查找分版本设计说明 | [技术参考](docs/reference/README.md) |

```powershell
git clone https://github.com/Hitachi-Mako71/shuimu-qqbot-dsh-hymemory.git
Set-Location .\shuimu-qqbot-dsh-hymemory\app
# 安装依赖与配置账号后：
.\start-all.ps1
# 停止：.\stop-all.ps1
```

## 仓库结构

```text
app/                    可运行工程、配置模板、插件和固定依赖
docs/
  deployment/           基础安装、两种 QQ 接入、配置与备份
  usage/                群聊、记忆、生图和控制台
  development/          架构、目录说明、维护与发布
  reference/            分版本技术契约与实现记录
archive/                历史报告、旧插件和旧安装包
```

运行命令默认在 `app/` 中执行。已有部署升级前请阅读[目录调整说明](docs/deployment/upgrading.md)。

真实凭证、QQ 登录态、OneBot 账号/群映射、聊天、记忆、附件、日志及 NapCat / QQ 二进制保存在本机，不随源码发布。历史材料集中在 [archive/](archive/README.md)，当前部署以 `docs/deployment/` 为准。
