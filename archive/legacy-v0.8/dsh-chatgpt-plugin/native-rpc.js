import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {EventEmitter} from 'node:events';
import manifest from './package.json' with {type:'json'};
export const nativeDirectory=()=>process.env.QQBOT_CODEX_WORK_DIR||path.resolve(process.env.QQBOT_CHATGPT_DIR||'data/chatgpt-plan','../codex-work');
export function readJson(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export function writeJson(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(tmp,file);}
export class NativeRPC extends EventEmitter {
  constructor(directory=nativeDirectory()){super();this.directory=directory;this.pending=new Map();this.sequence=0;}
  async start(){if(this.ready)return this.ready;this.ready=this.initialize();return this.ready;}
  async initialize(){
    const cfg=readJson(path.join(this.directory,'config.json'));
    if(!cfg.codexPath||!cfg.codexHome||!cfg.cwd)throw Error('CODEX_NOT_CONFIGURED');this.config=cfg;
    this.child=spawn(cfg.codexPath,['app-server','--stdio'],{cwd:cfg.cwd,env:{...process.env,CODEX_HOME:cfg.codexHome},windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.stderr.on('data',()=>{});
    this.child.on('error',()=>this.fail());this.child.on('exit',()=>this.fail());
    this.child.stdin.on('error',()=>this.fail());
    createInterface({input:this.child.stdout}).on('line',line=>{
      let m;try{m=JSON.parse(line);}catch{return;}
      if(m.method){this.emit('event',m);return;}
      const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);
      m.error?p.reject(Object.assign(Error(/already has an active writer/i.test(String(m.error.message))?'CODEX_THREAD_BUSY':'CODEX_RPC_ERROR'),{rpcCode:m.error.code,rpcMethod:p.method})):p.resolve(m.result);
    });
    await this.call('initialize',{clientInfo:{name:'yuzu_qqbot',title:'柚柚QQ机器人',version:manifest.version},capabilities:{experimentalApi:true}});
    this.send({method:'initialized',params:{}});
    // Disable inherited connected services for bot sessions; DSH supplies scoped tools.
    const settings=await this.call('config/read',{includeLayers:false});
    this.overrides={'web_search':'disabled','model_reasoning_effort':'low'};
    for(const name of ['shell_tool','unified_exec','apps','browser_use','computer_use','view_image','code_mode_host','multi_agent','js_repl','skill_search','workspace_dependencies'])this.overrides['features.'+name]=false;
    for(const name of Object.keys(settings.config?.mcp_servers||{}))this.overrides['mcp_servers.'+name+'.enabled']=false;
    const plugins=await this.call('plugin/list',{cwds:[cfg.cwd],forceRefetch:false});
    this.pluginIds=(plugins.marketplaces||[]).flatMap(m=>m.plugins||[]).map(p=>p.id).filter(Boolean);
    return this;
  }
  send(value){if(!this.child||this.child.killed)throw Error('CODEX_OFFLINE');this.child.stdin.write(JSON.stringify(value)+'\n');}
  call(method,params,timeout=45000){return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(Object.assign(Error('CODEX_RPC_TIMEOUT'),{rpcMethod:method}));},timeout);this.pending.set(id,{resolve,reject,timer,method});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
  reply(id,result){this.send({id,result});}
  fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CODEX_OFFLINE'));}this.pending.clear();this.ready=null;this.emit('offline');}
  close(){this.child?.stdin.end();const child=this.child;setTimeout(()=>child?.kill(),800).unref();}
}
