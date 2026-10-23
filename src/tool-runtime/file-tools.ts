import fs from 'node:fs/promises';
import path from 'node:path';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';
import type { ToolCallResult } from '../shared/types.ts';

const security = new SecurityGuard(DEFAULT_PERMISSIONS);

export async function readFileTool(filePath: string): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    security.validatePathAccess(filePath, 'read');
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      toolName: 'file_read',
      success: true,
      output: content,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      toolName: 'file_read',
      success: false,
      output: '',
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function writeFileTool(filePath: string, content: string): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    security.validatePathAccess(filePath, 'write');
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return {
      toolName: 'file_write',
      success: true,
      output: `File successfully written to ${filePath}`,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      toolName: 'file_write',
      success: false,
      output: '',
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function deleteFileTool(filePath: string): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    security.validatePathAccess(filePath, 'delete');
    await fs.unlink(filePath);
    return {
      toolName: 'file_delete',
      success: true,
      output: `File deleted: ${filePath}`,
      durationMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      toolName: 'file_delete',
      success: false,
      output: '',
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}
