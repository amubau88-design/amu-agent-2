// Run on the client computer with a dedicated key file. No key in arguments or output.
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
const raw=process.env.AMU_API_BASE_URL||'http://127.0.0.1:3030/v1',base=new URL(raw),host=base.hostname.replace(/^\[|\]$/g,'');
const local=['127.0.0.1','::1','localhost'].includes(host),privateAddresses=new net.BlockList();
for(const [ip,bits] of [['10.0.0.0',8],['172.16.0.0',12],['192.168.0.0',16]])privateAddresses.addSubnet(ip,bits);
privateAddresses.addSubnet('fc00::',7,'ipv6');
if(base.username||base.password||base.search||base.hash||base.pathname.replace(/\/$/,'')!=='/v1'||(!local&&(!net.isIP(host)||!privateAddresses.check(host,net.isIP(host)===6?'ipv6':'ipv4')))||(!local&&base.protocol!=='https:')||!['http:','https:'].includes(base.protocol))throw Error('Use a private IP HTTPS /v1 endpoint, or HTTP only on loopback');
if(!process.env.AMU_CLIENT_KEY_FILE)throw Error('Set AMU_CLIENT_KEY_FILE to the dedicated application key file');
const key=fs.readFileSync(process.env.AMU_CLIENT_KEY_FILE,'utf8').trim();if(key.length<32||/[\r\n]/.test(key))throw Error('Invalid application key file');
const ca=process.env.AMU_CA_FILE?fs.readFileSync(process.env.AMU_CA_FILE):undefined;if(base.protocol==='https:'&&!ca)throw Error('Set AMU_CA_FILE to the verified AMU CA certificate');
async function request(route,body){return new Promise((resolve,reject)=>{const url=new URL(route,base),transport=url.protocol==='https:'?https:http;
 const req=transport.request(url,{method:body?'POST':'GET',ca,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...(body?{'Idempotency-Key':crypto.randomUUID()}:{} )}},response=>{let text='';response.on('data',chunk=>{text+=chunk;if(text.length>262144)response.destroy(Error('Connection test response exceeds limit'));});response.on('error',reject);response.on('end',()=>{if(response.statusCode!==200)reject(Error('AMU request rejected with HTTP '+response.statusCode));else resolve({status:response.statusCode,text});});});req.setTimeout(120000,()=>req.destroy(Error('AMU connection test timeout; request was not retried')));req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
 });}
const health=JSON.parse((await request('/health')).text),models=JSON.parse((await request('/v1/models')).text);
const result={reachable:true,tls:base.protocol==='https:',inferenceReady:health.inferenceReady,models:models.data.map(model=>model.id),chatTest:'not requested',twoComputerTest:'Only valid if this script is actually run on the other computer'};
if(process.argv.includes('--chat')){const model=process.env.AMU_CLIENT_MODEL||models.data[0]?.id;if(!model)throw Error('No authorized model available');const response=await request('/v1/chat/completions',{model,messages:[{role:'user',content:'Say hello.'}],max_tokens:8,stream:true,stream_options:{include_usage:true}});const frames=response.text.split('\n').filter(line=>line.startsWith('data: ')&&line!=='data: [DONE]').map(line=>JSON.parse(line.slice(6)));if(!response.text.includes('data: [DONE]')||frames.some(frame=>frame.error))throw Error('Streaming connection test did not complete');result.chatTest='SSE completed';result.model=model;}
console.log(JSON.stringify(result,null,2));
