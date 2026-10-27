# 发布流程

1. 对照 `versions.json` 和当前运行源码确认本次变更范围，并检查 `.env`、QQ/DSH/Codex 凭证、本机映射、聊天、记忆、日志、登录态和模型文件未进入发布目录。
2. 修改 `dsh-hymemory-plugin` 后递增 `package.json` 版本，运行 `npm pack` 生成唯一版本的 `.tgz`。
3. 将实际 profile 的依赖清单与锁文件转换为仓库相对路径，更新 `dependency-locks/qqbot-profile`。
4. 只在部署环境安装目标包，并比较源码与 `node_modules/dsh-hymemory-qq` 的文件哈希。
5. 使用 `start-all.ps1` / `stop-all.ps1` 管理项目服务；记录插件版本、服务健康和 QQ transport 模式。健康接口不代表 QQ 收发已验收。
6. 发布前检查目标文件、版本、锁文件、压缩包内容和公开差异；不得提交用户的 QQ/群映射或本机账号数据。

当前版本和传输模式见 `versions.json`、`docs/QQ_TRANSPORTS.md`。不要把历史验证结果误标成本次发布结果。

