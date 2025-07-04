import { Client, type ClientOptions } from '@elastic/elasticsearch';
import crypto from 'crypto';

import type {
  ElasticsearchConfig,
  ElasticsearchHealth,
  IndexConfig,
  SearchQuery,
  SearchResponse,
  LogSearchFilters,
  LogSearchOptions,
  LogAggregationOptions,
  LogDocument,
  LogSourceDocument,
  ErrorPatternDocument,
  IndexInfo,
} from './types.js';

import {
  LOG_INDEX_PREFIX,
  LOG_SOURCE_INDEX,
  ERROR_PATTERN_INDEX,
  DEFAULT_INDEX_SETTINGS,
  LOG_INDEX_MAPPINGS,
} from './types.js';

import type { LogEntry } from '@mcp-log-server/types';

// Elasticsearch client implementation for search and analytics

export class ElasticsearchClient {
  private client: Client;
  private config: ElasticsearchConfig;
  private indexName: string;
  private isConnected: boolean = false;

  constructor(config: ElasticsearchConfig) {
    this.config = config;
    this.indexName = config.indexName || 'mcp-logs';
    
    const clientOptions: ClientOptions = {
      node: config.node,
      auth: config.auth,
      maxRetries: config.maxRetries || 3,
      requestTimeout: config.requestTimeout || 30000,
    };

    if (config.ssl) {
      clientOptions.tls = {
        rejectUnauthorized: config.ssl.rejectUnauthorized,
      };
    }

    this.client = new Client(clientOptions);
  }

  async connect(): Promise<void> {
    try {
      await this.client.ping();
      this.isConnected = true;
      
      // Initialize indices if they don't exist
      await this.initializeIndices();
      await this.createIndexTemplate();
    } catch (error) {
      throw new Error(`Failed to connect to Elasticsearch: ${(error as Error).message}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      this.isConnected = false;
    } catch (error) {
      console.error('Error disconnecting from Elasticsearch:', error);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.client.ping();
      return response === true;
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }

  // Index Management
  async initializeIndices(): Promise<void> {
    const indices: IndexConfig[] = [
      {
        name: this.getLogIndexPattern(),
        mappings: LOG_INDEX_MAPPINGS,
        settings: {
          ...DEFAULT_INDEX_SETTINGS,
          analysis: {
            analyzer: {
              path_analyzer: {
                type: 'custom',
                tokenizer: 'path_tokenizer',
                filter: ['lowercase'],
              },
            },
            tokenizer: {
              path_tokenizer: {
                type: 'path_hierarchy'
              },
            },
          },
        },
      },
      {
        name: LOG_SOURCE_INDEX,
        mappings: {
          properties: {
            source_id: { type: 'keyword' },
            user_id: { type: 'keyword' },
            name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            type: { type: 'keyword' },
            config: { type: 'object', enabled: false },
            is_active: { type: 'boolean' },
            created_at: { type: 'date' },
            updated_at: { type: 'date' },
            last_seen: { type: 'date' },
            health_status: { type: 'keyword' },
            tags: { type: 'keyword' },
            description: { type: 'text' },
          },
        },
        settings: DEFAULT_INDEX_SETTINGS,
      },
      {
        name: ERROR_PATTERN_INDEX,
        mappings: {
          properties: {
            error_hash: { type: 'keyword' },
            error_type: { type: 'keyword' },
            normalized_message: { type: 'text', analyzer: 'standard' },
            occurrence_count: { type: 'long' },
            first_seen: { type: 'date' },
            last_seen: { type: 'date' },
            source_ids: { type: 'keyword' },
            agent_types: { type: 'keyword' },
            affected_functions: { type: 'keyword' },
            sample_stack_trace: { type: 'text', index: false },
            sample_metadata: { type: 'object', enabled: false },
            is_resolved: { type: 'boolean' },
            resolved_at: { type: 'date' },
            resolution_notes: { type: 'text' },
            severity: { type: 'keyword' },
            category: { type: 'keyword' },
          },
        },
        settings: DEFAULT_INDEX_SETTINGS,
      },
    ];

    for (const indexConfig of indices) {
      await this.createIndexIfNotExists(indexConfig);
    }
  }

  async createIndexIfNotExists(config: IndexConfig): Promise<boolean> {
    try {
      const exists = await this.client.indices.exists({ index: config.name });
      
      if (!exists) {
        await this.client.indices.create({
          index: config.name,
          mappings: config.mappings as any,
          settings: config.settings as any,
          aliases: config.aliases,
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Failed to create index ${config.name}:`, error);
      return false;
    }
  }

  async deleteIndex(indexName: string): Promise<boolean> {
    try {
      await this.client.indices.delete({ index: indexName });
      return true;
    } catch {
      return false;
    }
  }

  async refreshIndex(indexName: string): Promise<boolean> {
    try {
      await this.client.indices.refresh({ index: indexName });
      return true;
    } catch {
      return false;
    }
  }

  // Document Operations
  async indexLogEntry(logEntry: LogEntry): Promise<boolean> {
    try {
      const logDoc: LogDocument = {
        '@timestamp': logEntry.timestamp,
        log_id: logEntry.id,
        source_id: logEntry.source,
        level: logEntry.level,
        message: logEntry.message,
        agent_type: logEntry.agentType,
        agent_version: 'unknown', // Not available in LogEntry
        session_id: logEntry.sessionId || 'unknown',
        file_path: 'unknown', // Not available in LogEntry
        line_number: undefined, // Not available in LogEntry
        function_name: undefined, // Not available in LogEntry
        metadata: logEntry.metadata,
        tags: undefined, // Not available in LogEntry
        duration_ms: undefined, // Not available in LogEntry
        memory_usage_mb: undefined, // Not available in LogEntry
        cpu_usage_percent: undefined, // Not available in LogEntry
        error_code: undefined, // Not available in LogEntry
        error_type: undefined, // Not available in LogEntry
        stack_trace: undefined, // Not available in LogEntry
        user_id: undefined, // Not available in LogEntry
        request_id: undefined, // Not available in LogEntry
        correlation_id: undefined, // Not available in LogEntry
        raw_log: logEntry.raw || logEntry.message,
        ingested_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        
        // Derived fields for search
        message_tokens: this.tokenizeMessage(logEntry.message),
        error_fingerprint: this.generateErrorFingerprint(logEntry),
        log_signature: this.generateLogSignature(logEntry),
        path_hierarchy: this.generatePathHierarchy(),
      };

      const indexName = this.getLogIndexName(new Date(logEntry.timestamp));
      
      await this.client.index({
        index: indexName,
        id: logEntry.id,
        body: logDoc,
      });

      return true;
    } catch (error) {
      console.error('Failed to index log entry:', error);
      return false;
    }
  }

  async bulkIndexLogEntries(logEntries: LogEntry[]): Promise<{ indexed: number; failed: number }> {
    if (logEntries.length === 0) {
      return { indexed: 0, failed: 0 };
    }

    try {
      const body = logEntries.flatMap(logEntry => {
        const logDoc: LogDocument = {
          '@timestamp': logEntry.timestamp,
          log_id: logEntry.id,
          source_id: logEntry.source,
          level: logEntry.level,
          message: logEntry.message,
          agent_type: logEntry.agentType,
          agent_version: 'unknown', // Not available in LogEntry
          session_id: logEntry.sessionId || 'unknown',
          file_path: 'unknown', // Not available in LogEntry
          line_number: undefined, // Not available in LogEntry
          function_name: undefined, // Not available in LogEntry
          metadata: logEntry.metadata,
          tags: undefined, // Not available in LogEntry
          duration_ms: undefined, // Not available in LogEntry
          memory_usage_mb: undefined, // Not available in LogEntry
          cpu_usage_percent: undefined, // Not available in LogEntry
          error_code: undefined, // Not available in LogEntry
          error_type: undefined, // Not available in LogEntry
          stack_trace: undefined, // Not available in LogEntry
          user_id: undefined, // Not available in LogEntry
          request_id: undefined, // Not available in LogEntry
          correlation_id: undefined, // Not available in LogEntry
          raw_log: logEntry.raw || logEntry.message,
          ingested_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
          
          // Derived fields for search
          message_tokens: this.tokenizeMessage(logEntry.message),
          error_fingerprint: this.generateErrorFingerprint(logEntry),
          log_signature: this.generateLogSignature(logEntry),
          path_hierarchy: this.generatePathHierarchy(),
        };

        const indexName = this.getLogIndexName(new Date(logEntry.timestamp));
        
        return [
          { index: { _index: indexName, _id: logEntry.id } },
          logDoc,
        ];
      });

      const response = await this.client.bulk({ body });
      
      let indexed = 0;
      let failed = 0;
      
      if (response.items) {
        for (const item of response.items) {
          if (item.index?.error) {
            failed++;
          } else {
            indexed++;
          }
        }
      }

      return { indexed, failed };
    } catch (error) {
      console.error('Failed to bulk index log entries:', error);
      return { indexed: 0, failed: logEntries.length };
    }
  }

  async indexLogSource(logSource: LogSourceDocument): Promise<boolean> {
    try {
      await this.client.index({
        index: LOG_SOURCE_INDEX,
        id: logSource.source_id,
        body: logSource,
      });
      return true;
    } catch {
      return false;
    }
  }

  async indexErrorPattern(errorPattern: ErrorPatternDocument): Promise<boolean> {
    try {
      await this.client.index({
        index: ERROR_PATTERN_INDEX,
        id: errorPattern.error_hash,
        body: errorPattern,
      });
      return true;
    } catch {
      return false;
    }
  }

  // Search Operations
  async search(searchQuery: SearchQuery): Promise<SearchResponse<LogDocument>> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        body: searchQuery as any,
      });

      return response as SearchResponse<LogDocument>;
    } catch (error) {
      throw new Error(`Elasticsearch search failed: ${(error as Error).message}`);
    }
  }

  async searchLogs(searchQuery: SearchQuery): Promise<SearchResponse<LogDocument>> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        body: searchQuery as any,
      });

      return response as SearchResponse<LogDocument>;
    } catch (error) {
      throw new Error(`Log search failed: ${(error as Error).message}`);
    }
  }

  async getLogById(id: string): Promise<LogDocument | null> {
    try {
      const response = await this.client.get({
        index: this.indexName,
        id,
      });

      return response._source as LogDocument;
    } catch (error) {
      if ((error as any).statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async searchLogSources(query: string): Promise<LogSourceDocument[]> {
    try {
      const response = await this.client.search({
        index: LOG_SOURCE_INDEX,
        body: {
          query: {
            multi_match: {
              query,
              fields: ['name^2', 'description', 'tags'],
              fuzziness: 'AUTO',
            },
          },
          size: 100,
        },
      });

      return response.hits.hits.map((hit: any) => hit._source);
    } catch {
      return [];
    }
  }

  async searchErrorPatterns(query: string): Promise<ErrorPatternDocument[]> {
    try {
      const response = await this.client.search({
        index: ERROR_PATTERN_INDEX,
        body: {
          query: {
            multi_match: {
              query,
              fields: ['error_type^2', 'normalized_message', 'category'],
              fuzziness: 'AUTO',
            },
          },
          size: 100,
          sort: [
            { occurrence_count: { order: 'desc' } },
            { last_seen: { order: 'desc' } },
          ],
        },
      });

      return response.hits.hits.map((hit: any) => hit._source);
    } catch {
      return [];
    }
  }

  // Health and Statistics
  async getHealth(): Promise<ElasticsearchHealth> {
    try {
      const health = await this.client.cluster.health();
      return {
        status: (health.status?.toLowerCase() as 'green' | 'yellow' | 'red') || 'red',
        cluster_name: health.cluster_name || '',
        timed_out: health.timed_out || false,
        number_of_nodes: health.number_of_nodes || 0,
        number_of_data_nodes: health.number_of_data_nodes || 0,
        active_primary_shards: health.active_primary_shards || 0,
        active_shards: health.active_shards || 0,
        relocating_shards: health.relocating_shards || 0,
        initializing_shards: health.initializing_shards || 0,
        unassigned_shards: health.unassigned_shards || 0,
        delayed_unassigned_shards: health.delayed_unassigned_shards || 0,
        number_of_pending_tasks: health.number_of_pending_tasks || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get Elasticsearch health: ${(error as Error).message}`);
    }
  }

  async getIndicesStats(): Promise<any[]> {
    try {
      const stats = await this.client.indices.stats({
        index: this.indexName,
      });

      const indices = Object.entries(stats.indices || {});
      return indices.map(([indexName, indexStats]) => ({
        index: indexName,
        docs_count: indexStats.total?.docs?.count || 0,
        docs_deleted: indexStats.total?.docs?.deleted || 0,
        store_size_bytes: indexStats.total?.store?.size_in_bytes || 0,
        segments_count: indexStats.total?.segments?.count || 0,
        segments_memory_bytes: indexStats.total?.segments?.memory_in_bytes || 0,
      }));
    } catch (error) {
      throw new Error(`Failed to get index stats: ${(error as Error).message}`);
    }
  }

  // Utility Methods
  private getLogIndexName(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${LOG_INDEX_PREFIX}-${year}.${month}.${day}`;
  }

  private getLogIndexPattern(): string {
    return `${LOG_INDEX_PREFIX}-*`;
  }

  private tokenizeMessage(message: string): string[] {
    // Simple tokenization - split on whitespace and punctuation
    return message
      .toLowerCase()
      .split(/[\s\.,;:!?\(\)\[\]{}'"]+/)
      .filter(token => token.length > 2);
  }

  private generateErrorFingerprint(logEntry: LogEntry): string {
    const components = [
      'error', // No error_type available in LogEntry
      'unknown', // No function_name available in LogEntry  
      'unknown', // No file_path available in LogEntry
    ].filter(Boolean);
    
    return components.join('|');
  }

  private generateLogSignature(logEntry: LogEntry): string {
    // Create a signature based on key components
    const components = [
      logEntry.agentType,
      logEntry.level,
      'unknown', // No function_name available in LogEntry
      'unknown', // No file_path available in LogEntry
    ].filter(Boolean);
    
    return components.join('|');
  }

  private generatePathHierarchy(filePath?: string): string[] {
    if (!filePath) return [];
    
    const parts = filePath.split('/').filter(Boolean);
    const hierarchy: string[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      hierarchy.push(parts.slice(0, i + 1).join('/'));
    }
    
    return hierarchy;
  }

  private buildLogSearchQuery(filters: LogSearchFilters) {
    const must: any[] = [];
    const filter: any[] = [];

    // Time range filter
    if (filters.start_time || filters.end_time) {
      const timeRange: any = {};
      if (filters.start_time) timeRange.gte = filters.start_time;
      if (filters.end_time) timeRange.lte = filters.end_time;
      
      filter.push({
        range: {
          '@timestamp': timeRange,
        },
      });
    }

    // Source IDs filter
    if (filters.source_ids?.length) {
      filter.push({
        terms: { source_id: filters.source_ids },
      });
    }

    // Agent types filter
    if (filters.agent_types?.length) {
      filter.push({
        terms: { agent_type: filters.agent_types },
      });
    }

    // Log levels filter
    if (filters.levels?.length) {
      filter.push({
        terms: { level: filters.levels },
      });
    }

    // Text query
    if (filters.query) {
      must.push({
        multi_match: {
          query: filters.query,
          fields: ['message^2', 'error_type', 'function_name'],
          fuzziness: 'AUTO',
        },
      });
    }

    // Error types filter
    if (filters.error_types?.length) {
      filter.push({
        terms: { error_type: filters.error_types },
      });
    }

    // Tags filter
    if (filters.tags?.length) {
      filter.push({
        terms: { tags: filters.tags },
      });
    }

    // Duration range
    if (filters.min_duration !== undefined || filters.max_duration !== undefined) {
      const durationRange: any = {};
      if (filters.min_duration !== undefined) durationRange.gte = filters.min_duration;
      if (filters.max_duration !== undefined) durationRange.lte = filters.max_duration;
      
      filter.push({
        range: { duration_ms: durationRange },
      });
    }

    // Has errors filter
    if (filters.has_errors) {
      filter.push({
        exists: { field: 'error_type' },
      });
    }

    if (must.length === 0 && filter.length === 0) {
      return { match_all: {} };
    }

    return {
      bool: {
        must: must.length > 0 ? must : undefined,
        filter: filter.length > 0 ? filter : undefined,
      },
    };
  }

  private buildSortClauses(sortOptions: Array<{ field: string; direction: 'asc' | 'desc' }>) {
    return sortOptions.map(sort => ({
      [sort.field]: { order: sort.direction },
    }));
  }

  private buildSourceFields(options: LogSearchOptions): string[] | boolean {
    const fields = ['@timestamp', 'log_id', 'source_id', 'level', 'message', 'agent_type', 'file_path'];
    
    if (options.include_metadata) {
      fields.push('metadata', 'tags');
    }
    
    if (options.include_raw_log) {
      fields.push('raw_log');
    }
    
    return fields;
  }

  private buildHighlightConfig() {
    return {
      fields: {
        message: {
          fragment_size: 150,
          number_of_fragments: 3,
        },
        error_type: {},
        function_name: {},
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
    };
  }

  private buildAggregations(options: LogAggregationOptions) {
    const aggs: any = {};

    // Time histogram
    if (options.time_interval) {
      aggs.time_histogram = {
        date_histogram: {
          field: '@timestamp',
          fixed_interval: options.time_interval,
          time_zone: options.time_zone || 'UTC',
          format: options.date_format || 'yyyy-MM-dd HH:mm:ss',
        },
      };
    }

    // Group by aggregations
    if (options.group_by?.length) {
      for (const field of options.group_by) {
        aggs[`by_${field}`] = {
          terms: {
            field,
            size: options.top_terms_size || 10,
          },
        };
      }
    }

    // Metrics
    if (options.metrics?.includes('error_rate')) {
      aggs.error_rate = {
        filter: {
          exists: { field: 'error_type' },
        },
      };
    }

    if (options.metrics?.includes('avg_duration')) {
      aggs.avg_duration = {
        avg: {
          field: 'duration_ms',
        },
      };
    }

    return aggs;
  }

  private async createIndexTemplate(): Promise<void> {
    try {
      const mappings = {
        properties: {
          '@timestamp': { type: 'date' },
          log_id: { type: 'keyword' },
          source_id: { type: 'keyword' },
          level: { type: 'keyword' },
          message: { type: 'text' },
          agent_type: { type: 'keyword' },
          agent_version: { type: 'keyword' },
          session_id: { type: 'keyword' },
          file_path: { type: 'keyword' },
          line_number: { type: 'integer' },
          function_name: { type: 'keyword' },
          metadata: { type: 'object', enabled: false },
          tags: { type: 'keyword' },
          duration_ms: { type: 'float' },
          memory_usage_mb: { type: 'float' },
          error_code: { type: 'keyword' },
          error_type: { type: 'keyword' },
          stack_trace: { type: 'text' },
          raw_log: { type: 'text' },
        },
      };

      const settings = {
        number_of_shards: 1,
        number_of_replicas: 0,
        refresh_interval: '1s',
      };

      await this.client.indices.create({
        index: this.indexName,
        mappings: mappings as any,
        settings: settings as any,
      });
    } catch (error) {
      if ((error as any).meta?.statusCode !== 400) {
        throw error;
      }
      // Index already exists, ignore error
    }
  }
} 