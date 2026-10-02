import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type http from 'node:http';
import { scan, scanTargets, tmpTargets } from './cleaner.js';
import { loadConfig } from './config.js';
import { loadHistory, saveHistory } from './history.js';
import { createServer, listen } from './http.js';
import { claudeHome, expandHome } from './paths.js';
import { ClaudeTranscriptSource } from './sources/claudeTranscriptSource.js';
import type { SourceAdapter } from './sources/types.js';
import { Store } from './store.js';

export interface App {
  store: Store;
  server: http.Server;
  url: string;
  close(): Promise<void>;
}

export async function startApp(opts: { host?: string; port?: number } = {}): Promise<App> {
  const config = await loadConfig();
  const store = new Store(config, Date.now, await loadHistory());
  // Persist new blocks (debounced) so the report keeps them after a restart.
  let saveTimer: NodeJS.Timeout | undefined;
  const persist = () => saveHistory({ version: 1, blocks: store.blockHistory() }).catch((err: Error) => console.error('[v-off] riwayat gagal disimpan:', err.message));
  store.on('block-added', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persist(), 2000);
  });
  // Data sources follow config: re-created when Pengaturan changes them.
  let sources: SourceAdapter[] = [];
  let sourcesKey = '';
  const startSources = async () => {
    const cfg = store.getConfig().sources;
    // Only Claude Code has an adapter so far; other toggles must not restart it.
    const key = JSON.stringify(cfg.claudeCode);
    if (key === sourcesKey) return;
    sourcesKey = key;
    for (const s of sources) s.stop();
    sources = [];
    if (cfg.claudeCode.enabled) {
      const root = cfg.claudeCode.path ? expandHome(cfg.claudeCode.path) : path.join(claudeHome(), 'projects');
      sources.push(new ClaudeTranscriptSource({ root }));
    }
    // Codex CLI and Gemini CLI adapters plug in here behind SourceAdapter.
    for (const s of sources) await s.start(store);
  };
  await startSources();

  const ticker = setInterval(() => store.tick(), 5000);
  ticker.unref();

  // Office boy dry-run cache scan: shortly after start, then every intervalMin.
  let scanning = false;
  const runScan = async () => {
    if (scanning) return;
    scanning = true;
    try {
      const cfg = store.getConfig();
      const targets = [...scanTargets(store.sessionDirs(), store.agents(), cfg.cleaner), ...(await tmpTargets())];
      store.setCleaner(await scan(targets));
    } catch (err) {
      console.error('[v-off] cache scan gagal:', (err as Error).message);
    } finally {
      scanning = false;
    }
  };
  const firstScan = setTimeout(() => void runScan(), 3000);
  firstScan.unref();
  let scanEvery = Math.max(1, config.cleaner.intervalMin);
  let scanTimer = setInterval(() => void runScan(), scanEvery * 60_000);
  scanTimer.unref();

  store.on('config-updated', (cfg) => {
    void startSources().catch((err: Error) => console.error('[v-off] sumber data gagal dimulai:', err.message));
    const every = Math.max(1, cfg.cleaner.intervalMin);
    if (every !== scanEvery) {
      scanEvery = every;
      clearInterval(scanTimer);
      scanTimer = setInterval(() => void runScan(), every * 60_000);
      scanTimer.unref();
    }
    void runScan(); // log paths or sessions may have changed
  });

  // dist/server/app.js -> dist/web
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
  const server = createServer(store, { webRoot });
  const addr = await listen(server, opts.host ?? '127.0.0.1', opts.port ?? 4747);
  const host = addr.address.includes(':') ? `[${addr.address}]` : addr.address;
  return {
    store,
    server,
    url: `http://${host}:${addr.port}`,
    async close() {
      clearInterval(ticker);
      clearTimeout(firstScan);
      clearInterval(scanTimer);
      if (saveTimer) {
        clearTimeout(saveTimer);
        await persist();
      }
      for (const s of sources) s.stop();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
