"""Add explicit QQ lifecycle hooks to the pinned official plugin via pnpm patch."""
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
manifest = json.loads((root / 'package.json').read_text(encoding='utf-8'))
if manifest.get('version') != '0.5.2':
    raise SystemExit('Only @tencent-connect/dsh-qqbot 0.5.2 is supported; refusing an unreviewed patch')
bootstrap_path = root / 'dist/gateway/bootstrap.js'
bootstrap_source = bootstrap_path.read_text(encoding='utf-8')
if 'registerQQRelay' not in bootstrap_source:
    bootstrap_anchor = '    const outboundHandler = createOutboundHandler(manager, sender, config, logger, toolsRegistry);'
    if bootstrap_source.count(bootstrap_anchor) != 1:
        raise SystemExit('Official bootstrap differs from the reviewed version; no patch written')
    bootstrap_source = "import { registerQQRelay } from 'dsh-hymemory-qq/bridge';\n" + bootstrap_source.replace(
        bootstrap_anchor,
        '    registerQQRelay(ctx, sender, config.appId);\n' + bootstrap_anchor,
        1,
    )
    bootstrap_path.write_text(bootstrap_source, encoding='utf-8', newline='\n')
vision_path = root / 'dist/media/vision-tool.js'
vision_source = vision_path.read_text(encoding='utf-8')
vision_anchor = '        model: vision.model,\n        messages: [message],'
vision_replacement = "        model: vision.model,\n        reasoningEffort: 'off',\n        messages: [message],"
if vision_replacement not in vision_source:
    if vision_source.count(vision_anchor) != 1:
        raise SystemExit('Official vision source differs from the reviewed version; no patch written')
    vision_path.write_text(vision_source.replace(vision_anchor, vision_replacement, 1), encoding='utf-8', newline='\n')
path = root / 'dist/transport/inbound.js'
source = path.read_text(encoding='utf-8')
if 'beforeQQTurn' in source:
    print('QQ memory hooks already present')
    raise SystemExit(0)


def replace_once(old, new):
    global source
    if source.count(old) != 1:
        raise SystemExit('Official plugin source differs from the reviewed version; no patch written')
    source = source.replace(old, new, 1)


replace_once("import { createUserMessage }", "import { beforeQQTurn, afterQQTurn, IDENTITY, MEMORY_CONTEXT } from 'dsh-hymemory-qq/bridge';\nimport { createUserMessage }")
replace_once(
    '    logger.info(`Processing: scope=${scope} peerId=${peerId} body="${agentBody.slice(0, 200)}"`);',
    '''    const identity = { appId: config.appId, scope, peerId };
    const memory = await beforeQQTurn({ identity, text: msg.content || '', messageId: msg.messageId });
    if (memory.handled) {
        await bot.sendMarkdown(replyTarget, memory.reply);
        return;
    }
    logger.info(`Processing: scope=${scope} (message content omitted)`);''',
)
replace_once(
    '    const content = [{ type: \'text\', text: agentBody }];',
    '''    record.agent[IDENTITY] = identity;
    record.agent[MEMORY_CONTEXT] = memory.context || '';
    const content = [{ type: 'text', text: agentBody }];''',
)
replace_once(
    "        logger.warn(`whenIdle rejected: ${err instanceof Error ? err.message : String(err)}`);\n    }\n}",
    "        logger.warn(`whenIdle rejected: ${err instanceof Error ? err.message : String(err)}`);\n    }\n    await afterQQTurn({ identity, text: msg.content || '', messageId: msg.messageId, sessionId: record.sessionId });\n}",
)
path.write_text(source, encoding='utf-8', newline='\n')
print('Prepared official QQ inbound hooks for pnpm patch-commit')
