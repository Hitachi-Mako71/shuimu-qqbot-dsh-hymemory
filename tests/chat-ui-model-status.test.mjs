import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeQQTurn} from '../dsh-hymemory-plugin/bridge.js';
test('QQ model status labels the ordinary Chat route accurately',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yuzu-model-label-'));
  const old=process.env.QQBOT_MODEL_ROUTING_FILE;
  try{
    process.env.QQBOT_MODEL_ROUTING_FILE=path.join(directory,'route.json');
    fs.writeFileSync(process.env.QQBOT_MODEL_ROUTING_FILE,JSON.stringify({provider:'chatgpt-chat',model:'browser-chat'}));
    const result=await beforeQQTurn({text:'当前模型'});
    assert.equal(result.handled,true);assert.match(result.reply,/ChatGPT普通Chat网页/);assert.doesNotMatch(result.reply,/DeepSeek/);
  }finally{
    if(old===undefined)delete process.env.QQBOT_MODEL_ROUTING_FILE;else process.env.QQBOT_MODEL_ROUTING_FILE=old;
    fs.unlinkSync(path.join(directory,'route.json'));fs.rmdirSync(directory);
  }
});
