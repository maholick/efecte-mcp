import { efecteConfig } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: number;
  private enableStructured: boolean;

  constructor() {
    this.level = LOG_LEVELS[efecteConfig.logging.level as LogLevel] || LOG_LEVELS.info;
    this.enableStructured = efecteConfig.logging.enableStructured;
  }

  private log(level: LogLevel, message: string, data?: any) {
    if (LOG_LEVELS[level] < this.level) return;

    const timestamp = new Date().toISOString();
    
    if (this.enableStructured) {
      const logEntry = {
        timestamp,
        level,
        message,
        ...(data && { data }),
      };
      console.error(JSON.stringify(logEntry));
    } else {
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      console.error(`${prefix} ${message}`);
      if (data) {
        console.error(JSON.stringify(data, null, 2));
      }
    }
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, error?: any) {
    const data = error instanceof Error 
      ? { message: error.message, stack: error.stack }
      : error;
    this.log('error', message, data);
  }

  performance(operation: string, duration: number, metadata?: any) {
    if (!efecteConfig.logging.enablePerformanceMetrics) return;
    
    this.log('info', `Performance: ${operation}`, {
      duration_ms: duration,
      ...metadata,
    });
  }
}

export const logger = new Logger();