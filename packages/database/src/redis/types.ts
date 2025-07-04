// Redis Types for Caching and Real-time Features
import type { LogLevel, LogEntry } from '@mcp-log-server/types';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableOfflineQueue?: boolean;
  lazyConnect?: boolean;
  keyPrefix?: string;
}

// Cache Keys Structure
export interface CacheKeys {
  // User session caching
  userSession: (userId: string) => string;
  userPreferences: (userId: string) => string;
  apiToken: (tokenHash: string) => string;
  
  // Log source caching
  logSource: (sourceId: string) => string;
  logSourceHealth: (sourceId: string) => string;
  activeLogSources: (userId: string) => string;
  
  // Query result caching
  logQuery: (queryHash: string) => string;
  aggregationQuery: (queryHash: string) => string;
  errorAnalysis: (queryHash: string) => string;
  
  // Real-time data
  recentLogs: (sourceId: string) => string;
  liveLogStream: (sourceId: string) => string;
  alertsQueue: () => string;
  
  // Rate limiting
  rateLimitUser: (userId: string) => string;
  rateLimitApi: (identifier: string) => string;
  
  // System status
  systemHealth: () => string;
  databaseStats: () => string;
  
  // Background job tracking
  jobStatus: (jobId: string) => string;
  jobQueue: (queueName: string) => string;
}

// Cache Value Types
export interface CachedUserSession {
  user_id: string;
  username: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  last_activity: string;
  session_data?: Record<string, any>;
}

export interface CachedUserPreferences {
  user_id: string;
  preferences: Record<string, any>;
  theme?: string;
  timezone?: string;
  notifications?: boolean;
  cached_at: string;
}

export interface CachedApiToken {
  token_id: string;
  user_id: string;
  name: string;
  permissions: string[];
  rate_limit: number;
  last_used: string;
  is_active: boolean;
}

export interface CachedLogSource {
  id: string;
  user_id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  is_active: boolean;
  last_seen: string;
  health_status: 'healthy' | 'warning' | 'error' | 'unknown';
}

export interface CachedLogSourceHealth {
  source_id: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  last_check: string;
  error_message?: string;
  metrics: {
    uptime_percent: number;
    avg_response_time: number;
    log_count_last_hour: number;
    error_rate: number;
  };
}

// Real-time Log Stream Types
export interface LiveLogEntry {
  log_id: string;
  timestamp: string;
  source_id: string;
  level: LogLevel;
  message: string;
  agent_type: string;
  session_id: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface LogStreamMessage {
  type: 'log' | 'error' | 'status' | 'heartbeat';
  source_id: string;
  timestamp: string;
  data: LiveLogEntry | AlertData | StatusUpdate | HeartbeatData;
}

export interface AlertData {
  alert_id: string;
  source_id: string;
  alert_type: 'error_spike' | 'source_down' | 'memory_high' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  created_at: string;
}

export interface StatusUpdate {
  source_id: string;
  status: 'connected' | 'disconnected' | 'error';
  message?: string;
  timestamp: string;
}

export interface HeartbeatData {
  source_id: string;
  timestamp: string;
  metrics: {
    memory_usage: number;
    cpu_usage: number;
    log_rate: number;
  };
}

// Rate Limiting Types
export interface RateLimitInfo {
  limit: number;
  current: number;
  reset_time: number;
  blocked: boolean;
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  skipSuccessful?: boolean;
  skipFailed?: boolean;
}

// System Health Types
export interface SystemHealthStatus {
  timestamp: string;
  services: {
    postgres: ServiceStatus;
    clickhouse: ServiceStatus;
    redis: ServiceStatus;
    elasticsearch: ServiceStatus;
  };
  metrics: {
    active_users: number;
    active_log_sources: number;
    logs_per_minute: number;
    error_rate: number;
    response_time_p95: number;
  };
}

export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'down';
  response_time: number;
  last_check: string;
  error_message?: string;
}

export interface DatabaseStats {
  postgres: {
    total_tables: number;
    total_rows: number;
    database_size_mb: number;
    active_connections: number;
  };
  clickhouse: {
    total_tables: number;
    total_rows: number;
    database_size_mb: number;
    compression_ratio: number;
  };
  redis: {
    used_memory_mb: number;
    connected_clients: number;
    total_keys: number;
    hit_rate: number;
  };
  elasticsearch: {
    cluster_status: string;
    total_indices: number;
    total_documents: number;
    storage_size_mb: number;
  };
}

// Background Job Types
export interface JobStatus {
  job_id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress: number;
  result?: any;
  error?: string;
  metadata: Record<string, any>;
}

export interface QueueJob {
  id: string;
  type: string;
  payload: Record<string, any>;
  priority: number;
  delay: number;
  attempts: number;
  max_attempts: number;
  created_at: string;
}

// Search and Query Caching
export interface CachedQueryResult {
  query_hash: string;
  query_params: Record<string, any>;
  result: any;
  total_count?: number;
  cached_at: string;
  expires_at: string;
  cache_hit_count: number;
}

// Pub/Sub Message Types
export interface PubSubMessage {
  channel: string;
  pattern?: string;
  message: string;
  timestamp: string;
}

export interface LogStreamSubscription {
  subscriber_id: string;
  source_ids: string[];
  levels: LogLevel[];
  filters: Record<string, any>;
  active: boolean;
  created_at: string;
}

// Configuration and Settings
export interface CacheConfig {
  default_ttl: number;
  max_memory_mb: number;
  eviction_policy: 'lru' | 'lfu' | 'ttl';
  compression: boolean;
  persistence: boolean;
}

export interface NotificationSettings {
  email_enabled: boolean;
  webhook_enabled: boolean;
  webhook_url?: string;
  alert_thresholds: {
    error_rate: number;
    response_time: number;
    memory_usage: number;
  };
}

// Error Types
export interface RedisError {
  code: string;
  message: string;
  command?: string;
  key?: string;
  timestamp: string;
}

// Utility Types
export type RedisValue = string | number | boolean | object | null;
export type CacheOperation = 'get' | 'set' | 'del' | 'expire' | 'exists';
export type PubSubPattern = string;
export type SubscriptionCallback = (message: PubSubMessage) => void;

// Constants
export const CACHE_KEYS: CacheKeys = {
  userSession: (userId: string) => `user:session:${userId}`,
  userPreferences: (userId: string) => `user:prefs:${userId}`,
  apiToken: (tokenHash: string) => `api:token:${tokenHash}`,
  
  logSource: (sourceId: string) => `source:${sourceId}`,
  logSourceHealth: (sourceId: string) => `source:health:${sourceId}`,
  activeLogSources: (userId: string) => `user:sources:${userId}`,
  
  logQuery: (queryHash: string) => `query:logs:${queryHash}`,
  aggregationQuery: (queryHash: string) => `query:agg:${queryHash}`,
  errorAnalysis: (queryHash: string) => `query:errors:${queryHash}`,
  
  recentLogs: (sourceId: string) => `logs:recent:${sourceId}`,
  liveLogStream: (sourceId: string) => `stream:logs:${sourceId}`,
  alertsQueue: () => 'queue:alerts',
  
  rateLimitUser: (userId: string) => `ratelimit:user:${userId}`,
  rateLimitApi: (identifier: string) => `ratelimit:api:${identifier}`,
  
  systemHealth: () => 'system:health',
  databaseStats: () => 'system:db:stats',
  
  jobStatus: (jobId: string) => `job:status:${jobId}`,
  jobQueue: (queueName: string) => `queue:${queueName}`,
};

export const CHANNEL_PATTERNS = {
  logStream: 'logs:stream:*',
  alerts: 'alerts:*',
  systemEvents: 'system:*',
  userEvents: 'user:*',
} as const;

export const DEFAULT_TTL = {
  session: 24 * 60 * 60, // 24 hours
  preferences: 30 * 60, // 30 minutes
  apiToken: 60 * 60, // 1 hour
  logSource: 10 * 60, // 10 minutes
  queryResult: 5 * 60, // 5 minutes
  systemHealth: 30, // 30 seconds
  jobStatus: 60 * 60, // 1 hour
} as const; 