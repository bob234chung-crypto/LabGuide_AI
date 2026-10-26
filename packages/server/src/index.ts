import { createApp } from './app.js';
import { log } from './logger.js';

const { app, store, cfg, backend, problems } = createApp();

if (problems.length) {
  for (const p of problems) console.error(`LabGuide cannot start: ${p}`);
  process.exit(1);
}

if (store) {
  store.purgeExpired(cfg.retentionDays);
  setInterval(() => store.purgeExpired(cfg.retentionDays), 60 * 60 * 1000).unref();
}

const server = app.listen(cfg.port, () => {
  log.info('LabGuide API listening', { port: cfg.port, storage: backend.kind, origins: cfg.allowedOrigins.join(' ') });
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    store?.flush();
    server.close(() => process.exit(0));
  });
}
