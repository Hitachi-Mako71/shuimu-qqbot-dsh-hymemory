const ROOT='http://127.0.0.1:8767';let polling=false;
async function api(route,body,token,timeout=5000){const state=await chrome.storage.local.get('token');const response=await fetch(ROOT+route,{method:'POST',headers:{'content-type':'application/json','x-yuzu-extension':chrome.runtime.id,...((token||state.token)?{authorization:'Bearer '+(token||state.token)}:{})},body:JSON.stringify({...body,extensionVersion:chrome.runtime.getManifest().version}),signal:AbortSignal.timeout(timeout)});const data=await response.json();if(!response.ok)throw Error(data.code||'CHAT_UI_OFFLINE');return data;}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    const state=await chrome.storage.local.get(['token','tabId','chatConfirmed','workTabId','workConfirmed']);
    if(message.type==='pair'&&!sender.tab){const result=await api('/pair',{code:String(message.code||'').trim()});await chrome.storage.local.set({token:result.token});return{ok:true};}
    if(message.type==='open'&&!sender.tab){if(!state.token)throw Error('请先填写本机配对码。');const tab=await chrome.tabs.create({url:'https://chatgpt.com/?yuzu-work=true'});await chrome.storage.local.set({workTabId:tab.id,workConfirmed:false});await chrome.storage.session.remove('job');return{ok:true};}
    if(message.type==='confirm'&&!sender.tab){const tabId=state.workTabId||state.tabId;if(!tabId)throw Error('请先打开专用Chat工作标签页。');const work=!!state.workTabId;await chrome.storage.local.set(work?{workConfirmed:true}:{chatConfirmed:true});return{ok:true};}
    if(message.type==='status'&&!sender.tab){const health=await fetch(ROOT+'/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());return{...health,paired:!!state.token,chatConfirmed:!!state.chatConfirmed,workConfirmed:!!state.workConfirmed};}
    if(!sender.tab||![state.tabId,state.workTabId].includes(sender.tab.id)||!state.token)return{};
    const workTab=sender.tab.id===state.workTabId,confirmed=workTab?state.workConfirmed:state.chatConfirmed;
    if(message.type==='poll'){
      const saved=await chrome.storage.session.get('job');if(saved.job)return{job:saved.job};
      if(polling)return{};polling=true;try{const result=await api('/poll',{...message.state,ready:!!(message.state.ready&&confirmed)});
        if(result.job){const job={...result.job,prepared:false};await chrome.storage.session.set({job});if(job.purpose!=='work')await chrome.tabs.update(sender.tab.id,{url:'https://chatgpt.com/?temporary-chat=true'});return{job};}return{};
      }finally{polling=false;}
    }
    if(message.type==='prepared'){const saved=await chrome.storage.session.get('job');if(saved.job?.id===message.id){await chrome.storage.session.set({job:{...saved.job,prepared:true}});}return{ok:true};}
    if(message.type==='downloadOutputs'){
      const saved=await chrome.storage.session.get('job'),job=saved.job;if(!job||job.id!==message.id||job.lease!==message.lease)throw Error('CHAT_UI_JOB_EXPIRED');const outputs=[];
      for(const entry of message.entries||[]){if(!/^https:\/\/chatgpt\.com\//.test(entry.url)||typeof entry.name!=='string')continue;const ext=(entry.name.match(/\.[A-Za-z0-9]{1,8}$/)||[''])[0].toLowerCase();if(!['.png','.jpg','.jpeg','.webp','.gif','.pdf','.txt','.md','.csv','.json','.py','.js','.ts','.html','.css','.docx','.xlsx','.pptx','.zip'].includes(ext))continue;
        let downloadId;try{
          downloadId=await chrome.downloads.download({url:entry.url,filename:'YuzuChatWork/'+job.id+'/'+entry.name.replace(/[^\w\u4e00-\u9fff .-]/g,'_').slice(-100),saveAs:false,conflictAction:'uniquify'});
          const item=await new Promise(async(resolve,reject)=>{let timer;const finish=(error,value)=>{clearTimeout(timer);chrome.downloads.onChanged.removeListener(listener);error?reject(error):resolve(value);};const listener=delta=>{if(delta.id!==downloadId||!delta.state)return;if(delta.state.current==='complete')chrome.downloads.search({id:downloadId}).then(rows=>finish(null,rows[0])).catch(error=>finish(error));else if(delta.state.current==='interrupted')finish(Error('CHAT_UI_DOWNLOAD_FAILED'));};chrome.downloads.onChanged.addListener(listener);timer=setTimeout(()=>finish(Error('CHAT_UI_DOWNLOAD_TIMEOUT')),90000);const rows=await chrome.downloads.search({id:downloadId});if(rows[0]?.state==='complete')finish(null,rows[0]);});
          const savedFile=await api('/download',{id:job.id,lease:job.lease,path:item.filename,name:entry.name},undefined,30000);outputs.push({name:savedFile.name});await chrome.downloads.removeFile(downloadId).catch(()=>{});await chrome.downloads.erase({id:downloadId});
        }catch{}
      }return{outputs};
    }
    if(message.type==='complete'){try{return await api('/complete',{id:message.id,lease:message.lease,text:message.text,error:message.error});}finally{await chrome.storage.session.remove('job');}}
    if(message.type==='heartbeat'){await api('/heartbeat',{...message.state,ready:!!(message.state.ready&&confirmed)});return{ok:true};}
    return{};
  })().then(respond,error=>respond({error:error.message||'CHAT_UI_OFFLINE'}));return true;
});
