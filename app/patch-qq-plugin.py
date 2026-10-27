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
if 'allowQQGroupObservation' not in middleware:
    middleware = middleware.replace('groupParticipationGate, rememberQQMedia }', 'groupParticipationGate, rememberQQMedia, allowQQGroupObservation }', 1)
    middleware = middleware.replace('bot.use((mCtx, next) => rememberQQMedia(mCtx, next, config.appId));',
                                    'bot.use((mCtx, next) => allowQQGroupObservation(mCtx, config.appId) ? rememberQQMedia(mCtx, next, config.appId) : next());', 1)
    middleware = middleware.replace('    bot.use(historyBuffer({', '    const qqHistory = historyBuffer({', 1)
    anchor = '            return historyGroupKey(config.appId, gid);\n        },\n    }));'
    if middleware.count(anchor) != 1:
        raise SystemExit('Official history middleware differs; no collection permission patch written')
    middleware = middleware.replace(anchor, '            return historyGroupKey(config.appId, gid);\n        },\n    });\n    bot.use((mCtx, next) => allowQQGroupObservation(mCtx, config.appId) ? qqHistory(mCtx, next) : next());', 1)
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
if 'prepareQQAgent' not in source:
    source = source.replace('prepareQQImages }', 'prepareQQImages, prepareQQAgent, isolateQQFiles, stageQQDownloads, qqWorkspace }', 1)
    old_identity = '    const identity = { appId: config.appId, scope, peerId };\n'
    if source.count(old_identity) != 1:
        raise SystemExit('Official identity source differs; no boundary patch written')
    source = source.replace(old_identity, '', 1)
    source = source.replace("    const peerId = scope === 'group' ? (msg.groupOpenid ?? msg.senderId) : msg.senderId;",
                            "    const peerId = scope === 'group' ? msg.groupOpenid : msg.senderId;\n    if (!peerId || !msg.senderId) return;\n    const identity = { appId: String(config.appId), scope, peerId, senderId: msg.senderId };\n    isolateQQFiles(identity, mwState);", 1)
    source = source.replace('    record.agent[IDENTITY] = identity;', '    await prepareQQAgent(record.agent, identity);', 1)
    source = source.replace('download: (items) => downloadMediaAttachments(items, config.media, logger)',
                            'mediaRoot: qqWorkspace(identity), download: async (items) => stageQQDownloads(identity, await downloadMediaAttachments(items, config.media, logger))', 1)
    source = source.replace('sessionId: record.sessionId });', "sessionId: record.sessionId, mode: memory.mode || 'chat' });", 1)
path.write_text(source, encoding='utf-8', newline='\n')

session_path = root / 'dist/session/session-manager.js'
session_source = session_path.read_text(encoding='utf-8')
if 'qqWorkspace' not in session_source:
    anchor = 'cwd: this.config.cwd || process.cwd(),'
    if session_source.count(anchor) != 2:
        raise SystemExit('Official session workspace source differs; no patch written')
    session_source = "import { qqWorkspace } from 'dsh-hymemory-qq/bridge';\n" + session_source
    session_source = session_source.replace(anchor, 'cwd: qqWorkspace({ appId: String(this.config.appId), scope: record.scope, peerId: record.peerId, senderId: record.senderId }),', 1)
    session_source = session_source.replace(anchor, 'cwd: qqWorkspace({ appId: String(this.config.appId), scope, peerId, senderId }),', 1)
    session_path.write_text(session_source, encoding='utf-8', newline='\n')

send_path = root / 'dist/media/send-file-tool.js'
send_source = send_path.read_text(encoding='utf-8')
if 'const currentCwd =' not in send_source:
    old = 'const absPath = resolve(file_path);'
    if send_source.count(old) != 1:
        raise SystemExit('Official file path source differs; no patch written')
    send_source = send_source.replace(old, "const currentCwd = exec.agent ? ctx.get('workingDirectory').get(exec.agent.session) : cwd;\n            const absPath = resolve(currentCwd, file_path);", 1)
    send_source = send_source.replace('isPathAllowed(absPath, config.sendFile, cwd)', 'isPathAllowed(absPath, config.sendFile, currentCwd)', 1)
    send_path.write_text(send_source, encoding='utf-8', newline='\n')
# V1.2: durable raw journal before any history, filtering, merging or Agent work.
if 'archiveQQInbound' not in middleware:
    middleware = "import { archiveQQInbound, mergeQQEvidence } from 'dsh-hymemory-qq/bridge';\n" + middleware
    anchor = '    // 4. 群历史缓冲'
    if middleware.count(anchor) != 1:
        raise SystemExit('Official access/history boundary differs; no evidence patch written')
    middleware = middleware.replace(anchor, '    bot.use((mCtx, next) => archiveQQInbound(mCtx, next, String(config.appId)));\n' + anchor, 1)
    middleware = middleware.replace("        strategy: 'merge',", "        strategy: 'merge',\n        onMerge: mergeQQEvidence,", 1)
    middleware_path.write_text(middleware, encoding='utf-8', newline='\n')
if 'instrumentQQEvidence' not in bootstrap_source:
    bootstrap_source = "import { instrumentQQEvidence } from 'dsh-hymemory-qq/bridge';\n" + bootstrap_source
    anchor = '    // ── 中间件链 ──'
    if bootstrap_source.count(anchor) != 1:
        raise SystemExit('Official SDK creation boundary differs; no evidence patch written')
    bootstrap_source = bootstrap_source.replace(anchor, '    instrumentQQEvidence(bot, String(config.appId));\n' + anchor, 1)
    bootstrap_path.write_text(bootstrap_source, encoding='utf-8', newline='\n')
if 'bindQQEvidence' not in source:
    source = "import { bindQQEvidence } from 'dsh-hymemory-qq/bridge';\n" + source
    anchor = '    await prepareQQAgent(record.agent, identity);'
    if source.count(anchor) != 1:
        raise SystemExit('Official Agent boundary differs; no evidence patch written')
    source = source.replace(anchor, anchor + '\n    bindQQEvidence(record.agent, mwState.qqEvidence, record.sessionId);', 1)
    path.write_text(source, encoding='utf-8', newline='\n')
outbound_path = root / 'dist/transport/outbound.js'
outbound = outbound_path.read_text(encoding='utf-8')
if 'withQQEvidence' not in outbound:
    outbound = "import { withQQEvidence, captureQQDraft } from 'dsh-hymemory-qq/bridge';\n" + outbound
    anchor = '        switch (event.type) {'
    end = "        }\n    }\n    /** 流式文本增量"
    if outbound.count(anchor) != 1 or outbound.count(end) != 1:
        raise SystemExit('Official outbound router differs; no evidence patch written')
    outbound = outbound.replace(anchor, '        return withQQEvidence(record.agent, () => {\n        captureQQDraft(record.agent, raw, session.header.id);\n' + anchor, 1)
    outbound = outbound.replace(end, "        }\n        });\n    }\n    /** 流式文本增量", 1)
    outbound_path.write_text(outbound, encoding='utf-8', newline='\n')
if 'retireQQPrivacySession' not in session_source:
    session_source = "import { retireQQPrivacySession, privacySessionId } from 'dsh-hymemory-qq/bridge';\n" + session_source
    anchor = '    async getOrCreate(scope, peerId, senderId, replyTarget) {\n        const key = this.sessionKey(scope, peerId);'
    if session_source.count(anchor)!=1:
        raise SystemExit('Official session lifecycle differs; no privacy patch written')
    session_source=session_source.replace(anchor,anchor+'\n        const qqPrivacyIdentity = { appId: String(this.config.appId), scope, peerId, senderId };\n        await retireQQPrivacySession(this, qqPrivacyIdentity);',1)
    anchor='const sessionId = SessionId(this.currentSessionId(key));'
    if session_source.count(anchor)!=1: raise SystemExit('Official session ID differs; no privacy patch written')
    session_source=session_source.replace(anchor,'const sessionId = SessionId(privacySessionId(key, qqPrivacyIdentity, this.currentSessionId(key)));',1)
    session_path.write_text(session_source,encoding='utf-8',newline='\n')
if 'retireQQPrivacySession' not in source:
    source="import { retireQQPrivacySession } from 'dsh-hymemory-qq/bridge';\n"+source
    source=source.replace('    if (memory.handled) {','    await retireQQPrivacySession(manager, identity);\n    if (memory.handled) {',1)
    source=source.replace('bindQQEvidence(record.agent, mwState.qqEvidence, record.sessionId);','bindQQEvidence(record.agent, mwState.qqEvidence, record.sessionId, memory.sourceIds || []);',1)
    path.write_text(source,encoding='utf-8',newline='\n')
# V2.1 history answering is read-only even if archived text asks for tools.
if "Symbol.for('qqbot.history.readonly')" not in source:
    anchor="    record.agent[MEMORY_CONTEXT] = memory.context || '';"
    if source.count(anchor)!=1: raise SystemExit('Official memory assignment differs; no history guard patch written')
    source=source.replace(anchor,anchor+"\n    record.agent[Symbol.for('qqbot.history.readonly')] = memory.historyOnly === true;",1)
    path.write_text(source,encoding='utf-8',newline='\n')
if 'coalesceQQMessages' not in middleware_path.read_text(encoding='utf-8'):
    coalescing=middleware_path.read_text(encoding='utf-8')
    coalescing="import { coalesceQQMessages } from 'dsh-hymemory-qq/bridge';\n"+coalescing
    coalescing=coalescing.replace('    const slash = slashCommand({','    bot.use(coalesceQQMessages({maxQueue:config.maxQueue}));\n    const slash = slashCommand({',1)
    middleware_path.write_text(coalescing,encoding='utf-8',newline='\n')
print('Prepared official QQ lifecycle hooks for pnpm patch-commit')
