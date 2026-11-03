// Current attachment work uses the identity-scoped workspace, not chat-history
// lookup. Explicit personal-history dependencies must still reach memory.
export function isCurrentFileTask(value) {
  const text=String(value||'').trim();
  if(/查历史|查原话|展开原话|还记得|上次|之前|以前|(?:我的|我个人的).{0,12}(?:偏好|习惯|喜好|要求)|我们的约定|根据记忆|结合记忆|约好|答应过/.test(text))return false;
  const filename=/\.(?:md|txt|pdf|docx?|xlsx?|csv|json|ya?ml|log|zip)(?=$|[\s，。！？、"'）)])/i.test(text);
  if(!filename&&!/文件|附件|文档/.test(text))return false;
  if(!/读|打开|总结|概括|分析|翻译|提取|查看|检查/.test(text))return false;
  return filename||/这|那|刚才|刚发|当前|本轮|已发|上传|收到|[两二三几]份/.test(text);
}
