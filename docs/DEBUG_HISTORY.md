# Debug attempts, 2026-10-20

## QQ / current Codex chat relay, 2026-10-21

- Followed OpenAI Docs and the systematic boundary investigation: installed CLI exposes queue; existing desktop control socket is not available. This was a capability check, not a change to desktop processes or database files.
- Official codex queue returned a current-thread receipt. The diagnostic message subsequently arrived in this exact chat, confirming actual consumption rather than relying on the receipt alone.
- Installed companion 0.2.0 and a reproducible gateway registration patch. QQ startup reached Bot ready without errors. No desktop/web profile was changed.
- User paired from private QQ with an expiring code, then sent the bidirectional acceptance phrase. Private local state confirmed paired/enabled, CLI receipt, and successful QQ sends. The actual forwarded acceptance request arrived as a user message in this Codex chat; assistant replied 同步成功, and the QQ sender counter advanced with no delivery error.
- Default sandbox could not open Codex queue SQLite with WAL; elevated read-only inspection succeeded. No direct database writes were used. Inbound submission uses the supported CLI with argument arrays and no shell.
- No extra test suites were added or run for this feature. Verification used actual installation, existing service startup, user pairing, real queue delivery, and actual QQ transport receipts.

## Startup on 2026-10-21

- Managed Python and Node wrappers alive, memory ready, but QQ never reported ready. No source changes or credential changes were made before diagnosis.
- Boundary checks: PowerShell Tencent auth and gateway succeeded; the same requests from Node failed with UND_ERR_CONNECT_TIMEOUT. Windows system proxy is configured while Node proxy environment was absent.
- Minimal hypothesis check: enable Node 24's environment proxy support with the existing Windows loopback proxy; the same Node auth and gateway requests both passed. No credentials were printed.
- Fix attempt 1: startup script now inherits the Windows system proxy when explicit HTTP/HTTPS proxy variables are absent, enables Node environment proxy support, and bypasses localhost. Actual bot restart verification follows.
- Validation passed: after restarting the managed processes, the actual QQ log reported Bot ready. The first targeted proxy fix resolved the startup issue.

## Personality configuration on 2026-10-21

- First application exposed a YAML dialect mismatch: PyYAML's YAML 1.1 loader converted the existing reasoningEffort: off string into false. DSH reported that the model-default entry expected a string. QQ itself still came online; the model-default warning required correction.
- Root cause confirmed from the serialized configuration and DSH validation message. Fix: use YAML 1.2 boolean resolution for personality edits, restore the pre-edit backup, then reapply only the requested prompts. Verification follows.

## QQ image content-type error on 2026-10-21

- User screenshot shows web_fetch failing with WEB_UNSUPPORTED_CONTENT_TYPE after an image message. Source/config investigation found media.enabled=false and vision disabled; the original integration was intentionally text-only. The QQ message builder supplied an image URL as text, and there was no registered image-understanding tool.
- Followed systematic-debugging: inspected attachment assembly, vision-tool registration, actual attachment/LLM API compatibility, and provider model capabilities before changing settings.
- Capability diagnostic initially selected the device record instead of the default grant; inspected the official credential schema, selected the exact default account key, and successfully fetched /models without exposing token values. deepseek-flash advertises text and image inputs; deepseek-v4-pro is text-only.
- Fix attempt 1: enable official media download and qqbot_describe_image with deepseek-account/deepseek-flash; add explicit picture-tool routing to the persona. Existing model/personality/session settings are preserved. Live QQ image verification follows.
- Live evidence after fix 1: QQ downloaded a 2.1MB PNG and called qqbot_describe_image. One call returned "vision model returned no text"; a subsequent actual image-tool result completed without error. The provider source defaults unspecified reasoningEffort to high, while the vision helper sets only 1200 max tokens. Root cause of the intermittent empty result is consistent with reasoning using the short generation budget.
- Fix attempt 2: add reasoningEffort: off to the official vision helper via the existing pinned pnpm patch, keeping the main Agent's behavior separate. This directly controls the helper request instead of increasing an unbounded reasoning budget.
- Verification: updated pnpm patch installed successfully, installed vision source contains reasoningEffort: off, QQ returned to Bot ready with no startup validation error. User confirmed in live QQ: 已经能描述图片了. The earlier image-tool execution also contains a successful result in the persisted session.

- Prior turn: regular sandbox denied DSH_HOME writes/network; reviewed elevated checks now pass. npm versions read successfully.
- OCR attempt 1: Windows PowerShell 5 interpreted a UTF-8 smart quote inside a regex as corrupted source, causing a regex parse error. Fix 1 replaces the smart quote expression with an ASCII-only pattern; rerun pending.
- Fix 1 removed the regex syntax error, but extraction still failed. Systematic-debugging Phase 1 instrumentation found that WinRT OCR split the secret into separate whitespace-delimited words on the token command line; the old regex required a contiguous 20-character word. Hypothesis: normalize OCR whitespace before parsing the platform's fixed-length secret. Fix 2 applies only that normalization. Real screenshot script is the failing reproduction; validation pending.
- Fix 2 still failed. Character-category instrumentation (no letters/digits disclosed) proved OCR used fullwidth colon U+FF1A at the AppID/secret boundary. Fix 3, after reading and applying systematic-debugging, normalizes Unicode FormKC before the already-tested whitespace normalization.
- Unicode fix passed parsing. Tencent rejected OCR-rendered secret (100016); screenshot glyph ambiguities remained. User entered current credentials into the local masked WinForms dialog and Tencent verification passed; no further OCR credential guessing is used.
- Actual QQ/DSH private message/reply succeeded (user confirmed receiving a response to 111); first session log was materialized under the independent JSONL root.
- pnpm Windows patch-commit treated an absolute patches-dir as a relative component. Using profile-relative `patches` succeeded; installed QQ inbound code contains the three intended hooks.
- Outbox regression tests exposed Windows file locks: sqlite's connection context manager commits but does not close. A closing contextmanager fixed the reproduced WinError 32; queue restart/dedup/delete-barrier checks passed.
- First background DSH boot failed because DSH intentionally refuses DSH_HOME in a discovered .env. Confirmed in app-boot readEnvLayer/BOOTSTRAP_PREFIXES. DSH_HOME must remain in the launching environment; remove it from the .env template and deployed config, retaining the launcher fallback.
- One independent model probe returned 503 during the verification sequence; the same probe passed after the final installation/restart, without changing provider configuration. Real SDK acceptance passed again. Retain graceful failure behavior for transient provider errors.
- After restart, logs showed the first recall exceeding the companion's 5-second deadline. Inspection established SDK/model initialization occurred on the first request. Added a failing startup warmup regression, then SDK/local-model warmup plus a maximum 30-second wait before starting QQ. Python regression went from the expected missing-warmup failure to 8 passing tests. Actual cold-start readiness validation follows.
