import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
const root=path.resolve(fs.mkdtempSync('scratch/session38-owner-ui-'));
process.env.AMU_BACKUP_PROJECT_ROOT=root;process.env.AMU_CENTRAL_STATE_DIR=root+'/scratch/secrets';process.env.AMU_CORE_STATE_DIR=root+'/scratch/core';
fs.mkdirSync(root+'/scratch/secrets',{recursive:true});fs.mkdirSync(root+'/scratch/core');
const {createAmuApiServer}=await import('../amu-api/server.ts'),{amuInference}=await import('../inference/engine.ts'),{closeIdentityJournal}=await import('../central/idempotency.ts'),{stopAdmissionMonitoring}=await import('../central/service.ts'),{stopMonitoring}=await import('../core/monitoring.ts'),{backupStatus}=await import('../backup/manager.ts');
const server=createAmuApiServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,key=fs.readFileSync(root+'/scratch/secrets/central-admin-key.txt','utf8').trim();
async function call(route,body,token=key){return fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function json(route,body,token=key){const response=await call(route,body,token);assert.ok([200,202].includes(response.status),await response.clone().text());return response.json();}
async function finish(job){for(let i=0;i<250;i++){const current=backupStatus().jobs.find(item=>item.id===job.id);if(current.state==='completed')return current.result;if(current.state!=='running')throw Error(current.error);await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Backup fixture deadline');}
const html=fs.readFileSync('src/web-ui/public/admin.html','utf8'),script=html.match(/<script>([\s\S]*)<\/script>/)[1],elements=new Map(),downloads=[],intervals=[],checks=[];
class Element{
 constructor(){this.value='';this.textContent='';this.hidden=false;this.checked=false;this.disabled=false;this.dataset={};this.children=[];this.handlers={};this.parentElement={};this.files=[];}
 get options(){return this.children;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];this.textContent='';}closest(){return this.parentElement;}addEventListener(name,callback){this.handlers[name]=callback;}click(){if(this.download)downloads.push({url:this.href,name:this.download});return this.onclick?.();}
}
for(const item of html.matchAll(/\bid="([^"]+)"/g)){assert.ok(!elements.has(item[1]),'Duplicate ID '+item[1]);elements.set(item[1],new Element());}
let clipboard='',transportFailure='',confirmations=0,cookieJar='',ownerCalls=0,dropCookie=false,httpOnlySeen=false;
const context=vm.createContext({document:{getElementById:id=>{assert.ok(elements.has(id),'Missing control '+id);return elements.get(id);},createElement:()=>new Element()},navigator:{clipboard:{writeText:async text=>{clipboard=text;}}},fetch:async(route,options)=>{if(transportFailure==='network')throw Error('injected disconnect');if(route==='/api/client/status'&&transportFailure==='maintenance')return Response.json({error:{message:'maintenance'}},{status:503});if(route==='/api/auth/owner-login')ownerCalls++;const response=await fetch(new URL(route,base),{...options,headers:{...options?.headers,Origin:base,...(cookieJar?{Cookie:cookieJar}:{})}});const setCookie=response.headers.get('set-cookie');if(setCookie){httpOnlySeen ||= setCookie.includes('HttpOnly');if(!dropCookie)cookieJar=setCookie.split(';')[0];}return response;},crypto:crypto.webcrypto,TextEncoder,btoa,AbortController,AbortSignal,TextDecoder,Blob,URL,Date,console,setTimeout,setInterval:callback=>{intervals.push(callback);return intervals.length;},confirm:()=>{confirmations++;return true;},prompt:()=>null});
const run=code=>vm.runInContext(code,context),el=id=>elements.get(id);
async function action(id){assert.equal(typeof el(id).onclick,'function',id);await el(id).onclick();}
async function rowAction(name,label){const row=el('clients').children.find(row=>row.children.some(child=>child.textContent?.startsWith(name+' ·')));assert.ok(row,name);const button=row.children.find(child=>child.textContent===label);assert.ok(button,label);await button.onclick();}
try{
 new vm.Script(script).runInContext(context);
 await action('ownerSignIn');assert.equal(ownerCalls,0);assert.match(el('ownerStatus').textContent,/Kein Einmalcode/);assert.equal(run('connected'),false);
 el('ownerCode').value='invalid-fixture';await action('ownerSignIn');assert.equal(ownerCalls,1);assert.match(el('ownerStatus').textContent,/nicht bestätigt/);assert.equal(run('connected'),false);
 const admin=JSON.parse(fs.readFileSync(root+'/scratch/secrets/central-access.json')).clients.find(c=>c.admin);const grant=()=>{const code=crypto.randomBytes(32).toString('base64url');fs.writeFileSync(root+'/scratch/secrets/owner-login-grant.json',JSON.stringify({root:process.cwd(),directory:path.resolve(process.env.AMU_CENTRAL_STATE_DIR),clientId:admin.id,adminHash:admin.hash,hash:crypto.createHash('sha256').update(code).digest('hex'),expiresAt:Date.now()+300000,proof:'fixture only, no Windows owner claim'}));return code;};
 el('ownerCode').value=grant();await action('ownerSignIn');assert.equal(run('connected'),true,el('ownerStatus').textContent+'; '+el('message').textContent);assert.equal(run('principal.role'),'admin');assert(httpOnlySeen);assert.match(el('ownerStatus').textContent,/Sitzung|sitzung/);assert.equal(el('ownerCode').value,'');
 await run('connected=false;principal=null;restoreBrowserSession()');assert.equal(run('connected'),true);assert.match(el('ownerStatus').textContent,/wiederhergestellt/);cookieJar='AMUAdmin=invalid-fixture-session';await run('run(refresh)');assert.equal(run('connected'),false);assert.match(el('ownerStatus').textContent,/nicht mehr angemeldet/);el('ownerCode').value=grant();await action('ownerSignIn');assert.equal(run('connected'),true);await action('logout');assert.equal(run('connected'),false);assert.match(el('ownerStatus').textContent,/Keine bestätigte/);
 dropCookie=true;el('ownerCode').value=grant();await action('ownerSignIn');assert.equal(run('connected'),false);assert.match(el('ownerStatus').textContent,/Code akzeptiert/);assert.equal(el('ownerCode').value,'');
 console.log(JSON.stringify({passed:true,realHTTP:true,browserDOMSimulated:true,productionLoginNotClaimed:true,emptyCodeSendsNoRequest:true,invalidCodeDenied:true,validFixtureGrantCreatesHttpOnlyAdminSession:true,logoutClearsStatus:true,blockedCookieNeverClaimsSignedIn:true}));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await amuInference.close();closeIdentityJournal();stopAdmissionMonitoring();stopMonitoring();}
