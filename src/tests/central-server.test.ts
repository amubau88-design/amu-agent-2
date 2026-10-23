import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
const testDirectory = fs.mkdtempSync('scratch/central-test-');
process.env.AMU_CENTRAL_STATE_DIR = testDirectory;
const { createAmuApiServer } = await import('../amu-api/server.ts');
const original = fs.readFileSync(testDirectory + '/central-access.json');
const key = fs.readFileSync(testDirectory + '/central-admin-key.txt', 'utf8').trim();
let running = 0; let peak = 0;
const fake = http.createServer(async (req,res) => {
  if (req.url === '/v1/models') { res.setHeader('Content-Type','application/json');res.end(JSON.stringify({object:'list',data:[{id:'fixture-model',object:'model'}]}));return; }
  let raw='';for await(const c of req) raw+=c;const b=JSON.parse(raw);assert.equal(b.messages[0].content,'Follow system');
  running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,40));running--;
  if(b.stream){res.setHeader('Content-Type','text/event-stream');res.write('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n');res.end('data: [DONE]\n\n');}
  else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({object:'chat.completion',choices:[{message:{role:'assistant',content:'OK'}}]}));}
});
const api=createAmuApiServer();
await new Promise<void>(r=>fake.listen(0,'127.0.0.1',r));await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${(api.address() as any).port}`;
async function call(p:string,token=key,body?:any){return fetch(base+p,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
try{
 assert.equal((await call('/v1/models','wrong')).status,401);
 assert.equal((await call('/api/v1/projects','wrong')).status,401);
 assert.equal((await call('/api/central/connection',key,{upstream:`http://127.0.0.1:${(fake.address() as any).port}/v1`,model:'fixture-model'})).status,200);
 const client=await (await call('/api/central/clients',key,{name:'verification-client',models:['fixture-model']})).json() as any;
 assert.equal((await call('/api/central/status',client.key)).status,403);
 assert.equal((await call('/api/v1/projects',client.key)).status,403);
 assert.equal((await call('/v1/models',client.key)).status,200);
 const messages=[{role:'system',content:'Follow system'},{role:'user',content:'Hello'}];
 assert.equal((await call('/v1/chat/completions',client.key,{model:'forbidden',messages})).status,403);
 assert.equal((await call('/v1/chat/completions',client.key,{model:'fixture-model',messages:[]})).status,400);
 const completion=await call('/v1/chat/completions',client.key,{model:'fixture-model',messages});assert.equal(completion.status,200);assert.equal((await completion.json() as any).choices[0].message.content,'OK');
 const stream=await call('/v1/chat/completions',client.key,{model:'fixture-model',messages,stream:true});assert.match(stream.headers.get('content-type')! as string,/text\/event-stream/);assert.match(await stream.text(),/data: \[DONE\]/);
 assert.equal((await call('/api/central/connection',key,{upstream:'https://api.openai.com/v1',model:'x'})).status,400);
 const concurrent=await Promise.all(Array.from({length:6},()=>call('/v1/chat/completions',client.key,{model:'fixture-model',messages})));assert.ok(concurrent.every(r=>r.status===200));assert.equal(peak,2);
 await call('/api/central/revoke',key,{id:client.id});assert.equal((await call('/v1/models',client.key)).status,401);
 console.log('PASS: authentication, client isolation, model ACL, validation, complete messages, JSON inference, real SSE transport, cloud rejection, revocation, concurrency limit' );
}finally{fs.writeFileSync(testDirectory + '/central-access.json',original);api.closeAllConnections();fake.closeAllConnections();await Promise.all([new Promise<void>(r=>api.close(()=>r())),new Promise<void>(r=>fake.close(()=>r()))]);}


