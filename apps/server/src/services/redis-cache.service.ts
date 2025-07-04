import { createClient, RedisClientType } from 'redis';

export interface RedisCacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTtl?: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class RedisCacheService {
  private client: RedisClientType;
  private config: RedisCacheConfig;
  private connected = false;
  private hitCount = 0;
  private missCount = 0;

  constructor(config: RedisCacheConfig = {
    host: 'localhost',
    port: 6379,
    keyPrefix: 'mcp-logs:',
    defaultTtl: 300 // 5 minutes
  }) {
    this.config = config;
    this.client = createClient({
      socket: {
        host: config.host,
        port: config.port
      },
      password: config.password,
      database: config.db || 0
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.client.on('connect', () => {
      console.log('🔗 Redis cache connected');
      this.connected = true;
    });

    this.client.on('error', (err) => {
      console.error('❌ Redis cache error:', err);
      this.connected = false;
    });

    this.client.on('end', () => {
      console.log('🔌 Redis cache disconnected');
      this.connected = false;
    });
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  /**
   * Get cached data
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) {
      return null;
    }

    try {
      const fullKey = this.getFullKey(key);
      const cached = await this.client.get(fullKey);
      
      if (!cached) {
        this.missCount++;
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(cached);
      
      // Check if expired
      if (Date.now() > entry.timestamp + (entry.ttl * 1000)) {
        await this.client.del(fullKey);
        this.missCount++;
        return null;
      }

      this.hitCount++;
      return entry.data;
    } catch (error) {
      console.warn('Redis get error:', error);
      this.missCount++;
      return null;
    }
  }

  /**
   * Set cached data
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      const fullKey = this.getFullKey(key);
      const cacheTtl = ttl || this.config.defaultTtl || 300;
      
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: cacheTtl
      };

      await this.client.setEx(fullKey, cacheTtl, JSON.stringify(entry));
    } catch (error) {
      console.warn('Redis set error:', error);
    }
  }

  /**
   * Delete cached data
   */
  async del(key: string): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      const fullKey = this.getFullKey(key);
      await this.client.del(fullKey);
    } catch (error) {
      console.warn('Redis del error:', error);
    }
  }

  /**
   * Clear all cache with prefix
   */
  async clear(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      const pattern = this.getFullKey('*');
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.warn('Redis clear error:', error);
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.connected || keys.length === 0) {
      return keys.map(() => null);
    }

    try {
      const fullKeys = keys.map(key => this.getFullKey(key));
      const values = await this.client.mGet(fullKeys);
      
      return values.map((value, index) => {
        if (!value) {
          this.missCount++;
          return null;
        }

        try {
          const entry: CacheEntry<T> = JSON.parse(value);
          
          // Check if expired
          if (Date.now() > entry.timestamp + (entry.ttl * 1000)) {
            // Delete expired key asynchronously
            this.client.del(fullKeys[index]).catch(console.warn);
            this.missCount++;
            return null;
          }

          this.hitCount++;
          return entry.data;
        } catch {
          this.missCount++;
          return null;
        }
      });
    } catch (error) {
      console.warn('Redis mget error:', error);
      return keys.map(() => {
        this.missCount++;
        return null;
      });
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset<T>(entries: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    if (!this.connected || entries.length === 0) {
      return;
    }

    try {
      const pipeline = this.client.multi();
      
      entries.forEach(({ key, data, ttl }) => {
        const fullKey = this.getFullKey(key);
        const cacheTtl = ttl || this.config.defaultTtl || 300;
        
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          ttl: cacheTtl
        };

        pipeline.setEx(fullKey, cacheTtl, JSON.stringify(entry));
      });

      await pipeline.exec();
    } catch (error) {
      console.warn('Redis mset error:', error);
    }
  }

  /**
   * Increment a counter
   */
  async incr(key: string, amount: number = 1): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const fullKey = this.getFullKey(key);
      return await this.client.incrBy(fullKey, amount);
    } catch (error) {
      console.warn('Redis incr error:', error);
      return 0;
    }
  }

  /**
   * Set expiration for a key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      const fullKey = this.getFullKey(key);
      return await this.client.expire(fullKey, ttl);
    } catch (error) {
      console.warn('Redis expire error:', error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      const fullKey = this.getFullKey(key);
      return (await this.client.exists(fullKey)) > 0;
    } catch (error) {
      console.warn('Redis exists error:', error);
      return false;
    }
  }

  /**
   * Add to a set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const fullKey = this.getFullKey(key);
      return await this.client.sAdd(fullKey, members);
    } catch (error) {
      console.warn('Redis sadd error:', error);
      return 0;
    }
  }

  /**
   * Get all members of a set
   */
  async smembers(key: string): Promise<string[]> {
    if (!this.connected) {
      return [];
    }

    try {
      const fullKey = this.getFullKey(key);
      return await this.client.sMembers(fullKey);
    } catch (error) {
      console.warn('Redis smembers error:', error);
      return [];
    }
  }

  /**
   * Remove from a set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const fullKey = this.getFullKey(key);
      return await this.client.sRem(fullKey, members);
    } catch (error) {
      console.warn('Redis srem error:', error);
      return 0;
    }
  }

  /**
   * Push to a list
   */
  async lpush(key: string, ...elements: string[]): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const fullKey = this.getFullKey(key);
      return await this.client.lPush(fullKey, elements);
    } catch (error) {
      console.warn('Redis lpush error:', error);
      return 0;
    }
  }

  /**
   * Get list range
   */
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.connected) {
      return [];
    }

    try {
      const fullKey = this.getFullKey(key);
      return await this.client.lRange(fullKey, start, stop);
    } catch (error) {
      console.warn('Redis lrange error:', error);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    connected: boolean;
    hitCount: number;
    missCount: number;
    hitRatio: number;
    totalRequests: number;
  } {
    const totalRequests = this.hitCount + this.missCount;
    const hitRatio = totalRequests > 0 ? this.hitCount / totalRequests : 0;

    return {
      connected: this.connected,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRatio: Math.round(hitRatio * 10000) / 100, // Percentage with 2 decimal places
      totalRequests
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get cache info from Redis
   */
  async getCacheInfo(): Promise<any> {
    if (!this.connected) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      return {
        memory: info,
        keyspace: await this.client.info('keyspace')
      };
    } catch (error) {
      console.warn('Redis info error:', error);
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.warn('Redis health check error:', error);
      return false;
    }
  }

  /**
   * Get full key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.config.keyPrefix || ''}${key}`;
  }
} 