import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';
import type { ToolCallResult } from '../shared/types.ts';

const execAsync = promisify(exec);
const security = new SecurityGuard(DEFAULT_PERMISSIONS);

export async function executeCmdTool(command: string, cwd: string = process.cwd()): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    security.validateCommand(command);
    security.validatePathAccess(cwd, 'read');

    const { stdout, stderr } = await execAsync(command, { cwd, timeout: 30000 });
    const output = security.sanitizeOutput(stdout + (stderr ? `\nSTDERR:\n${stderr}` : ''));

    return {
      toolName: 'execute_cmd',
      success: true,
      output,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const error = err as Error & { stdout?: string; stderr?: string };
    const output = security.sanitizeOutput((error.stdout || '') + '\n' + (error.stderr || error.message));

    return {
      toolName: 'execute_cmd',
      success: false,
      output,
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function runTestTool(testPath?: string): Promise<ToolCallResult> {
  const cmd = testPath ? `node --test ${testPath}` : 'npm test';
  return executeCmdTool(cmd);
}

export async function runBuildTool(): Promise<ToolCallResult> {
  return executeCmdTool('npm run build');
}
