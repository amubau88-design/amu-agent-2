import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {EngineError} from '../inference/models.ts';
const execute=promisify(execFile);
export async function windowsTaskStatus(){if(process.platform!=='win32')return{supported:false,installed:false};try{const {stdout}=await execute(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.resolve('scripts/windows-autostart.ps1'),'-Action','Status'],{cwd:process.cwd(),windowsHide:true,timeout:10000,maxBuffer:65536});return JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{throw new EngineError(503,'Windows task status could not be read under this service account');}}
