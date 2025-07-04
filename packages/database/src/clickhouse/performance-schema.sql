-- Performance Optimization Schema for MCP Log Server
-- Materialized views, indexes, and aggregation tables for fast analytics

-- 1. Materialized View for Hourly Log Aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS mcp_logs.logs_hourly_mv
ENGINE = ReplacingMergeTree()
ORDER BY (toStartOfHour(timestamp), source, level)
SETTINGS index_granularity = 8192
AS SELECT
    toStartOfHour(timestamp) as hour,
    source,
    level,
    agentType,
    count() as log_count,
    countIf(level = 'error') as error_count,
    countIf(level = 'warn') as warn_count,
    countIf(level = 'info') as info_count,
    countIf(level = 'debug') as debug_count,
    max(timestamp) as last_log_time,
    min(timestamp) as first_log_time
FROM mcp_logs.logs
GROUP BY hour, source, level, agentType;

-- 2. Materialized View for Daily Agent Summaries
CREATE MATERIALIZED VIEW IF NOT EXISTS mcp_logs.agent_daily_summary_mv
ENGINE = ReplacingMergeTree()
ORDER BY (toDate(timestamp), source)
SETTINGS index_granularity = 8192
AS SELECT
    toDate(timestamp) as date,
    source,
    agentType,
    count() as total_logs,
    countIf(level IN ('error', 'fatal')) as total_errors,
    countIf(level = 'warn') as total_warnings,
    max(timestamp) as last_activity,
    min(timestamp) as first_activity,
    uniq(level) as unique_levels,
    groupArray(level) as level_distribution
FROM mcp_logs.logs
GROUP BY date, source, agentType;

-- 3. Materialized View for Log Patterns (Pre-computed)
CREATE MATERIALIZED VIEW IF NOT EXISTS mcp_logs.log_patterns_mv
ENGINE = ReplacingMergeTree()
ORDER BY (toStartOfHour(timestamp), pattern_type)
SETTINGS index_granularity = 8192
AS SELECT
    toStartOfHour(timestamp) as hour,
    CASE
        -- Common error patterns
        WHEN message LIKE '%error%' OR message LIKE '%Error%' OR message LIKE '%ERROR%' THEN 'Error Messages'
        WHEN message LIKE '%failed%' OR message LIKE '%Failed%' OR message LIKE '%FAILED%' THEN 'Failure Messages'
        WHEN message LIKE '%timeout%' OR message LIKE '%Timeout%' OR message LIKE '%TIMEOUT%' THEN 'Timeout Issues'
        WHEN message LIKE '%connection%' OR message LIKE '%Connection%' THEN 'Connection Issues'
        WHEN message LIKE '%permission%' OR message LIKE '%Permission%' OR message LIKE '%denied%' THEN 'Permission Issues'
        WHEN message LIKE '%not found%' OR message LIKE '%Not found%' OR message LIKE '%404%' THEN 'Not Found Errors'
        WHEN message LIKE '%unauthorized%' OR message LIKE '%Unauthorized%' OR message LIKE '%401%' THEN 'Authorization Errors'
        WHEN message LIKE '%rate limit%' OR message LIKE '%Rate limit%' OR message LIKE '%429%' THEN 'Rate Limiting'
        -- Performance patterns
        WHEN message LIKE '%slow%' OR message LIKE '%Slow%' OR message LIKE '%performance%' THEN 'Performance Issues'
        WHEN message LIKE '%memory%' OR message LIKE '%Memory%' OR message LIKE '%RAM%' THEN 'Memory Issues'
        WHEN message LIKE '%disk%' OR message LIKE '%Disk%' OR message LIKE '%storage%' THEN 'Storage Issues'
        -- AI Agent specific patterns
        WHEN message LIKE '%AI%' OR message LIKE '%model%' OR message LIKE '%completion%' THEN 'AI Model Operations'
        WHEN message LIKE '%prompt%' OR message LIKE '%Prompt%' THEN 'Prompt Processing'
        WHEN message LIKE '%WSL%' OR message LIKE '%wsl%' THEN 'WSL Operations'
        ELSE 'Other'
    END as pattern_type,
    level,
    source,
    count() as pattern_count,
    min(timestamp) as first_seen,
    max(timestamp) as last_seen
FROM mcp_logs.logs
WHERE pattern_type != 'Other'
GROUP BY hour, pattern_type, level, source;

-- 4. Index for Fast Timestamp Queries
ALTER TABLE mcp_logs.logs ADD INDEX IF NOT EXISTS idx_timestamp_level (timestamp, level) TYPE minmax GRANULARITY 1;
ALTER TABLE mcp_logs.logs ADD INDEX IF NOT EXISTS idx_source_timestamp (source, timestamp) TYPE minmax GRANULARITY 1;
ALTER TABLE mcp_logs.logs ADD INDEX IF NOT EXISTS idx_level_timestamp (level, timestamp) TYPE minmax GRANULARITY 1;

-- 5. Fast Search Index for Message Content
ALTER TABLE mcp_logs.logs ADD INDEX IF NOT EXISTS idx_message_tokens (message) TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1;

-- 6. Performance Monitoring Table
CREATE TABLE IF NOT EXISTS mcp_logs.query_performance (
    query_id String,
    query_type String,
    execution_time_ms UInt32,
    timestamp DateTime64(3) DEFAULT now64(),
    result_rows UInt32,
    bytes_read UInt64,
    memory_usage UInt64
) ENGINE = MergeTree()
ORDER BY timestamp
TTL timestamp + INTERVAL 7 DAY;

-- 7. Agent Health Cache Table
CREATE TABLE IF NOT EXISTS mcp_logs.agent_health_cache (
    agent_id String,
    agent_name String,
    last_activity DateTime64(3),
    log_volume_24h UInt32,
    error_count_24h UInt32,
    warning_count_24h UInt32,
    health_score UInt8,
    status String,
    updated_at DateTime64(3) DEFAULT now64()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY agent_id
TTL updated_at + INTERVAL 1 HOUR;

-- 8. Anomaly Detection Cache Table
CREATE TABLE IF NOT EXISTS mcp_logs.anomaly_cache (
    anomaly_id String,
    anomaly_type String,
    message String,
    severity String,
    agent_id String,
    metadata String, -- JSON string
    created_at DateTime64(3) DEFAULT now64(),
    expires_at DateTime64(3)
) ENGINE = MergeTree()
ORDER BY created_at
TTL expires_at;

-- 9. Optimize Table Settings for Performance
OPTIMIZE TABLE mcp_logs.logs FINAL;

-- 10. Create Indexes on Materialized Views
ALTER TABLE mcp_logs.logs_hourly_mv ADD INDEX IF NOT EXISTS idx_hour_source (hour, source) TYPE minmax GRANULARITY 1;
ALTER TABLE mcp_logs.agent_daily_summary_mv ADD INDEX IF NOT EXISTS idx_date_source (date, source) TYPE minmax GRANULARITY 1;
ALTER TABLE mcp_logs.log_patterns_mv ADD INDEX IF NOT EXISTS idx_hour_pattern (hour, pattern_type) TYPE minmax GRANULARITY 1; 