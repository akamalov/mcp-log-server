import { z } from "zod";

// Log Entry Types
export const LogLevelSchema = z.enum([
  "trace",
  "debug", 
  "info",
  "warn",
  "error",
  "fatal"
]);

export const LogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  level: LogLevelSchema,
  message: z.string(),
  source: z.string(), // AI agent identifier
  agentType: z.string(), // claude, cursor, vscode-copilot, etc.
  sessionId: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  raw: z.string().optional(), // original log line
});

export type LogLevel = z.infer<typeof LogLevelSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;

// AI Agent Types
export const AgentTypeSchema = z.enum([
  "claude-code",
  "claude-desktop", 
  "cursor",
  "vscode-copilot",
  "gemini-code-assist",
  "github-copilot",
  "jetbrains-ai",
  "custom"
]);

export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: AgentTypeSchema,
  enabled: z.boolean().default(true),
  logPaths: z.array(z.string()),
  logFormat: z.string(), // regex pattern or format string
  parser: z.string().optional(), // custom parser name
  filters: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AgentType = z.infer<typeof AgentTypeSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Log Source Configuration
export const LogSourceTypeSchema = z.enum([
  "file",
  "directory", 
  "api",
  "websocket",
  "mcp"
]);

export const LogSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: LogSourceTypeSchema,
  path: z.string(),
  pattern: z.string().optional(), // for directory monitoring
  enabled: z.boolean().default(true),
  agentId: z.string(),
  pollingInterval: z.number().optional(), // milliseconds
  maxFileSize: z.number().optional(), // bytes
  encoding: z.string().default("utf-8"),
  metadata: z.record(z.unknown()).optional(),
});

export type LogSourceType = z.infer<typeof LogSourceTypeSchema>;
export type LogSource = z.infer<typeof LogSourceSchema>;

// Log Parser Types
export interface LogParser {
  readonly name: string;
  readonly description: string;
  readonly supportedFormats: string[];
  parse(raw: string, source: LogSource): LogEntry | null;
  validate(format: string): boolean;
}

// Agent Adapter Interface
export interface AgentAdapter {
  readonly agentType: AgentType;
  readonly name: string;
  readonly version: string;
  
  // Configuration
  getDefaultConfig(): AgentConfig;
  validateConfig(config: AgentConfig): boolean;
  
  // Log Sources
  discoverLogSources(): Promise<LogSource[]>;
  validateLogSource(source: LogSource): Promise<boolean>;
  
  // Log Processing
  createParser(): LogParser;
  processLogEntry(entry: LogEntry): Promise<LogEntry>;
  
  // Lifecycle
  initialize(config: AgentConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ status: "healthy" | "degraded" | "unhealthy"; details?: string }>;
}

// Log Stream Types
export const LogStreamEventSchema = z.object({
  type: z.enum(["entry", "error", "started", "stopped", "reconnect"]),
  timestamp: z.string().datetime(),
  sourceId: z.string(),
  data: z.unknown().optional(),
});

export type LogStreamEvent = z.infer<typeof LogStreamEventSchema>;

export interface LogStream {
  readonly sourceId: string;
  readonly isActive: boolean;
  
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: LogStreamEvent) => void): void;
  onEntry(handler: (entry: LogEntry) => void): void;
  onError(handler: (error: Error) => void): void;
}

// Log Aggregation Types
export const LogQuerySchema = z.object({
  sources: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional(),
  levels: z.array(LogLevelSchema).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  sortBy: z.enum(["timestamp", "level", "source"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const LogQueryResultSchema = z.object({
  entries: z.array(LogEntrySchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  aggregations: z.record(z.unknown()).optional(),
});

export type LogQuery = z.infer<typeof LogQuerySchema>;
export type LogQueryResult = z.infer<typeof LogQueryResultSchema>;

// Real-time Log Updates
export const LogUpdateEventSchema = z.object({
  type: z.enum(["new_entry", "source_added", "source_removed", "agent_status"]),
  timestamp: z.string().datetime(),
  data: z.unknown(),
});

export type LogUpdateEvent = z.infer<typeof LogUpdateEventSchema>;

export interface LogSubscription {
  readonly id: string;
  readonly query: LogQuery;
  readonly isActive: boolean;
  
  onUpdate(handler: (event: LogUpdateEvent) => void): void;
  unsubscribe(): Promise<void>;
}

// Cross-platform path utilities
export interface PathResolver {
  resolveAgentLogPath(agentType: AgentType, platform: NodeJS.Platform): string[];
  validatePath(path: string): boolean;
  normalizePath(path: string): string;
  isAbsolute(path: string): boolean;
  expandVariables(path: string): string;
}

// Agent Status Types
export const AgentStatusSchema = z.object({
  agentId: z.string(),
  status: z.enum(["active", "inactive", "error", "unknown"]),
  lastSeen: z.string().datetime().optional(),
  entriesCount: z.number().int().nonnegative().default(0),
  errorCount: z.number().int().nonnegative().default(0),
  sources: z.array(z.object({
    sourceId: z.string(),
    status: z.enum(["active", "inactive", "error"]),
    lastEntry: z.string().datetime().optional(),
  })),
  details: z.string().optional(),
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>; 