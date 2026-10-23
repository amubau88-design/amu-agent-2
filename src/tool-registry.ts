import type { ToolCallResult, ToolDefinition } from './shared/types.ts';
import { readFileTool, writeFileTool, deleteFileTool } from './tool-runtime/file-tools.ts';
import { executeCmdTool, runTestTool, runBuildTool } from './tool-runtime/cmd-tools.ts';

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolCallResult>;

export class ToolRegistry {
  private tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    this.register('file_read', {
      name: 'file_read',
      description: 'Read contents of a file',
      category: 'file',
      parameters: { filePath: 'string' },
      requiredPermissions: ['file:read'],
    }, async (args) => readFileTool(args.filePath as string));

    this.register('file_write', {
      name: 'file_write',
      description: 'Write content to a file',
      category: 'file',
      parameters: { filePath: 'string', content: 'string' },
      requiredPermissions: ['file:write'],
    }, async (args) => writeFileTool(args.filePath as string, args.content as string));

    this.register('file_delete', {
      name: 'file_delete',
      description: 'Delete a file',
      category: 'file',
      parameters: { filePath: 'string' },
      requiredPermissions: ['file:delete'],
    }, async (args) => deleteFileTool(args.filePath as string));

    this.register('execute_cmd', {
      name: 'execute_cmd',
      description: 'Execute a shell command safely',
      category: 'cmd',
      parameters: { command: 'string' },
      requiredPermissions: ['cmd:execute'],
    }, async (args) => executeCmdTool(args.command as string));

    this.register('run_test', {
      name: 'run_test',
      description: 'Run project unit tests',
      category: 'test',
      parameters: { testPath: 'string' },
      requiredPermissions: ['cmd:execute'],
    }, async (args) => runTestTool(args.testPath as string | undefined));

    this.register('run_build', {
      name: 'run_build',
      description: 'Run project build compilation',
      category: 'build',
      parameters: {},
      requiredPermissions: ['cmd:execute'],
    }, async () => runBuildTool());
  }

  public register(name: string, definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(name, { definition, handler });
  }

  public getAvailableTools(loadedToolNames: string[]): ToolDefinition[] {
    return loadedToolNames
      .filter(name => this.tools.has(name))
      .map(name => this.tools.get(name)!.definition);
  }

  public async executeTool(name: string, args: Record<string, unknown>, allowedTools: string[]): Promise<ToolCallResult> {
    if (!allowedTools.includes(name)) {
      return {
        toolName: name,
        success: false,
        output: '',
        error: `PERMISSIONS DENIED: Tool '${name}' is not in the loaded tool set for this task tier.`,
        durationMs: 0,
      };
    }

    const tool = this.tools.get(name);
    if (!tool) {
      return {
        toolName: name,
        success: false,
        output: '',
        error: `UNKNOWN TOOL: Tool '${name}' is not registered in ToolRegistry.`,
        durationMs: 0,
      };
    }

    return tool.handler(args);
  }
}

export const toolRegistry = new ToolRegistry();
