import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../web-ui/public/admin.html',import.meta.url),'utf8');
const helper=html.match(/function authenticationHeaders\(\)\{[^\n]+/)[0];
test('cookie login omits Authorization, explicit keys remain supported',()=>{
 for(const [input,expected] of [['',{}],['   ',{}],['  sample-test-key  ',{Authorization:'Bearer sample-test-key'}]]){
 const actual=vm.runInNewContext(helper+';authenticationHeaders()', {el:()=>({value:input})});
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);
 }
});
test('all authenticated fetch paths use the same credential selection',()=>{
 assert.equal((html.match(/authenticationHeaders\(\)/g)||[]).length,5);
 assert.doesNotMatch(html,/Authorization:'Bearer '\+el\('key'\)/);
 new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
