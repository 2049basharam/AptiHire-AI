import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

// Load .env into process.env for Vitest worker processes
const loadedEnv: Record<string, string> = {};
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  for (const line of envConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        const value = trimmed.substring(idx + 1).trim().replace(/[\r\n]/g, '').replace(/^["']|["']$/g, '');
        process.env[key] = value;
        loadedEnv[key] = value;
      }
    }
  }
}

export default defineConfig({
  test: {
    env: loadedEnv,
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
