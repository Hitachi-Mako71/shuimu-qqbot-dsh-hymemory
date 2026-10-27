(()=>{
  const visible=e=>!!e&&e.getClientRects().length>0;
  let temporarySeen=false;
  function editor(){
    const candidates=[...document.querySelectorAll('textarea,[contenteditable]')].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&(e.tagName==='TEXTAREA'||['true','plaintext-only',''].includes(e.getAttribute('contenteditable'))));
    const ranked=candidates.map(e=>{const hints=[e.id,e.getAttribute('role'),e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.getAttribute('data-testid')].join(' ');return{element:e,score:/search|搜索|查找/i.test(hints)?-100:(e.id==='prompt-textarea'?100:0)+(e.closest('main')?30:0)+(e.closest('form')?20:0)+(/prompt|composer|message|chat|询问|输入|提问/i.test(hints)?20:0)};}).filter(e=>e.score>=0).sort((a,b)=>b.score-a.score);
    if(!ranked.length||ranked.length>1&&ranked[0].score===ranked[1].score)return null;return ranked[0].element;
  }
  const sendButton=()=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(/send-button/.test(e.dataset.testid||'')||/^(发送|发送提示|发送消息|Send prompt|Send message)$/i.test(e.getAttribute('aria-label')||'')));
  const stopButton=()=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(/stop-button/.test(e.dataset.testid||'')||/stop generating|^stop$|停止生成|停止流式|停止响应|^停止$/i.test(e.getAttribute('aria-label')||'')));
  function state(){
    const modeControls=[...document.querySelectorAll('header button,[role="tab"],button[aria-pressed],button[aria-checked],[role="switch"],[role="radio"],[aria-pressed],[aria-checked],[aria-selected]')].filter(visible).map(element=>{
      const label=(element.innerText||element.getAttribute('aria-label')||element.getAttribute('title')||'').trim();
      const state=['aria-pressed','aria-checked','aria-selected','data-state','data-active'].map(name=>element.getAttribute(name)).find(value=>value!==null);
      const active=state===true||state==='true'||state==='on'||state==='active'||state==='checked'||state==='selected';
      return{label,active,hasState:state!==undefined};
    });
    const isChat=label=>/^(Chat|聊天)(\s|$)/i.test(label),isWork=label=>/^(Work|工作)(\s|$)/i.test(label);
    const chatSelected=modeControls.some(control=>isChat(control.label)&&control.active);
    const workSelected=modeControls.some(control=>isWork(control.label)&&control.active)||/^\/work(?:\/|$)/.test(location.pathname);
    const requested=new URL(location.href).searchParams.get('temporary-chat')==='true',workRequested=new URL(location.href).searchParams.get('yuzu-work')==='true';
    if(workRequested)sessionStorage.setItem('yuzu-chat-work-tab','1');
    const marker=requested&&[...document.querySelectorAll('button,header,[role="status"],h1,h2')].filter(visible).some(e=>/临时聊天|临时对话|Temporary Chat|^Temporary$/i.test((e.innerText||'').trim()));
    const inWork=(workRequested||sessionStorage.getItem('yuzu-chat-work-tab')==='1')&&!workSelected;
    if(!requested)temporarySeen=false;else if(marker)temporarySeen=true;
    const temporary=requested&&temporarySeen;
    const hasExplicitMode=modeControls.some(control=>(isChat(control.label)||isWork(control.label))&&control.hasState);
    const chat=(hasExplicitMode?chatSelected:modeControls.some(control=>isChat(control.label)&&control.active))||temporary||inWork,field=editor();
    const candidates=[...document.querySelectorAll('textarea,[contenteditable]')].map(e=>e.tagName.toLowerCase()+(e.id?'#'+e.id.replace(/[^A-Za-z0-9_-]/g,'').slice(0,28):'')+(visible(e)?':visible':':hidden')).slice(0,3).join(',');
    const status=!field?'input-missing:'+candidates:!chat?'chat-mode-required':inWork?'ready-work':!temporary?'temporary-missing:'+(requested?'requested':'not-requested'):'ready';
    return{ready:!!field&&chat,mode:chat?'chat':'unknown',temporary,work:inWork,status};
  }
  function structuredReply(prompt,nonce){
    if(!/^[a-f0-9-]{36}$/.test(nonce||''))return '';
    const root=document.querySelector('main')||document.body,normalize=s=>String(s||'').replace(/\s+/g,''),key=normalize(prompt);
    const nodes=[...root.querySelectorAll('div,p,pre,code,span,article')].filter(visible);
    const promptNodes=nodes.filter(e=>normalize(e.innerText||e.textContent)===key);
    const known=[...root.querySelectorAll('[data-message-author-role="assistant"]')];
    const candidates=known.length?known.flatMap(e=>[e,...e.querySelectorAll('p,pre,code,div,span')]):nodes.filter(e=>!promptNodes.some(p=>p.contains(e)));
    const replies=new Set();
    for(const element of candidates){
      if(!visible(element)||element.closest('[data-testid*="reasoning"],[class*="reasoning"]'))continue;
      const text=(element.innerText||element.textContent||'').trim();if(text.length>100000||!text.includes(nonce))continue;
      try{
        const raw=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');if(key.includes(normalize(raw)))continue;let value;
        try{value=JSON.parse(raw);}catch{
          // Some rendered replies escape Markdown punctuation. Only repair a
          // final text envelope; tool arguments must always remain strict JSON.
          const repaired=raw.replace(/\\(?:\\|["/bfnrt]|u[0-9a-fA-F]{4}|([*_~`]))/g,(match,punctuation)=>punctuation||match);
          value=JSON.parse(repaired);
          if(value.kind!=='final'||Object.keys(value).sort().join(',')!=='kind,nonce,text')continue;
        }
        if(value.nonce===nonce&&(value.kind==='final'&&typeof value.text==='string'||value.kind==='tools'&&Array.isArray(value.calls)))replies.add(JSON.stringify(value));
      }catch{}
    }
    return replies.size===1?[...replies][0]:'';
  }
  globalThis.YuzuChatDOM={editor,sendButton,stopButton,state,structuredReply};
})();
