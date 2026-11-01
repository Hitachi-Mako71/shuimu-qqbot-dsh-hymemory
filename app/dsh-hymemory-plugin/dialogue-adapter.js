import { compileDialogueTurn, generateDialogueReply, analyzeDialogueTurn } from './dialogue-engine/index.js';
import { actContract } from './dialogue-engine/dialogue-policy.js';
import { model } from './companion.js';
import { actorLabel } from './identity.js';

export function nativeDialoguePrompt(identity, { text = '', quotedText = '', hasImages = false } = {}) {
  const scope=identity.scope === 'group' ? 'group' : 'private';
  const speaker=scope === 'group' ? actorLabel(identity) : '当前发言者';
  const analysis=analyzeDialogueTurn({text,quotedText,hasImages});
  const plan={act:analysis.act,target:speaker,focus:'',emotion:'',clarificationNecessary:false};
  const turn=compileDialogueTurn({scope,text,speaker,hasImages,
    quoted:quotedText ? { text:quotedText, speaker:'引用对象由平台上下文核验' } : null }, { variant:'C',includeStyle:false,plan });
  return {
    policy:{act:plan.act,basis:analysis.basis,contract:actContract(plan)},
    context:'【本轮对话资料；原始消息与实际图片优先】\n'+JSON.stringify(turn.data),
  };
}

export function nativeDialogueContext(identity,turn={}) {
  const prompt=nativeDialoguePrompt(identity,turn);
  return '【对话模块本轮判断】'+JSON.stringify(prompt.policy)+'\n'+prompt.context;
}

export async function generateGroupDialogue(system, context, maxTokens, sessionId) {
  const data = JSON.parse(context);
  const selected = data.selectedMessage || {};
  const quote = data.quotedMessage;
  const result = await generateDialogueReply({ scope:'group', text:selected.text,
    speaker:selected.label || '当前群友', turns:data.recentGroupConversation,
    quoted:quote ? {speaker:quote.label,text:quote.text} : null,
    addressedTo:data.replyTargetKind, context, hostSystem:system }, {
    generate:({system,user,maxTokens,sessionId}) => model(system,user,maxTokens,sessionId),
    maxTokens, sessionId, separatePlanning:false, postAlign:false,
  });
  return result.action === 'reply' ? result.text : '<NO_REPLY>';
}
