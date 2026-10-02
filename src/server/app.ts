import path from 'node:path';
import type http from 'node:http';
import { loadConfig } from './config.js';
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
  const store = new Store(config);
  const sources: SourceAdapter[] = [];

  if (config.sources.claudeCode.enabled) {
    const root = config.sources.claudeCode.path
      ? expandHome(config.sources.claudeCode.path)
      : path.join(claudeHome(), 'projects');
    sources.push(new ClaudeTranscriptSource({ root }));
  }
  // Codex CLI and Gemini CLI adapters plug in here behind SourceAdapter.

  for (const s of sources) await s.start(store);
  const ticker = setInterval(() => store.tick(), 5000);
  ticker.unref();

  const server = createServer(store);
  const addr = await listen(server, opts.host ?? '127.0.0.1', opts.port ?? 4747);
  const host = addr.address.includes(':') ? `[${addr.address}]` : addr.address;
  return {
    store,
    server,
    url: `http://${host}:${addr.port}`,
    async close() {
      clearInterval(ticker);
      for (const s of sources) s.stop();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
