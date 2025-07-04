import { vi, beforeEach } from 'vitest';

declare global {
  // eslint-disable-next-line no-var
  var testHelpers: any;
}

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
});

// Mock environment variables for testing
vi.mock('process', () => ({
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/mcp_log_server_test',
    REDIS_URL: 'redis://localhost:6379',
    CLICKHOUSE_URL: 'http://localhost:8123',
    ELASTICSEARCH_URL: 'http://localhost:9200',
    JWT_SECRET: 'test-jwt-secret'
  }
}));

// Global test utilities
globalThis.testHelpers = {
  createMockMCPMessage: () => ({
    id: 'test-id',
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Test message',
    source: 'test-agent'
  })
}; 