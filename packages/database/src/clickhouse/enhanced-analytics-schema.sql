-- Enhanced Analytics Schema for MCP Log Server
-- This schema supports sophisticated pattern detection, clustering, and anomaly detection

-- Create database for enhanced analytics
CREATE DATABASE IF NOT EXISTS mcp_analytics;

-- Detected patterns table
CREATE TABLE IF NOT EXISTS mcp_analytics.log_patterns (
    id String,
    pattern String,
    regex Nullable(String),
    count UInt32,
    percentage Float64,
    first_seen DateTime64(3),
    last_seen DateTime64(3),
    severity Enum('low' = 1, 'medium' = 2, 'high' = 3, 'critical' = 4),
    category Enum('error' = 1, 'performance' = 2, 'security' = 3, 'business' = 4, 'system' = 5),
    confidence Float64,
    related_patterns Array(String),
    agents Array(String),
    trend Enum('increasing' = 1, 'decreasing' = 2, 'stable' = 3),
    metadata String, -- JSON string
    created_at DateTime64(3) DEFAULT now(),
    updated_at DateTime64(3) DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id, severity, count)
PARTITION BY toYYYYMM(created_at)
TTL created_at + INTERVAL 90 DAY;

-- Log clusters table
CREATE TABLE IF NOT EXISTS mcp_analytics.log_clusters (
    id String,
    centroid String,
    size UInt32,
    similarity Float64,
    time_range_start DateTime64(3),
    time_range_end DateTime64(3),
    dominant_level String,
    dominant_agent String,
    patterns Array(String),
    created_at DateTime64(3) DEFAULT now(),
    updated_at DateTime64(3) DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id, size, similarity)
PARTITION BY toYYYYMM(created_at)
TTL created_at + INTERVAL 60 DAY;

-- Sequence patterns table
CREATE TABLE IF NOT EXISTS mcp_analytics.sequence_patterns (
    id String,
    sequence Array(String),
    frequency UInt32,
    avg_duration UInt32, -- milliseconds
    agents Array(String),
    severity Enum('low' = 1, 'medium' = 2, 'high' = 3, 'critical' = 4),
    category Enum('workflow' = 1, 'error_chain' = 2, 'performance_degradation' = 3, 'security_incident' = 4),
    examples String, -- JSON string
    created_at DateTime64(3) DEFAULT now(),
    updated_at DateTime64(3) DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id, frequency, severity)
PARTITION BY toYYYYMM(created_at)
TTL created_at + INTERVAL 60 DAY;

-- Cross-agent correlations table
CREATE TABLE IF NOT EXISTS mcp_analytics.cross_agent_correlations (
    id String,
    agents Array(String),
    pattern String,
    strength Float64,
    time_window String,
    category Enum('cascading_failure' = 1, 'distributed_error' = 2, 'synchronized_event' = 3),
    detected_at DateTime64(3),
    created_at DateTime64(3) DEFAULT now()
) ENGINE = ReplacingMergeTree(created_at)
ORDER BY (id, strength, detected_at)
PARTITION BY toYYYYMM(detected_at)
TTL created_at + INTERVAL 30 DAY;

-- Anomaly alerts table
CREATE TABLE IF NOT EXISTS mcp_analytics.anomaly_alerts (
    id String,
    type Enum('volume_spike' = 1, 'error_burst' = 2, 'agent_silence' = 3, 'pattern_anomaly' = 4, 
              'sequence_break' = 5, 'temporal_deviation' = 6, 'cross_agent_correlation' = 7),
    message String,
    severity Enum('info' = 1, 'warning' = 2, 'critical' = 3),
    timestamp DateTime64(3),
    agent_id Nullable(String),
    confidence Float64,
    metadata String, -- JSON string
    related_patterns Array(String),
    suggested_actions Array(String),
    status Enum('active' = 1, 'acknowledged' = 2, 'resolved' = 3) DEFAULT 'active',
    created_at DateTime64(3) DEFAULT now(),
    updated_at DateTime64(3) DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id, severity, timestamp)
PARTITION BY toYYYYMM(timestamp)
TTL created_at + INTERVAL 30 DAY;

-- Enhanced log aggregations by pattern
CREATE TABLE IF NOT EXISTS mcp_analytics.log_aggregations_by_pattern (
    pattern_id String,
    time_bucket DateTime64(3),
    count UInt32,
    agents Array(String),
    level_distribution String, -- JSON string
    avg_confidence Float64,
    created_at DateTime64(3) DEFAULT now()
) ENGINE = SummingMergeTree(count)
ORDER BY (pattern_id, time_bucket)
PARTITION BY toYYYYMM(time_bucket)
TTL created_at + INTERVAL 60 DAY;

-- Temporal pattern analysis
CREATE TABLE IF NOT EXISTS mcp_analytics.temporal_patterns (
    id String,
    pattern String,
    time_pattern Enum('hourly' = 1, 'daily' = 2, 'weekly' = 3, 'irregular' = 4),
    peaks String, -- JSON array
    baseline Float64,
    volatility Float64,
    cyclical Bool,
    forecast String, -- JSON array
    created_at DateTime64(3) DEFAULT now(),
    updated_at DateTime64(3) DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id, time_pattern, baseline)
PARTITION BY toYYYYMM(created_at)
TTL created_at + INTERVAL 90 DAY;

-- Performance metrics for analytics
CREATE TABLE IF NOT EXISTS mcp_analytics.analytics_performance (
    operation String,
    duration_ms UInt32,
    patterns_found UInt32,
    clusters_found UInt32,
    sequences_found UInt32,
    anomalies_found UInt32,
    timestamp DateTime64(3),
    created_at DateTime64(3) DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (operation, timestamp)
PARTITION BY toYYYYMM(timestamp)
TTL created_at + INTERVAL 30 DAY;

-- Materialized views for real-time analytics

-- Pattern frequency by hour
CREATE MATERIALIZED VIEW IF NOT EXISTS mcp_analytics.pattern_frequency_hourly
ENGINE = SummingMergeTree()
ORDER BY (pattern_id, hour_bucket)
PARTITION BY toYYYYMM(hour_bucket)
AS SELECT
    pattern_id,
    toStartOfHour(created_at) as hour_bucket,
    count() as frequency,
    uniq(agent_id) as unique_agents
FROM mcp_analytics.log_patterns
GROUP BY pattern_id, hour_bucket;

-- Agent health scoring
CREATE MATERIALIZED VIEW IF NOT EXISTS mcp_analytics.agent_health_scores
ENGINE = ReplacingMergeTree()
ORDER BY (agent_id, score_timestamp)
PARTITION BY toYYYYMM(score_timestamp)
AS SELECT
    agent_id,
    toStartOfHour(timestamp) as score_timestamp,
    countIf(severity = 'critical') as critical_patterns,
    countIf(severity = 'high') as high_patterns,
    countIf(severity = 'medium') as medium_patterns,
    countIf(severity = 'low') as low_patterns,
    avg(confidence) as avg_confidence,
    -- Calculate health score: 100 - (critical*20 + high*10 + medium*5 + low*1)
    greatest(0, 100 - (critical_patterns * 20 + high_patterns * 10 + medium_patterns * 5 + low_patterns * 1)) as health_score
FROM mcp_analytics.log_patterns
WHERE has(agents, agent_id)
GROUP BY agent_id, score_timestamp;

-- Anomaly detection baseline
CREATE MATERIALIZED VIEW IF NOT EXISTS mcp_analytics.anomaly_baselines
ENGINE = AggregatingMergeTree()
ORDER BY (metric_type, time_bucket)
PARTITION BY toYYYYMM(time_bucket)
AS SELECT
    'log_volume' as metric_type,
    toStartOfHour(timestamp) as time_bucket,
    count() as value,
    avg(count()) OVER (PARTITION BY toStartOfHour(timestamp) ORDER BY toStartOfHour(timestamp) ROWS BETWEEN 23 PRECEDING AND CURRENT ROW) as moving_avg,
    stddevSamp(count()) OVER (PARTITION BY toStartOfHour(timestamp) ORDER BY toStartOfHour(timestamp) ROWS BETWEEN 23 PRECEDING AND CURRENT ROW) as moving_stddev
FROM mcp_logs.logs
GROUP BY time_bucket;

-- Cross-agent pattern correlation
CREATE MATERIALIZED VIEW IF NOT EXISTS mcp_analytics.cross_agent_pattern_correlation
ENGINE = ReplacingMergeTree()
ORDER BY (agent_pair, pattern_id, correlation_timestamp)
PARTITION BY toYYYYMM(correlation_timestamp)
AS SELECT
    arraySort([agent1, agent2]) as agent_pair,
    pattern_id,
    toStartOfHour(created_at) as correlation_timestamp,
    count() as co_occurrences,
    uniq(pattern_id) as unique_patterns
FROM (
    SELECT 
        pattern_id,
        agent1,
        agent2,
        created_at
    FROM mcp_analytics.log_patterns
    ARRAY JOIN agents as agent1
    ARRAY JOIN agents as agent2
    WHERE agent1 != agent2
)
GROUP BY agent_pair, pattern_id, correlation_timestamp;

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_patterns_severity ON mcp_analytics.log_patterns (severity) TYPE set(0);
CREATE INDEX IF NOT EXISTS idx_patterns_category ON mcp_analytics.log_patterns (category) TYPE set(0);
CREATE INDEX IF NOT EXISTS idx_patterns_agents ON mcp_analytics.log_patterns (agents) TYPE bloom_filter(0.01);
CREATE INDEX IF NOT EXISTS idx_patterns_created_at ON mcp_analytics.log_patterns (created_at) TYPE minmax;

CREATE INDEX IF NOT EXISTS idx_clusters_size ON mcp_analytics.log_clusters (size) TYPE minmax;
CREATE INDEX IF NOT EXISTS idx_clusters_similarity ON mcp_analytics.log_clusters (similarity) TYPE minmax;

CREATE INDEX IF NOT EXISTS idx_sequences_frequency ON mcp_analytics.sequence_patterns (frequency) TYPE minmax;
CREATE INDEX IF NOT EXISTS idx_sequences_severity ON mcp_analytics.sequence_patterns (severity) TYPE set(0);

CREATE INDEX IF NOT EXISTS idx_alerts_type ON mcp_analytics.anomaly_alerts (type) TYPE set(0);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON mcp_analytics.anomaly_alerts (severity) TYPE set(0);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON mcp_analytics.anomaly_alerts (status) TYPE set(0);
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON mcp_analytics.anomaly_alerts (timestamp) TYPE minmax;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mcp_analytics.* TO analytics_user;
-- GRANT SELECT ON mcp_logs.* TO analytics_user; 