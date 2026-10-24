import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {IdentityJournal} from './journal.ts';
import {EngineError} from '../inference/models.ts';
const file=path.resolve(process.env.AMU_CENTRAL_STATE_DIR||'scratch/secrets','request-identities.json');
const journal=new IdentityJournal(file.replace(/\.json$/,'.sqlite'),file,entry=>({id:entry.identity,hash:entry.requestHash,state:entry.state,createdAt:entry.time}));
export const identityJournalStatus=()=>journal.summary();
export const closeIdentityJournal=()=>journal.close();
/** Optional client retry identity. No prompt/output persistence and no automatic execution replay. */
export function claimRequestIdentity(clientId:string,header:unknown,body:unknown){
 if(header===undefined)return;
 if(typeof header!=='string'||!/^[-a-zA-Z0-9_.:]{1,128}$/.test(header))throw new EngineError(400,'Invalid Idempotency-Key (1–128 simple characters)');
 const identity=crypto.createHash('sha256').update(clientId+'\0'+header).digest('hex'),requestHash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 journal.accept(identity,requestHash);
 return (success:boolean)=>journal.finish(identity,success?'completed':'failed');
}
