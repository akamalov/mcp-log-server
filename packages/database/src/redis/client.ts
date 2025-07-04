import Redis from 'redis';
import crypto from 'crypto';
import type {
  RedisConfig,
  CachedUserSession,
  CachedUserPreferences,
  CachedApiToken,
  CachedLogSource,
  CachedLogSourceHealth,
  LiveLogEntry,
  LogStreamMessage,
  AlertData,
  StatusUpdate,
  HeartbeatData,
  RateLimitInfo,
  RateLimitOptions,
  SystemHealthStatus,
  DatabaseStats,
  JobStatus,
  QueueJob,
  CachedQueryResult,
  PubSubMessage,
  LogStreamSubscription,
  RedisValue,
  SubscriptionCallback,
} from './types.js';

import {
  CACHE_KEYS,
  CHANNEL_PATTERNS,
  DEFAULT_TTL,
} from './types.js';

export class RedisClient {
  private client: Redis.RedisClientType;
  private subscriber: Redis.RedisClientType;
  private isConnected: boolean = false;
  private config: RedisConfig;
  private subscriptions: Map<string, SubscriptionCallback> = new Map();

  constructor(config: RedisConfig) {
    this.config = config;
    
    const redisOptions = {
      socket: {
        host: config.host,
        port: config.port,
      },
      password: config.password,
      database: config.database || 0,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      enableOfflineQueue: config.enableOfflineQueue !== false,
      lazyConnect: config.lazyConnect !== false,
      keyPrefix: config.keyPrefix || 'mcp:',
    };

    this.client = Redis.createClient(redisOptions);
    this.subscriber = Redis.createClient(redisOptions);

    // Error handling
    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.subscriber.on('error', (err) => {
      console.error('Redis Subscriber Error:', err);
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect()
      ]);
      this.isConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.disconnect(),
      this.subscriber.disconnect()
    ]);
    this.isConnected = false;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }

  // Generic Cache Operations
  async get<T = RedisValue>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (value === null) return null;
      
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch {
      return null;
    }
  }

  async set<T = RedisValue>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl) {
        await this.client.setEx(key, ttl, stringValue);
      } else {
        await this.client.set(key, stringValue);
      }
      return true;
    } catch {
      return false;
    }
  }

  async del(key: string | string[]): Promise<number> {
    try {
      if (Array.isArray(key)) {
        return await this.client.del(key);
      } else {
        return await this.client.del(key);
      }
    } catch {
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch {
      return false;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      return Boolean(result);
    } catch {
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch {
      return -1;
    }
  }

  // User Session Management
  async cacheUserSession(session: CachedUserSession): Promise<boolean> {
    const key = CACHE_KEYS.userSession(session.user_id);
    return await this.set(key, session, DEFAULT_TTL.session);
  }

  async getUserSession(userId: string): Promise<CachedUserSession | null> {
    const key = CACHE_KEYS.userSession(userId);
    return await this.get<CachedUserSession>(key);
  }

  async invalidateUserSession(userId: string): Promise<boolean> {
    const key = CACHE_KEYS.userSession(userId);
    const result = await this.del(key);
    return result > 0;
  }

  // User Preferences
  async cacheUserPreferences(preferences: CachedUserPreferences): Promise<boolean> {
    const key = CACHE_KEYS.userPreferences(preferences.user_id);
    return await this.set(key, preferences, DEFAULT_TTL.preferences);
  }

  async getUserPreferences(userId: string): Promise<CachedUserPreferences | null> {
    const key = CACHE_KEYS.userPreferences(userId);
    return await this.get<CachedUserPreferences>(key);
  }

  // API Token Management
  async cacheApiToken(token: CachedApiToken): Promise<boolean> {
    const key = CACHE_KEYS.apiToken(this.hashToken(token.token_id));
    return await this.set(key, token, DEFAULT_TTL.apiToken);
  }

  async getApiToken(tokenHash: string): Promise<CachedApiToken | null> {
    const key = CACHE_KEYS.apiToken(tokenHash);
    return await this.get<CachedApiToken>(key);
  }

  async invalidateApiToken(tokenHash: string): Promise<boolean> {
    const key = CACHE_KEYS.apiToken(tokenHash);
    const result = await this.del(key);
    return result > 0;
  }

  // Log Source Management
  async cacheLogSource(source: CachedLogSource): Promise<boolean> {
    const key = CACHE_KEYS.logSource(source.id);
    return await this.set(key, source, DEFAULT_TTL.logSource);
  }

  async getLogSource(sourceId: string): Promise<CachedLogSource | null> {
    const key = CACHE_KEYS.logSource(sourceId);
    return await this.get<CachedLogSource>(key);
  }

  async cacheLogSourceHealth(health: CachedLogSourceHealth): Promise<boolean> {
    const key = CACHE_KEYS.logSourceHealth(health.source_id);
    return await this.set(key, health, DEFAULT_TTL.logSource);
  }

  async getLogSourceHealth(sourceId: string): Promise<CachedLogSourceHealth | null> {
    const key = CACHE_KEYS.logSourceHealth(sourceId);
    return await this.get<CachedLogSourceHealth>(key);
  }

  // Query Result Caching
  async cacheQueryResult(queryHash: string, result: any, ttl?: number): Promise<boolean> {
    const key = CACHE_KEYS.logQuery(queryHash);
    const cachedResult: CachedQueryResult = {
      query_hash: queryHash,
      query_params: {},
      result,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (ttl || DEFAULT_TTL.queryResult) * 1000).toISOString(),
      cache_hit_count: 0,
    };
    return await this.set(key, cachedResult, ttl || DEFAULT_TTL.queryResult);
  }

  async getQueryResult(queryHash: string): Promise<any | null> {
    const key = CACHE_KEYS.logQuery(queryHash);
    const cached = await this.get<CachedQueryResult>(key);
    
    if (cached) {
      // Increment hit count
      cached.cache_hit_count++;
      await this.set(key, cached, await this.ttl(key));
      return cached.result;
    }
    
    return null;
  }

  // Rate Limiting
  async checkRateLimit(identifier: string, options: RateLimitOptions): Promise<RateLimitInfo> {
    const key = CACHE_KEYS.rateLimitApi(identifier);
    const windowStart = Math.floor(Date.now() / options.windowMs) * options.windowMs;
    const windowKey = `${key}:${windowStart}`;

    try {
      const current = await this.client.incr(windowKey);
      
      if (current === 1) {
        await this.client.expire(windowKey, Math.ceil(options.windowMs / 1000));
      }

      return {
        limit: options.maxRequests,
        current,
        reset_time: windowStart + options.windowMs,
        blocked: current > options.maxRequests,
      };
    } catch {
      return {
        limit: options.maxRequests,
        current: 0,
        reset_time: windowStart + options.windowMs,
        blocked: false,
      };
    }
  }

  // Real-time Log Streaming
  async publishLogEntry(sourceId: string, logEntry: LiveLogEntry): Promise<boolean> {
    try {
      const message: LogStreamMessage = {
        type: 'log',
        source_id: sourceId,
        timestamp: new Date().toISOString(),
        data: logEntry,
      };

      const channel = `logs:stream:${sourceId}`;
      await this.client.publish(channel, JSON.stringify(message));
      
      // Also add to recent logs list
      const recentLogsKey = CACHE_KEYS.recentLogs(sourceId);
      await this.client.lPush(recentLogsKey, JSON.stringify(logEntry));
      await this.client.lTrim(recentLogsKey, 0, 99); // Keep last 100 logs
      await this.client.expire(recentLogsKey, 60 * 60); // 1 hour TTL

      return true;
    } catch {
      return false;
    }
  }

  async publishAlert(alert: AlertData): Promise<boolean> {
    try {
      const message: LogStreamMessage = {
        type: 'error',
        source_id: alert.source_id,
        timestamp: new Date().toISOString(),
        data: alert,
      };

      await this.client.publish('alerts:all', JSON.stringify(message));
      await this.client.publish(`alerts:${alert.source_id}`, JSON.stringify(message));
      
      // Add to alerts queue
      const alertsKey = CACHE_KEYS.alertsQueue();
      await this.client.lPush(alertsKey, JSON.stringify(alert));
      await this.client.lTrim(alertsKey, 0, 999); // Keep last 1000 alerts

      return true;
    } catch {
      return false;
    }
  }

  async publishStatusUpdate(update: StatusUpdate): Promise<boolean> {
    try {
      const message: LogStreamMessage = {
        type: 'status',
        source_id: update.source_id,
        timestamp: new Date().toISOString(),
        data: update,
      };

      await this.client.publish(`system:status:${update.source_id}`, JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  async publishHeartbeat(heartbeat: HeartbeatData): Promise<boolean> {
    try {
      const message: LogStreamMessage = {
        type: 'heartbeat',
        source_id: heartbeat.source_id,
        timestamp: new Date().toISOString(),
        data: heartbeat,
      };

      await this.client.publish(`system:heartbeat:${heartbeat.source_id}`, JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  // Pub/Sub Management
  async subscribe(pattern: string, callback: SubscriptionCallback): Promise<void> {
    this.subscriptions.set(pattern, callback);
    
    await this.subscriber.pSubscribe(pattern, (message, channel) => {
      const pubSubMessage: PubSubMessage = {
        channel,
        pattern,
        message,
        timestamp: new Date().toISOString(),
      };
      callback(pubSubMessage);
    });
  }

  async unsubscribe(pattern: string): Promise<void> {
    this.subscriptions.delete(pattern);
    await this.subscriber.pUnsubscribe(pattern);
  }

  async getRecentLogs(sourceId: string, limit: number = 50): Promise<LiveLogEntry[]> {
    try {
      const key = CACHE_KEYS.recentLogs(sourceId);
      const logs = await this.client.lRange(key, 0, limit - 1);
      return logs.map(log => JSON.parse(log));
    } catch {
      return [];
    }
  }

  // Background Job Management
  async setJobStatus(jobStatus: JobStatus): Promise<boolean> {
    const key = CACHE_KEYS.jobStatus(jobStatus.job_id);
    return await this.set(key, jobStatus, DEFAULT_TTL.jobStatus);
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const key = CACHE_KEYS.jobStatus(jobId);
    return await this.get<JobStatus>(key);
  }

  async enqueueJob(queueName: string, job: QueueJob): Promise<boolean> {
    try {
      const key = CACHE_KEYS.jobQueue(queueName);
      await this.client.lPush(key, JSON.stringify(job));
      return true;
    } catch {
      return false;
    }
  }

  async dequeueJob(queueName: string): Promise<QueueJob | null> {
    try {
      const key = CACHE_KEYS.jobQueue(queueName);
      const jobData = await this.client.rPop(key);
      return jobData ? JSON.parse(jobData) : null;
    } catch {
      return null;
    }
  }

  // System Health and Stats
  async cacheSystemHealth(health: SystemHealthStatus): Promise<boolean> {
    const key = CACHE_KEYS.systemHealth();
    return await this.set(key, health, DEFAULT_TTL.systemHealth);
  }

  async getSystemHealth(): Promise<SystemHealthStatus | null> {
    const key = CACHE_KEYS.systemHealth();
    return await this.get<SystemHealthStatus>(key);
  }

  async cacheDatabaseStats(stats: DatabaseStats): Promise<boolean> {
    const key = CACHE_KEYS.databaseStats();
    return await this.set(key, stats, DEFAULT_TTL.systemHealth);
  }

  async getDatabaseStats(): Promise<DatabaseStats | null> {
    const key = CACHE_KEYS.databaseStats();
    return await this.get<DatabaseStats>(key);
  }

  // Utility Methods
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  generateQueryHash(query: string, params: Record<string, any>): string {
    const combined = JSON.stringify({ query, params });
    return crypto.createHash('md5').update(combined).digest('hex');
  }

  // Cleanup and Maintenance
  async flushDatabase(): Promise<boolean> {
    try {
      await this.client.flushDb();
      return true;
    } catch {
      return false;
    }
  }

  async getInfo(): Promise<string> {
    try {
      return await this.client.info();
    } catch {
      return '';
    }
  }

  async getMemoryUsage(): Promise<number> {
    try {
      const info = await this.client.info('memory');
      const match = info.match(/used_memory:(\d+)/);
      return match ? parseInt(match[1]) : 0;
    } catch {
      return 0;
    }
  }

  async getKeyCount(): Promise<number> {
    try {
      const info = await this.client.info('keyspace');
      const match = info.match(/keys=(\d+)/);
      return match ? parseInt(match[1]) : 0;
    } catch {
      return 0;
    }
  }

  // Batch Operations
  async mget<T = RedisValue>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mGet(keys);
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      });
    } catch {
      return keys.map(() => null);
    }
  }

  async mset<T = RedisValue>(keyValuePairs: Record<string, T>): Promise<boolean> {
    try {
      const pairs: string[] = [];
      for (const [key, value] of Object.entries(keyValuePairs)) {
        pairs.push(key);
        pairs.push(typeof value === 'string' ? value : JSON.stringify(value));
      }
      await this.client.mSet(pairs);
      return true;
    } catch {
      return false;
    }
  }

  // List Operations
  async lpush(key: string, values: RedisValue[]): Promise<number> {
    try {
      const stringValues = values.map(v => typeof v === 'string' ? v : JSON.stringify(v));
      return await this.client.lPush(key, stringValues);
    } catch {
      return 0;
    }
  }

  async rpop<T = RedisValue>(key: string): Promise<T | null> {
    try {
      const value = await this.client.rPop(key);
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch {
      return null;
    }
  }

  async lrange<T = RedisValue>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      const values = await this.client.lRange(key, start, stop);
      return values.map(value => {
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      });
    } catch {
      return [];
    }
  }
} 