import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
let cached:{at:number;value:any}|undefined;
export async function hardwareInventory(){
 if(cached&&Date.now()-cached.at<30000)return {...cached.value,freeMemoryBytes:os.freemem()};
 let adapters:any[]=[],probeError:string|null=null;
 if(process.platform==='win32'){
  try{const powershell=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');const command="[void][Reflection.Assembly]::LoadWithPartialName('System.Management');$s=New-Object System.Management.ManagementObjectSearcher('SELECT Name,AdapterRAM FROM Win32_VideoController');@($s.Get() | ForEach-Object { [pscustomobject]@{name=$_.Name;driverReportedBytes=$_.AdapterRAM} }) | ConvertTo-Json -Compress";const {stdout}=await run(powershell,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:4000,maxBuffer:16384});const data=JSON.parse(stdout);adapters=(Array.isArray(data)?data:[data]).filter(Boolean).map(a=>({...a,vramVerified:false,source:'Windows driver; AdapterRAM may truncate above 4 GiB'}));}catch{probeError='GPU driver inventory unavailable; no GPU capacity assumed';}
 }
 const candidates=process.platform==='win32'?[path.join(process.env.SystemRoot||'C:/Windows','System32/nvidia-smi.exe'),path.join(process.env.ProgramFiles||'C:/Program Files','NVIDIA Corporation/NVSMI/nvidia-smi.exe')]:['/usr/bin/nvidia-smi'];
 const executable=candidates.find(file=>fs.existsSync(file));if(executable){try{const {stdout}=await run(executable,['--query-gpu=name,memory.total,memory.free','--format=csv,noheader,nounits'],{windowsHide:true,timeout:3000,maxBuffer:16384});const devices=stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>{const [name,total,free]=line.split(',').map(s=>s.trim());return {name,totalVramBytes:Number(total)*1024**2,freeVramBytes:Number(free)*1024**2,vramVerified:true,source:'nvidia-smi'};});if(devices.every(d=>Number.isFinite(d.totalVramBytes)&&Number.isFinite(d.freeVramBytes)))adapters=devices;}catch{probeError='NVIDIA query unavailable; no verified VRAM capacity';}}
 const value={cpu:os.cpus()[0]?.model,logicalCpus:os.availableParallelism(),totalMemoryBytes:os.totalmem(),freeMemoryBytes:os.freemem(),adapters,probeError,runtimeBackend:'cpu',gpuOffloadingEnabled:false,checkedAt:new Date().toISOString()};cached={at:Date.now(),value};return value;
}
