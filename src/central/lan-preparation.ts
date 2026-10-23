import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
export function lanPreparation(){
 const directory=path.resolve('scratch/tls-public');const caFile=path.join(directory,'amu-ca.pem');const serverFile=path.resolve('scratch/secrets/tls/server-cert.pem');
 if(!fs.existsSync(caFile)||!fs.existsSync(serverFile))return{prepared:false,twoComputerTest:'not performed'};
 const certificate=new X509Certificate(fs.readFileSync(serverFile));const ca=new X509Certificate(fs.readFileSync(caFile));
 return{prepared:true,caFile,serverCertificate:serverFile,certificateExpires:certificate.validTo,remainingDays:Math.floor((Date.parse(certificate.validTo)-Date.now())/86400000),subjectAlternativeNames:certificate.subjectAltName,caFingerprint256:ca.fingerprint256,twoComputerTest:'not performed',certificateStoreModified:false,firewallModified:false};
}
