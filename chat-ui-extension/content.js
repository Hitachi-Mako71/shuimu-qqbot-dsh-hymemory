(()=>{
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let busy=false;
  const {editor,sendButton,stopButton,state,structuredReply}=globalThis.YuzuChatDOM;
  async function complete(job){
    const report=async payload=>chrome.runtime.sendMessage({type:'complete',id:job.id,lease:job.lease,...payload});
    try{
      if(job.prepared)throw Error('CHAT_UI_PAGE_RELOADED');
      if(Date.now()>job.expiresAt)throw Error('CHAT_UI_JOB_EXPIRED');
      for(let i=0;i<60&&(!editor()||!(state().temporary||state().work));i++)await sleep(300);
      const before=state();if(before.mode!=='chat'||!before.ready||job.purpose==='work'&&!before.work||job.purpose!=='work'&&!before.temporary)throw Error('CHAT_UI_NOT_CHAT');
      if((editor().innerText||editor().value||'').trim())throw Error('CHAT_UI_DRAFT_PRESENT');
      await chrome.runtime.sendMessage({type:'prepared',id:job.id});
      const uploadFiles=job.files?.length?job.files:job.images||[];
      if(uploadFiles.length){
        const input=document.querySelector('input[type="file"]');if(!input)throw Error('CHAT_UI_FILE_UPLOAD_UNAVAILABLE');const transfer=new DataTransfer();
        for(let i=0;i<uploadFiles.length;i++){const file=uploadFiles[i],extension=file.type==='image/jpeg'?'jpg':(file.name?.split('.').pop()||file.type.split('/')[1]);if(!/^[a-z0-9]{1,8}$/i.test(extension))throw Error('CHAT_UI_FILE_UNSUPPORTED');const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));transfer.items.add(new File([bytes],file.name||'qq-attachment-'+(i+1)+'.'+extension,{type:file.type}));}
        input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await sleep(1000);
      }
      const field=editor();field.focus();if(field instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,job.prompt);field.dispatchEvent(new Event('input',{bubbles:true}));}
      else{field.textContent='';const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(field);selection.removeAllRanges();selection.addRange(range);if(!document.execCommand('insertText',false,job.prompt)){field.textContent=job.prompt;field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:job.prompt}));}}
      for(let i=0;i<100&&(!sendButton()||sendButton().disabled);i++)await sleep(200);
      if(!sendButton()||sendButton().disabled)throw Error('CHAT_UI_SEND_DISABLED');
      if(state().mode!=='chat')throw Error('CHAT_UI_NOT_CHAT');sendButton().click();
      let previous='',stable=0,seen=false;
      while(Date.now()<job.expiresAt){
        await sleep(650);
        const status=state();await chrome.runtime.sendMessage({type:'heartbeat',state:status});
        if(status.mode==='work')throw Error('CHAT_UI_MODE_CHANGED');
        const nonce=job.prompt.match(/"nonce":"([a-f0-9-]{36})"/)?.[1];const text=structuredReply(job.prompt,nonce);
        if(text){seen=true;if(text===previous&&!stopButton())stable++;else stable=0;previous=text;if(stable>=3){
          if(job.purpose==='work'){const value=JSON.parse(text);if(value.files?.length){const node=[...document.querySelectorAll('[data-message-author-role="assistant"]')].find(e=>(e.innerText||'').includes(nonce));const links=[...(node?.querySelectorAll('a[href]')||[])].map(a=>({url:a.href,name:(a.innerText||a.download||a.getAttribute('aria-label')||decodeURIComponent(new URL(a.href).pathname.split('/').pop()||'')).trim()})).filter(x=>x.name&&value.files.some(n=>n.toLowerCase()===x.name.toLowerCase()||x.name.toLowerCase().includes(n.toLowerCase())));const downloaded=await chrome.runtime.sendMessage({type:'downloadOutputs',id:job.id,lease:job.lease,entries:links});value.qqFiles=downloaded?.outputs||[];}
            await report({text:JSON.stringify(value)});return;}
          await report({text});return;}}
        if(!seen&&!stopButton()&&Date.now()>job.expiresAt-10000)throw Error('CHAT_UI_NO_REPLY');
      }throw Error('CHAT_UI_TIMEOUT');
    }catch(error){await report({error:/^CHAT_UI_[A-Z_]+$/.test(error.message)?error.message:'CHAT_UI_PAGE_FAILED'}).catch(()=>{});}
  }
  async function tick(){if(busy)return;busy=true;try{const reply=await chrome.runtime.sendMessage({type:'poll',state:state()});if(reply.job)await complete(reply.job);}catch{}finally{busy=false;}}
  setInterval(tick,1200);setTimeout(tick,1000);
})();
