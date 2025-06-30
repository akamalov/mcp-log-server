import * as fs from 'fs/promises';
import { FSWatcher, watch } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  AgentConfig, 
  LogSource, 
  LogEntry, 
  LogParser,
  LogLevel,
} from "@mcp-log-server/types";
import { BaseAgentAdapter } from "./base.js";

export interface ClaudeLogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Log parser for Claude AI applications
 */
export class ClaudeLogParser implements LogParser {
  readonly name = "claude-parser";
  readonly description = "Parser for Claude AI application logs";
  readonly supportedFormats = ["json", "structured"];

  parse(raw: string, source: LogSource): LogEntry | null {
    try {
      // Try parsing as JSON first (Claude Desktop typically uses JSON logs)
      const parsed = JSON.parse(raw) as ClaudeLogEntry;
      
      if (!parsed.timestamp || !parsed.message) {
        return null;
      }

      return {
        id: this.generateId(raw, source),
        timestamp: new Date(parsed.timestamp).toISOString(),
        level: this.parseLevel(parsed.level),
        message: parsed.message,
        source: source.id,
        agentType: "claude-code",
        context: parsed.context,
        raw,
      };
    } catch {
      // Fallback to plain text parsing
      return this.parseTextLog(raw, source);
    }
  }

  validate(format: string): boolean {
    return this.supportedFormats.includes(format);
  }

  private parseTextLog(raw: string, source: LogSource): LogEntry | null {
    // Basic text log parsing for Claude Code
    const timestampMatch = raw.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)/);
    const levelMatch = raw.match(/\[(trace|debug|info|warn|error|fatal)\]/i);
    
    if (!timestampMatch) {
      return null;
    }

    const timestamp = new Date(timestampMatch[1]).toISOString();
    const level = levelMatch ? this.parseLevel(levelMatch[1]) : "info";
    const message = raw.replace(timestampMatch[0], "").replace(levelMatch?.[0] || "", "").trim();

    return {
      id: this.generateId(raw, source),
      timestamp,
      level,
      message,
      source: source.id,
      agentType: "claude-code",
      raw,
    };
  }

  private parseLevel(level: string): LogLevel {
    const normalized = level.toLowerCase();
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

  private generateId(raw: string, source: LogSource): string {
    const content = `${source.id}-${raw}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `claude-${Math.abs(hash).toString(36)}`;
  }
}

/**
 * Agent adapter for Claude AI applications
 * Monitors Claude Desktop and Claude Code logs
 */
export class ClaudeAgentAdapter extends BaseAgentAdapter {
  readonly agentType = "claude-code" as const;
  readonly name = "Claude Agent Adapter";
  readonly version = "1.0.0";

  private logWatchers = new Map<string, FSWatcher>();

  /**
   * Get default configuration for Claude agent
   */
  getDefaultConfig(): AgentConfig {
    return {
      id: "claude-agent",
      name: "Claude AI Agent",
      type: "claude-code",
      enabled: true,
      logPaths: this.getDefaultLogPaths(),
      logFormat: "json",
      parser: "claude-parser",
      filters: [],
      metadata: {
        platform: os.platform(),
        version: this.version,
      },
    };
  }

  /**
   * Discover available Claude log sources
   */
  async discoverLogSources(): Promise<LogSource[]> {
    const sources: LogSource[] = [];
    const logPaths = this.getDefaultLogPaths();

    for (const logPath of logPaths) {
      try {
        const stats = await fs.stat(logPath);
        const isDirectory = stats.isDirectory();
        
        sources.push({
          id: `claude-${path.basename(logPath)}`,
          name: `Claude Logs - ${path.basename(logPath)}`,
          type: isDirectory ? "directory" : "file",
          path: logPath,
          pattern: isDirectory ? "*.log" : undefined,
          enabled: true,
          agentId: this.config?.id || "claude-agent",
          encoding: "utf-8",
          metadata: {
            discovered: new Date().toISOString(),
            size: stats.size,
          },
        });
      } catch {
        // Path doesn't exist or isn't accessible
        continue;
      }
    }

    return sources;
  }

  /**
   * Validate a log source
   */
  async validateLogSource(source: LogSource): Promise<boolean> {
    try {
      const stats = await fs.stat(source.path);
      
      if (source.type === "file") {
        return stats.isFile();
      } else if (source.type === "directory") {
        return stats.isDirectory();
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Create log parser
   */
  createParser(): LogParser {
    return new ClaudeLogParser();
  }

  /**
   * Get default log paths for Claude on different platforms
   */
  private getDefaultLogPaths(): string[] {
    const platform = os.platform();
    const homeDir = os.homedir();

    switch (platform) {
      case "darwin": // macOS
        return [
          path.join(homeDir, "Library", "Logs", "Claude"),
          path.join(homeDir, "Library", "Application Support", "Claude", "logs"),
          path.join(homeDir, ".claude", "logs"),
        ];
      case "win32": // Windows
        return [
          path.join(homeDir, "AppData", "Local", "Claude", "logs"),
          path.join(homeDir, "AppData", "Roaming", "Claude", "logs"),
          path.join(homeDir, ".claude", "logs"),
        ];
      case "linux": // Linux
        return [
          path.join(homeDir, ".config", "claude", "logs"),
          path.join(homeDir, ".claude", "logs"),
          path.join("/var", "log", "claude"),
        ];
      default:
        return [
          path.join(homeDir, ".claude", "logs"),
        ];
    }
  }

  /**
   * Perform adapter-specific initialization
   */
  protected async performInitialization(): Promise<void> {
    if (!this.config) {
      throw new Error("Configuration required");
    }

    // Validate that at least one log path exists
    const validPaths = [];
    for (const logPath of this.config.logPaths) {
      try {
        await fs.access(logPath);
        validPaths.push(logPath);
      } catch {
        // Path doesn't exist or isn't accessible
        continue;
      }
    }

    if (validPaths.length === 0) {
      this.emitStatusChange("degraded", "No accessible log paths found");
    }
  }

  /**
   * Start monitoring Claude logs
   */
  protected async performStart(): Promise<void> {
    if (!this.config) {
      throw new Error("Configuration required");
    }

    const sources = await this.discoverLogSources();
    
    for (const source of sources) {
      if (!source.enabled) continue;
      
      try {
        await this.watchLogSource(source);
      } catch (error) {
        this.emitError(new Error(`Failed to watch source ${source.id}: ${error}`));
      }
    }
  }

  /**
   * Stop monitoring logs
   */
  protected async performStop(): Promise<void> {
    for (const [sourceId, watcher] of this.logWatchers) {
      try {
        await watcher.close();
      } catch (error) {
        this.emitError(new Error(`Failed to close watcher for ${sourceId}: ${error}`));
      }
    }
    this.logWatchers.clear();
  }

  /**
   * Start watching a specific log source
   */
  private async watchLogSource(source: LogSource): Promise<void> {
    try {
      if (source.type === 'file') {
        // Single file watching
        const watcher = watch(source.path, (eventType: string, filename: string | null) => {
          if (eventType === 'change') {
            this.processLogFile(source.path).catch((err) => {
              this.emit('error', err);
            });
          }
        });

        watcher.on('error', (error) => {
          this.emit('error', error);
        });

        this.logWatchers.set(source.path, watcher);
      } else if (source.type === 'directory') {
        // Directory watching
        const watcher = watch(source.path, { recursive: true }, (eventType: string, filename: string | null) => {
          if (eventType === "change" && filename?.endsWith(".log")) {
            const fullPath = path.join(source.path, filename);
            this.processLogFile(fullPath).catch((err) => {
              this.emit('error', err);
            });
          }
        });

        watcher.on('error', (error) => {
          this.emit('error', error);
        });

        this.logWatchers.set(source.path, watcher);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Process a log file and emit entries
   */
  private async processLogFile(filePath: string): Promise<void> {
    try {
      const parser = this.createParser();
      const content = await fs.readFile(filePath, 'utf-8');
      
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            // Create a minimal LogSource for parsing
            const logSource = {
              id: filePath,
              path: filePath,
              type: 'file' as const,
              name: path.basename(filePath),
              enabled: true,
              agentId: 'claude',
              encoding: 'utf-8'
            };
            
            const entry = parser.parse(line, logSource);
            if (entry) {
              this.emit('logEntry', entry);
            }
          } catch (parseError) {
            // Skip invalid log lines
            continue;
          }
        }
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to process log file ${filePath}: ${error}`));
    }
  }
} 