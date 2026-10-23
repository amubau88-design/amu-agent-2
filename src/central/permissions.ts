import { EngineError } from '../inference/models.ts';
export type ClientRole = 'inference' | 'operator' | 'developer' | 'admin';
export type Principal = { admin: boolean; role?: ClientRole };
export const roleOf = (client: Principal): ClientRole => client.admin ? 'admin' : client.role && ['inference','operator','developer'].includes(client.role) ? client.role : 'inference';
export function requireRole(client: Principal, allowed: ClientRole[]) { if (!allowed.includes(roleOf(client))) throw new EngineError(403, 'Client role does not permit this operation'); }
