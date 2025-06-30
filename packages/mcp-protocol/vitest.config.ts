import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
    ],
  },
  resolve: {
    alias: {
      '@mcp-log-server/types': resolve(__dirname, '../types/src'),
    }
  }
}); 