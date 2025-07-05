import dgram from 'dgram';
import net from 'net';
import tls from 'tls';
import { EventEmitter } from 'events';
import type { Logger } from '../logger.js';

export interface SyslogForwarderConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'udp' | 'tcp' | 'tcp-tls';
  facility: number; // 0-23, typically 16 for local use
  severity: 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'info' | 'debug';
  format: 'rfc3164' | 'rfc5424';
  enabled: boolean;
  filters?: {
    agents?: string[];
    levels?: string[];
    messagePatterns?: string[];
  };
  metadata?: {
    tag?: string;
    hostname?: string;
    appName?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface LogEntry {
  timestamp: Date;
  agent: string;
  level: string;
  message: string;
  source?: string;
  metadata?: Record<string, any>;
}

export class SyslogForwarderService extends EventEmitter {
  private forwarders: Map<string, SyslogForwarderConfig> = new Map();
  private connections: Map<string, any> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  /**
   * Add a new syslog forwarder configuration
   */
  async addForwarder(config: Omit<SyslogForwarderConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<SyslogForwarderConfig> {
    const forwarder: SyslogForwarderConfig = {
      ...config,
      id: `forwarder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.forwarders.set(forwarder.id, forwarder);
    
    if (forwarder.enabled) {
      await this.initializeConnection(forwarder);
    }

    this.logger.info('Syslog forwarder added', { 
      id: forwarder.id, 
      name: forwarder.name,
      host: forwarder.host,
      port: forwarder.port,
      protocol: forwarder.protocol
    });

    this.emit('forwarder-added', forwarder);
    return forwarder;
  }

  /**
   * Update an existing forwarder configuration
   */
  async updateForwarder(id: string, updates: Partial<SyslogForwarderConfig>): Promise<SyslogForwarderConfig | null> {
    const forwarder = this.forwarders.get(id);
    if (!forwarder) {
      return null;
    }

    // Close existing connection if configuration changed
    if (updates.host || updates.port || updates.protocol || updates.enabled === false) {
      await this.closeConnection(id);
    }

    const updatedForwarder = {
      ...forwarder,
      ...updates,
      updatedAt: new Date(),
    };

    this.forwarders.set(id, updatedForwarder);

    // Reinitialize connection if enabled
    if (updatedForwarder.enabled) {
      await this.initializeConnection(updatedForwarder);
    }

    this.logger.info('Syslog forwarder updated', { id, name: updatedForwarder.name });
    this.emit('forwarder-updated', updatedForwarder);
    return updatedForwarder;
  }

  /**
   * Remove a forwarder configuration
   */
  async removeForwarder(id: string): Promise<boolean> {
    const forwarder = this.forwarders.get(id);
    if (!forwarder) {
      return false;
    }

    await this.closeConnection(id);
    this.forwarders.delete(id);

    this.logger.info('Syslog forwarder removed', { id, name: forwarder.name });
    this.emit('forwarder-removed', id);
    return true;
  }

  /**
   * Get all forwarder configurations
   */
  getForwarders(): SyslogForwarderConfig[] {
    return Array.from(this.forwarders.values());
  }

  /**
   * Get a specific forwarder by ID
   */
  getForwarder(id: string): SyslogForwarderConfig | null {
    return this.forwarders.get(id) || null;
  }

  /**
   * Forward a log entry to all enabled forwarders
   */
  async forwardLog(logEntry: LogEntry): Promise<void> {
    const enabledForwarders = Array.from(this.forwarders.values()).filter(f => f.enabled);

    for (const forwarder of enabledForwarders) {
      if (this.shouldForwardLog(logEntry, forwarder)) {
        try {
          await this.sendSyslogMessage(forwarder, logEntry);
        } catch (error) {
          this.logger.warn('Failed to forward log to syslog server', {
            forwarderId: forwarder.id,
            forwarderName: forwarder.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          this.emit('forward-error', { forwarder, logEntry, error });
        }
      }
    }
  }

  /**
   * Test connection to a syslog server
   */
  async testConnection(config: Pick<SyslogForwarderConfig, 'host' | 'port' | 'protocol'>): Promise<{ success: boolean; message: string; latency?: number }> {
    const startTime = Date.now();
    
    try {
      switch (config.protocol) {
        case 'udp':
          return await this.testUdpConnection(config.host, config.port, startTime);
        case 'tcp':
          return await this.testTcpConnection(config.host, config.port, startTime);
        case 'tcp-tls':
          return await this.testTlsConnection(config.host, config.port, startTime);
        default:
          return { success: false, message: 'Unsupported protocol' };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Connection test failed',
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Initialize connection for a forwarder
   */
  private async initializeConnection(forwarder: SyslogForwarderConfig): Promise<void> {
    try {
      switch (forwarder.protocol) {
        case 'udp':
          // UDP doesn't maintain persistent connections
          break;
        case 'tcp':
          await this.createTcpConnection(forwarder);
          break;
        case 'tcp-tls':
          await this.createTlsConnection(forwarder);
          break;
      }
    } catch (error) {
      this.logger.error('Failed to initialize syslog forwarder connection', {
        forwarderId: forwarder.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Close connection for a forwarder
   */
  private async closeConnection(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (connection) {
      try {
        if (typeof connection.end === 'function') {
          connection.end();
        } else if (typeof connection.close === 'function') {
          connection.close();
        }
      } catch (error) {
        this.logger.warn('Error closing syslog connection', { forwarderId: id, error });
      }
      this.connections.delete(id);
    }
  }

  /**
   * Check if a log entry should be forwarded based on filters
   */
  private shouldForwardLog(logEntry: LogEntry, forwarder: SyslogForwarderConfig): boolean {
    const { filters } = forwarder;
    if (!filters) return true;

    // Check agent filter
    if (filters.agents && filters.agents.length > 0) {
      if (!filters.agents.includes(logEntry.agent)) {
        return false;
      }
    }

    // Check level filter
    if (filters.levels && filters.levels.length > 0) {
      if (!filters.levels.includes(logEntry.level)) {
        return false;
      }
    }

    // Check message pattern filter
    if (filters.messagePatterns && filters.messagePatterns.length > 0) {
      const matchesPattern = filters.messagePatterns.some(pattern => {
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(logEntry.message);
        } catch {
          return logEntry.message.toLowerCase().includes(pattern.toLowerCase());
        }
      });
      if (!matchesPattern) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send syslog message to forwarder
   */
  private async sendSyslogMessage(forwarder: SyslogForwarderConfig, logEntry: LogEntry): Promise<void> {
    const syslogMessage = this.formatSyslogMessage(forwarder, logEntry);
    
    switch (forwarder.protocol) {
      case 'udp':
        await this.sendUdpMessage(forwarder, syslogMessage);
        break;
      case 'tcp':
      case 'tcp-tls':
        await this.sendTcpMessage(forwarder, syslogMessage);
        break;
    }
  }

  /**
   * Format log entry as syslog message
   */
  private formatSyslogMessage(forwarder: SyslogForwarderConfig, logEntry: LogEntry): string {
    const priority = this.calculatePriority(forwarder.facility, this.mapSeverity(logEntry.level, forwarder.severity));
    const timestamp = logEntry.timestamp.toISOString();
    const hostname = forwarder.metadata?.hostname || 'mcp-log-server';
    const tag = forwarder.metadata?.tag || logEntry.agent;
    const appName = forwarder.metadata?.appName || 'mcp-log-server';

    if (forwarder.format === 'rfc5424') {
      // RFC5424 format: <priority>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
      const version = '1';
      const procId = process.pid;
      const msgId = '-';
      const structuredData = '-';
      
      return `<${priority}>${version} ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${logEntry.message}`;
    } else {
      // RFC3164 format: <priority>TIMESTAMP HOSTNAME TAG: MSG
      const legacyTimestamp = logEntry.timestamp.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      return `<${priority}>${legacyTimestamp} ${hostname} ${tag}: ${logEntry.message}`;
    }
  }

  /**
   * Calculate syslog priority value
   */
  private calculatePriority(facility: number, severity: number): number {
    return facility * 8 + severity;
  }

  /**
   * Map log level to syslog severity
   */
  private mapSeverity(level: string, defaultSeverity: string): number {
    const severityMap: Record<string, number> = {
      emergency: 0, alert: 1, critical: 2, error: 3,
      warning: 4, notice: 5, info: 6, debug: 7
    };

    const levelSeverityMap: Record<string, string> = {
      fatal: 'emergency',
      error: 'error',
      warn: 'warning',
      warning: 'warning',
      info: 'info',
      debug: 'debug',
      trace: 'debug'
    };

    const mappedSeverity = levelSeverityMap[level.toLowerCase()] || defaultSeverity;
    return severityMap[mappedSeverity] || severityMap[defaultSeverity] || 6;
  }

  /**
   * Send UDP message
   */
  private async sendUdpMessage(forwarder: SyslogForwarderConfig, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = dgram.createSocket('udp4');
      const buffer = Buffer.from(message);

      client.send(buffer, forwarder.port, forwarder.host, (error) => {
        client.close();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Send TCP message
   */
  private async sendTcpMessage(forwarder: SyslogForwarderConfig, message: string): Promise<void> {
    const connection = this.connections.get(forwarder.id);
    if (!connection) {
      throw new Error(`No connection available for forwarder ${forwarder.id}`);
    }

    return new Promise((resolve, reject) => {
      const messageWithLength = `${message.length} ${message}`;
      connection.write(messageWithLength, (error: any) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Create TCP connection
   */
  private async createTcpConnection(forwarder: SyslogForwarderConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      
      socket.connect(forwarder.port, forwarder.host, () => {
        this.connections.set(forwarder.id, socket);
        resolve();
      });

      socket.on('error', (error) => {
        reject(error);
      });

      socket.on('close', () => {
        this.connections.delete(forwarder.id);
      });
    });
  }

  /**
   * Create TLS connection
   */
  private async createTlsConnection(forwarder: SyslogForwarderConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: forwarder.host,
        port: forwarder.port,
        rejectUnauthorized: false // In production, you might want to verify certificates
      }, () => {
        this.connections.set(forwarder.id, socket);
        resolve();
      });

      socket.on('error', (error) => {
        reject(error);
      });

      socket.on('close', () => {
        this.connections.delete(forwarder.id);
      });
    });
  }

  /**
   * Test UDP connection
   */
  private async testUdpConnection(host: string, port: number, startTime: number): Promise<{ success: boolean; message: string; latency: number }> {
    return new Promise((resolve) => {
      const client = dgram.createSocket('udp4');
      const testMessage = Buffer.from('<165>Dec 25 10:00:00 test-host test: Connection test');
      
      const timeout = setTimeout(() => {
        client.close();
        resolve({
          success: false,
          message: 'UDP test timeout (no response expected for UDP)',
          latency: Date.now() - startTime
        });
      }, 2000);

      client.send(testMessage, port, host, (error) => {
        clearTimeout(timeout);
        client.close();
        
        if (error) {
          resolve({
            success: false,
            message: `UDP test failed: ${error.message}`,
            latency: Date.now() - startTime
          });
        } else {
          resolve({
            success: true,
            message: 'UDP test message sent successfully',
            latency: Date.now() - startTime
          });
        }
      });
    });
  }

  /**
   * Test TCP connection
   */
  private async testTcpConnection(host: string, port: number, startTime: number): Promise<{ success: boolean; message: string; latency: number }> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          success: false,
          message: 'TCP connection timeout',
          latency: Date.now() - startTime
        });
      }, 5000);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.end();
        resolve({
          success: true,
          message: 'TCP connection successful',
          latency: Date.now() - startTime
        });
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          message: `TCP connection failed: ${error.message}`,
          latency: Date.now() - startTime
        });
      });
    });
  }

  /**
   * Test TLS connection
   */
  private async testTlsConnection(host: string, port: number, startTime: number): Promise<{ success: boolean; message: string; latency: number }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: false,
          message: 'TLS connection timeout',
          latency: Date.now() - startTime
        });
      }, 5000);

      const socket = tls.connect({
        host,
        port,
        rejectUnauthorized: false
      }, () => {
        clearTimeout(timeout);
        socket.end();
        resolve({
          success: true,
          message: 'TLS connection successful',
          latency: Date.now() - startTime
        });
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          message: `TLS connection failed: ${error.message}`,
          latency: Date.now() - startTime
        });
      });
    });
  }

  /**
   * Cleanup all connections
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down syslog forwarder service...');
    
    const closePromises = Array.from(this.connections.keys()).map(id => this.closeConnection(id));
    await Promise.all(closePromises);
    
    this.removeAllListeners();
    this.logger.info('Syslog forwarder service shutdown complete');
  }
} 