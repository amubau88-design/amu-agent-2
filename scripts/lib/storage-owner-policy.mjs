import fs from 'node:fs';
/** Denials only; this file can never authorize a write or a partition operation. */
export function storageOwnerPolicy(){
 const file=new URL('../../config/runner-storage-policy.json',import.meta.url);if(fs.statSync(file).size>8192)throw Error('Storage policy too large');const policy=JSON.parse(fs.readFileSync(file,'utf8'));
 if(policy.schemaVersion!==1||!Array.isArray(policy.protectedDiskIdentities)||policy.protectedDiskIdentities.length>20||policy.protectedDiskIdentities.some(id=>!/^[a-f0-9]{64}$/.test(id))||policy.preferredPartitionBytes!==null&&(!Number.isSafeInteger(policy.preferredPartitionBytes)||policy.preferredPartitionBytes<20*1024**3))throw Error('Invalid owner storage protection policy');return policy;
}
