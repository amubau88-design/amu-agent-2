import {EngineError} from '../inference/models.ts';
const text={type:'string'},change={type:'object',properties:{path:text,content:text,delete:{type:'boolean'}},required:['path','content','delete'],additionalProperties:false};
export const agentTools=[
 {name:'read_file',permission:'read_file',parameters:{path:'string'}},
 {name:'list_files',permission:'list_files',parameters:{path:'string'}},
 {name:'search_code',permission:'search_code',parameters:{path:'string',query:'string'}},
 {name:'git_status',permission:'git_status',parameters:{}},
 {name:'prepare_changes',permission:'prepare_patch',parameters:{changes:'array'}},
 {name:'run_test',permission:'run_test',parameters:{path:'string'}},
 {name:'show_diff',permission:'show_diff',parameters:{}},
 {name:'request_approval',permission:'show_diff',parameters:{}},
 {name:'prepare_commit',permission:'git_status',parameters:{}},
 {name:'finish',permission:null,parameters:{}},
] as const;
export const agentDecisionSchema={type:'object',properties:{name:{enum:agentTools.map(t=>t.name)},arguments:{type:'object',properties:{path:text,query:text,changes:{type:'array',items:change,minItems:1,maxItems:8}},additionalProperties:false},explanation:text},required:['name','arguments','explanation'],additionalProperties:false};
export const flatAgentDecisionSchema={type:'object',properties:{name:{enum:agentTools.map(t=>t.name)},path:text,query:text,changes:{type:'array',items:change,minItems:0,maxItems:8},explanation:text},required:['name','path','query','changes','explanation'],additionalProperties:false};
export const planSchema={type:'object',properties:{plan:{type:'array',items:text,minItems:1,maxItems:6}},required:['plan'],additionalProperties:false};
/** Fits the existing 192-token planning allowance instead of relying on verbal brevity alone. */
export const concisePlanSchema={type:'object',properties:{plan:{type:'array',items:{type:'string',maxLength:80},minItems:2,maxItems:3}},required:['plan'],additionalProperties:false};
export const reportSchema={type:'object',properties:{summary:text},required:['summary'],additionalProperties:false};
export function validateAgentCall(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['name','arguments','explanation'].includes(k))||typeof input.explanation!=='string'||input.explanation.length>2000)throw new EngineError(422,'Malformed structured tool decision');
 const tool=agentTools.find(t=>t.name===input.name);if(!tool)throw new EngineError(403,'Unknown agent tool');const args=input.arguments;
 if(!args||typeof args!=='object'||Array.isArray(args))throw new EngineError(422,'Tool arguments must be an object');
 const parameters=tool.parameters as Record<string,string>;if(Object.keys(args).some(k=>!Object.hasOwn(parameters,k))||Object.keys(parameters).some(k=>!(k in args)))throw new EngineError(422,'Unexpected or missing tool parameters: '+tool.name);
 for(const [key,type] of Object.entries(parameters)){if(type==='string'&&(typeof args[key]!=='string'||args[key].length>500))throw new EngineError(422,'Invalid tool string: '+key);if(type==='array'&&(!Array.isArray(args[key])||!args[key].length||args[key].length>8))throw new EngineError(422,'Expected 1–8 changes');}
 if(tool.name==='prepare_changes')for(const c of args.changes){if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).length!==3||Object.keys(c).some(k=>!['path','content','delete'].includes(k))||typeof c.path!=='string'||c.path.length>500||typeof c.content!=='string'||Buffer.byteLength(c.content)>128*1024||typeof c.delete!=='boolean')throw new EngineError(422,'Invalid change parameters');}
 if(tool.name==='search_code'&&(!args.query||args.query.length>200))throw new EngineError(422,'Literal search query requires 1–200 characters');return {tool,name:tool.name,arguments:args,explanation:input.explanation};
}
/** Native-format normalization is preparation only; current embedded runtime advertises no native calls. */
export function parseAgentOutput(value:string,format:'amu-json-v1'|'amu-flat-v1'|'openai-native'='amu-json-v1',nativeSupported=false){
 let parsed:any;try{parsed=JSON.parse(value);}catch{throw new EngineError(422,'Incomplete model JSON; no tool executed');}
 if(format==='amu-flat-v1'){
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).length!==5||Object.keys(parsed).some(k=>!['name','path','query','changes','explanation'].includes(k))||typeof parsed.path!=='string'||typeof parsed.query!=='string'||!Array.isArray(parsed.changes))throw new EngineError(422,'Malformed flat tool envelope');
  const tool=agentTools.find(t=>t.name===parsed.name);if(!tool)throw new EngineError(403,'Unknown agent tool');const parameters=tool.parameters as Record<string,string>;
  for(const k of ['path','query','changes'])if(!(k in parameters)&&(k==='changes'?parsed[k].length!==0:parsed[k]!==''))throw new EngineError(422,'Unused flat tool parameters must be empty: '+k);
  parsed={name:parsed.name,arguments:Object.fromEntries(Object.keys(parameters).map(k=>[k,parsed[k]])),explanation:parsed.explanation};
 }
 if(format==='openai-native'){
  if(!nativeSupported)throw new EngineError(409,'Native tool calling is unavailable for this model/runtime');
  if(!Array.isArray(parsed?.tool_calls)||parsed.tool_calls.length!==1)throw new EngineError(422,'Exactly one native tool call required');const call=parsed.tool_calls[0];if(call.type!=='function'||typeof call.function?.arguments!=='string')throw new EngineError(422,'Invalid native call');let args;try{args=JSON.parse(call.function.arguments);}catch{throw new EngineError(422,'Incomplete native arguments');}parsed={name:call.function.name,arguments:args,explanation:'Native function request'};
 }return validateAgentCall(parsed);
}
export const agentToolCatalog=()=>({version:1,format:'amu-flat-v1',formats:['amu-flat-v1','amu-json-v1'],nativeToolCalling:false,administrativeActions:[{name:'apply_changes',requiresAdministrator:true,requiresExactDigest:true},{name:'restore_changes',requiresAdministrator:true,requiresExactDigest:true},{name:'commit_changes',requiresAdministrator:true,requiresExactDigest:true}],tools:agentTools,decisionSchema:flatAgentDecisionSchema,description:'Strukturierte JSON-Werkzeugaufrufe; native Modell-Tool-Calls sind nicht freigeschaltet.'});
