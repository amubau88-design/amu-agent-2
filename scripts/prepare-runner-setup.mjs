// Creates an owner-reviewable handoff in scratch only. Never runs WSL, Docker, shell or installers.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {runnerSetupPlan} from './lib/runner-setup-plan.mjs';import {storageOwnerPolicy} from './lib/storage-owner-policy.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),[inventoryPath,outputPath,storagePath,...extra]=process.argv.slice(2);
if(!inventoryPath||!outputPath||extra.length)throw Error('Usage: node scripts/prepare-runner-setup.mjs <inventory.json> <new scratch/output-directory> [detailed-storage.json]');
const output=path.resolve(outputPath),scratch=path.join(root,'scratch'),relative=path.relative(scratch,output);
if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.existsSync(output))throw Error('Output must be a new directory within project scratch');
for(let parent=path.dirname(output);;parent=path.dirname(parent)){if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())throw Error('Linked output parent refused');if(parent===root)break;if(path.dirname(parent)===parent)throw Error('Output is outside project');}
const input=path.resolve(inventoryPath);if(fs.statSync(input).size>1024*1024)throw Error('Inventory exceeds size limit');
if(storagePath&&fs.statSync(storagePath).size>1024*1024)throw Error('Storage inventory exceeds size limit');
const ownerPolicy=storageOwnerPolicy();
const plan=runnerSetupPlan(JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'')),storagePath?JSON.parse(fs.readFileSync(storagePath,'utf8').replace(/^\uFEFF/,'')):undefined,ownerPolicy);
const files=['src/runner/protocol.ts','src/runner/lease.ts','src/runner/docker-runtime.ts','src/runner/service.ts','src/runner/acceptance.ts','src/central/storage.ts','scripts/isolated-runner.mjs','scripts/accept-isolated-runner.mjs','scripts/runner-linux-preflight.mjs','scripts/verify-runner-bundle.mjs','scripts/isolated-runner/Dockerfile','scripts/isolated-runner/entry.mjs','scripts/isolated-runner/config.example.json','scripts/isolated-runner/wsl.conf.example','scripts/isolated-runner/amu-runner.service.example','docs/session17-runner-setup.md','docs/session21-runner-operations.md'];
// Validate every fixed source before writing any handoff files.
const sources=files.map(name=>{const file=path.join(root,name);if(fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw Error('Unsafe bundle source '+name);const bytes=fs.readFileSync(file);return {name,bytes,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};});
fs.mkdirSync(output,{recursive:true,mode:0o700});
for(const {name,bytes}of sources){const file=path.join(output,'bundle',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});}
const write=(name,body)=>fs.writeFileSync(path.join(output,name),body,{flag:'wx',mode:0o600});
write('plan.json',JSON.stringify(plan,null,2)+'\n');
write('package.json',JSON.stringify({private:true,type:'module',engines:{node:'>=24'},description:'AMU isolated runner handoff; no npm install required'},null,2)+'\n');
const storageTarget=plan.storageReview?.plan.recommendation,swapRoot=storageTarget?.proposedInstallationRoot||storageTarget?.installationRoot;
const swapLine=swapRoot?'swapFile='+(swapRoot+'\\WSL\\swap.vhdx').replaceAll('\\','\\\\')+'\n':'';
write('wslconfig.proposed',plan.resources.memoryGiB>=2&&plan.resources.processors>=1&&!(ownerPolicy.protectedDiskIdentities.length&&!storageTarget)?`# Review only: affects ALL WSL2 distributions. Do not overwrite an existing configuration.\n# Apply only after the approved internal storage target exists.\n[wsl2]\nmemory=${plan.resources.memoryGiB}GB\nprocessors=${plan.resources.processors}\nswap=1GB\n${swapLine}guiApplications=false\nlocalhostForwarding=true\n`:'# Unknown/insufficient resources or owner storage hold: no applicable WSL configuration generated.\n');
const envelopeFiles=['plan.json','package.json','wslconfig.proposed'];
write('manifest.json',JSON.stringify({schemaVersion:1,files:sources.map(({name,sha256,bytes})=>({path:'bundle/'+name,sha256,bytes:bytes.length})),envelopeFiles:envelopeFiles.map(name=>({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex')})),containsCredentials:false,containsModelWeights:false,transferred:false},null,2)+'\n');
const manifestSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(output,'manifest.json'))).digest('hex');
console.log(JSON.stringify({output,files:sources.length,manifestSha256,readyForInstallation:plan.readyForInstallation,blockers:plan.blockers,systemChanged:false,runnerStarted:false}));
