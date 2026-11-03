// Only self-contained concept questions can skip optional long-term recall.
// Recent conversation remains available; personal/history/deictic tasks retain it.
export function isStandaloneKnowledgeQuery(value) {
  const text=String(value||'').replace(/<@!?[^>]+>|<qqbot-at-user\b[^>]*\/>/g,'').trim();
  if(!text||text.length>160||/[\r\n]|https?:\/\//i.test(text))return false;
  if(/我|你|咱|群里|本群|上次|以前|之前|刚才|刚刚|记得|记忆|原话|说过|提过|聊过|约定|答应|这|那|它|该文件|附件/.test(text))return false;
  return /^(?:什么是|(?:请)?(?:解释|介绍|讲解)(?:一下|下)?)\s*[^？?。！!；;]{1,120}[？?。！!\s]*$/u.test(text)
    || /^[^？?。！!；;]{1,120}(?:是指什么|是什么|是什么意思)[？?。！!\s]*$/u.test(text);
}
