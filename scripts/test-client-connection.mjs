// Run on the client computer with a dedicated key file. No key in arguments or output.
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import {clientTarget} from './lib/client-target.mjs';
import crypto from 'node:crypto';
let stage='configuration';
async function main(){
const {url:base,lookup}=await clientTarget(process.env.AMU_API_BASE_URL||'http://127.0.0.1:3030/v1');
if(!process.env.AMU_CLIENT_KEY_FILE)throw Error('Set AMU_CLIENT_KEY_FILE to the dedicated application key file');
const key=fs.readFileSync(process.env.AMU_CLIENT_KEY_FILE,'utf8').trim();if(key.length<32||/[\r\n]/.test(key))throw Error('Invalid application key file');
const ca=process.env.AMU_CA_FILE?fs.readFileSync(process.env.AMU_CA_FILE):undefined;if(base.protocol==='https:'&&!ca)throw Error('Set AMU_CA_FILE to the verified AMU CA certificate');
async function request(route,body){return new Promise((resolve,reject)=>{const url=new URL(route,base),transport=url.protocol==='https:'?https:http;
 const req=transport.request(url,{method:body?'POST':'GET',ca,lookup,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(body?{'Idempotency-Key':crypto.randomUUID()}:{} )}},response=>{let text='';response.on('data',chunk=>{text+=chunk;if(text.length>262144)response.destroy(Error('Connection test response exceeds limit'));});response.on('error',reject);response.on('end',()=>{if(response.statusCode!==200)reject(Object.assign(Error('AMU request rejected with HTTP '+response.statusCode),{status:response.statusCode}));else resolve({status:response.statusCode,text});});});req.setTimeout(120000,()=>req.destroy(Error('AMU connection test timeout; request was not retried')));req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });}
stage='health';const health=JSON.parse((await request('/health')).text);stage='models';const models=JSON.parse((await request('/v1/models')).text);
const result={reachable:true,tls:base.protocol==='https:',inferenceReady:health.inferenceReady,models:models.data.map(model=>model.id),chatTest:'not requested',twoComputerTest:'Only valid if this script is actually run on the other computer'};
if(process.argv.includes('--chat')){stage='chat';const model=process.env.AMU_CLIENT_MODEL||models.data[0]?.id;if(!model)throw Error('No authorized model available');const response=await request('/v1/chat/completions',{model,messages:[{role:'user',content:'Say hello.'}],max_tokens:8,stream:true,stream_options:{include_usage:true}});const frames=response.text.split('\n').filter(line=>line.startsWith('data: ')&&line!=='data: [DONE]').map(line=>JSON.parse(line.slice(6)));if(!response.text.includes('data: [DONE]')||frames.some(frame=>frame.error))throw Error('Streaming connection test did not complete');result.chatTest='SSE completed';result.model=model;}
console.log(JSON.stringify(result,null,2));

}
void main().catch(error=>{const status=Number.isInteger(error.status)?error.status:undefined,code=typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'AMU_CLIENT_TEST_FAILED';let diagnose='Konfiguration, Schlüsseldatei, CA und Serveradresse prüfen.';if(code==='ECONNREFUSED')diagnose='Dienst nicht erreichbar: Serverstart, IP und Port prüfen.';else if(code.includes('CERT')||code.includes('TLS')||code.includes('ISSUER')||code.includes('SELF_SIGNED'))diagnose='TLS-Vertrauen prüfen: richtige öffentliche CA, gültiges Zertifikat und passende IP im SAN verwenden. Zertifikatsprüfung nicht abschalten.';else if(status===401)diagnose='Individuellen Client-Schlüssel prüfen: gesperrt, widerrufen oder erneuert?';else if(status===403)diagnose='Client-Freigaben, Modellrechte und Quell-IP-Freigabe prüfen.';else if(status===429)diagnose='Anfragen, Parallelität oder Tagesbudget begrenzt. Laufende Arbeit und Limits im Dashboard prüfen.';else if(status===503)diagnose='Server erreichbar, aber kein passender Worker bereit oder Wartung aktiv.';console.error(JSON.stringify({success:false,serverResponded:status!==undefined||['models','chat'].includes(stage),stage,code,httpStatus:status,diagnose,automaticRetries:0},null,2));process.exitCode=1;});
