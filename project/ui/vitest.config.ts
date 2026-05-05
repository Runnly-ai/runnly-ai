import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.tsx'],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'dist/',
        '**/*.d.ts',
        '**/types/',
      ],
    },
    include: ['**/*.test.tsx', '**/*.spec.tsx'],
    exclude: ['node_modules/', '.next/', 'dist/'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
