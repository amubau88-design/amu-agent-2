import crypto from 'node:crypto';

export const hash = (value:string|Buffer) => crypto.createHash('sha256').update(value).digest('hex');
export const uuid = (value:unknown):value is string => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export type RunnerProfile={id:string;kind:'build'|'unit'|'integration'|'typecheck';executable:'node'|'npm';arguments:string[];limits:{wallTimeMs:number;memoryMiB:number;cpuCount:number;processCount:number;outputBytes:number}};
export type ManifestFile={path:string;sha256:string;bytes:number};
export function sourcePath(value:unknown):asserts value is string {
 if(typeof value!=='string'||value.length>180||!value.split('/').every(p=>/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(p)&&!['node_modules','secrets','backups'].includes(p.toLowerCase()))||value.includes(':'))throw Error('Invalid runner source path');
}
export function profileDigest(profile:RunnerProfile){return hash(JSON.stringify({id:profile.id,kind:profile.kind,executable:profile.executable,arguments:profile.arguments,limits:Object.fromEntries(['wallTimeMs','memoryMiB','cpuCount','processCount','outputBytes'].map(k=>[k,profile.limits[k as keyof typeof profile.limits]]))}));}
export function validateProfile(value:any):RunnerProfile {
 if(!value||Object.keys(value).sort().join()!==['arguments','executable','id','kind','limits'].sort().join()||!/^[a-z0-9-]{1,64}$/.test(value.id)||!['build','unit','integration','typecheck'].includes(value.kind))throw Error('Invalid fixed runner profile');
 const ranges={wallTimeMs:[1000,120000],memoryMiB:[128,4096],cpuCount:[1,4],processCount:[4,64],outputBytes:[1024,32768]};
 if(!value.limits||Object.keys(value.limits).sort().join()!==Object.keys(ranges).sort().join())throw Error('Complete runner limits required');
 for(const [k,[min,max]]of Object.entries(ranges))if(!Number.isInteger(value.limits[k])||value.limits[k]<min||value.limits[k]>max)throw Error('Unsafe runner limit: '+k);
 const args=value.arguments;if(!Array.isArray(args)||args.length<1||args.length>13||args.some(a=>typeof a!=='string'))throw Error('Invalid literal arguments');
 if(value.executable==='node'){
  if(!['--check','--test'].includes(args[0])||args.length<2||args[0]==='--check'&&args.length!==2)throw Error('Only explicit Node syntax/test files are allowed');
  for(const file of args.slice(1)){sourcePath(file);if(!/\.[cm]?js$/.test(file))throw Error('Node profiles require JavaScript files');}
 }else if(value.executable==='npm'){
  if(args.length!==2||args[0]!=='run'||!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/.test(args[1]))throw Error('Only a fixed npm script is allowed');
 }else throw Error('Runner image supports Node/npm only; Python requires a separately reviewed image');
 return structuredClone(value);
}
export function validateManifest(value:any):ManifestFile[]{
 if(!Array.isArray(value)||!value.length||value.length>12)throw Error('Select 1–12 explicit files');const seen=new Set<string>();let bytes=0;
 for(const file of value){if(!file||Object.keys(file).sort().join()!==['bytes','path','sha256'].sort().join())throw Error('Invalid manifest fields');sourcePath(file.path);if(seen.has(file.path.toLowerCase()))throw Error('Duplicate source path');seen.add(file.path.toLowerCase());if(typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isInteger(file.bytes)||file.bytes<0||file.bytes>131072)throw Error('Invalid manifest hash/size');bytes+=file.bytes;}
 const paths=[...seen];if(paths.some((name,i)=>paths.some((other,j)=>i!==j&&other.startsWith(name+'/'))))throw Error('Conflicting file/directory paths');if(bytes>524288)throw Error('Source snapshot exceeds 512 KiB');return value;
}
