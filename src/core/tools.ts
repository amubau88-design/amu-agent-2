import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EngineError } from '../inference/models.ts';
import { checkSource } from './validation.ts';

const root = fs.realpathSync(process.cwd());
export const coreDirectory = path.resolve(process.env.AMU_CORE_STATE_DIR || 'scratch/core');
fs.mkdirSync(coreDirectory, { recursive: true });
const inside = (parent: string, target: string) => { const rel = path.relative(parent, target); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
export function controlledPath(relative: string, write = false): string {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes(':') || relative.includes('\0')) throw new EngineError(403, 'Only project-relative paths are permitted');
  const target = path.resolve(root, relative);
  const normalized = path.relative(root, target).replaceAll('\\', '/');
  if (!inside(root, target) || !/^(src\/|docs\/|scripts\/|scratch\/core\/workspaces\/|package\.json$|tsconfig\.json$)/.test(normalized)) throw new EngineError(403, 'Path is outside controlled AMU source areas');
  if (normalized.split('/').some(s => s.startsWith('.') || ['node_modules','secrets','backups','.git'].includes(s))) throw new EngineError(403, 'Protected path');
  let cursor = target;
  while (!fs.existsSync(cursor)) { const parent = path.dirname(cursor); if (parent === cursor) throw new EngineError(403, 'Invalid target path'); cursor = parent; }
  if (!inside(root, fs.realpathSync(cursor))) throw new EngineError(403, 'Symlink escapes project');
  for (let part = target; inside(root, part) && part !== root; part = path.dirname(part)) if (fs.existsSync(part) && fs.lstatSync(part).isSymbolicLink()) throw new EngineError(403, 'Linked source paths are not permitted');
  if (write && !/\.(?:[cm]?[jt]sx?|json|md|txt)$/.test(target)) throw new EngineError(403, 'File type is not permitted for changes');
  return target;
}
export const contentHash = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
export function readControlled(relative: string) {
  const target = controlledPath(relative);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new EngineError(404, 'Source file not found');
  if (fs.statSync(target).size > 128 * 1024) throw new EngineError(413, 'Source file exceeds analysis limit');
  const content = fs.readFileSync(target, 'utf8');
  return { file: relative, content, sha256: contentHash(content), validation: checkSource(relative, content) };
}
export const isCriticalSource = (file: string) => /^(?:package\.json$|tsconfig\.json$|scripts\/|src\/)/.test(file.replaceAll('\\', '/'));
export type Proposal = { id: string; taskId: string; file: string; baseHash: string | null; content: string; contentHash?: string; risk?: 'critical' | 'normal'; status: 'proposed' | 'applied'; createdAt: string; backup?: string };
export function createProposal(taskId: string, file: string, content: string, baseHash: string | null): Proposal {
  const target = controlledPath(file, true);
  if (typeof content !== 'string' || Buffer.byteLength(content) > 128 * 1024) throw new EngineError(413, 'Proposed content too large');
  const validation = checkSource(file, content);
  if (!validation.passed) throw new EngineError(422, 'Proposed source is invalid: ' + validation.details);
  const exists = fs.existsSync(target);
  if ((exists ? contentHash(fs.readFileSync(target, 'utf8')) : null) !== baseHash) throw new EngineError(409, 'Source changed since it was read');
  if(baseHash===contentHash(content))throw new EngineError(422,'Proposed content does not change the source');
  const proposal: Proposal = { id: crypto.randomUUID(), taskId, file, baseHash, content, contentHash: contentHash(content), risk: isCriticalSource(file) ? 'critical' : 'normal', status: 'proposed', createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(coreDirectory, proposal.id + '.proposal.json'), JSON.stringify(proposal, null, 2), { flag: 'wx' });
  return proposal;
}
export function applyProposal(id: string, approval: { approveCritical?: boolean; expectedContentHash?: string } = {}): Proposal {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new EngineError(400, 'Invalid proposal id');
  const recordPath = path.join(coreDirectory, id + '.proposal.json');
  if (!fs.existsSync(recordPath)) throw new EngineError(404, 'Proposal not found');
  const proposal: Proposal = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  if (isCriticalSource(proposal.file) && (approval.approveCritical !== true || approval.expectedContentHash !== contentHash(proposal.content))) throw new EngineError(403, 'Critical source change requires explicit approval of this exact content hash');
  if (proposal.status !== 'proposed') throw new EngineError(409, 'Proposal already applied');
  const target = controlledPath(proposal.file, true);
  const exists = fs.existsSync(target);
  if ((exists ? contentHash(fs.readFileSync(target, 'utf8')) : null) !== proposal.baseHash) throw new EngineError(409, 'Source changed; regenerate and review proposal');
  if (!checkSource(proposal.file, proposal.content).passed) throw new EngineError(422, 'Proposal syntax is invalid');
  const backupDirectory = path.join(coreDirectory, 'backups', proposal.id);
  fs.mkdirSync(backupDirectory, { recursive: true });
  if (exists) { proposal.backup = path.join(backupDirectory, path.basename(target)); if(fs.existsSync(proposal.backup)){if(fs.lstatSync(proposal.backup).isSymbolicLink()||contentHash(fs.readFileSync(proposal.backup,'utf8'))!==proposal.baseHash)throw new EngineError(409,'Existing repair backup does not match original source');}else fs.copyFileSync(target, proposal.backup, fs.constants.COPYFILE_EXCL); }
  const manifestFile=path.join(backupDirectory,'manifest.json');
  const manifest={file:proposal.file,before:proposal.baseHash,after:contentHash(proposal.content),time:new Date().toISOString(),criticalApproved:isCriticalSource(proposal.file)?approval.approveCritical===true:false,approvedContentHash:contentHash(proposal.content)};
  if(fs.existsSync(manifestFile)){const previous=JSON.parse(fs.readFileSync(manifestFile,'utf8'));if(previous.file!==manifest.file||previous.before!==manifest.before||previous.after!==manifest.after)throw new EngineError(409,'Existing repair manifest does not match proposal');}
  fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = target + '.' + proposal.id + '.tmp';
  if(fs.existsSync(temporary)){if(fs.lstatSync(temporary).isSymbolicLink()||contentHash(fs.readFileSync(temporary,'utf8'))!==contentHash(proposal.content))throw new EngineError(409,'Unrecognized temporary source file; retained for review');}else fs.writeFileSync(temporary, proposal.content, { flag: 'wx' });
  if((fs.existsSync(target)?contentHash(fs.readFileSync(target,'utf8')):null)!==proposal.baseHash)throw new EngineError(409,'Source changed immediately before replacement');
  fs.renameSync(temporary, target);
  proposal.status = 'applied';
  fs.writeFileSync(recordPath + '.tmp', JSON.stringify(proposal, null, 2)); fs.renameSync(recordPath + '.tmp', recordPath);
  return proposal;
}
// Reconcile only writes whose approved manifest, backup and exact resulting source agree.
// No source is written or automatically replayed during recovery.
export function reconcileAppliedProposal(id:string):Proposal|null {
  if(!/^[a-f0-9-]{36}$/.test(id))return null;
  const recordPath=path.join(coreDirectory,id+'.proposal.json');if(!fs.existsSync(recordPath))return null;
  const proposal:Proposal=JSON.parse(fs.readFileSync(recordPath,'utf8'));const alreadyApplied=proposal.status==='applied';
  const manifestPath=path.join(coreDirectory,'backups',id,'manifest.json');if(!fs.existsSync(manifestPath))return null;
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));const expected=contentHash(proposal.content);
  if(manifest.file!==proposal.file||manifest.before!==proposal.baseHash||manifest.after!==expected||manifest.approvedContentHash!==expected)return null;
  if(isCriticalSource(proposal.file)&&manifest.criticalApproved!==true)return null;
  const target=controlledPath(proposal.file,true);if(!fs.existsSync(target)||contentHash(fs.readFileSync(target,'utf8'))!==expected)return null;
  if(proposal.baseHash!==null){const backup=path.join(coreDirectory,'backups',id,path.basename(target));if(!fs.existsSync(backup)||contentHash(fs.readFileSync(backup,'utf8'))!==proposal.baseHash)return null;proposal.backup=backup;}
  proposal.status='applied';if(!alreadyApplied){fs.writeFileSync(recordPath+'.tmp',JSON.stringify(proposal,null,2));fs.renameSync(recordPath+'.tmp',recordPath);}return proposal;
}
