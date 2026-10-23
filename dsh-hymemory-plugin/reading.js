import { namespace } from './companion-state.js';

// A daily-life model is never a book source. Only the reading ledger can publish
// a reading reflection; this guard also covers check-ins and ambient group chat.
export const readingClaim = text => /读(?:到|过|着|了|完|起|一|书|小说|诗|文章|故事)|(?:看|翻)(?:了|完|过|着|开|到|看|阅).{0,16}(?:书|小说|诗|散文|文章)|(?:阅读|读书).{0,8}(?:时|后|中|感悟|发现)/s.test(text || '');
export const readingTopic = text => /读书|读完|读到|阅读|书名|什么书|哪本书|哪句话|原句|那句话|读后感|书中|这本书|查读书记忆/.test(text || '');

async function request(route, owner, extra = {}, timeout = 5000) {
  const base = new URL(process.env.MEMORY_BRIDGE_URL || 'http://127.0.0.1:8765');
  if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname)) throw Error('ReadingMustBeLocal');
  const response = await fetch(new URL(`/reading/${route}`, base), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MEMORY_BRIDGE_TOKEN}` },
    body: JSON.stringify({ user_id: owner, ...extra }), signal: AbortSignal.timeout(timeout),
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw Error('ReadingUnavailable');
  return data;
}
const position = n => `PDF第${n.pages[0]}${n.pages.length > 1 ? `—${n.pages.at(-1)}` : ''}页`;
export function readingMessage(note) {
  return `刚读了《${note.title}》${position(note)}的一段内容。\n${note.reflection}`;
}
const readingRule = '\n【真实读书规则】只有已导入原书、完成逐段阅读并保存的阅读笔记，才是读过的证据。旧日常里的读书故事不是真实阅读记录；不能给它们补书名或引文。没有本会话阅读笔记就说尚无已保存的阅读记录；不能凭书名、旧回复或模型知识声称读过。不要自发创作新的读书经历。';
function renderReading(data, detailed) {
  if (!data.notes?.length) return readingRule;
  const notes = data.notes.slice(0, detailed ? 3 : 1).map(n => ({ id: n.id, title: n.title, author: n.author, pages: n.pages,
    summary: n.summary?.slice(0, detailed ? 350 : 180), reflection: n.reflection?.slice(0, detailed ? 300 : 180),
    evidence: n.evidence?.slice(0, 2), links: n.links?.slice(0, 2), questions: n.questions?.slice(0, 2) }));
  const current = data.books.find(b => b.book === data.notes[0].book);
  return readingRule + '\n【当前QQ身份的真实阅读资料；感悟是读者理解，不是用户事实或底层人设】\n' + JSON.stringify({ notes,
    progress: current ? { title: current.title, readSegments: current.cursor, totalSegments: current.total } : null,
    currentUnderstanding: current?.overview?.slice(0, detailed ? 1200 : 600) || data.notes[0].overview?.slice(0, detailed ? 1200 : 600) });
}
export async function readingContext(key, query = '') {
  const detailed = readingTopic(query);
  try {
    const data = await request('recall', key, { query: detailed ? query : '', limit: detailed ? 3 : 1 }, detailed ? 3000 : 1000);
    return renderReading(data, detailed);
  } catch { return readingRule + '\n本轮阅读账本不可用，不声称已查到或保存。'; }
}
export async function beforeReadingTurn({ identity, text = '', hasImages = false }) {
  if (hasImages) return null;
  const key = namespace(identity), input = text.trim().replace(/^(?:柚柚|水木|大肥鱼)[，,：:\s]*/, '');
  if (!key) return null;
  const next = input.match(/^(?:开始读书|继续读书|去读书|读下一段|阅读下一段|读书吧)(?:[：:\s]+(.+))?[。！!]?$/);
  const control = /^(?:书架|阅读书架|读书进度|阅读进度|暂停阅读|开启阅读|恢复阅读|读书感悟|读后感|查读书记忆(?:\s.*)?)$/.test(input);
  const followup = /^(?:你)?(?:在读什么书|最近读了什么书|读的是什么书|什么书|哪本书|是哪本书|书名是什么|哪句话|原句是什么)[？?。\s]*$/.test(input);
  const shareRequest = /(?:讲|说|分享).*(?:读书|读后感)|(?:读书|阅读).*(?:趣事|感悟|心得)/.test(input);
  const discussion = !next && !control && !followup && !shareRequest && readingTopic(input);
  if (!next && !control && !followup && !shareRequest && !discussion) return null;
  try {
    if (next) {
      const data = await request('next', key, { book: next[1]?.trim() || '' });
      return { handled: true, reply: data.queued ? `我会从《${data.title}》已保存的书签接着读第${data.segment}段。读完并核对笔记后，再与你分享感悟。` : '这个会话没有未读的书。请先在控制台“阅读书房”导入书籍；私聊书架不会自动共享到群里。' };
    }
    if (/^(?:暂停阅读|开启阅读|恢复阅读)$/.test(input)) {
      const data = await request('auto', key, { enabled: input !== '暂停阅读' });
      return { handled: true, reply: data.books.length ? (input === '暂停阅读' ? '已暂停后续自动阅读；正在读的一段会先保存笔记，不再开启下一段。' : '已恢复自动阅读，会从保存的书签继续。') : '这个会话的书架还没有书。' };
    }
    const data = await request('recall', key, { query: input.replace(/^查读书记忆\s*/, ''), limit: discussion ? 3 : 5 });
    if (discussion) return { handled: false, readingAvailable: Boolean(data.notes.length), context: renderReading(data, true) };
    if (/^(?:书架|阅读书架|读书进度|阅读进度)$/.test(input)) return { handled: true, reply: data.books.map(b => `《${b.title}》${b.author}\n已读${b.cursor}/${b.total}段，${b.cursor ? `书签到PDF第${b.lastPage}页` : '尚未开始'}；Hy Memory确认${b.indexed}段。${b.auto ? '自动阅读开启' : '自动阅读暂停'}${b.error ? '；上一段未通过读取或核对，进度未推进' : ''}`).join('\n\n') || '书架为空。可以从本机控制台的“阅读书房”导入PDF、TXT或Markdown。' };
    if (!data.notes.length) {
      if (followup) return null; // Old fictional snippets stay unknown; never invent a provenance.
      if (shareRequest && data.books.some(b => !b.complete)) {
        await request('next', key);
        return { handled: true, reply: '我先从书签接着读一小段。等原文和感悟都核对、保存好了，再认真与你聊，不先编一段读书经历。' };
      }
      return { handled: true, reply: '还没有保存并核对过的真实读书笔记。我不会为旧的读书故事补造书名或细节。' };
    }
    if (followup && /书/.test(input)) return { handled: true, reply: `实际阅读记录里是《${data.notes[0].title}》${data.notes[0].author}，这条笔记来自${position(data.notes[0])}。旧日常中未记书名的故事，不能据此认成这本书。` };
    if (followup) return { handled: true, reply: data.notes[0].evidence.map(e => `《${data.notes[0].title}》PDF第${e.page}页：“${e.quote}”`).join('\n') };
    return { handled: true, reply: data.notes.slice(0, input.startsWith('查') ? 3 : 1).map(n => `${readingMessage(n)}\n（阅读笔记已存，${n.indexStatus === 'done' ? 'Hy Memory已确认' : 'Hy Memory后台待同步'}）`).join('\n\n') };
  } catch { return { handled: true, reply: '阅读资料暂时不可用，这次没有推进书签，也没有确认新的读书感悟。稍后可用“读书进度”查看。' }; }
}
export async function pendingReadingShare(key) {
  try { return (await request('share', key)).note; } catch { return null; }
}
export async function finishReadingShare(key, note, receipt) {
  await request('share', key, { note_id: note.id, token: note.token, receipt });
}
