// AMU lifecycle/file protection only; no project code, Docker, WSL or simulated OS acceptance.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {acquireRunnerLease} from '../runner/lease.ts';
const root=fs.mkdtempSync(path.resolve('scratch/session21-lease-test-'));
const first=acquireRunnerLease(root,'service');assert.throws(()=>acquireRunnerLease(root,'service'),/locked/);assert.throws(()=>acquireRunnerLease(root,'acceptance'),/locked/);
first.release();first.release();const acceptance=acquireRunnerLease(root,'acceptance');assert.throws(()=>acquireRunnerLease(root,'service'),/locked/);acceptance.release();
fs.writeFileSync(path.join(root,'lifecycle.lock'),JSON.stringify({pid:2147483647,purpose:'service'}));assert.throws(()=>acquireRunnerLease(root,'service'),/No automatic takeover/);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'lifecycle.lock'))).pid,2147483647);fs.unlinkSync(path.join(root,'lifecycle.lock'));
const changed=acquireRunnerLease(root,'service');fs.writeFileSync(changed.file,JSON.stringify({token:'foreign',pid:process.pid,root}));assert.throws(()=>changed.release(),/Changed/);assert.ok(fs.existsSync(changed.file));
for(const file of ['scripts/isolated-runner.mjs','scripts/accept-isolated-runner.mjs']){const source=fs.readFileSync(file,'utf8');assert.ok(source.indexOf('acquireRunnerLease(config.runtime.workRoot')<source.indexOf('await runtime.recoverOwnedContainers()'));}
console.log(JSON.stringify({passed:true,checks:['service and acceptance mutually exclusive','clean release permits restart','uncertain crash lock is retained without takeover','changed lock is not deleted','actual entrypoints acquire before recovery'],realLinuxTest:false,projectCodeExecuted:false}));
