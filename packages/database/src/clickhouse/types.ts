// ClickHouse Database Types for Log Analytics
import type { LogLevel, LogEntry, LogMetadata } from '@mcp-log-server/types';

export interface ClickHouseConfig {
  url: string;
  host?: string;
  port?: number;
  database: string;
  username: string;
  password: string;
  max_open_connections?: number;
  compression?: boolean;
  session_timeout?: number;
}

// Main log entries table structure
export interface LogEntryRow {
  timestamp: string; // DateTime64(3) as ISO string
  log_id: string;
  source_id: string;
  level: LogLevel;
  message: string;
  agent_type: string;
  agent_version: string;
  session_id: string;
  file_path: string;
  line_number?: number;
  function_name?: string;
  metadata: string; // JSON string
  tags: string[];
  duration_ms?: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
  error_code?: string;
  error_type?: string;
  stack_trace?: string;
  user_id?: string;
  request_id?: string;
  correlation_id?: string;
  ingested_at: string; // DateTime64(3) as ISO string
  processed_at?: string;
  raw_log: string;
}

// Hourly aggregation stats
export interface LogHourlyStatsRow {
  hour: string; // DateTime as ISO string
  source_id: string;
  agent_type: string;
  level: LogLevel;
  log_count: number;
  error_count: number;
  warn_count: number;
  avg_duration_ms?: number;
  max_duration_ms?: number;
  avg_memory_mb?: number;
  max_memory_mb?: number;
}

// Daily aggregation stats
export interface LogDailyStatsRow {
  day: string; // Date as ISO string
  source_id: string;
  agent_type: string;
  total_logs: number;
  errors: number;
  warnings: number;
  info_logs: number;
  debug_logs: number;
  unique_sessions: number;
  avg_duration?: number;
  p95_duration?: number;
  p99_duration?: number;
}

// Error patterns tracking
export interface ErrorPatternRow {
  first_seen: string;
  last_seen: string;
  error_hash: string;
  error_type: string;
  normalized_message: string;
  occurrence_count: number;
  source_ids: string[];
  agent_types: string[];
  sample_stack_trace?: string;
  sample_metadata: string;
  is_resolved: boolean;
  resolved_at?: string;
  resolution_notes?: string;
}

// Session analytics
export interface SessionAnalyticsRow {
  session_id: string;
  source_id: string;
  agent_type: string;
  session_start: string;
  session_end: string;
  duration_minutes: number;
  total_logs: number;
  error_count: number;
  warn_count: number;
  unique_functions: number;
  avg_response_time: number;
  max_memory_usage: number;
  user_id?: string;
  tags: string[];
}

// Search index structure
export interface SearchIndexRow {
  log_id: string;
  timestamp: string;
  source_id: string;
  message_tokens: string[];
  search_text: string;
  level: LogLevel;
  agent_type: string;
  tags: string[];
}

// Performance metrics
export interface PerformanceMetricRow {
  timestamp: string;
  metric_name: string;
  metric_value: number;
  source_id: string;
  agent_type: string;
  dimensions: Record<string, string>;
}

// Insert types (for data ingestion)
export interface InsertLogEntry {
  timestamp?: Date | string;
  log_id: string;
  source_id: string;
  level: LogLevel;
  message: string;
  agent_type: string;
  agent_version: string;
  session_id: string;
  file_path: string;
  line_number?: number;
  function_name?: string;
  metadata?: LogMetadata;
  tags?: string[];
  duration_ms?: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
  error_code?: string;
  error_type?: string;
  stack_trace?: string;
  user_id?: string;
  request_id?: string;
  correlation_id?: string;
  raw_log: string;
}

export interface InsertErrorPattern {
  error_hash: string;
  error_type: string;
  normalized_message: string;
  source_ids: string[];
  agent_types: string[];
  sample_stack_trace?: string;
  sample_metadata: LogMetadata;
  first_seen?: Date | string;
  last_seen?: Date | string;
}

export interface InsertSessionAnalytics {
  session_id: string;
  source_id: string;
  agent_type: string;
  session_start: Date | string;
  session_end: Date | string;
  duration_minutes: number;
  total_logs: number;
  error_count: number;
  warn_count: number;
  unique_functions: number;
  avg_response_time: number;
  max_memory_usage: number;
  user_id?: string;
  tags?: string[];
}

export interface InsertPerformanceMetric {
  timestamp?: Date | string;
  metric_name: string;
  metric_value: number;
  source_id: string;
  agent_type: string;
  dimensions?: Record<string, string>;
}

// Query filters and options
export interface LogQueryFilters {
  start_time?: Date | string;
  end_time?: Date | string;
  source_ids?: string[];
  agent_types?: string[];
  levels?: LogLevel[];
  session_ids?: string[];
  user_ids?: string[];
  search?: string; // Full-text search
  has_errors?: boolean;
  min_duration?: number;
  max_duration?: number;
  tags?: string[];
  correlation_id?: string;
  request_id?: string;
}

export interface LogQueryOptions {
  startTime?: Date | string;
  endTime?: Date | string;
  levels?: LogLevel[];
  sourceIds?: string[];
  agentTypes?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'duration_ms' | 'memory_usage_mb';
  sortOrder?: 'ASC' | 'DESC';
  order_by?: 'timestamp' | 'duration_ms' | 'memory_usage_mb';
  order_direction?: 'ASC' | 'DESC';
  include_metadata?: boolean;
  include_raw_log?: boolean;
}

export interface AggregationOptions {
  startTime?: Date | string;
  endTime?: Date | string;
  sourceIds?: string[];
  agentTypes?: string[];
  levels?: LogLevel[];
  groupBy: ('source_id' | 'agent_type' | 'level' | 'time')[];
  interval?: 'minute' | 'hour' | 'day' | 'week';
  includeMetrics?: boolean;
  includeDurationMetrics?: boolean;
  includePercentiles?: boolean;
  group_by?: ('source_id' | 'agent_type' | 'level' | 'hour' | 'day')[];
  time_interval?: 'minute' | 'hour' | 'day' | 'week';
  metrics?: ('count' | 'error_rate' | 'avg_duration' | 'p95_duration' | 'p99_duration')[];
}

export interface ErrorAnalysisFilters {
  start_time?: Date | string;
  end_time?: Date | string;
  source_ids?: string[];
  agent_types?: string[];
  error_types?: string[];
  is_resolved?: boolean;
  min_occurrences?: number;
}

export interface ErrorAnalysisOptions {
  startTime?: Date | string;
  endTime?: Date | string;
  sourceIds?: string[];
  agentTypes?: string[];
  errorTypes?: string[];
  limit?: number;
}

export interface SessionAnalysisFilters {
  start_time?: Date | string;
  end_time?: Date | string;
  source_ids?: string[];
  agent_types?: string[];
  user_ids?: string[];
  min_duration?: number;
  max_duration?: number;
}

export interface SessionAnalysisOptions {
  startTime?: Date | string;
  endTime?: Date | string;
  sourceIds?: string[];
  agentTypes?: string[];
  userIds?: string[];
  minDuration?: number;
  maxDuration?: number;
}

export interface PerformanceAnalysisOptions {
  startTime?: Date | string;
  endTime?: Date | string;
  sourceIds?: string[];
  interval?: 'hour' | 'day';
}

// Result types
export interface LogAggregationResult {
  timestamp?: string;
  source_id?: string;
  agent_type?: string;
  level?: LogLevel;
  count: number;
  error_count?: number;
  warn_count?: number;
  avg_duration?: number;
  p95_duration?: number;
  p99_duration?: number;
  max_memory?: number;
  unique_sessions?: number;
}

export interface ErrorAnalysisResult {
  error_hash: string;
  error_type: string;
  normalized_message: string;
  occurrence_count: number;
  first_seen: Date;
  last_seen: Date;
  affected_sources: string[];
  affected_agents?: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  is_resolved?: boolean;
}

export interface SessionAnalysisResult {
  session_id: string;
  source_id: string;
  agent_type: string;
  duration_minutes: number;
  log_count: number;
  error_count: number;
  warning_count: number;
  start_time: Date;
  end_time: Date;
  total_logs?: number;
  error_rate?: number;
  avg_response_time?: number;
  peak_memory?: number;
  activity_score?: number;
}

export interface PerformanceAnalysisResult {
  timestamp: Date;
  metric_name: string;
  value: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  period_start: Date;
  period_end: Date;
  source_id?: string;
  agent_type?: string;
}

// Health and monitoring types
export interface ClickHouseHealthStatus {
  is_connected: boolean;
  last_ping: Date;
  version?: string;
  uptime?: string;
  disk_usage?: number;
  memory_usage?: number;
  active_queries?: number;
  total_rows?: number;
  database_size_mb?: number;
}

export interface DatabaseHealth {
  status: 'healthy' | 'warning' | 'error';
  version: string;
  total_rows: number;
  database_size_mb: number;
  uptime_seconds: number;
  connections: {
    active: number;
    idle: number;
    max: number;
  };
  performance: {
    queries_per_second: number;
    avg_query_duration_ms: number;
    memory_usage_mb: number;
  };
  errors: string[];
}

export interface TableStats {
  table_name: string;
  total_rows: number;
  total_bytes: number;
  compressed_bytes: number;
  compression_ratio?: number;
  last_modified: Date;
  part_count: number;
}

// Utility types
export type TimeRange = {
  start: Date | string;
  end: Date | string;
};

export type DateInterval = 'minute' | 'hour' | 'day' | 'week' | 'month';

export type SortOrder = 'ASC' | 'DESC';

export type LogFieldPath = keyof LogEntryRow; 