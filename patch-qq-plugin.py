"""Add explicit QQ lifecycle hooks to the pinned official plugin via pnpm patch."""
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
manifest = json.loads((root / 'package.json').read_text(encoding='utf-8'))
if manifest.get('version') != '0.5.2':
    raise SystemExit('Only @tencent-connect/dsh-qqbot 0.5.2 is supported; refusing an unreviewed patch')
middleware_path = root / 'dist/gateway/middleware-setup.js'
middleware = middleware_path.read_text(encoding='utf-8')
if 'groupParticipationGate' not in middleware:
    anchor = '''    bot.use(mentionGate({
        requireMentionInGroup: config.requireMention,
    }));'''
    if middleware.count(anchor) != 1:
        raise SystemExit('Official mention middleware differs; no group patch written')
    middleware = "import { groupParticipationGate } from 'dsh-hymemory-qq/bridge';\n" + middleware.replace(anchor, '''    bot.use(mentionGate({ requireMentionInGroup: false, passthrough: true }));
    bot.use((mCtx, next) => groupParticipationGate(mCtx, next, config.appId));''', 1)
    middleware = middleware.replace('messageFilter({ skipSelfEcho: false })', 'messageFilter({ skipSelfEcho: true })')
    middleware_path.write_text(middleware, encoding='utf-8', newline='\n')
if 'rememberQQMedia' not in middleware:
    middleware = middleware.replace("import { groupParticipationGate }", "import { groupParticipationGate, rememberQQMedia }")
    media_anchor = '    bot.use(historyBuffer({'
    if middleware.count(media_anchor) != 1:
        raise SystemExit('Official middleware differs; no image reference cache patch written')
    middleware = middleware.replace(media_anchor, '    bot.use((mCtx, next) => rememberQQMedia(mCtx, next, config.appId));\n' + media_anchor, 1)
    middleware_path.write_text(middleware, encoding='utf-8', newline='\n')
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
if 'sendProactiveMarkdown:' not in bootstrap_source:
    proactive_anchor = '    const sender = {\n'
    if bootstrap_source.count(proactive_anchor) != 1:
        raise SystemExit('Official sender source differs from the reviewed version; no patch written')
    bootstrap_source = bootstrap_source.replace(proactive_anchor, proactive_anchor + "        sendProactiveMarkdown: (target, content) => bot.sendMarkdown({ scope: target.scope, targetId: target.targetId }, content),\n", 1)
    bootstrap_path.write_text(bootstrap_source, encoding='utf-8', newline='\n')
if 'sendCodexImage:' not in bootstrap_source:
    image_anchor = '    const sender = {\n'
    if bootstrap_source.count(image_anchor) != 1:
        raise SystemExit('Official sender differs; no image patch written')
    bootstrap_source = bootstrap_source.replace(image_anchor, image_anchor + '        sendCodexImage: (target, source, opts) => bot.sendImage(target, source, opts),\n', 1)
    bootstrap_path.write_text(bootstrap_source, encoding='utf-8', newline='\n')
if 'rememberQQBotSelf(config.appId, event)' not in bootstrap_source:
    ready_anchor = "    bot.on('ready', () => {"
    if bootstrap_source.count(ready_anchor) != 1:
        raise SystemExit('Official ready handler differs; no self-mention patch written')
    bootstrap_source = bootstrap_source.replace("import { registerQQRelay } from 'dsh-hymemory-qq/bridge';", "import { registerQQRelay, rememberQQBotSelf } from 'dsh-hymemory-qq/bridge';")
    bootstrap_source = bootstrap_source.replace(ready_anchor, "    bot.on('ready', (event) => {\n        rememberQQBotSelf(config.appId, event);", 1)
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
had_hooks = 'beforeQQTurn' in source


def replace_once(old, new):
    global source
    if had_hooks:
        return
    if source.count(old) != 1:
        raise SystemExit('Official plugin source differs from the reviewed version; no patch written')
    source = source.replace(old, new, 1)


replace_once("import { createUserMessage }", "import { beforeQQTurn, afterQQTurn, IDENTITY, MEMORY_CONTEXT, configureQQResponseSpeed } from 'dsh-hymemory-qq/bridge';\nimport { createUserMessage }")
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
    configureQQResponseSpeed(record.agent);
    const content = [{ type: 'text', text: agentBody }];''',
)
replace_once(
    "        logger.warn(`whenIdle rejected: ${err instanceof Error ? err.message : String(err)}`);\n    }\n}",
    "        logger.warn(`whenIdle rejected: ${err instanceof Error ? err.message : String(err)}`);\n    }\n    await afterQQTurn({ identity, text: msg.content || '', messageId: msg.messageId, sessionId: record.sessionId });\n}",
)
if 'prepareQQImages' not in source:
    source = source.replace('configureQQResponseSpeed }', 'configureQQResponseSpeed, prepareQQImages }', 1)
    source = source.replace('classifyContentType, isVoiceContentType, }', 'classifyContentType, isVoiceContentType, downloadMediaAttachments, }', 1)
    source = source.replace('    const agentBody = assembleAgentBody(msg, mwState, scope, logger);', "    const agentBody = assembleAgentBody(msg, mwState, scope, logger) || ((mwState.qqMedia?.quoteAttachments?.length || mwState.quote?.attachments?.length) ? '请查看用户本轮引用的图片。' : null);", 1)
    source = source.replace("messageId: msg.messageId });\n    if (memory.handled)", "messageId: msg.messageId, quotedText: mwState.quote?.text || '', hasImages: (msg.attachments || []).some(a => /^image(?:\\/|$)/.test(a.content_type || '')) || Boolean(mwState.quote?.attachments?.length || mwState.qqMedia?.quoteAttachments?.length) });\n    if (memory.handled)", 1)
    image_anchor = "    const content = [{ type: 'text', text: agentBody }];"
    if source.count(image_anchor) != 1:
        raise SystemExit('Official inbound content differs; no direct image patch written')
    source = source.replace(image_anchor, "    const media = await prepareQQImages({ identity, message: msg, state: mwState, download: (items) => downloadMediaAttachments(items, config.media, logger) });\n    const content = [{ type: 'text', text: agentBody }, ...media.blocks];", 1)
path.write_text(source, encoding='utf-8', newline='\n')
print('Prepared official QQ inbound hooks for pnpm patch-commit')
