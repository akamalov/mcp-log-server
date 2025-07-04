-- ClickHouse Schema for MCP Log Server Analytics
-- This database stores high-volume log entries optimized for time-series queries

-- Main log entries table with efficient time-based partitioning
CREATE TABLE IF NOT EXISTS log_entries (
    -- Time and identification
    timestamp DateTime64(3) CODEC(Delta, ZSTD(1)),
    log_id String CODEC(ZSTD(1)),
    source_id String CODEC(ZSTD(1)),
    
    -- Core log data
    level LowCardinality(String) CODEC(ZSTD(1)), -- debug, info, warn, error, fatal
    message String CODEC(ZSTD(1)),
    
    -- Agent and context information
    agent_type LowCardinality(String) CODEC(ZSTD(1)), -- claude, cursor, vscode, custom
    agent_version String CODEC(ZSTD(1)),
    session_id String CODEC(ZSTD(1)),
    
    -- Location and source details
    file_path String CODEC(ZSTD(1)),
    line_number Nullable(UInt32) CODEC(ZSTD(1)),
    function_name Nullable(String) CODEC(ZSTD(1)),
    
    -- Structured metadata
    metadata String CODEC(ZSTD(1)), -- JSON string for flexible metadata
    tags Array(String) CODEC(ZSTD(1)),
    
    -- Performance and context
    duration_ms Nullable(Float64) CODEC(ZSTD(1)),
    memory_usage_mb Nullable(Float64) CODEC(ZSTD(1)),
    cpu_usage_percent Nullable(Float64) CODEC(ZSTD(1)),
    
    -- Error tracking
    error_code Nullable(String) CODEC(ZSTD(1)),
    error_type Nullable(String) CODEC(ZSTD(1)),
    stack_trace Nullable(String) CODEC(ZSTD(1)),
    
    -- User and request context
    user_id Nullable(String) CODEC(ZSTD(1)),
    request_id Nullable(String) CODEC(ZSTD(1)),
    correlation_id Nullable(String) CODEC(ZSTD(1)),
    
    -- Ingestion metadata
    ingested_at DateTime64(3) DEFAULT now64() CODEC(Delta, ZSTD(1)),
    processed_at Nullable(DateTime64(3)) CODEC(Delta, ZSTD(1)),
    
    -- Raw log line for full-text search
    raw_log String CODEC(ZSTD(1))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, source_id, level, agent_type)
TTL timestamp + INTERVAL 90 DAY DELETE -- Auto-delete logs older than 90 days
SETTINGS index_granularity = 8192;

-- Materialized view for real-time aggregations by hour
CREATE MATERIALIZED VIEW IF NOT EXISTS log_hourly_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, source_id, agent_type, level)
AS SELECT
    toStartOfHour(timestamp) as hour,
    source_id,
    agent_type,
    level,
    count() as log_count,
    countIf(level = 'error') as error_count,
    countIf(level = 'warn') as warn_count,
    avg(duration_ms) as avg_duration_ms,
    max(duration_ms) as max_duration_ms,
    avg(memory_usage_mb) as avg_memory_mb,
    max(memory_usage_mb) as max_memory_mb
FROM log_entries
GROUP BY hour, source_id, agent_type, level;

-- Materialized view for daily aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS log_daily_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (day, source_id, agent_type)
AS SELECT
    toStartOfDay(timestamp) as day,
    source_id,
    agent_type,
    count() as total_logs,
    countIf(level = 'error') as errors,
    countIf(level = 'warn') as warnings,
    countIf(level = 'info') as info_logs,
    countIf(level = 'debug') as debug_logs,
    uniqExact(session_id) as unique_sessions,
    avg(duration_ms) as avg_duration,
    quantile(0.95)(duration_ms) as p95_duration,
    quantile(0.99)(duration_ms) as p99_duration
FROM log_entries
GROUP BY day, source_id, agent_type;

-- Error tracking and analysis table
CREATE TABLE IF NOT EXISTS error_patterns (
    -- Time and identification
    first_seen DateTime64(3) CODEC(Delta, ZSTD(1)),
    last_seen DateTime64(3) CODEC(Delta, ZSTD(1)),
    
    -- Error pattern identification
    error_hash String CODEC(ZSTD(1)), -- Hash of normalized error message
    error_type String CODEC(ZSTD(1)),
    normalized_message String CODEC(ZSTD(1)),
    
    -- Occurrence tracking
    occurrence_count UInt64 CODEC(ZSTD(1)),
    source_ids Array(String) CODEC(ZSTD(1)),
    agent_types Array(String) CODEC(ZSTD(1)),
    
    -- Sample data
    sample_stack_trace Nullable(String) CODEC(ZSTD(1)),
    sample_metadata String CODEC(ZSTD(1)),
    
    -- Resolution tracking
    is_resolved Bool DEFAULT false,
    resolved_at Nullable(DateTime64(3)) CODEC(Delta, ZSTD(1)),
    resolution_notes Nullable(String) CODEC(ZSTD(1))
)
ENGINE = ReplacingMergeTree(last_seen)
PARTITION BY toYYYYMM(first_seen)
ORDER BY (error_hash, first_seen)
SETTINGS index_granularity = 8192;

-- Session analytics table for tracking user/agent sessions
CREATE TABLE IF NOT EXISTS session_analytics (
    session_id String CODEC(ZSTD(1)),
    source_id String CODEC(ZSTD(1)),
    agent_type LowCardinality(String) CODEC(ZSTD(1)),
    
    -- Session timing
    session_start DateTime64(3) CODEC(Delta, ZSTD(1)),
    session_end DateTime64(3) CODEC(Delta, ZSTD(1)),
    duration_minutes Float64 CODEC(ZSTD(1)),
    
    -- Activity metrics
    total_logs UInt64 CODEC(ZSTD(1)),
    error_count UInt64 CODEC(ZSTD(1)),
    warn_count UInt64 CODEC(ZSTD(1)),
    unique_functions UInt64 CODEC(ZSTD(1)),
    
    -- Performance metrics
    avg_response_time Float64 CODEC(ZSTD(1)),
    max_memory_usage Float64 CODEC(ZSTD(1)),
    
    -- Context
    user_id Nullable(String) CODEC(ZSTD(1)),
    tags Array(String) CODEC(ZSTD(1))
)
ENGINE = ReplacingMergeTree(session_end)
PARTITION BY toYYYYMM(session_start)
ORDER BY (session_start, source_id, session_id)
SETTINGS index_granularity = 8192;

-- Search index table for full-text search capabilities
CREATE TABLE IF NOT EXISTS search_index (
    log_id String CODEC(ZSTD(1)),
    timestamp DateTime64(3) CODEC(Delta, ZSTD(1)),
    source_id String CODEC(ZSTD(1)),
    
    -- Search vectors and text
    message_tokens Array(String) CODEC(ZSTD(1)), -- Tokenized message for search
    search_text String CODEC(ZSTD(1)), -- Combined searchable text
    
    -- Metadata for search context
    level LowCardinality(String) CODEC(ZSTD(1)),
    agent_type LowCardinality(String) CODEC(ZSTD(1)),
    tags Array(String) CODEC(ZSTD(1))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, source_id)
SETTINGS index_granularity = 8192;

-- Performance metrics table for system monitoring
CREATE TABLE IF NOT EXISTS performance_metrics (
    timestamp DateTime64(3) CODEC(Delta, ZSTD(1)),
    metric_name LowCardinality(String) CODEC(ZSTD(1)),
    metric_value Float64 CODEC(ZSTD(1)),
    
    -- Context
    source_id String CODEC(ZSTD(1)),
    agent_type LowCardinality(String) CODEC(ZSTD(1)),
    
    -- Additional dimensions
    dimensions Map(String, String) CODEC(ZSTD(1))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, metric_name, source_id)
TTL timestamp + INTERVAL 30 DAY DELETE -- Keep metrics for 30 days
SETTINGS index_granularity = 8192;

-- Create dictionaries for efficient lookups

-- Log level priority dictionary
CREATE DICTIONARY IF NOT EXISTS log_level_priority (
    level String,
    priority UInt8
)
PRIMARY KEY level
SOURCE(CLICKHOUSE(
    query 'SELECT level, priority FROM (
        SELECT ''debug'' as level, 1 as priority
        UNION ALL SELECT ''info'', 2
        UNION ALL SELECT ''warn'', 3  
        UNION ALL SELECT ''error'', 4
        UNION ALL SELECT ''fatal'', 5
    )'
))
LAYOUT(HASHED())
LIFETIME(0);

-- Useful functions for log analysis

-- Function to extract error patterns
CREATE FUNCTION IF NOT EXISTS extractErrorPattern AS (message) -> 
    replaceRegexpAll(
        replaceRegexpAll(message, '[0-9]+', '#NUM#'),
        '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', '#UUID#'
    );

-- Function to calculate log trend
CREATE FUNCTION IF NOT EXISTS calculateTrend AS (current_count, previous_count) ->
    if(previous_count > 0, 
       round((current_count - previous_count) / previous_count * 100, 2),
       if(current_count > 0, 100, 0)
    );

-- Views for common queries

-- Recent errors view
CREATE VIEW IF NOT EXISTS recent_errors AS
SELECT 
    timestamp,
    source_id,
    agent_type,
    level,
    message,
    error_code,
    error_type,
    session_id,
    correlation_id
FROM log_entries 
WHERE level IN ('error', 'fatal')
  AND timestamp >= now() - INTERVAL 1 HOUR
ORDER BY timestamp DESC
LIMIT 1000;

-- Performance summary view
CREATE VIEW IF NOT EXISTS performance_summary AS
SELECT 
    toStartOfHour(timestamp) as hour,
    source_id,
    agent_type,
    count() as total_logs,
    countIf(level = 'error') as errors,
    avg(duration_ms) as avg_duration,
    quantile(0.95)(duration_ms) as p95_duration,
    max(memory_usage_mb) as peak_memory
FROM log_entries
WHERE timestamp >= now() - INTERVAL 24 HOUR
GROUP BY hour, source_id, agent_type
ORDER BY hour DESC;

-- Agent activity view
CREATE VIEW IF NOT EXISTS agent_activity AS
SELECT 
    agent_type,
    source_id,
    count() as log_count,
    countIf(level = 'error') as error_count,
    max(timestamp) as last_activity,
    uniqExact(session_id) as active_sessions
FROM log_entries
WHERE timestamp >= now() - INTERVAL 1 HOUR
GROUP BY agent_type, source_id
ORDER BY log_count DESC; 