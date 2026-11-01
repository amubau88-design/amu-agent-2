import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {verifyRestoredDatabases} from '../backup/verify-state.ts';
const root=fs.mkdtempSync(path.resolve('scratch/session39-long-path-test-'));
const directory=path.join(root,'nested-'.repeat(12),'restore-'.repeat(12));fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'state.sqlite');assert(file.length>260);
const database=new DatabaseSync(path.toNamespacedPath(file));database.exec('CREATE TABLE evidence(value INTEGER); INSERT INTO evidence VALUES(39)');database.close();const before=fs.readFileSync(file);
const result=await verifyRestoredDatabases(root);assert.equal(result.length,1);assert.equal(result[0].integrity,'ok');assert.deepEqual(fs.readFileSync(file),before);
console.log(JSON.stringify({passed:true,realSQLite:true,pathLength:file.length,readOnlyContentsUnchanged:true,fixtureRetained:true}));
