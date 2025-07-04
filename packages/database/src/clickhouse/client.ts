import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import type {
  ClickHouseConfig,
  LogEntryRow,
  LogHourlyStatsRow,
  LogDailyStatsRow,
  ErrorPatternRow,
  SessionAnalyticsRow,
  SearchIndexRow,
  PerformanceMetricRow,
  InsertLogEntry,
  InsertErrorPattern,
  InsertSessionAnalytics,
  InsertPerformanceMetric,
  LogQueryFilters,
  LogQueryOptions,
  AggregationOptions,
  ErrorAnalysisFilters,
  SessionAnalysisFilters,
  LogAggregationResult,
  ErrorAnalysisResult,
  SessionAnalysisResult,
  PerformanceAnalysisResult,
  ClickHouseHealthStatus,
  TableStats,
  TimeRange,
  DateInterval,
  SortOrder,
  ErrorAnalysisOptions,
  SessionAnalysisOptions,
  PerformanceAnalysisOptions,
  DatabaseHealth,
} from './types.js';
import type { LogLevel, LogMetadata } from '@mcp-log-server/types';

// Simple logger interface for now
interface Logger {
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

class SimpleLogger implements Logger {
  constructor(private name: string) {}
  
  error(message: string, meta?: any): void {
    console.error(`[${this.name}] ERROR: ${message}`, meta);
  }
  
  warn(message: string, meta?: any): void {
    console.warn(`[${this.name}] WARN: ${message}`, meta);
  }
  
  info(message: string, meta?: any): void {
    console.info(`[${this.name}] INFO: ${message}`, meta);
  }
  
  debug(message: string, meta?: any): void {
    console.debug(`[${this.name}] DEBUG: ${message}`, meta);
  }
}

export class ClickHouseLogClient {
  private client: ClickHouseClient;
  private isConnected: boolean = false;
  private config: ClickHouseConfig;
  private logger: Logger;

  constructor(config: ClickHouseConfig) {
    this.config = config;
    this.logger = new SimpleLogger('ClickHouseLogClient');
    this.client = createClient({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
      compression: {
        request: true,
        response: true,
      },
      request_timeout: 30000,
      max_open_connections: 10,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.ping();
      this.isConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect to ClickHouse: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    this.isConnected = false;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result.success;
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }

  // Schema Management
  async initializeSchema(): Promise<void> {
    try {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      
      // Execute the entire schema
      await this.client.exec({ query: schema });
    } catch (error) {
      throw new Error(`Failed to initialize ClickHouse schema: ${error}`);
    }
  }

  // Log Entry Operations
  async insertLogEntry(entry: InsertLogEntry): Promise<void> {
    const row: Partial<LogEntryRow> = {
      timestamp: this.formatTimestamp(entry.timestamp || new Date()),
      log_id: entry.log_id,
      source_id: entry.source_id,
      level: entry.level,
      message: entry.message,
      agent_type: entry.agent_type,
      agent_version: entry.agent_version,
      session_id: entry.session_id,
      file_path: entry.file_path,
      line_number: entry.line_number,
      function_name: entry.function_name,
      metadata: JSON.stringify(entry.metadata || {}),
      tags: entry.tags || [],
      duration_ms: entry.duration_ms,
      memory_usage_mb: entry.memory_usage_mb,
      cpu_usage_percent: entry.cpu_usage_percent,
      error_code: entry.error_code,
      error_type: entry.error_type,
      stack_trace: entry.stack_trace,
      user_id: entry.user_id,
      request_id: entry.request_id,
      correlation_id: entry.correlation_id,
      raw_log: entry.raw_log,
    };

    await this.client.insert({
      table: 'log_entries',
      values: [row],
      format: 'JSONEachRow',
    });
  }

  async insertLogEntries(entries: InsertLogEntry[]): Promise<void> {
    const rows = entries.map(entry => ({
      timestamp: this.formatTimestamp(entry.timestamp || new Date()),
      log_id: entry.log_id,
      source_id: entry.source_id,
      level: entry.level,
      message: entry.message,
      agent_type: entry.agent_type,
      agent_version: entry.agent_version,
      session_id: entry.session_id,
      file_path: entry.file_path,
      line_number: entry.line_number,
      function_name: entry.function_name,
      metadata: JSON.stringify(entry.metadata || {}),
      tags: entry.tags || [],
      duration_ms: entry.duration_ms,
      memory_usage_mb: entry.memory_usage_mb,
      cpu_usage_percent: entry.cpu_usage_percent,
      error_code: entry.error_code,
      error_type: entry.error_type,
      stack_trace: entry.stack_trace,
      user_id: entry.user_id,
      request_id: entry.request_id,
      correlation_id: entry.correlation_id,
      raw_log: entry.raw_log,
    }));

    await this.client.insert({
      table: 'log_entries',
      values: rows,
      format: 'JSONEachRow',
    });
  }

  async getLogEntries(options: LogQueryOptions = {}): Promise<LogEntryRow[]> {
    const {
      startTime,
      endTime,
      levels,
      sourceIds,
      agentTypes,
      search,
      limit = 100,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'DESC',
    } = options;

    const conditions: string[] = [];

    if (startTime) conditions.push(`timestamp >= '${this.formatTimestamp(startTime)}'`);
    if (endTime) conditions.push(`timestamp <= '${this.formatTimestamp(endTime)}'`);
    if (levels && levels.length > 0) {
      const levelsList = levels.map(level => `'${level}'`).join(',');
      conditions.push(`level IN (${levelsList})`);
    }
    if (sourceIds && sourceIds.length > 0) {
      const sourceIdsList = sourceIds.map(id => `'${id}'`).join(',');
      conditions.push(`source_id IN (${sourceIdsList})`);
    }
    if (agentTypes && agentTypes.length > 0) {
      const agentTypesList = agentTypes.map(type => `'${type}'`).join(',');
      conditions.push(`agent_type IN (${agentTypesList})`);
    }
    if (search) {
      conditions.push(`(message LIKE '%${search}%' OR raw_log LIKE '%${search}%')`);
    }

    let query = 'SELECT * FROM log_entries';

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY ${sortBy} ${sortOrder}`;
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });
    
    const data = await result.json<LogEntryRow[]>();
    return Array.isArray(data) ? data.flat() : [data];
  }

  async aggregateLogEntries(options: AggregationOptions): Promise<LogAggregationResult[]> {
    const {
      startTime,
      endTime,
      sourceIds,
      agentTypes,
      levels,
      groupBy,
      interval = 'hour',
    } = options;

    const conditions: string[] = [];
    
    if (startTime) conditions.push(`timestamp >= '${this.formatTimestamp(startTime)}'`);
    if (endTime) conditions.push(`timestamp <= '${this.formatTimestamp(endTime)}'`);
    if (sourceIds && sourceIds.length > 0) {
      const sourceIdsList = sourceIds.map(id => `'${id}'`).join(',');
      conditions.push(`source_id IN (${sourceIdsList})`);
    }
    if (agentTypes && agentTypes.length > 0) {
      const agentTypesList = agentTypes.map(type => `'${type}'`).join(',');
      conditions.push(`agent_type IN (${agentTypesList})`);
    }
    if (levels && levels.length > 0) {
      const levelsList = levels.map(level => `'${level}'`).join(',');
      conditions.push(`level IN (${levelsList})`);
    }

    const groupByColumns = groupBy.map(field => {
      if (field === 'time') {
        return `toStartOfInterval(timestamp, INTERVAL 1 ${interval})`;
      }
      return field;
    }).join(', ');

    let query = `
      SELECT 
        ${groupByColumns} as group_key,
        count() as count,
        countIf(level = 'error') as error_count,
        countIf(level = 'warn') as warning_count,
        avg(duration_ms) as avg_duration_ms,
        quantile(0.95)(duration_ms) as p95_duration_ms,
        quantile(0.99)(duration_ms) as p99_duration_ms,
        min(timestamp) as period_start,
        max(timestamp) as period_end
      FROM log_entries
    `;

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY ${groupByColumns} ORDER BY period_start DESC`;

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await result.json<LogAggregationResult[]>();
    return Array.isArray(data) ? data.flat() : [data];
  }

  // Error Pattern Analysis
  async insertErrorPattern(pattern: InsertErrorPattern): Promise<void> {
    const errorHash = this.generateErrorHash(pattern.normalized_message, pattern.error_type);
    
    const row = {
      first_seen: this.formatTimestamp(pattern.first_seen || new Date()),
      last_seen: this.formatTimestamp(pattern.last_seen || new Date()),
      error_hash: errorHash,
      error_type: pattern.error_type,
      normalized_message: pattern.normalized_message,
      occurrence_count: 1,
      source_ids: pattern.source_ids,
      agent_types: pattern.agent_types,
      sample_stack_trace: pattern.sample_stack_trace,
      sample_metadata: JSON.stringify(pattern.sample_metadata),
    };

    await this.client.insert({
      table: 'error_patterns',
      values: [row],
      format: 'JSONEachRow',
    });
  }

  async analyzeErrorPatterns(options: ErrorAnalysisOptions): Promise<ErrorAnalysisResult[]> {
    const { startTime, endTime, sourceIds, limit = 100 } = options;

    let query = `
      SELECT 
        cityHash64(message) as error_hash,
        any(message) as normalized_message,
        count() as occurrence_count,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        arrayUniq(groupArray(source_id)) as affected_sources,
        'stable' as trend,
        case 
          when dateDiff('hour', min(timestamp), max(timestamp)) < 1 then 'spike'
          when count() > 100 then 'frequent'
          else 'normal'
        end as error_type
      FROM log_entries 
      WHERE level IN ('error', 'fatal')
    `;

    const conditions: string[] = [];
    if (startTime) conditions.push(`timestamp >= '${this.formatTimestamp(startTime)}'`);
    if (endTime) conditions.push(`timestamp <= '${this.formatTimestamp(endTime)}'`);
    if (sourceIds && sourceIds.length > 0) {
      const sourceIdsList = sourceIds.map((id: string) => `'${id}'`).join(',');
      conditions.push(`source_id IN (${sourceIdsList})`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY error_hash
      ORDER BY occurrence_count DESC
      LIMIT ${limit}
    `;

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });

    const rawData = await result.json<any[]>();
    const data = Array.isArray(rawData) && Array.isArray(rawData[0]) ? rawData[0] : rawData;
    
    return data.map(row => ({
      error_hash: row.error_hash,
      error_type: row.error_type,
      normalized_message: row.normalized_message,
      occurrence_count: row.occurrence_count,
      first_seen: new Date(row.first_seen),
      last_seen: new Date(row.last_seen),
      affected_sources: row.affected_sources,
      trend: row.trend,
    }));
  }

  // Session Analytics
  async insertSessionAnalytics(session: InsertSessionAnalytics): Promise<void> {
    const row = {
      session_id: session.session_id,
      source_id: session.source_id,
      agent_type: session.agent_type,
      session_start: this.formatTimestamp(session.session_start),
      session_end: this.formatTimestamp(session.session_end),
      duration_minutes: session.duration_minutes,
      total_logs: session.total_logs,
      error_count: session.error_count,
      warn_count: session.warn_count,
      unique_functions: session.unique_functions,
      avg_response_time: session.avg_response_time,
      max_memory_usage: session.max_memory_usage,
      user_id: session.user_id,
      tags: session.tags || [],
    };

    await this.client.insert({
      table: 'session_analytics',
      values: [row],
      format: 'JSONEachRow',
    });
  }

  async analyzeSessionMetrics(options: SessionAnalysisOptions): Promise<SessionAnalysisResult[]> {
    const { startTime, endTime, sourceIds } = options;

    let query = `
      SELECT 
        session_id,
        any(source_id) as source_id,
        any(agent_type) as agent_type,
        dateDiff('minute', min(timestamp), max(timestamp)) as duration_minutes,
        count() as log_count,
        countIf(level = 'error') as error_count,
        countIf(level = 'warn') as warning_count,
        min(timestamp) as start_time,
        max(timestamp) as end_time
      FROM log_entries
      WHERE session_id IS NOT NULL
    `;

    const conditions: string[] = [];
    if (startTime) conditions.push(`timestamp >= '${this.formatTimestamp(startTime)}'`);
    if (endTime) conditions.push(`timestamp <= '${this.formatTimestamp(endTime)}'`);
    if (sourceIds && sourceIds.length > 0) {
      const sourceIdsList = sourceIds.map((id: string) => `'${id}'`).join(',');
      conditions.push(`source_id IN (${sourceIdsList})`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY session_id
      ORDER BY start_time DESC
      LIMIT 1000
    `;

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await result.json<SessionAnalysisResult[]>();
    return Array.isArray(data) ? data.flat() : [data];
  }

  // Performance Metrics
  async insertPerformanceMetric(metric: InsertPerformanceMetric): Promise<void> {
    const row = {
      timestamp: this.formatTimestamp(metric.timestamp || new Date()),
      metric_name: metric.metric_name,
      metric_value: metric.metric_value,
      source_id: metric.source_id,
      agent_type: metric.agent_type,
      dimensions: metric.dimensions || {},
    };

    await this.client.insert({
      table: 'performance_metrics',
      values: [row],
      format: 'JSONEachRow',
    });
  }

  async analyzePerformanceMetrics(options: PerformanceAnalysisOptions): Promise<PerformanceAnalysisResult[]> {
    const { startTime, endTime, sourceIds, interval = 'hour' } = options;
    
    let query = `
      SELECT 
        toStartOfHour(timestamp) as timestamp,
        'response_time' as metric_name,
        avg(metric_value) as value,
        'stable' as trend,
        min(timestamp) as period_start,
        max(timestamp) as period_end
      FROM performance_metrics
      WHERE metric_name = 'response_time'
    `;

    const conditions: string[] = [];
    if (startTime) conditions.push(`timestamp >= '${this.formatTimestamp(startTime)}'`);
    if (endTime) conditions.push(`timestamp <= '${this.formatTimestamp(endTime)}'`);
    if (sourceIds && sourceIds.length > 0) {
      const sourceIdsList = sourceIds.map(id => `'${id}'`).join(',');
      conditions.push(`source_id IN (${sourceIdsList})`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY toStartOfHour(timestamp) ORDER BY timestamp DESC`;

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await result.json<PerformanceAnalysisResult[]>();
    return Array.isArray(data) ? data.flat() : [data];
  }

  // Health and Monitoring
  async getHealth(): Promise<DatabaseHealth> {
    try {
      const versionQuery = 'SELECT version() as version';
      const statsQuery = 'SELECT count() as total_rows, sum(bytes) as total_bytes FROM system.parts WHERE active = 1';

      const [versionResult, statsResult] = await Promise.all([
        this.client.query({ query: versionQuery, format: 'JSONEachRow' }),
        this.client.query({ query: statsQuery, format: 'JSONEachRow' }),
      ]);

      const versionData = await versionResult.json<{version: string}>();
      const statsData = await statsResult.json<{total_rows: number; total_bytes: number}>();

      const version = Array.isArray(versionData) && versionData.length > 0 ? versionData[0].version : 'unknown';
      const totalRows = Array.isArray(statsData) && statsData.length > 0 ? statsData[0].total_rows || 0 : 0;
      const totalBytes = Array.isArray(statsData) && statsData.length > 0 ? statsData[0].total_bytes || 0 : 0;

      return {
        status: 'healthy' as const,
        version,
        total_rows: totalRows,
        database_size_mb: Math.round(totalBytes / 1024 / 1024),
        uptime_seconds: 0,
        connections: {
          active: 1,
          idle: 0,
          max: 10,
        },
        performance: {
          queries_per_second: 0,
          avg_query_duration_ms: 0,
          memory_usage_mb: 0,
        },
        errors: [],
      };
    } catch (error) {
      return {
        status: 'error' as const,
        version: 'unknown',
        total_rows: 0,
        database_size_mb: 0,
        uptime_seconds: 0,
        connections: {
          active: 0,
          idle: 0,
          max: 10,
        },
        performance: {
          queries_per_second: 0,
          avg_query_duration_ms: 0,
          memory_usage_mb: 0,
        },
        errors: [(error as Error).message],
      };
    }
  }

  async getTableStats(): Promise<TableStats[]> {
    const query = `
      SELECT 
        name as table_name,
        sum(rows) as total_rows,
        sum(bytes) as total_bytes,
        0 as compressed_bytes,
        0 as compression_ratio,
        max(modification_time) as last_modified,
        count() as part_count
      FROM system.parts 
      WHERE active = 1 AND database = currentDatabase()
      GROUP BY name
      ORDER BY total_bytes DESC
    `;

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await result.json<any>();
    const tableStats = Array.isArray(data) ? data : [data];
    
    return tableStats.map(row => ({
      table_name: row.table_name || '',
      total_rows: row.total_rows || 0,
      total_bytes: row.total_bytes || 0,
      compressed_bytes: row.compressed_bytes || 0,
      compression_ratio: row.compression_ratio || 0,
      last_modified: new Date(row.last_modified || Date.now()),
      part_count: row.part_count || 0,
    }));
  }

  // Utility Methods
  private formatTimestamp(timestamp: string | Date): string {
    let isoString: string;
    if (timestamp instanceof Date) {
      isoString = timestamp.toISOString();
    } else {
      isoString = new Date(timestamp).toISOString();
    }
    // ClickHouse DateTime64(3) expects format without 'Z' suffix
    return isoString.replace('T', ' ').replace('Z', '');
  }

  private generateErrorHash(message: string, errorType: string): string {
    return `${errorType}_${message.substring(0, 100)}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // Cleanup and Maintenance
  async optimizeTables(): Promise<void> {
    const tables = ['log_entries', 'error_patterns', 'session_analytics', 'performance_metrics'];
    
    for (const table of tables) {
      await this.client.command({
        query: `OPTIMIZE TABLE ${table} FINAL`,
      });
    }
  }

  async getRecentLogs(limit: number = 100): Promise<LogEntryRow[]> {
    const query = `
      SELECT * FROM log_entries 
      ORDER BY timestamp DESC 
      LIMIT ${limit}
    `;

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await result.json<LogEntryRow[]>();
    return Array.isArray(data) ? data.flat() : [data];
  }

  async getLogCount(options: Partial<LogQueryOptions> = {}): Promise<number> {
    const { startTime, endTime, levels, sourceIds } = options;
    
    let query = 'SELECT COUNT(*) as count FROM log_entries';
    const conditions: string[] = [];

    if (startTime) conditions.push(`timestamp >= '${this.formatTimestamp(startTime)}'`);
    if (endTime) conditions.push(`timestamp <= '${this.formatTimestamp(endTime)}'`);
    if (levels && levels.length > 0) {
      const levelsList = levels.map(level => `'${level}'`).join(',');
      conditions.push(`level IN (${levelsList})`);
    }
    if (sourceIds && sourceIds.length > 0) {
      const sourceIdsList = sourceIds.map(id => `'${id}'`).join(',');
      conditions.push(`source_id IN (${sourceIdsList})`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });

    const countData = await result.json<{count: number}>();
    const count = Array.isArray(countData) && countData.length > 0 ? countData[0].count || 0 : 0;
    return count;
  }

  async searchLogEntries(searchQuery: string, options: LogQueryOptions = {}): Promise<LogEntryRow[]> {
    const { startTime, endTime, levels, sourceIds, limit = 100, offset = 0 } = options;
    
    let query = `
      SELECT * FROM log_entries 
      WHERE (message LIKE '%${searchQuery}%' OR raw_log LIKE '%${searchQuery}%')
    `;
    
    const conditions: string[] = [];
    if (startTime) conditions.push(`timestamp >= '${this.formatTimestamp(startTime)}'`);
    if (endTime) conditions.push(`timestamp <= '${this.formatTimestamp(endTime)}'`);
    if (levels && levels.length > 0) {
      const levelsList = levels.map(level => `'${level}'`).join(',');
      conditions.push(`level IN (${levelsList})`);
    }
    if (sourceIds && sourceIds.length > 0) {
      const sourceIdsList = sourceIds.map(id => `'${id}'`).join(',');
      conditions.push(`source_id IN (${sourceIdsList})`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`;

    const result = await this.client.query({
      query,
      format: 'JSONEachRow',
    });

    const data = await result.json<LogEntryRow[]>();
    return Array.isArray(data) ? data.flat() : [data];
  }
} 