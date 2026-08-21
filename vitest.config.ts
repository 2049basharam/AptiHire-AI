import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**',
      '**/.next/**',
    ],
    // Run tests sequentially to prevent shared database state conflicts
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
