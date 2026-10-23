import type { RouteDecision, TaskTier } from '../shared/types.ts';

export class TaskRouter {
  public route(prompt: string, forcedTier?: TaskTier): RouteDecision {
    if (forcedTier) {
      return this.buildDecision(forcedTier, `Forced tier specified in task options: ${forcedTier}`);
    }

    const lower = prompt.trim().toLowerCase();

    // 1. GREETING check
    if (this.isGreeting(lower)) {
      return this.buildDecision('GREETING', 'Deterministic matching: Casual greeting detected.');
    }

    // 2. DEBUG check
    if (this.isDebug(lower)) {
      return this.buildDecision('DEBUG', 'Deterministic matching: Debugging/error keywords detected.');
    }

    // 3. FULL_AGENT check
    if (this.isFullAgent(lower)) {
      return this.buildDecision('FULL_AGENT', 'Deterministic matching: Complex multi-step development keywords detected.');
    }

    // 4. CODE check
    if (this.isCode(lower)) {
      return this.buildDecision('CODE', 'Deterministic matching: Code generation/editing keywords detected.');
    }

    // 5. Default KNOWLEDGE
    return this.buildDecision('KNOWLEDGE', 'Deterministic matching: General knowledge or standard inquiry.');
  }

  private isGreeting(text: string): boolean {
    const greetingWords = ['hallo', 'hi', 'hey', 'guten tag', 'moin', 'servus', 'wer bist du', 'hello'];
    // Short string check
    if (text.length < 30 && greetingWords.some(w => text.includes(w))) {
      return true;
    }
    return false;
  }

  private isDebug(text: string): boolean {
    const debugKeywords = ['debug', 'fehler', 'error', 'bug', 'fix', 'reparier', 'exception', 'stacktrace', 'failing test', 'test schlägt fehl'];
    return debugKeywords.some(w => text.includes(w));
  }

  private isFullAgent(text: string): boolean {
    const fullAgentKeywords = ['bau ein', 'entwickle', 'erstelle neues modul', 'full agent', 'refactore das gesamte', 'end-to-end', 'mehrstufig', 'komplettes projekt'];
    return fullAgentKeywords.some(w => text.includes(w));
  }

  private isCode(text: string): boolean {
    const codeKeywords = ['code', 'funktion', 'schreibe', 'implementiere', 'class', 'interface', 'typescript', 'javascript', 'html', 'css', 'api endpoint'];
    return codeKeywords.some(w => text.includes(w));
  }

  private buildDecision(tier: TaskTier, reason: string): RouteDecision {
    switch (tier) {
      case 'GREETING':
        return {
          tier,
          reason,
          loadedTools: [],
          contextStrategy: 'minimal',
          maxTokens: 256,
          temperature: 0.7,
        };
      case 'KNOWLEDGE':
        return {
          tier,
          reason,
          loadedTools: [],
          contextStrategy: 'knowledge',
          maxTokens: 1024,
          temperature: 0.3,
        };
      case 'CODE':
        return {
          tier,
          reason,
          loadedTools: ['file_read', 'file_write'],
          contextStrategy: 'coding',
          maxTokens: 2048,
          temperature: 0.2,
        };
      case 'DEBUG':
        return {
          tier,
          reason,
          loadedTools: ['file_read', 'file_write', 'run_test', 'analyze_log'],
          contextStrategy: 'debug',
          maxTokens: 4096,
          temperature: 0.1,
        };
      case 'FULL_AGENT':
        return {
          tier,
          reason,
          loadedTools: ['file_read', 'file_write', 'file_delete', 'run_test', 'run_build', 'execute_cmd', 'verify'],
          contextStrategy: 'full',
          maxTokens: 8192,
          temperature: 0.1,
        };
    }
  }
}

export const taskRouter = new TaskRouter();
