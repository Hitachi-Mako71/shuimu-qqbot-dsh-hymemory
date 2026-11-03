// Only self-contained knowledge/calculation tasks skip optional long-term recall.
// Recent conversation remains available; personal/history/deictic tasks retain it.
export function isStandaloneKnowledgeQuery(value) {
  const text=String(value||'').replace(/<@!?[^>]+>|<qqbot-at-user\b[^>]*\/>/g,'').trim();
  const calculation=text.replace(/^(?:柚柚|水木|公主)[，,：:\s]+/u,'');
  if(/[+*/×÷-]/u.test(calculation)&&/^(?:计算\s*)?[0-9.()（）+*/×÷\s-]+(?:等于几|等于多少|等于|=)?[？?。！!\s]*$/u.test(calculation))return true;
  if(!text||text.length>160||/[\r\n]|https?:\/\//i.test(text))return false;
  if(/我|你|咱|群里|本群|上次|以前|之前|刚才|刚刚|记得|记忆|原话|说过|提过|聊过|约定|答应|这|那|它|该文件|附件/.test(text))return false;
  return /^(?:如何|怎么|怎样)(?:安装|配置|使用|设置|运行|部署|训练|编译|调用|实现|创建|连接|计算|理解|区分)\s*[^？?。！!；;]{1,100}[？?。！!\s]*$/u.test(text)
    || /^(?:什么是|(?:请)?(?:解释|介绍|讲解)(?:一下|下)?)\s*[^？?。！!；;]{1,120}[？?。！!\s]*$/u.test(text)
    || /^[^？?。！!；;]{1,120}(?:是指什么|是什么|是什么意思)[？?。！!\s]*$/u.test(text);
}
