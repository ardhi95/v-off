import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Config, Status } from '../shared/types.js';
import { saveConfig, validateConfig, withDefaults } from './config.js';
import { parseHookPayload } from './sources/claudeHook.js';
import type { Period, Store } from './store.js';

const MAX_BODY = 1024 * 1024;
const STATUSES: Status[] = ['kerja', 'macet', 'bicara', 'simak', 'idle', 'bersih'];
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export interface ServerOptions {
  host?: string;
  port?: number;
  /** Persist config on PUT /api/config. Tests pass a temp file. */
  saveConfig?: (c: Config) => Promise<void>;
  /** Built web UI (dist/web). Served for non-API GET requests when present. */
  webRoot?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

/** Serve a file from webRoot; unknown paths fall back to index.html. Returns false if no UI is built. */
async function serveStatic(webRoot: string, pathname: string, res: http.ServerResponse): Promise<boolean> {
  const root = path.resolve(webRoot);
  let file = path.resolve(root, '.' + decodeURIComponent(pathname));
  // Never serve outside webRoot.
  if (file !== root && !file.startsWith(root + path.sep)) file = path.join(root, 'index.html');
  let data: Buffer;
  try {
    const st = await fs.stat(file);
    if (st.isDirectory()) file = path.join(file, 'index.html');
    data = await fs.readFile(file);
  } catch {
    try {
      file = path.join(root, 'index.html');
      data = await fs.readFile(file);
    } catch {
      return false;
    }
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
  return true;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(json);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Body terlalu besar.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body bukan JSON yang valid.');
  }
}

function hostName(header: string | undefined): string {
  if (!header) return '';
  return header.startsWith('[') ? header.slice(0, header.indexOf(']') + 1) : header.split(':')[0]!;
}

/**
 * Local-only guard. Rejects DNS-rebinding (foreign Host header) and cross-site
 * requests from web pages (foreign Origin), so only local tools and the v-off UI
 * can reach the API.
 */
function checkLocal(req: http.IncomingMessage): void {
  if (!LOCAL_HOSTS.has(hostName(req.headers.host))) throw new HttpError(403, 'Host tidak diizinkan.');
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try {
      ok = LOCAL_HOSTS.has(hostName(new URL(origin).host));
    } catch {
      ok = false;
    }
    if (!ok) throw new HttpError(403, 'Origin tidak diizinkan.');
  }
}

/** V_OFF_* variables a hook forwards, from the `x-v-off-env` header (`K=V; K2=V2`) or `?agent=`. */
function hookEnv(req: http.IncomingMessage, url: URL): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  const header = req.headers['x-v-off-env'];
  if (typeof header === 'string') {
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) {
        const k = part.slice(0, eq).trim();
        if (k.startsWith('V_OFF_')) env[k] = part.slice(eq + 1).trim();
      }
    }
  }
  const agent = url.searchParams.get('agent');
  if (agent) env.V_OFF_AGENT = agent;
  return Object.keys(env).length ? env : undefined;
}

export function createServer(store: Store, opts: ServerOptions = {}): http.Server {
  const clients = new Set<http.ServerResponse>();
  const broadcast = (event: string, data: unknown) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };
  const onAgent = (a: unknown) => broadcast('agent-updated', a);
  const onEvent = (e: unknown) => broadcast('event-added', e);
  const onCleaner = (c: unknown) => broadcast('cleaner-updated', c);
  store.on('agent-updated', onAgent);
  store.on('event-added', onEvent);
  store.on('cleaner-updated', onCleaner);
  const heartbeat = setInterval(() => {
    for (const c of clients) c.write(': ping\n\n');
  }, 15_000);
  heartbeat.unref();

  const server = http.createServer(async (req, res) => {
    try {
      checkLocal(req);
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const method = req.method ?? 'GET';
      const route = `${method} ${url.pathname}`;

      if (route === 'GET /api/state') return send(res, 200, store.snapshot());

      if (route === 'GET /api/stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        res.write('retry: 2000\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      if (route === 'POST /api/hook') {
        if (!store.getConfig().sources.claudeCode.enabled) return send(res, 202, { ok: true, ignored: true });
        const events = parseHookPayload(await readJson(req), Date.now(), hookEnv(req, url));
        if (events.length) store.ingest(events);
        return send(res, 200, { ok: true });
      }

      if (route === 'POST /api/status') {
        if (!store.getConfig().sources.webhook.enabled) throw new HttpError(403, 'Webhook dinonaktifkan di Pengaturan.');
        const body = (await readJson(req)) as Record<string, unknown>;
        const status = body.status as Status;
        if (typeof body.agentId !== 'string' || !STATUSES.includes(status)) {
          throw new HttpError(400, 'Wajib: agentId (string) dan status (kerja|macet|bicara|simak|idle|bersih).');
        }
        const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
        if (!store.setExternalStatus(body.agentId, status, str(body.task), str(body.detail))) {
          throw new HttpError(404, 'Agent tidak ditemukan.');
        }
        return send(res, 200, { ok: true });
      }

      const agentAction = /^\/api\/agents\/([^/]+)\/(resolve|idle|log)$/.exec(url.pathname);
      if (agentAction) {
        const id = decodeURIComponent(agentAction[1]!);
        const action = agentAction[2];
        if (method === 'GET' && action === 'log') {
          if (!store.agentById(id)) throw new HttpError(404, 'Agent tidak ditemukan.');
          return send(res, 200, store.agentLog(id));
        }
        if (method === 'POST' && action === 'resolve') {
          if (!store.resolve(id)) throw new HttpError(404, 'Agent tidak ditemukan.');
          return send(res, 200, { ok: true });
        }
        if (method === 'POST' && action === 'idle') {
          const body = (await readJson(req)) as { idle?: unknown };
          if (typeof body.idle !== 'boolean') throw new HttpError(400, 'Wajib: idle (boolean).');
          if (!store.setIdle(id, body.idle)) throw new HttpError(404, 'Agent tidak ditemukan.');
          return send(res, 200, { ok: true });
        }
      }

      if (route === 'GET /api/report') {
        const period = (url.searchParams.get('period') ?? 'day') as Period;
        if (!['day', 'week', 'month'].includes(period)) throw new HttpError(400, 'period harus day, week, atau month.');
        return send(res, 200, store.report(period));
      }

      if (route === 'GET /api/config') return send(res, 200, store.getConfig());

      if (route === 'PUT /api/config') {
        const body = await readJson(req);
        const err = validateConfig(body);
        if (err) throw new HttpError(400, err);
        const config = withDefaults(body as Partial<Config>);
        await (opts.saveConfig ?? saveConfig)(config);
        store.setConfig(config);
        return send(res, 200, config);
      }

      if (route === 'POST /api/cleaner/clean') {
        // SPEC §8: v1 is dry-run only; real deletion arrives with the cleaner phase.
        throw new HttpError(501, 'Pembersihan nyata belum tersedia. Office boy masih mode dry-run.');
      }

      if (method === 'GET' && !url.pathname.startsWith('/api/')) {
        if (opts.webRoot && (await serveStatic(opts.webRoot, url.pathname, res))) return;
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('v-off berjalan, tetapi UI belum di-build. Jalankan: npm run build\n');
        return;
      }

      throw new HttpError(404, 'Tidak ditemukan.');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[v-off]', err);
      if (!res.headersSent) send(res, status, { error: err instanceof HttpError ? err.message : 'Galat server.' });
      else res.end();
    }
  });

  server.on('close', () => {
    clearInterval(heartbeat);
    store.off('agent-updated', onAgent);
    store.off('event-added', onEvent);
    store.off('cleaner-updated', onCleaner);
    for (const c of clients) c.end();
    clients.clear();
  });
  return server;
}

export async function listen(server: http.Server, host = '127.0.0.1', port = 4747): Promise<AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server.address() as AddressInfo;
}
