import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const project=process.cwd();
const tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6);
if(tag&&!/^[a-z0-9-]{1,50}$/.test(tag))throw Error('Invalid validation tag');
const output=path.resolve(project,'.run/dialogue-validation-20261029',tag||'.');
if(tag&&fs.existsSync(path.join(output,'regression-summary.json')))throw Error('Use a fresh validation tag');
fs.mkdirSync(output,{recursive:true});
const sandbox=fs.mkdtempSync(path.join(output,'isolated-'));
const testTemp=path.join(output,'tmp');fs.mkdirSync(testTemp,{recursive:true});
const env={...process.env,MEMORY_BRIDGE_URL:'http://127.0.0.1:1',MEMORY_BRIDGE_TOKEN:'synthetic-validation-only'};
// Node's default Windows temp is outside the project and may be write-restricted
// in managed runs. Keep every test fixture under this isolated, disposable root.
env.TEMP=testTemp;env.TMP=testTemp;env.TMPDIR=testTemp;
for(const [key,dir] of Object.entries({QQBOT_COMPANION_DIR:'companion',QQBOT_EVIDENCE_DIR:'evidence',QQBOT_PRIVACY_DIR:'privacy',QQBOT_WORKSPACE_ROOT:'workspaces',QQBOT_METRICS_DIR:'metrics'}))env[key]=path.join(sandbox,dir);
env.QQBOT_MODEL_ROUTING_FILE=path.join(sandbox,'routing.json');
env.QQBOT_TRANSPORT_FILE=path.join(sandbox,'transport.json');
const tests=fs.readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>path.join('tests',f));
tests.push(...fs.readdirSync('dsh-hymemory-plugin/dialogue-engine/test').filter(f=>f.endsWith('.test.js')).map(f=>path.join('dsh-hymemory-plugin/dialogue-engine/test',f)));
const run=spawnSync(process.execPath,['--import',pathToFileURL(path.resolve('tools/dialogue-test-imports.mjs')).href,'--test','--test-reporter=tap',...tests],{cwd:project,env,encoding:'utf8',timeout:180000,maxBuffer:8_000_000});
fs.writeFileSync(path.join(output,'regression.tap'),(run.stdout||'')+'\n'+(run.stderr||''));
const summary={exitCode:run.status,error:run.error?.code,testFiles:tests.length,
  totals:(run.stdout||'').split('\n').filter(l=>/^# (tests|pass|fail|cancelled|skipped|duration_ms) /.test(l)),
  failures:(run.stdout||'').split('\n').filter(l=>/^not ok /.test(l)),sandbox};
fs.writeFileSync(path.join(output,'regression-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));process.exitCode=run.status??1;
