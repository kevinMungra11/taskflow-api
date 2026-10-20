import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://taskflow:taskflow@localhost:5432/taskflow_test',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    },
  },
});
