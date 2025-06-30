import { EventEmitter } from 'events';
import { 
  AgentAdapter, 
  AgentType, 
  AgentConfig, 
  LogSource, 
  LogEntry, 
  LogParser,
  LogLevel,
} from "@mcp-log-server/types";

export interface AgentAdapterEvents {
  logEntry: (entry: LogEntry) => void;
  error: (error: Error) => void;
  statusChange: (status: "healthy" | "degraded" | "unhealthy", details?: string) => void;
}

/**
 * Base implementation for AI agent adapters
 * Provides common functionality and lifecycle management
 */
export abstract class BaseAgentAdapter extends EventEmitter implements AgentAdapter {
  abstract readonly agentType: AgentType;
  abstract readonly name: string;
  abstract readonly version: string;

  protected config: AgentConfig | null = null;
  protected initialized = false;
  protected running = false;

  /**
   * Whether the adapter is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Whether the adapter is running
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the current configuration
   */
  get currentConfig(): AgentConfig | null {
    return this.config;
  }

  /**
   * Get default configuration for this agent type
   */
  abstract getDefaultConfig(): AgentConfig;

  /**
   * Validate agent configuration
   */
  validateConfig(config: AgentConfig): boolean {
    // Basic validation - subclasses can override for specific validation
    return (
      config.type === this.agentType &&
      config.logPaths.length > 0 &&
      config.logFormat.length > 0
    );
  }

  /**
   * Discover available log sources for this agent
   */
  abstract discoverLogSources(): Promise<LogSource[]>;

  /**
   * Validate a specific log source
   */
  abstract validateLogSource(source: LogSource): Promise<boolean>;

  /**
   * Create a log parser for this agent type
   */
  abstract createParser(): LogParser;

  /**
   * Process and enrich a log entry
   */
  async processLogEntry(entry: LogEntry): Promise<LogEntry> {
    // Base implementation - subclasses can override for specific processing
    return {
      ...entry,
      agentType: this.agentType,
      metadata: {
        ...entry.metadata,
        adapter: this.name,
        adapterVersion: this.version,
        processedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Initialize the adapter with configuration
   */
  async initialize(config: AgentConfig): Promise<void> {
    if (this.initialized) {
      throw new Error("Adapter already initialized");
    }

    if (!this.validateConfig(config)) {
      throw new Error("Invalid configuration");
    }

    this.config = config;
    await this.performInitialization();
    this.initialized = true;
  }

  /**
   * Start monitoring logs
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      throw new Error("Adapter not initialized");
    }

    if (this.running) {
      return;
    }

    await this.performStart();
    this.running = true;
    this.emit("statusChange", "healthy", "Monitoring started");
  }

  /**
   * Stop monitoring logs
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.performStop();
    this.running = false;
    this.emit("statusChange", "unhealthy", "Monitoring stopped");
  }

  /**
   * Get health status
   */
  async health(): Promise<{ status: "healthy" | "degraded" | "unhealthy"; details?: string }> {
    if (!this.initialized) {
      return { status: "unhealthy", details: "Not initialized" };
    }

    if (!this.running) {
      return { status: "unhealthy", details: "Not running" };
    }

    // Subclasses can override for more specific health checks
    return { status: "healthy" };
  }

  /**
   * Emit a log entry event with processing
   */
  protected async emitLogEntry(entry: LogEntry): Promise<void> {
    try {
      const processedEntry = await this.processLogEntry(entry);
      this.emit("logEntry", processedEntry);
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Emit an error event
   */
  protected emitError(error: Error): void {
    this.emit("error", error);
  }

  /**
   * Emit a status change event
   */
  protected emitStatusChange(status: "healthy" | "degraded" | "unhealthy", details?: string): void {
    this.emit("statusChange", status, details);
  }

  /**
   * Abstract method for adapter-specific initialization
   */
  protected abstract performInitialization(): Promise<void>;

  /**
   * Abstract method for adapter-specific start logic
   */
  protected abstract performStart(): Promise<void>;

  /**
   * Abstract method for adapter-specific stop logic
   */
  protected abstract performStop(): Promise<void>;

  /**
   * Utility method to parse log level from string
   */
  protected parseLogLevel(levelStr: string): LogLevel {
    const normalized = levelStr.toLowerCase().trim();
    
    switch (normalized) {
      case "trace":
      case "debug":
        return "debug";
      case "info":
      case "information":
        return "info";
      case "warn":
      case "warning":
        return "warn";
      case "error":
      case "err":
        return "error";
      case "fatal":
      case "critical":
        return "fatal";
      default:
        return "info";
    }
  }

  /**
   * Utility method to generate unique log entry ID
   */
  protected generateLogId(source: string, timestamp: string, message: string): string {
    const content = `${source}-${timestamp}-${message}`;
    // Simple hash function for ID generation
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${this.agentType}-${Math.abs(hash).toString(36)}`;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.running) {
      this.stop().catch((error) => {
        console.error("Error during adapter disposal:", error);
      });
    }
    this.removeAllListeners();
  }
} 