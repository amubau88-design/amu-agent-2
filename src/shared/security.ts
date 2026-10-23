import path from 'node:path';
import type { CapabilityPermission } from './types.ts';

export const DEFAULT_PROJECT_ROOT = path.resolve(process.cwd());

export const DEFAULT_PERMISSIONS: CapabilityPermission = {
  allowedPaths: [DEFAULT_PROJECT_ROOT],
  deniedPaths: [
    path.resolve(DEFAULT_PROJECT_ROOT, '..', 'AMU SYSTEM'),
    path.resolve(DEFAULT_PROJECT_ROOT, '..', 'AMU Preis Assistent'),
    path.resolve(DEFAULT_PROJECT_ROOT, '..', 'AMU Auftragsplattform'),
  ],
  allowCommandExecution: true,
  allowedCommands: ['npm', 'node', 'tsc', 'git status', 'git diff', 'dir', 'ls'],
  allowFileDeletion: false,
  allowNetworkAccess: true,
};

export class SecurityGuard {
  private permissions: CapabilityPermission;
  private projectRoot: string;

  constructor(permissions: CapabilityPermission = DEFAULT_PERMISSIONS, rootDir: string = DEFAULT_PROJECT_ROOT) {
    this.permissions = permissions;
    this.projectRoot = path.resolve(rootDir);
  }

  public validatePathAccess(targetPath: string, mode: 'read' | 'write' | 'delete'): void {
    const resolvedPath = path.resolve(targetPath);

    // Check denied paths first
    for (const denied of this.permissions.deniedPaths) {
      if (resolvedPath.toLowerCase().startsWith(denied.toLowerCase())) {
        throw new Error(`SECURITY VIOLATION: Path access denied to external project path: ${targetPath}`);
      }
    }

    // Ensure path is within allowed project root
    let isAllowed = false;
    for (const allowed of this.permissions.allowedPaths) {
      if (resolvedPath.toLowerCase().startsWith(path.resolve(allowed).toLowerCase())) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      throw new Error(`SECURITY VIOLATION: Access outside allowed project root is forbidden: ${targetPath}`);
    }

    if (mode === 'delete' && !this.permissions.allowFileDeletion) {
      throw new Error(`SECURITY VIOLATION: File deletion is strictly disabled in current capability profile.`);
    }
  }

  public validateCommand(command: string): void {
    if (!this.permissions.allowCommandExecution) {
      throw new Error(`SECURITY VIOLATION: Command execution is disabled.`);
    }

    const forbiddenPatterns = [
      /rmdir\s+\/s\s+\/q\s+[c-z]:/i,
      /rm\s+-rf\s+\//i,
      /format\s+[c-z]:/i,
      /drop\s+database/i,
      /delete\s+from/i,
      /password/i,
      /secret/i,
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(command)) {
        throw new Error(`SECURITY VIOLATION: Command contains prohibited pattern: ${command}`);
      }
    }
  }

  public sanitizeOutput(text: string): string {
    // Scrub potential API keys or secrets
    return text.replace(/(api[-_]?key|secret|password|bearer\s+[a-z0-9\._-]+)\s*[:=]\s*["']?([^"'\s]+)["']?/gi, '$1=***REDACTED***');
  }
}
