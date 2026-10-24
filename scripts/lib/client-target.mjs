import net from 'node:net';
import {lookup} from 'node:dns/promises';

const addresses=new net.BlockList();
for(const [ip,bits] of [['10.0.0.0',8],['172.16.0.0',12],['192.168.0.0',16],['127.0.0.0',8]])addresses.addSubnet(ip,bits);
addresses.addSubnet('fc00::',7,'ipv6');addresses.addAddress('::1','ipv6');
export const privateAddress=ip=>!!net.isIP(ip)&&addresses.check(ip,net.isIP(ip)===6?'ipv6':'ipv4');

/** Resolve once before reading credentials; pin the socket while TLS verifies the original name. */
export async function clientTarget(raw,resolve=lookup){
 const url=new URL(raw),host=url.hostname.replace(/^\[|\]$/g,'');
 const loopback=['localhost','127.0.0.1','::1'].includes(host);
 if(url.username||url.password||url.search||url.hash||url.pathname.replace(/\/$/,'')!=='/v1'||!['http:','https:'].includes(url.protocol)||(!loopback&&url.protocol!=='https:'))throw Error('Use a private HTTPS IP or domain /v1 endpoint; HTTP is restricted to loopback');
 let resolved;
 if(host==='localhost')resolved=[{address:'127.0.0.1',family:4}];
 else if(net.isIP(host))resolved=[{address:host,family:net.isIP(host)}];
 else {
  let timer;try{resolved=await Promise.race([resolve(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DNS resolution timeout')),5000);timer.unref();})]);}finally{clearTimeout(timer);}
 }
 if(!resolved.length||resolved.some(entry=>!privateAddress(entry.address)||net.isIP(entry.address)!==entry.family))throw Error('Domain must resolve exclusively to private or loopback addresses');
 const target=resolved[0];
 return {url,lookup:(_hostname,options,callback)=>callback(null,options?.all?[target]:target.address,options?.all?undefined:target.family)};
}
