import { ClickHouseClient } from '@clickhouse/client';
import type { LogEntry, LogQuery } from '@mcp-log-server/types';

export interface QueryPerformanceMetrics {
  queryId: string;
  queryType: string;
  executionTime: number;
  resultRows: number;
  bytesRead: number;
  memoryUsage: number;
  timestamp: Date;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // seconds
  maxSize: number; // max entries
}

export class OptimizedLogsService {
  private clickhouse: ClickHouseClient;
  private queryCache = new Map<string, { data: any; expiry: number }>();
  private cacheConfig: CacheConfig;
  private performanceMetrics: QueryPerformanceMetrics[] = [];

  constructor(
    clickhouseConfig: any,
    cacheConfig: CacheConfig = {
      enabled: true,
      ttl: 300, // 5 minutes
      maxSize: 1000
    }
  ) {
    this.clickhouse = new ClickHouseClient(clickhouseConfig);
    this.cacheConfig = cacheConfig;
  }

  /**
   * Enhanced log ingestion with performance tracking
   */
  async ingestLog(logEntry: LogEntry): Promise<void> {
    const startTime = performance.now();
    const queryId = `ingest-${Date.now()}`;

    try {
      // Use optimized insert with batch processing capability
      await this.clickhouse.insert({
        table: 'mcp_logs.logs',
        values: [{
          id: logEntry.id,
          timestamp: logEntry.timestamp,
          level: logEntry.level,
          message: logEntry.message,
          source: logEntry.source,
          agentType: logEntry.metadata?.agentType || 'unknown',
          metadata: JSON.stringify(logEntry.metadata || {})
        }]
      });

      // Track performance metrics
      const executionTime = performance.now() - startTime;
      await this.trackQueryPerformance({
        queryId,
        queryType: 'INSERT',
        executionTime,
        resultRows: 1,
        bytesRead: 0,
        memoryUsage: 0,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Failed to ingest log:', error);
      throw error;
    }
  }

  /**
   * Optimized recent logs retrieval using materialized views
   */
  async getRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    const cacheKey = `recent-logs-${limit}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const startTime = performance.now();
    const queryId = `recent-logs-${Date.now()}`;

    try {
      // Use optimized query with proper indexing
      const result = await this.clickhouse.query({
        query: `
          SELECT 
            id,
            timestamp,
            level,
            message,
            source,
            agentType,
            metadata
          FROM mcp_logs.logs 
          ORDER BY timestamp DESC 
          LIMIT ${limit}
        `,
      });

      const logs = await result.json();
      const mappedLogs = logs.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level,
        message: row.message,
        source: row.source,
        metadata: {
          agentType: row.agentType,
          ...JSON.parse(row.metadata || '{}')
        }
      }));

      // Cache the results
      this.setCache(cacheKey, mappedLogs);

      // Track performance
      const executionTime = performance.now() - startTime;
      await this.trackQueryPerformance({
        queryId,
        queryType: 'SELECT_RECENT',
        executionTime,
        resultRows: mappedLogs.length,
        bytesRead: 0,
        memoryUsage: 0,
        timestamp: new Date()
      });

      return mappedLogs;
    } catch (error) {
      console.error('Failed to get recent logs:', error);
      throw error;
    }
  }

  /**
   * Optimized log search using materialized views and indexes
   */
  async searchLogs(query: LogQuery): Promise<LogEntry[]> {
    const cacheKey = `search-${JSON.stringify(query)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const startTime = performance.now();
    const queryId = `search-${Date.now()}`;

    try {
      // Build optimized WHERE clause
      const conditions: string[] = [];
      const params: any = {};

      if (query.level) {
        conditions.push(`level = '${query.level}'`);
      }

      if (query.source) {
        conditions.push(`source = '${query.source}'`);
      }

      if (query.startTime) {
        conditions.push(`timestamp >= '${query.startTime}'`);
      }

      if (query.endTime) {
        conditions.push(`timestamp <= '${query.endTime}'`);
      }

      if (query.message) {
        // Use the token index for fast text search
        conditions.push(`hasToken(message, '${query.message.replace(/'/g, "''")}')`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitClause = query.limit ? `LIMIT ${query.limit}` : 'LIMIT 1000';

      // Use optimized query with proper indexing
      const sqlQuery = `
        SELECT 
          id,
          timestamp,
          level,
          message,
          source,
          agentType,
          metadata
        FROM mcp_logs.logs 
        ${whereClause}
        ORDER BY timestamp DESC 
        ${limitClause}
      `;

      const result = await this.clickhouse.query({ query: sqlQuery });
      const logs = await result.json();
      
      const mappedLogs = logs.map((row: any) => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level,
        message: row.message,
        source: row.source,
        metadata: {
          agentType: row.agentType,
          ...JSON.parse(row.metadata || '{}')
        }
      }));

      // Cache the results
      this.setCache(cacheKey, mappedLogs);

      // Track performance
      const executionTime = performance.now() - startTime;
      await this.trackQueryPerformance({
        queryId,
        queryType: 'SEARCH',
        executionTime,
        resultRows: mappedLogs.length,
        bytesRead: 0,
        memoryUsage: 0,
        timestamp: new Date()
      });

      return mappedLogs;
    } catch (error) {
      console.error('Failed to search logs:', error);
      throw error;
    }
  }

  /**
   * Fast hourly metrics using materialized view
   */
  async getHourlyMetrics(hours: number = 24): Promise<any[]> {
    const cacheKey = `hourly-metrics-${hours}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const startTime = performance.now();
    const queryId = `hourly-metrics-${Date.now()}`;

    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT 
            hour,
            source,
            level,
            agentType,
            sum(log_count) as total_logs,
            sum(error_count) as total_errors,
            sum(warn_count) as total_warnings,
            sum(info_count) as total_info,
            sum(debug_count) as total_debug,
            max(last_log_time) as last_activity
          FROM mcp_logs.logs_hourly_mv
          WHERE hour >= now() - INTERVAL ${hours} HOUR
          GROUP BY hour, source, level, agentType
          ORDER BY hour DESC
        `,
      });

      const metrics = await result.json();
      
      // Cache the results with shorter TTL for real-time data
      this.setCache(cacheKey, metrics, 60); // 1 minute cache

      // Track performance
      const executionTime = performance.now() - startTime;
      await this.trackQueryPerformance({
        queryId,
        queryType: 'HOURLY_METRICS',
        executionTime,
        resultRows: metrics.length,
        bytesRead: 0,
        memoryUsage: 0,
        timestamp: new Date()
      });

      return metrics;
    } catch (error) {
      console.error('Failed to get hourly metrics:', error);
      throw error;
    }
  }

  /**
   * Fast agent health metrics using cached view
   */
  async getOptimizedAgentHealth(): Promise<any[]> {
    const cacheKey = 'agent-health-optimized';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const startTime = performance.now();
    const queryId = `agent-health-${Date.now()}`;

    try {
      // Try to get from cache table first
      const cacheResult = await this.clickhouse.query({
        query: `
          SELECT 
            agent_id,
            agent_name,
            last_activity,
            log_volume_24h,
            error_count_24h,
            warning_count_24h,
            health_score,
            status
          FROM mcp_logs.agent_health_cache
          WHERE updated_at > now() - INTERVAL 15 MINUTE
        `,
      });

      const cachedHealth = await cacheResult.json();
      
      if (cachedHealth.length > 0) {
        this.setCache(cacheKey, cachedHealth, 60);
        return cachedHealth;
      }

      // Fall back to materialized view if cache is empty
      const result = await this.clickhouse.query({
        query: `
          SELECT 
            source as agent_id,
            source as agent_name,
            max(last_activity) as last_activity,
            sum(total_logs) as log_volume_24h,
            sum(total_errors) as error_count_24h,
            sum(total_warnings) as warning_count_24h
          FROM mcp_logs.agent_daily_summary_mv
          WHERE date >= today() - 1
          GROUP BY source
          ORDER BY log_volume_24h DESC
        `,
      });

      const health = await result.json();
      
      // Calculate health scores and update cache
      const enrichedHealth = health.map((agent: any) => {
        const errorRate = agent.log_volume_24h > 0 ? agent.error_count_24h / agent.log_volume_24h : 0;
        const warningRate = agent.log_volume_24h > 0 ? agent.warning_count_24h / agent.log_volume_24h : 0;
        
        let healthScore = 100;
        healthScore -= Math.min(50, errorRate * 500);
        healthScore -= Math.min(20, warningRate * 200);
        
        const minutesSinceActivity = (Date.now() - new Date(agent.last_activity).getTime()) / (1000 * 60);
        if (minutesSinceActivity > 60) {
          healthScore -= Math.min(30, minutesSinceActivity / 10);
        }

        const status = minutesSinceActivity > 1440 ? 'inactive' :
                      healthScore >= 80 ? 'healthy' :
                      healthScore >= 60 ? 'warning' : 'critical';

        return {
          ...agent,
          health_score: Math.max(0, Math.round(healthScore)),
          status
        };
      });

      // Update cache table
      if (enrichedHealth.length > 0) {
        await this.updateAgentHealthCache(enrichedHealth);
      }

      // Cache the results
      this.setCache(cacheKey, enrichedHealth, 60);

      // Track performance
      const executionTime = performance.now() - startTime;
      await this.trackQueryPerformance({
        queryId,
        queryType: 'AGENT_HEALTH',
        executionTime,
        resultRows: enrichedHealth.length,
        bytesRead: 0,
        memoryUsage: 0,
        timestamp: new Date()
      });

      return enrichedHealth;
    } catch (error) {
      console.error('Failed to get optimized agent health:', error);
      throw error;
    }
  }

  /**
   * Fast pattern detection using materialized view
   */
  async getOptimizedPatterns(hours: number = 24): Promise<any[]> {
    const cacheKey = `patterns-optimized-${hours}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const startTime = performance.now();
    const queryId = `patterns-${Date.now()}`;

    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT 
            pattern_type,
            sum(pattern_count) as total_count,
            min(first_seen) as first_seen,
            max(last_seen) as last_seen,
            groupArray(DISTINCT level) as levels,
            groupArray(DISTINCT source) as sources
          FROM mcp_logs.log_patterns_mv
          WHERE hour >= now() - INTERVAL ${hours} HOUR
          GROUP BY pattern_type
          ORDER BY total_count DESC
          LIMIT 20
        `,
      });

      const patterns = await result.json();
      
      // Cache the results
      this.setCache(cacheKey, patterns, 120); // 2 minute cache

      // Track performance
      const executionTime = performance.now() - startTime;
      await this.trackQueryPerformance({
        queryId,
        queryType: 'PATTERNS',
        executionTime,
        resultRows: patterns.length,
        bytesRead: 0,
        memoryUsage: 0,
        timestamp: new Date()
      });

      return patterns;
    } catch (error) {
      console.error('Failed to get optimized patterns:', error);
      throw error;
    }
  }

  /**
   * Cache management methods
   */
  private getFromCache(key: string): any | null {
    if (!this.cacheConfig.enabled) return null;

    const entry = this.queryCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.queryCache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache(key: string, data: any, customTtl?: number): void {
    if (!this.cacheConfig.enabled) return;

    // Clean up old entries if cache is full
    if (this.queryCache.size >= this.cacheConfig.maxSize) {
      const oldestKey = this.queryCache.keys().next().value;
      this.queryCache.delete(oldestKey);
    }

    const ttl = customTtl || this.cacheConfig.ttl;
    this.queryCache.set(key, {
      data,
      expiry: Date.now() + (ttl * 1000)
    });
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.queryCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; maxSize: number; hitRatio: number } {
    return {
      size: this.queryCache.size,
      maxSize: this.cacheConfig.maxSize,
      hitRatio: 0 // TODO: Track hit/miss ratio
    };
  }

  /**
   * Track query performance
   */
  private async trackQueryPerformance(metrics: QueryPerformanceMetrics): Promise<void> {
    try {
      // Store in memory for immediate access
      this.performanceMetrics.push(metrics);
      
      // Keep only last 1000 metrics in memory
      if (this.performanceMetrics.length > 1000) {
        this.performanceMetrics = this.performanceMetrics.slice(-1000);
      }

      // Store in database for historical analysis
      await this.clickhouse.insert({
        table: 'mcp_logs.query_performance',
        values: [{
          query_id: metrics.queryId,
          query_type: metrics.queryType,
          execution_time_ms: Math.round(metrics.executionTime),
          result_rows: metrics.resultRows,
          bytes_read: metrics.bytesRead,
          memory_usage: metrics.memoryUsage
        }]
      });
    } catch (error) {
      console.warn('Failed to track query performance:', error);
    }
  }

  /**
   * Get performance statistics
   */
  public getPerformanceStats(): {
    averageQueryTime: number;
    totalQueries: number;
    queryTypeBreakdown: Record<string, number>;
    recentMetrics: QueryPerformanceMetrics[];
  } {
    const total = this.performanceMetrics.length;
    const avgTime = total > 0 ? 
      this.performanceMetrics.reduce((sum, m) => sum + m.executionTime, 0) / total : 0;
    
    const typeBreakdown = this.performanceMetrics.reduce((acc, m) => {
      acc[m.queryType] = (acc[m.queryType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      averageQueryTime: Math.round(avgTime * 100) / 100,
      totalQueries: total,
      queryTypeBreakdown: typeBreakdown,
      recentMetrics: this.performanceMetrics.slice(-10)
    };
  }

  /**
   * Update agent health cache table
   */
  private async updateAgentHealthCache(healthData: any[]): Promise<void> {
    try {
      await this.clickhouse.insert({
        table: 'mcp_logs.agent_health_cache',
        values: healthData.map(agent => ({
          agent_id: agent.agent_id,
          agent_name: agent.agent_name,
          last_activity: agent.last_activity,
          log_volume_24h: agent.log_volume_24h,
          error_count_24h: agent.error_count_24h,
          warning_count_24h: agent.warning_count_24h,
          health_score: agent.health_score,
          status: agent.status
        }))
      });
    } catch (error) {
      console.warn('Failed to update agent health cache:', error);
    }
  }

  /**
   * Initialize performance schema
   */
  public async initializePerformanceSchema(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const schemaPath = path.join(process.cwd(), '../../packages/database/src/clickhouse/performance-schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      
      // Execute each statement separately
      const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);
      
      for (const statement of statements) {
        try {
          await this.clickhouse.exec({ query: statement.trim() + ';' });
        } catch (error: any) {
          // Ignore "already exists" errors
          if (!error.message?.includes('already exists')) {
            console.warn(`Warning executing schema statement: ${error.message}`);
          }
        }
      }
      
      console.log('✅ Performance schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize performance schema:', error);
      throw error;
    }
  }
} 