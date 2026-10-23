import {loadNetworkProfile,tlsFile} from './network-profile.ts';
import fs from 'node:fs';
import net from 'node:net';
import { EngineError } from '../inference/models.ts';
const profile=loadNetworkProfile();
export const bindHost = process.env.AMU_BIND_HOST || profile.bindHost;
export const isLoopback = (address: string) => ['127.0.0.1','::1','::ffff:127.0.0.1','localhost'].includes(address);
const allowed = new net.BlockList();
const cidrs = (process.env.AMU_ALLOWED_CIDRS ?? profile.allowedCidrs.join(',')).split(',').map(v => v.trim()).filter(Boolean);
for (const cidr of cidrs) {
  const [address, bits] = cidr.split('/'); const version = net.isIP(address);
  if (!version) throw new Error('AMU_ALLOWED_CIDRS contains an invalid IP address');
  const family = version === 4 ? 'ipv4' : 'ipv6';
  if (bits === undefined) allowed.addAddress(address, family);
  else { const prefix = Number(bits); if (!Number.isInteger(prefix) || prefix < 0 || prefix > (version === 4 ? 32 : 128)) throw new Error('Invalid allowed subnet prefix'); allowed.addSubnet(address, prefix, family); }
}
export function tlsOptions() {
  const cert = process.env.AMU_TLS_CERT || (profile.certificate?tlsFile(profile.certificate):undefined); const key = process.env.AMU_TLS_KEY || (profile.privateKey?tlsFile(profile.privateKey):undefined);
  if (cert && key) return { cert: fs.readFileSync(cert), key: fs.readFileSync(key), minVersion: 'TLSv1.2' as const };
  if (!isLoopback(bindHost)) throw new Error('LAN binding requires AMU_TLS_CERT and AMU_TLS_KEY');
  return undefined;
}
export function validateNetworkConfiguration() { if (!isLoopback(bindHost) && !cidrs.length) throw new Error('LAN binding requires an explicit AMU_ALLOWED_CIDRS allowlist'); }
export function checkNetworkAccess(remote: string, admin = false) {
  if (isLoopback(remote)) return;
  const address = remote.startsWith('::ffff:') ? remote.slice(7) : remote;
  const version = net.isIP(address);
  if (!version || !allowed.check(address, version === 4 ? 'ipv4' : 'ipv6')) throw new EngineError(403, 'Source address is not allowed');
  if (admin && !(process.env.AMU_ALLOW_REMOTE_ADMIN!==undefined?process.env.AMU_ALLOW_REMOTE_ADMIN==='true':profile.allowRemoteAdmin)) throw new EngineError(403, 'Remote administration is disabled');
}
export function networkStatus() { return { bindHost, tls: !!((process.env.AMU_TLS_CERT && process.env.AMU_TLS_KEY)||(profile.certificate&&profile.privateKey)), allowedCidrs: cidrs, remoteAdministration: process.env.AMU_ALLOW_REMOTE_ADMIN!==undefined?process.env.AMU_ALLOW_REMOTE_ADMIN==='true':profile.allowRemoteAdmin }; }
