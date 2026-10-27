# QQ Bot project maintenance

Read `README.md`, `docs/FROM_ZERO.md`, `docs/CONFIGURATION.md`, and `docs/HANDOFF.md` before changing runtime behavior.

- Windows deployment targets the dedicated `qqbot` profile. Version pins live in `versions.json` and `dsh-hymemory-plugin/package.json`.
- The supported QQ transports are Tencent official QQ Bot and local QQ + NapCat/OneBot 11. Preserve both paths and document their differences in `docs/QQ_TRANSPORTS.md`.
- Do not publish `.env`, QQ/DSH/Codex credentials, `data/`, QQ login state, chat, memories, local mappings, screenshots, logs, model caches, or NapCat/QQ binaries. Review the final commit tree before publishing.
- Keep OneBot bound to loopback and `allowedGroups` explicit. Never infer user/group identity from a display name or merge private and group memories.
- User-requested image generation uses the separate Codex image workflow. Do not route ordinary QQ text conversations to Codex.
- When changing plugin source, increment its package version, produce a versioned `.tgz`, update the dedicated profile lock, and verify installed hashes when deploying.
- Use the project's managed start/stop scripts and stop only processes recorded for this project.
- Do not add or run application tests unless the user asks. Installation and health checks are not proof of real QQ message acceptance.

