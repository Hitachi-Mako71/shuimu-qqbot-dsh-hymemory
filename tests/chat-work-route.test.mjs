import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {modelRoute} from '../dsh-hymemory-plugin/model-route.js';

const scratch=path.resolve('github-repo/.tmp');fs.mkdirSync(scratch,{recursive:true});
const directory=fs.mkdtempSync(path.join(scratch,'chat-work-route-'));
const routeFile=path.join(directory,'model-routing.json');
process.env.QQBOT_MODEL_ROUTING_FILE=routeFile;
process.env.MEMORY_DSH_PROVIDER='deepseek-account';
process.env.MEMORY_DSH_MODEL='deepseek-flash';
try{
  fs.writeFileSync(routeFile,JSON.stringify({provider:'chatgpt-chat-work',model:'browser-chat'}));
  assert.deepEqual(modelRoute(),{provider:'deepseek-account',model:'deepseek-flash'});
  fs.writeFileSync(routeFile,JSON.stringify({provider:'codex',model:'gpt-6-luna'}));
  assert.deepEqual(modelRoute(),{provider:'codex',model:'gpt-6-luna'});
  console.log(JSON.stringify({passed:true,checks:2,workRouteMemoryModel:'deepseek-account'}));
}finally{fs.rmSync(directory,{recursive:true,force:true});}
