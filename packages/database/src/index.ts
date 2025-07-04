// Database clients and types
export * from './postgres/index.js';
export * from './redis/index.js';

// Export ClickHouse with specific naming to avoid conflicts
export {
  ClickHouseLogClient,
  type ClickHouseConfig,
  type LogEntryRow,
  type LogQueryOptions,
  type AggregationOptions,
  type SortOrder as ClickHouseSortOrder,
} from './clickhouse/index.js';

// Export Elasticsearch with specific naming to avoid conflicts  
export {
  ElasticsearchClient,
  type ElasticsearchConfig,
  type LogDocument,
  type SearchQuery,
  type SearchResponse,
  type SortOrder as ElasticsearchSortOrder,
} from './elasticsearch/index.js';

// Re-export commonly used types for convenience
export type { 
  DatabaseConfig,
  DatabaseConnection,
  DatabaseHealth,
  QueryResult,
  TransactionOptions,
} from './types.js'; 