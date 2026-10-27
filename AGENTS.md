# Project maintenance

Read `README.md`, `docs/deployment/windows.md`, `docs/deployment/configuration.md`, and `docs/development/handoff.md` before changing runtime behavior.

- `app/` is the deployable project root. Run installation and service commands there. Keep its deployed relative paths intact unless an implementation change explicitly requires otherwise.
- Supported QQ transports are Tencent official QQ Bot and local QQ + NapCat/OneBot 11. Preserve both and maintain their guides under `docs/deployment/`.
- Version pins live in `app/versions.json` and `app/dsh-hymemory-plugin/package.json`. `archive/` is historical and is not loaded by the current installer.
- Never publish credentials, QQ login state, private account/group mappings, chat, memories, local data, attachments, logs, model caches, or NapCat/QQ binaries. Inspect the final commit tree and package contents.
- Keep OneBot bound to loopback and allowed groups explicit. Identity comes from the gateway, never a display name. Do not merge private and group memories.
- Codex handles explicitly requested image generation through the separate image workflow. Ordinary QQ text conversations use DeepSeek.
- Plugin source changes require a version increment, a versioned package, profile-lock updates, and installed hash checks when deploying. Documentation and source-preserving directory moves do not require a plugin rebuild.
- Use managed start/stop scripts and stop only the project's recorded processes. PowerShell 5 scripts retain UTF-8 BOM where required.
- Do not add or run application tests unless requested. Installation and health checks do not prove real QQ delivery.

## 调试兜底规则

- 处理程序故障、测试失败或异常行为时，记录已执行的修复尝试。
- 两次不同修复在相关验证后仍未解决问题时，第三次尝试前必须调用并严格遵循 `superpowers:systematic-debugging`；该 skill 的触发规则更早适用时立即调用。
