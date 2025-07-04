// Common Database Types and Interfaces

export interface DatabaseConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    max_connections?: number;
    connection_timeout?: number;
    idle_timeout?: number;
    ssl?: boolean;
    ssl_ca?: string;
    ssl_cert?: string;
    ssl_key?: string;
  };
  clickhouse: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    https?: boolean;
    timeout?: number;
    keep_alive?: boolean;
    compression?: boolean;
    max_open_connections?: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    database?: number;
    keyPrefix?: string;
    maxRetriesPerRequest?: number;
    retryDelayOnFailover?: number;
    enableOfflineQueue?: boolean;
    lazyConnect?: boolean;
  };
  elasticsearch: {
    node: string | string[];
    auth?: {
      username: string;
      password: string;
    };
    tls?: {
      rejectUnauthorized?: boolean;
      ca?: string;
      cert?: string;
      key?: string;
    };
    maxRetries?: number;
    requestTimeout?: number;
    pingTimeout?: number;
    sniffOnStart?: boolean;
    sniffInterval?: number;
  };
}

export interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  isReady(): boolean;
}

export interface DatabaseHealth {
  is_connected: boolean;
  response_time_ms?: number;
  error_message?: string;
  last_check: string;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: Array<{
    name: string;
    type: string;
  }>;
  duration_ms?: number;
}

export interface TransactionOptions {
  isolation_level?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  timeout?: number;
  read_only?: boolean;
}

export interface Migration {
  id: string;
  name: string;
  up: string;
  down: string;
  checksum: string;
  created_at: string;
}

export interface MigrationStatus {
  id: string;
  name: string;
  applied_at: string;
  checksum: string;
  success: boolean;
  error_message?: string;
}

// Common error types
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public query?: string,
    public parameters?: any[]
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string, public host?: string, public port?: number) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends DatabaseError {
  constructor(
    message: string,
    code?: string,
    query?: string,
    parameters?: any[]
  ) {
    super(message, code, query, parameters);
    this.name = 'QueryError';
  }
}

export class TransactionError extends DatabaseError {
  constructor(message: string, public operation?: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

export class MigrationError extends DatabaseError {
  constructor(
    message: string,
    public migration_id?: string,
    public operation?: 'up' | 'down'
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

// Utility types
export type DatabaseType = 'postgres' | 'clickhouse' | 'redis' | 'elasticsearch';

export interface DatabaseMetrics {
  total_connections: number;
  active_connections: number;
  idle_connections: number;
  total_queries: number;
  successful_queries: number;
  failed_queries: number;
  avg_query_duration_ms: number;
  max_query_duration_ms: number;
  total_transactions: number;
  successful_transactions: number;
  failed_transactions: number;
  cache_hits?: number;
  cache_misses?: number;
  cache_hit_ratio?: number;
}

export interface DatabasePool {
  total_connections: number;
  active_connections: number;
  idle_connections: number;
  waiting_connections: number;
}

export interface TableStats {
  table_name: string;
  row_count: number;
  size_bytes: number;
  index_size_bytes?: number;
  last_vacuum?: string;
  last_analyze?: string;
}

export interface IndexStats {
  index_name: string;
  table_name: string;
  size_bytes: number;
  scans: number;
  tuples_read: number;
  tuples_fetched: number;
}

// Connection pool configuration
export interface PoolConfig {
  min_connections: number;
  max_connections: number;
  acquire_timeout_ms: number;
  idle_timeout_ms: number;
  reap_interval_ms: number;
  create_timeout_ms: number;
  destroy_timeout_ms: number;
  create_retry_interval_ms: number;
  propagate_create_error: boolean;
}

// Database backup and restore
export interface BackupConfig {
  destination: string;
  compression: boolean;
  encryption?: {
    algorithm: string;
    key: string;
  };
  retention_days: number;
  include_tables?: string[];
  exclude_tables?: string[];
}

export interface BackupStatus {
  id: string;
  database_type: DatabaseType;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'failed';
  size_bytes?: number;
  error_message?: string;
  file_path?: string;
}

export interface RestoreOptions {
  source: string;
  target_database?: string;
  include_tables?: string[];
  exclude_tables?: string[];
  drop_existing?: boolean;
  validate_checksums?: boolean;
}

// Monitoring and alerting
export interface DatabaseAlert {
  id: string;
  database_type: DatabaseType;
  alert_type: 'connection' | 'performance' | 'storage' | 'replication' | 'backup';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  triggered_at: string;
  resolved_at?: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
}

export interface MonitoringConfig {
  enabled: boolean;
  check_interval_ms: number;
  thresholds: {
    connection_timeout_ms: number;
    query_timeout_ms: number;
    max_connections_percent: number;
    disk_usage_percent: number;
    memory_usage_percent: number;
    replication_lag_ms: number;
  };
  alerts: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
}

// Database schema validation
export interface SchemaValidation {
  table_name: string;
  column_name: string;
  expected_type: string;
  actual_type: string;
  is_nullable: boolean;
  default_value?: any;
  constraint_type?: string;
  constraint_definition?: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaValidation[];
  timestamp: string;
}

// Generic database client interface
export interface DatabaseClient extends DatabaseConnection {
  query<T = any>(sql: string, parameters?: any[]): Promise<QueryResult<T>>;
  execute(sql: string, parameters?: any[]): Promise<void>;
  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
  getHealth(): Promise<DatabaseHealth>;
  getMetrics(): Promise<DatabaseMetrics>;
  getTableStats(): Promise<TableStats[]>;
} 