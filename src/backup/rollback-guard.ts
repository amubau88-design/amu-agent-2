import fs from 'node:fs';
import path from 'node:path';
if(fs.existsSync(path.resolve('scratch/manual-rollback.lock')))throw Error('Manual code rollback is incomplete. Keep AMU stopped and use the preserved rollback recovery tool.');
