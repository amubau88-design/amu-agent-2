import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writePrivateJson} from './storage.ts';
import {EngineError} from '../inference/models.ts';
type Entry={identity:string;requestHash:string;state:'accepted'|'completed'|'failed'|'interrupted';time:string};
const file=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets','request-identities.json');
let entries:Entry[]=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
if(!Array.isArray(entries))throw Error('Invalid request identity journal');
let recovered=false;for(const entry of entries)if(entry.state==='accepted'){entry.state='interrupted';recovered=true;}
const save=()=>writePrivateJson(file,entries,true);if(recovered)save();
/** Optional client retry identity. No prompt/output persistence and no automatic execution replay. */
export function claimRequestIdentity(clientId:string,header:unknown,body:unknown){
 if(header===undefined)return;
 if(typeof header!=='string'||!/^[-a-zA-Z0-9_.:]{1,128}$/.test(header))throw new EngineError(400,'Invalid Idempotency-Key (1–128 simple characters)');
 const identity=crypto.createHash('sha256').update(clientId+'\0'+header).digest('hex'),requestHash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const previous=entries.find(e=>e.identity===identity);if(previous)throw new EngineError(409,previous.requestHash!==requestHash?'Idempotency-Key conflicts with an earlier request':'Request identity is already '+previous.state+'; execution will not be repeated');
 if(entries.length>=100000)throw new EngineError(507,'Request identity journal capacity reached; archive state before accepting new identities');
 const entry:Entry={identity,requestHash,state:'accepted',time:new Date().toISOString()};entries.push(entry);save();
 return (success:boolean)=>{entry.state=success?'completed':'failed';save();};
}
