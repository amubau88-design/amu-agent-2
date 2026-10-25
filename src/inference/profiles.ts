import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readGgufFileInfo} from 'node-llama-cpp';
import {EngineError,listLocalModels,modelDirectory,modelPath,registryFile,type ModelEntry} from './models.ts';
import {writePrivateJson} from '../central/storage.ts';

export type CodingProfile={id:string;name:string;version:number;repository:string|null;format:'GGUF';architecture:string|null;template:'gguf-auto'|'chatml'|'gguf-jinja';tokenizer:'embedded-gguf';defaultContext:number;maximumContext:number;minimumWeightBytes:number;expectedTemplateSha256?:string;expectedLayers?:number;expectedEmbedding?:number;headDimension?:number;capabilities:{streaming:true;jsonSchema:true;structuredTools:true;nativeToolCalling:false};runtime:string};
const capabilities={streaming:true,jsonSchema:true,structuredTools:true,nativeToolCalling:false} as const;
export const codingProfiles:CodingProfile[]=[
 {id:'local-gguf',name:'Vorhandenes lokales GGUF-Modell',version:1,repository:null,format:'GGUF',architecture:null,template:'gguf-auto',tokenizer:'embedded-gguf',defaultContext:4096,maximumContext:32768,minimumWeightBytes:0,capabilities,runtime:'node-llama-cpp 3.22.2 / embedded llama.cpp'},
 {id:'qwen3-coder-30b-a3b',name:'Qwen3-Coder-30B-A3B-Instruct',version:1,repository:'Qwen/Qwen3-Coder-30B-A3B-Instruct',format:'GGUF',architecture:'qwen3moe',template:'gguf-jinja',tokenizer:'embedded-gguf',defaultContext:4096,maximumContext:262144,minimumWeightBytes:18000000000,expectedLayers:48,expectedEmbedding:2048,headDimension:128,expectedTemplateSha256:'5a38bfa05833266240066aedc497decc9b00cc0d3e3b8cceea98cf530196ab06',capabilities,runtime:'Embedded GGUF Jinja template; native 30B load/quality acceptance pending'},
 {id:'qwen25-coder-32b',name:'Qwen2.5-Coder-32B-Instruct',version:1,repository:'Qwen/Qwen2.5-Coder-32B-Instruct',format:'GGUF',architecture:'qwen2',template:'gguf-auto',tokenizer:'embedded-gguf',defaultContext:4096,maximumContext:32768,minimumWeightBytes:19900000000,expectedLayers:64,expectedEmbedding:5120,headDimension:128,capabilities,runtime:'node-llama-cpp 3.22.2 / embedded llama.cpp; large-model acceptance pending'},
];
export function codingProfile(id:string){const profile=codingProfiles.find(p=>p.id===id);if(!profile)throw new EngineError(400,'Unknown coding model profile');return profile;}
export function installedProfile(id:string){const model=listLocalModels().find(m=>m.id===id);if(!model)throw new EngineError(404,'Local model not installed');return codingProfile(model.profileId||'local-gguf');}
export function assertProfileContext(profile:CodingProfile,contextSize:number){if(!Number.isSafeInteger(contextSize)||contextSize<512||contextSize>profile.maximumContext)throw new EngineError(422,'Configured context exceeds model profile capacity');}
export function validateProfileMetadata(profile:CodingProfile,metadata:any){
 const architecture=metadata.general?.architecture,config=metadata[architecture],template=metadata.tokenizer?.chat_template;
 if(profile.architecture&&profile.architecture!==architecture)throw new EngineError(422,'GGUF architecture does not match model profile');
 if(profile.expectedLayers&&config?.block_count!==profile.expectedLayers||profile.expectedEmbedding&&config?.embedding_length!==profile.expectedEmbedding)throw new EngineError(422,'GGUF dimensions do not match the selected coding model; a small model cannot be relabeled as a large Coder');
 if(profile.repository&&(typeof template!=='string'||template.length>65536))throw new EngineError(422,'Coding model requires its bounded embedded GGUF chat template');
 if(profile.expectedTemplateSha256&&crypto.createHash('sha256').update(template).digest('hex')!==profile.expectedTemplateSha256)throw new EngineError(422,'GGUF chat template differs from the verified official profile revision');
}

/** Register existing weights only. Never downloads, overwrites, or loads a native process. */
let registrationActive=false;
export async function registerLocalModel(body:any){if(registrationActive)throw new EngineError(409,'A local model validation is already running');registrationActive=true;try{return await registerLocalModelOnce(body);}finally{registrationActive=false;}}
async function registerLocalModelOnce(body:any){
 const profile=codingProfile(body?.profileId),id=body?.modelId,filename=body?.filename;
 if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,99}$/.test(id)||typeof filename!=='string'||filename.includes(':')||filename.includes('\\')||path.basename(filename)!==filename||!filename.endsWith('.gguf')||!/^[a-f0-9]{64}$/.test(body.sha256||''))throw new EngineError(400,'Model id, GGUF filename, profile and expected SHA-256 are required');
 const file=path.join(modelDirectory,filename);if(!fs.existsSync(file))throw new EngineError(404,'Copy approved weights into the local model directory first');
 const relative=path.relative(fs.realpathSync(modelDirectory),fs.realpathSync(file));if(relative.startsWith('..')||path.isAbsolute(relative)||fs.lstatSync(file).isSymbolicLink())throw new EngineError(403,'Linked model paths are not permitted');
 const before=fs.statSync(file);if(!before.isFile())throw new EngineError(400,'Model must be a regular file');
 const digest=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))digest.update(chunk);if(digest.digest('hex')!==body.sha256)throw new EngineError(422,'GGUF checksum differs from expected value');
 const info=await readGgufFileInfo(file,{sourceType:'filesystem',readTensorInfo:false,logWarnings:false,ignoreKeys:['tokenizer.ggml.tokens','tokenizer.ggml.merges','tokenizer.ggml.token_type']});
 validateProfileMetadata(profile,info.metadata);
 const after=fs.statSync(file);if(after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new EngineError(409,'Weights changed during validation');
 const entries:ModelEntry[]=fs.existsSync(registryFile)?JSON.parse(fs.readFileSync(registryFile,'utf8')):[];if(!Array.isArray(entries))throw new EngineError(409,'Existing registry is invalid; preserved');
 if(entries.some(entry=>entry.id===id||entry.filename===filename))throw new EngineError(409,'Model id or file is already registered; existing entry preserved');
 const entry:ModelEntry={id,filename,sha256:body.sha256,bytes:after.size,license:profile.repository?'Apache-2.0':'User must verify weight license',profileId:profile.id,registeredAt:new Date().toISOString()};
 writePrivateJson(registryFile,[...entries,entry],true);return {...entry,path:modelPath(id),loaded:false};
}
