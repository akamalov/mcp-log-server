import { EventEmitter } from 'events';
import {
  LoggingLevel,
  LoggingMessageNotification,
  ServerInfo,
} from '@mcp-log-server/types';

/**
 * Log level hierarchy for filtering and comparison
 */
const LOG_LEVEL_HIERARCHY: Record<LoggingLevel, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  critical: 5,
  alert: 6,
  emergency: 7,
};

/**
 * Log level display names for formatting
 */
const LOG_LEVEL_NAMES: Record<LoggingLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  notice: 'NOTICE',
  warning: 'WARN',
  error: 'ERROR',
  critical: 'CRIT',
  alert: 'ALERT',
  emergency: 'EMERG',
};

/**
 * Log entry interface for structured logging
 */
export interface LogEntry {
  timestamp: Date;
  level: LoggingLevel;
  logger: string;
  message: string;
  data?: any;
  context?: Record<string, any>;
}

/**
 * Logger interface for pluggable logging backends
 */
export interface LoggerBackend {
  log(entry: LogEntry): void | Promise<void>;
}

/**
 * Console logger backend
 */
export class ConsoleLoggerBackend implements LoggerBackend {
  private useColors: boolean;

  constructor(useColors: boolean = true) {
    this.useColors = useColors && typeof process !== 'undefined' && process.stdout?.isTTY;
  }

  log(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = LOG_LEVEL_NAMES[entry.level];
    const logger = entry.logger;
    const message = entry.message;

    let formattedMessage = `[${timestamp}] ${level.padEnd(5)} ${logger}: ${message}`;

    if (this.useColors) {
      formattedMessage = this.colorize(formattedMessage, entry.level);
    }

    if (entry.data) {
      formattedMessage += '\n' + this.formatData(entry.data);
    }

    if (entry.context && Object.keys(entry.context).length > 0) {
      formattedMessage += '\n' + this.formatContext(entry.context);
    }

    const output = this.getOutputStream(entry.level);
    output.write(formattedMessage + '\n');
  }

  private colorize(message: string, level: LoggingLevel): string {
    const colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      notice: '\x1b[34m', // Blue
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      critical: '\x1b[35m', // Magenta
      alert: '\x1b[41m',    // Red background
      emergency: '\x1b[41m\x1b[5m', // Red background + blink
    };

    const reset = '\x1b[0m';
    return colors[level] + message + reset;
  }

  private formatData(data: any): string {
    if (typeof data === 'string') {
      return `  Data: ${data}`;
    }
    
    try {
      return `  Data: ${JSON.stringify(data, null, 2).split('\n').map(line => '  ' + line).join('\n')}`;
    } catch {
      return `  Data: ${String(data)}`;
    }
  }

  private formatContext(context: Record<string, any>): string {
    const formatted = Object.entries(context)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    return `  Context: ${formatted}`;
  }

  private getOutputStream(level: LoggingLevel): NodeJS.WriteStream {
    // Error and above go to stderr, others to stdout
    const errorLevels: LoggingLevel[] = [
      'error',
      'critical',
      'alert',
      'emergency',
    ];

    return errorLevels.includes(level) ? process.stderr : process.stdout;
  }
}

/**
 * Structured logger for MCP protocol logging
 */
export class MCPLogger extends EventEmitter {
  private level: LoggingLevel;
  private loggerName: string;
  private backends: LoggerBackend[] = [];
  private context: Record<string, any> = {};

  constructor(name: string, level: LoggingLevel = 'info') {
    super();
    this.loggerName = name;
    this.level = level;
  }

  /**
   * Add a logging backend
   */
  addBackend(backend: LoggerBackend): void {
    this.backends.push(backend);
  }

  /**
   * Remove a logging backend
   */
  removeBackend(backend: LoggerBackend): void {
    const index = this.backends.indexOf(backend);
    if (index > -1) {
      this.backends.splice(index, 1);
    }
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LoggingLevel): void {
    this.level = level;
    this.emit('level-changed', level);
  }

  /**
   * Get the current log level
   */
  getLevel(): LoggingLevel {
    return this.level;
  }

  /**
   * Set context data that will be included in all log entries
   */
  setContext(context: Record<string, any>): void {
    this.context = { ...context };
  }

  /**
   * Add context data
   */
  addContext(key: string, value: any): void {
    this.context[key] = value;
  }

  /**
   * Remove context data
   */
  removeContext(key: string): void {
    delete this.context[key];
  }

  /**
   * Clear all context data
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Check if a log level should be logged
   */
  shouldLog(level: LoggingLevel): boolean {
    return LOG_LEVEL_HIERARCHY[level] >= LOG_LEVEL_HIERARCHY[this.level];
  }

  /**
   * Create a child logger with additional context
   */
  child(name: string, context?: Record<string, any>): MCPLogger {
    const childName = `${this.loggerName}.${name}`;
    const child = new MCPLogger(childName, this.level);
    
    // Inherit backends
    child.backends = [...this.backends];
    
    // Merge context
    child.context = { ...this.context, ...context };
    
    return child;
  }

  /**
   * Log at a specific level
   */
  log(level: LoggingLevel, message: string, data?: any, additionalContext?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      logger: this.loggerName,
      message,
      data,
      context: { ...this.context, ...additionalContext },
    };

    // Emit log event
    this.emit('log', entry);

    // Send to backends
    for (const backend of this.backends) {
      try {
        const result = backend.log(entry);
        if (result instanceof Promise) {
          result.catch(error => this.emit('backend-error', error, backend));
        }
      } catch (error) {
        this.emit('backend-error', error, backend);
      }
    }
  }

  /**
   * Convenience methods for each log level
   */
  debug(message: string, data?: any, context?: Record<string, any>): void {
    this.log('debug', message, data, context);
  }

  info(message: string, data?: any, context?: Record<string, any>): void {
    this.log('info', message, data, context);
  }

  notice(message: string, data?: any, context?: Record<string, any>): void {
    this.log('notice', message, data, context);
  }

  warn(message: string, data?: any, context?: Record<string, any>): void {
    this.log('warning', message, data, context);
  }

  error(message: string, data?: any, context?: Record<string, any>): void {
    this.log('error', message, data, context);
  }

  critical(message: string, data?: any, context?: Record<string, any>): void {
    this.log('critical', message, data, context);
  }

  alert(message: string, data?: any, context?: Record<string, any>): void {
    this.log('alert', message, data, context);
  }

  emergency(message: string, data?: any, context?: Record<string, any>): void {
    this.log('emergency', message, data, context);
  }

  /**
   * Create an MCP log message for protocol transmission
   */
  createMCPLogMessage(level: LoggingLevel, message: string, data?: any): LoggingMessageNotification {
    return {
      jsonrpc: "2.0",
      method: "notifications/message",
      params: {
        level,
        logger: this.loggerName,
        data: data || message,
      },
    };
  }
}

// Alias for convenience
export const Logger = MCPLogger;

/**
 * Logger factory for creating loggers with consistent configuration
 */
export class LoggerFactory {
  private static defaultLevel: LoggingLevel = 'info';
  private static defaultBackends: LoggerBackend[] = [];
  private static loggers: Map<string, MCPLogger> = new Map();

  /**
   * Set the default log level for new loggers
   */
  static setDefaultLevel(level: LoggingLevel): void {
    this.defaultLevel = level;
  }

  /**
   * Add a default backend for new loggers
   */
  static addDefaultBackend(backend: LoggerBackend): void {
    this.defaultBackends.push(backend);
  }

  /**
   * Remove a default backend
   */
  static removeDefaultBackend(backend: LoggerBackend): void {
    const index = this.defaultBackends.indexOf(backend);
    if (index > -1) {
      this.defaultBackends.splice(index, 1);
    }
  }

  /**
   * Create or get a logger by name
   */
  static getLogger(name: string, level?: LoggingLevel): MCPLogger {
    let logger = this.loggers.get(name);
    
    if (!logger) {
      logger = new MCPLogger(name, level ?? this.defaultLevel);
      
      // Add default backends
      for (const backend of this.defaultBackends) {
        logger.addBackend(backend);
      }
      
      this.loggers.set(name, logger);
    }

    return logger;
  }

  /**
   * Create a logger for an MCP server
   */
  static createServerLogger(serverInfo: ServerInfo, level?: LoggingLevel): MCPLogger {
    const name = `mcp-server:${serverInfo.name}@${serverInfo.version}`;
    return this.getLogger(name, level);
  }

  /**
   * Set log level for all existing loggers
   */
  static setAllLoggers(level: LoggingLevel): void {
    this.defaultLevel = level;
    for (const logger of this.loggers.values()) {
      logger.setLevel(level);
    }
  }

  /**
   * Get all registered loggers
   */
  static getAllLoggers(): MCPLogger[] {
    return Array.from(this.loggers.values());
  }

  /**
   * Clear all loggers (useful for testing)
   */
  static clearLoggers(): void {
    this.loggers.clear();
  }
}

// Initialize default console backend
LoggerFactory.addDefaultBackend(new ConsoleLoggerBackend()); 