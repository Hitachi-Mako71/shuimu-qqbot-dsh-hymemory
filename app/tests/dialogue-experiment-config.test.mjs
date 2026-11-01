import test from 'node:test';
import assert from 'node:assert/strict';
import {generationOptions} from '../tools/dialogue-experiment-config.mjs';
import {generateDialogueReply} from '../dsh-hymemory-plugin/dialogue-engine/index.js';
test('an ablation can hold planning and example retrieval equal on both sides',async()=>{
  for(const side of ['baseline','candidate']){
    const stages=[];let retrieved=0;
    const options=generationOptions({planning:'true',semantic:'true','reference-planning':'true','reference-semantic':'true'},side,async()=>{retrieved++;return [];});
    await generateDialogueReply({speaker:'评测者',text:'普通分享。'},{...options,generate:async r=>{
      stages.push(r.stage);return r.stage==='plan'?'{"act":"respond","target":"评测者"}':'正文。';
    }});
    assert.deepEqual(stages,['plan','generate']);assert.equal(retrieved,1);
  }
});
