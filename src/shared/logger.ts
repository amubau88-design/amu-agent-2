import type { AuditEvent } from './types.ts';

export class StructuredLogger {
  private correlationId: string;
  private requestId: string;

  constructor(correlationId: string = 'global', requestId: string = 'global') {
    this.correlationId = correlationId;
    this.requestId = requestId;
  }

  public setContext(correlationId: string, requestId: string): void {
    this.correlationId = correlationId;
    this.requestId = requestId;
  }

  public info(message: string, details?: Record<string, unknown>): void {
    this.log('INFO', message, details);
  }

  public warn(message: string, details?: Record<string, unknown>): void {
    this.log('WARN', message, details);
  }

  public error(message: string, details?: Record<string, unknown>): void {
    this.log('ERROR', message, details);
  }

  public audit(eventType: string, details: Record<string, unknown>): AuditEvent {
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      requestId: this.requestId,
      eventType,
      details,
    };
    this.info(`[AUDIT:${eventType}]`, details);
    return event;
  }

  private log(level: string, message: string, details?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: this.correlationId,
      requestId: this.requestId,
      message,
      ...(details ? { details } : {}),
    };
    // Clean formatted output
    process.stdout.write(JSON.stringify(logEntry) + '\n');
  }
}

export const logger = new StructuredLogger();
