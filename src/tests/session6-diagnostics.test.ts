import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(fs.mkdtempSync('scratch/session6-diagnostics-test-')),file=root+'/client-key.txt',secret='diagnostic-private-key-marker-'.repeat(2);fs.writeFileSync(file,secret,{mode:0o600});
function run(env:Record<string,string>){const result=spawnSync(process.execPath,['scripts/test-client-connection.mjs'],{encoding:'utf8',windowsHide:true,timeout:5000,env:{...process.env,...env}});assert.equal(result.status,1,result.stderr);assert.ok(!result.stderr.includes(secret));return JSON.parse(result.stderr);}
const missing=run({AMU_CLIENT_KEY_FILE:''});assert.equal(missing.stage,'configuration');assert.equal(missing.automaticRetries,0);
const publicTarget=run({AMU_CLIENT_KEY_FILE:file,AMU_API_BASE_URL:'https://8.8.8.8/v1'});assert.equal(publicTarget.stage,'configuration');
const reservation=net.createServer();await new Promise<void>(r=>reservation.listen(0,'127.0.0.1',r));const port=(reservation.address() as any).port;await new Promise<void>(r=>reservation.close(()=>r()));const refused=run({AMU_CLIENT_KEY_FILE:file,AMU_API_BASE_URL:`http://127.0.0.1:${port}/v1`});assert.equal(refused.stage,'health');assert.equal(refused.code,'ECONNREFUSED');assert.match(refused.diagnose,/Dienst/);
const evidence={passed:true,time:new Date().toISOString(),checks:['missing configuration and refused connection produce readable stage-specific diagnostics without secrets','public endpoint rejected before connection; no automatic retries'],publicNetworkRequests:0};fs.writeFileSync(root+'/verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
