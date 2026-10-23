// One-time offline import. No inference server is contacted.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs, []));
if (!args.file || !args.id || !/^[a-f0-9]{64}$/.test(args.sha256 || '')) throw new Error('Usage: node scripts/import-model.mjs --file <GGUF> --id <model-id> --sha256 <checksum> --license <license-id>');
const directory = path.resolve('scratch/models');
await fsp.mkdir(directory, { recursive: true });
const filename = args.id.replace(/[^a-zA-Z0-9._-]/g, '-') + '.gguf';
const target = path.join(directory, filename);
if (fs.existsSync(target)) throw new Error('Target already exists; no model overwritten');
const source = await fsp.open(args.file, 'r');
const magic = Buffer.alloc(4); await source.read(magic, 0, 4, 0); await source.close();
if (magic.toString() !== 'GGUF') throw new Error('Source is not a GGUF model');
const digest = crypto.createHash('sha256');
const temporary = target + '.partial';
try {
  await pipeline(fs.createReadStream(args.file), new Transform({ transform(chunk, encoding, done) { digest.update(chunk); done(null, chunk); } }), fs.createWriteStream(temporary, { flags: 'wx' }));
  if (digest.digest('hex') !== args.sha256) throw new Error('Source checksum mismatch; import refused');
  await fsp.rename(temporary, target);
} catch (error) { if (fs.existsSync(temporary)) await fsp.unlink(temporary); throw error; }
const registryPath = path.join(directory, 'registry.json');
const registry = fs.existsSync(registryPath) ? JSON.parse(await fsp.readFile(registryPath, 'utf8')) : [];
if (registry.some(m => m.id === args.id)) throw new Error('Model id already registered');
registry.push({ id: args.id, filename, sha256: args.sha256, bytes: (await fsp.stat(target)).size, license: args.license || 'unspecified' });
await fsp.writeFile(registryPath + '.tmp', JSON.stringify(registry, null, 2));
await fsp.rename(registryPath + '.tmp', registryPath);
console.log(JSON.stringify({ imported: args.id, path: target, checksumVerified: true }));
