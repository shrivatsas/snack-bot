import * as fs from 'fs';
import * as path from 'path';

export interface AuditEntry {
  timestamp: string;
  flowId: string;
  event: string;
  data?: any;
  level: 'info' | 'warn' | 'error';
}

export class AuditLogger {
  private logFile: string;
  private logDir: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'audit.jsonl');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private async writeEntry(entry: AuditEntry): Promise<void> {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logFile, logLine, 'utf8');
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  async logFlowStart(flowId: string, flowType: string): Promise<void> {
    await this.writeEntry({
      timestamp: new Date().toISOString(),
      flowId,
      event: 'flow_start',
      data: { flowType },
      level: 'info'
    });
  }

  async logStep(flowId: string, step: string, data?: any): Promise<void> {
    await this.writeEntry({
      timestamp: new Date().toISOString(),
      flowId,
      event: step,
      data,
      level: 'info'
    });
  }

  async logFlowComplete(flowId: string, result: any): Promise<void> {
    await this.writeEntry({
      timestamp: new Date().toISOString(),
      flowId,
      event: 'flow_complete',
      data: result,
      level: 'info'
    });
  }

  async logFlowError(flowId: string, error: string): Promise<void> {
    await this.writeEntry({
      timestamp: new Date().toISOString(),
      flowId,
      event: 'flow_error',
      data: { error },
      level: 'error'
    });
  }

  async logWarning(flowId: string, message: string, data?: any): Promise<void> {
    await this.writeEntry({
      timestamp: new Date().toISOString(),
      flowId,
      event: 'warning',
      data: { message, ...data },
      level: 'warn'
    });
  }

  async getFlowLogs(flowId: string): Promise<AuditEntry[]> {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      return lines
        .map(line => {
          try {
            return JSON.parse(line) as AuditEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is AuditEntry => entry !== null && entry.flowId === flowId);
    } catch (error) {
      console.error('Failed to read audit logs:', error);
      return [];
    }
  }

  async getRecentLogs(limit = 100): Promise<AuditEntry[]> {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      return lines
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line) as AuditEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is AuditEntry => entry !== null);
    } catch (error) {
      console.error('Failed to read audit logs:', error);
      return [];
    }
  }
}