import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'playwright-tests/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false
      }
    }
  },
  resolve: {
    alias: {
      '@mcp-log-server/types': resolve(__dirname, './packages/types/src'),
      '@mcp-log-server/mcp-protocol': resolve(__dirname, './packages/mcp-protocol/src'),
      '@mcp-log-server/database': resolve(__dirname, './packages/database/src'),
      '@mcp-log-server/ui': resolve(__dirname, './packages/ui/src')
    }
  }
}); 