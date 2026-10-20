import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/pool.js';

const server = createApp().listen(config.PORT, () => {
  console.log(`taskflow-api listening on port ${config.PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
