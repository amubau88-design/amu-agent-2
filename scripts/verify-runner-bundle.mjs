import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const [directory,expected,...extra]=process.argv.slice(2);if(!directory||!/^[a-f0-9]{64}$/.test(expected||'')||extra.length)throw Error('Usage: node scripts/verify-runner-bundle.mjs <handoff-directory> <trusted manifest SHA-256>');
const root=path.resolve(directory),digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(let p=root;;p=path.dirname(p)){if(fs.lstatSync(p).isSymbolicLink())throw Error('Linked bundle root refused');if(path.dirname(p)===p)break;}
const manifestFile=path.join(root,'manifest.json');if(fs.lstatSync(manifestFile).isSymbolicLink()||fs.statSync(manifestFile).size>65536)throw Error('Unsafe manifest');
const bytes=fs.readFileSync(manifestFile);if(digest(bytes)!==expected)throw Error('Manifest differs from trusted offline digest');const manifest=JSON.parse(bytes);
if(manifest.schemaVersion!==1||!Array.isArray(manifest.files)||manifest.files.length<1||manifest.files.length>40)throw Error('Invalid manifest schema');
const seen=new Set();for(const entry of manifest.files){
 if(typeof entry.path!=='string'||!/^bundle\/(src|scripts|docs)\/[a-zA-Z0-9_./-]+$/.test(entry.path)||entry.path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(entry.path)||!/^[a-f0-9]{64}$/.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>1024*1024)throw Error('Invalid bounded manifest entry');seen.add(entry.path);
 let cursor=root;for(const part of entry.path.split('/')){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())throw Error('Linked bundle entry refused');}
 if(!fs.statSync(cursor).isFile()||fs.statSync(cursor).size!==entry.bytes||digest(fs.readFileSync(cursor))!==entry.sha256)throw Error('Bundle file integrity mismatch');
}
const requiredEnvelope=['plan.json','package.json','wslconfig.proposed'];if(!Array.isArray(manifest.envelopeFiles)||manifest.envelopeFiles.length!==requiredEnvelope.length||!requiredEnvelope.every(name=>manifest.envelopeFiles.filter(e=>e.path===name).length===1))throw Error('Missing handoff metadata integrity');
for(const entry of manifest.envelopeFiles){if(!requiredEnvelope.includes(entry.path))throw Error('Invalid metadata path');const file=path.join(root,entry.path);if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>65536||digest(fs.readFileSync(file))!==entry.sha256)throw Error('Handoff metadata integrity mismatch');}
const walk=dir=>{for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.lstatSync(file).isSymbolicLink())throw Error('Linked unexpected bundle entry');if(fs.statSync(file).isDirectory())walk(file);else if(!seen.has(path.relative(root,file).split(path.sep).join('/')))throw Error('Unexpected bundle file');}};walk(path.join(root,'bundle'));
console.log(JSON.stringify({integrityVerified:true,files:seen.size,originTrustedOnlyBySuppliedOfflineDigest:true,runnerStarted:false,isolationAccepted:false}));
