#!/usr/bin/env node
import { startApp } from './app.js';

// `v-off` starts the local server. `v-off setup` (Claude Code hooks) and opening
// the browser arrive in later phases (see CLAUDE.md).

const port = Number(process.env.V_OFF_PORT ?? 4747);
const host = process.env.V_OFF_HOST ?? '127.0.0.1';

const cmd = process.argv[2];
if (cmd && cmd !== 'start') {
  console.error(`Perintah tidak dikenal: ${cmd}. Pakai: v-off [start]`);
  process.exit(1);
}

startApp({ host, port })
  .then((app) => {
    console.log(`v-off berjalan di ${app.url}`);
    const shutdown = () => {
      void app.close().then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })
  .catch((err: Error & { code?: string }) => {
    if (err.code === 'EADDRINUSE') console.error(`Port ${port} sudah dipakai. Set V_OFF_PORT ke port lain.`);
    else console.error(err.message);
    process.exit(1);
  });
