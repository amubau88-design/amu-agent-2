// Static protocol tests: no generated code is executed.
import assert from 'node:assert/strict';import {moduleContracts,localModuleChecks} from '../core/module-contracts.ts';
const sources=[{path:'pricing.mjs',content:'export const total=({quantity,unitPrice})=>quantity*unitPrice;'}, {path:'handlers.mjs',content:"import {total} from './pricing.mjs';export function handle(x){return total(x);}"},{path:'server.mjs',content:"import {handle as quote} from './handlers.mjs';export default quote;"}];
assert.equal(localModuleChecks(sources).passed,true);const broken=sources.map(s=>({...s,content:s.path==='pricing.mjs'?s.content.replace('total=','price='):s.content})),check=localModuleChecks(broken);assert.equal(check.passed,false);assert.deepEqual(check.errors,[{importer:'handlers.mjs',target:'pricing.mjs',missing:['total']}]);
assert.equal(localModuleChecks([{path:'a.mjs',content:"export * from './b.mjs';"},{path:'c.mjs',content:"import {dynamic} from './a.mjs';"}]).errors.length,0);
assert.equal(localModuleChecks([{path:'c.mjs',content:"import {dynamic} from './undeclared.mjs';"}]).unresolved.length,1);
assert.equal(moduleContracts([{path:'common.cjs',content:'module.exports={x:1};'}])[0].complete,false);
assert.deepEqual(moduleContracts(sources).map(c=>c.exports),[['total'],['handle'],['default']]);
assert.equal(localModuleChecks([{path:'a.mjs',content:"import type {Foo} from './b.mjs';"},{path:'b.mjs',content:'export const x=1;'}]).errors.length,0);
assert.equal(moduleContracts([{path:'a.mjs',content:'x'.repeat(32769)}])[0].truncated,true);
console.log(JSON.stringify({passed:true,staticOnly:true,threeFileImportExportContract:true,unknownContractsNotInvented:true}));
const {moduleRepairGoal,draftHasModuleFailure}=await import('../core/module-contracts.ts');assert.match(moduleRepairGoal(check,'pricing.mjs','Multiply'),/export names.*total/);assert.equal(draftHasModuleFailure(check,'pricing.mjs'),true);assert.equal(draftHasModuleFailure(check,'server.mjs'),false);
const {currentAgentTests}=await import('../core/agent-finalization.ts');assert.deepEqual(currentAgentTests({pendingChangeSet:'now',tests:[{file:'a',sourceHash:'current',changeSetId:'now',passed:false},{file:'a',sourceHash:'old',changeSetId:'now',passed:true},{file:'a',sourceHash:'current',changeSetId:'before',passed:true}]},{a:'current'}),[{file:'a',sourceHash:'current',changeSetId:'now',passed:false}]);
