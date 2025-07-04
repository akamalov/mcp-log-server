import { LogEntry, LogQuery } from '@mcp-log-server/types';
import {
  ClickHouseLogClient,
  type ClickHouseConfig,
  type InsertLogEntry,
  type LogQueryOptions,
  type LogEntryRow
} from '@mcp-log-server/database';
// TODO: Import your database clients (ClickHouse, Elasticsearch, Postgres) as needed

export class LogsService {
  private clickhouse: ClickHouseLogClient;

  constructor(clickhouseConfig: ClickHouseConfig) {
    this.clickhouse = new ClickHouseLogClient(clickhouseConfig);
    this.clickhouse.connect().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to connect to ClickHouse:', err);
    });
  }

  // Helper to map LogEntry to InsertLogEntry
  private mapLogEntry(entry: LogEntry): InsertLogEntry {
    return {
      timestamp: entry.timestamp,
      log_id: entry.id,
      source_id: entry.source,
      level: entry.level,
      message: entry.message,
      agent_type: entry.agentType,
      agent_version: 'unknown', // Default value since not available in LogEntry
      session_id: entry.sessionId || 'default-session',
      file_path: (entry.context as any)?.file || '',
      line_number: (entry.context as any)?.line,
      function_name: (entry.context as any)?.function,
      metadata: entry.metadata,
      tags: (entry.metadata as any)?.tags || [],
      duration_ms: undefined,
      memory_usage_mb: undefined,
      cpu_usage_percent: undefined,
      error_code: undefined,
      error_type: undefined,
      stack_trace: undefined,
      user_id: undefined,
      request_id: undefined,
      correlation_id: undefined,
      raw_log: entry.raw || entry.message,
    };
  }

  // Ingest a new log entry
  async ingestLog(entry: LogEntry): Promise<void> {
    const insertEntry = this.mapLogEntry(entry);
    await this.clickhouse.insertLogEntry(insertEntry);
  }

  // Get recent logs (default: 100)
  async getRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    const rows = await this.clickhouse.getRecentLogs(limit);
    return rows.map(this.mapLogEntryRowToLogEntry);
  }

  // Search logs with filters
  async searchLogs(query: LogQuery): Promise<LogEntry[]> {
    // Map LogQuery to LogQueryOptions and search string
    const options: LogQueryOptions = {
      startTime: query.from,
      endTime: query.to,
      levels: query.levels,
      sourceIds: query.sources,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy as any,
      sortOrder: query.sortOrder as any,
    };
    const search = query.search || '';
    const rows = search
      ? await this.clickhouse.searchLogEntries(search, options)
      : await this.clickhouse.getLogEntries(options);
    return rows.map(this.mapLogEntryRowToLogEntry);
  }

  // Helper to map LogEntryRow to LogEntry
  private mapLogEntryRowToLogEntry(row: LogEntryRow): LogEntry {
    return {
      id: row.log_id,
      timestamp: row.timestamp,
      level: row.level,
      message: row.message,
      source: row.source_id,
      agentType: row.agent_type,
      sessionId: row.session_id,
      context: {}, // Not present in row
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      raw: row.raw_log,
    };
  }
} 