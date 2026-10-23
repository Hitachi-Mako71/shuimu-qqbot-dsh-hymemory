import { loadWorld, canon, worldContext, correctFact, searchWorld, memoryRequest } from './fiction-ledger.js';

export function dailyInvitation(text) {
  if (/^(?:我|我们)|上次|刚才|方才|之前|前面|那句|那本|还记得/.test(text)) return false;
  return /(?:今天|最近|今晚|现在|这会儿).*(?:什么.*(?:趣事|有趣|好玩)|有.*(?:趣事|有趣的事)|在做什么|忙什么|干什么|做了什么)/.test(text)
    || /(?:讲|说|分享).*(?:你|柚柚).*(?:日常|生活|趣事)/.test(text);
}
export function fictionQuestion(text, world) {
  if (/^(?:记住|\/remember)/.test(text) || /我家|我自己|现实中|现实里/.test(text)) return false;
  if (/(?:什么书|哪本书|什么句子|哪句|书名|原句|那句|后来呢|然后呢)/.test(text)
      && (Object.values(world.events || {}).some(e => !e.quarantined) || /你|柚柚|那|刚才|是什么书什么句子/.test(text))) return true;
  if ((text.includes('你') || (canon().protected.nicknames || []).some((name) => text.includes(name)))
      && /小猫|猫咪|花园|茉莉|书房|舞会|宫廷|日记|日常|生活|练琴|点心|旧书/.test(text)
      || /(?:小猫|花园|宫廷|剧情|舞会).*(?:叫什么|名字|上次|后来|进展|怎样了|怎么样)/.test(text)) return true;
  return Object.values(world.facts).some((f) => /^(pet|npc|object|book)\./.test(f.key) && f.value.length >= 2 && text.includes(f.value));
}
export async function fictionCommands(key, text) {
  const world = loadWorld(key);
  if (text === '生活设定') {
    const base = canon();
    const facts = Object.values(world.facts).map((f) => `${f.id}｜${f.label}：${f.value}\n  来源：${f.source.eventId || f.source.type}，版本${f.revision}`);
    return { handled: true, reply: `【底层人设 · 固定配置】\n${base.protected.identity}\n称呼：${(base.protected.nicknames || ['柚柚']).join('、')}\n${base.protected.preferences}\n\n【已确认的世界设定】\n${facts.join('\n') || '还没有从故事中确认新设定，暂时保持未知。'}\n\n更正已有设定：更正生活设定 F编号：新内容。底层人设需在本机人格配置中修改。` };
  }
  if (text === '事件进度') {
    const open = Object.values(world.threads).filter((t) => ['planned', 'active'].includes(t.status));
    const closed = Object.values(world.threads).filter((t) => ['completed', 'canceled'].includes(t.status)).slice(-5);
    const render = (items) => items.map((t) => `- ${t.title}［${t.status}］：${t.progress}\n  来源：${t.source.eventId}`).join('\n') || '暂无。';
    return { handled: true, reply: `【进行中的事情】\n${render(open)}\n\n【最近已结束】\n${render(closed)}` };
  }
  if (text === '生活记忆状态') {
    let remote = 'Hy Memory暂不可用，事实账本和日记仍在本机。';
    try {
      const result = await memoryRequest('status', { user_id: key, epoch: world.epoch });
      remote = `Hy Memory确认写入并回读：${result.records.done || 0} 条；待处理：${(result.records.pending || 0) + (result.records.running || 0)} 条。`;
    } catch {}
    return { handled: true, reply: `底层人设：固定配置，不由剧情自动改写。\n世界设定：${Object.keys(world.facts).length} 条\n情景记忆：${Object.values(world.events).filter((e) => !e.quarantined).length} 段\n进行中事件：${Object.values(world.threads).filter((t) => ['planned', 'active'].includes(t.status)).length} 件\n旧日记待整理：${world.migration.length} 段\n待核对旧日记：${Object.values(world.events).filter((e) => e.quarantined).length} 段\n本机待提交索引：${world.pendingIndex.length} 条\n${remote}\n虚构和你的真实记忆使用不同空间。` };
  }
  if (text === '待核对日记') {
    const items = Object.values(world.events).filter((e) => e.quarantined);
    return { handled: true, reply: items.length ? items.map((e) => `${e.eventId}｜${e.date} ${e.time}\n${e.summary}\n原因：${(e.verification.reasons || []).join('；')}`).join('\n\n') : '目前没有需要核对的旧日记。' };
  }
  const correction = text.match(/^更正生活设定\s+(F[a-f0-9]{12})\s*[:：=]\s*(.+)$/s);
  if (correction) {
    if (!Object.values(world.facts).some((f) => f.id === correction[1])) return { handled: true, reply: '没有找到这个设定编号，请先用“生活设定”查看。' };
    const result = correctFact(key, world, correction[1], correction[2]);
    return { handled: true, reply: `已明确更正：${result.label}＝${result.value}。\n账本已保存，版本${result.revision}；Hy Memory索引将后台更新。` };
  }
  if (text.startsWith('更正生活设定')) return { handled: true, reply: '请先用“生活设定”取得F编号，再发送“更正生活设定 F编号：新内容”。' };
  const query = text.match(/^查生活记忆(?:\s*[:：]?\s*(.*))?$/s);
  if (query) {
    const found = await searchWorld(key, world, query[1]?.trim() || '小猫 花园 读书 名字 进行中的事情');
    return { handled: true, reply: `${found.method === 'hy-memory' ? '【Hy Memory召回，已与当前账本核对】' : '【本地账本检索；本次未取得可用的Hy Memory命中】'}\n${found.records.map((r) => `- ${r.content}\n  ID：${r.id}｜来源：${r.meta.source?.eventId || r.meta.source?.type || '账本'}${r.memoryId ? `｜Hy ID：${r.memoryId}` : ''}`).join('\n') || '暂无匹配的虚构记忆。'}\n底层人设可用“生活设定”查看。` };
  }
  return null;
}
export async function fictionContext(key, query) {
  const world = loadWorld(key);
  const found = await searchWorld(key, world, query || '最近日常');
  return `\n【分层虚构记忆：底层配置、已确认设定、事件状态及近期原文】\n${JSON.stringify(worldContext(world))}\n【与当前话题相关的情景记忆，均为虚构】\n${JSON.stringify(found.records)}\n底层人设不能被情景记忆改写；已确认设定和当前事件状态优先于旧情景。追问那本书、那句话时优先核对原文和followups；没记下的细节说明未记录，不能编造或把已有记录一概说成随口编的。普通聊天不另造已发生的日常；想展开新的日常应先由独立日记流程保存、核对，再表达。召回方式：${found.method}。`;
}
