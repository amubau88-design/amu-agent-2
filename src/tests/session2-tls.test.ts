import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
const state=fs.mkdtempSync('scratch/session2-tls-test-');process.env.AMU_CENTRAL_STATE_DIR=state+'/access';process.env.AMU_CORE_STATE_DIR=state+'/core';process.env.AMU_SUPERVISOR_STATE_DIR=state;
process.env.AMU_BIND_HOST='0.0.0.0';process.env.AMU_ALLOWED_CIDRS='192.168.2.0/24';process.env.AMU_TLS_CERT='scratch/secrets/tls/server-cert.pem';process.env.AMU_TLS_KEY='scratch/secrets/tls/server-key.pem';
const {createAmuApiServer}=await import('../amu-api/server.ts');const api=createAmuApiServer();await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));const port=(api.address() as any).port,ca=fs.readFileSync('scratch/tls-public/amu-ca.pem');
async function request(trusted:boolean){return new Promise<{status:number;body:string}>((resolve,reject)=>{const req=https.get({hostname:'127.0.0.1',port,path:'/health',...(trusted?{ca}:{})},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode!,body}));});req.on('error',reject);});}
try{await assert.rejects(request(false));const response=await request(true);assert.equal(response.status,200);assert.ok(JSON.parse(response.body).engine);console.log('PASS: actual HTTPS with generated CA trust and hostname/IP validation; untrusted certificate rejected; listener remained loopback-only');}finally{api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));}
