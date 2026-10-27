import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../chat-ui-extension/dom.js',import.meta.url),'utf8');
const attrs={role:'switch','aria-label':'聊天','aria-checked':'true'};
const makeMode=(label,checked)=>({
  innerText:label,
  getClientRects:()=>[{}],
  getAttribute:name=>name==='aria-label'?label:name==='role'?'switch':name==='aria-checked'?String(checked):null,
});
const legacyWorkButton={innerText:'工作',getClientRects:()=>[{}],getAttribute:()=>null};
const editor={tagName:'TEXTAREA',id:'prompt-textarea',disabled:false,readOnly:false,value:'',getClientRects:()=>[{}],closest:()=>({}),getAttribute:()=>null};
function inspect(chatOn){
  const modes=[makeMode('聊天',chatOn),makeMode('工作',!chatOn)];
  const document={querySelectorAll(selector){
    if(selector==='textarea,[contenteditable]')return[editor];
    if(selector==='header button,[role="tab"],button[aria-pressed],button[aria-checked],[role="switch"],[role="radio"],[aria-pressed],[aria-checked],[aria-selected]')return[legacyWorkButton,...modes];
    if(selector==='button,header,[role="status"],h1,h2')return[];
    return[];
  }};
  const context={document,location:{href:'https://chatgpt.com/?yuzu-work=true',pathname:'/'},sessionStorage:{getItem:()=>null,setItem:()=>{}},URL,HTMLTextAreaElement:function(){}};
  vm.runInNewContext(source,context);
  return context.YuzuChatDOM.state();
}
const state=inspect(true);
assert.deepEqual(JSON.parse(JSON.stringify(state)),{ready:true,mode:'chat',temporary:false,work:true,status:'ready-work'});
const workState=inspect(false);
assert.deepEqual(JSON.parse(JSON.stringify(workState)),{ready:false,mode:'unknown',temporary:false,work:false,status:'chat-mode-required'});
console.log(JSON.stringify({passed:true,cases:2,chatSelected:state.status,workSelected:workState.status}));
