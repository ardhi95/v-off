#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp } from './app.js';
import { HOOK_EVENTS, runSetup } from './setup.js';

// v-off CLI:
//   v-off [start] [--port N] [--no-open]   start the server and open the browser
//   v-off setup [--remove] [--dry-run] [--port N]   install/remove Claude Code hooks

const HELP = `v-off — kantor virtual 3D untuk AI coding agent

Pemakaian:
  npx v-off                  Jalankan server lokal dan buka Ruang Tim di browser
  npx v-off setup            Pasang hooks Claude Code (~/.claude/settings.json)
  npx v-off setup --remove   Copot hooks v-off (hook lain tidak disentuh)

Opsi:
  --port <n>     Port server (default 4747, atau V_OFF_PORT)
  --no-open      Jangan buka browser otomatis
  --dry-run      (setup) Tampilkan hasil tanpa menulis file
  -h, --help     Bantuan ini
  -v, --version  Versi

Variabel: V_OFF_PORT, V_OFF_HOST (default 127.0.0.1), V_OFF_HOME (default ~/.v-off),
CLAUDE_CONFIG_DIR (default ~/.claude), V_OFF_AGENT (tetapkan sesi ke agent tertentu).`;

export interface CliArgs {
  command: 'start' | 'setup' | 'help' | 'version';
  port: number;
  open: boolean;
  remove: boolean;
  dryRun: boolean;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliArgs | string {
  const out: CliArgs = {
    command: 'start',
    port: Number(env.V_OFF_PORT) || 4747,
    open: !env.V_OFF_NO_OPEN,
    remove: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === 'start' || a === 'setup') out.command = a;
    else if (a === '-h' || a === '--help' || a === 'help') out.command = 'help';
    else if (a === '-v' || a === '--version') out.command = 'version';
    else if (a === '--no-open') out.open = false;
    else if (a === '--remove') out.remove = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--port' || a.startsWith('--port=')) {
      const v = a.includes('=') ? a.split('=')[1] : argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return `Port tidak valid: ${v ?? ''}`;
      out.port = n;
    } else return `Argumen tidak dikenal: ${a}. Lihat: v-off --help`;
  }
  return out;
}

function version(): string {
  try {
    const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
    return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

/** Open the URL in the default browser. The URL is ours (no user input), passed as an argument, never through a shell string. */
function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['explorer.exe', [url]] :
    ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args as string[], { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`Buka di browser: ${url}`));
    child.unref();
  } catch {
    console.log(`Buka di browser: ${url}`);
  }
}

/** Is a v-off server already answering on this port? */
async function alreadyRunning(host: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/api/state`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { agents?: unknown };
    return res.ok && Array.isArray(body.agents);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === 'string') {
    console.error(args);
    process.exit(1);
  }
  if (args.command === 'help') return console.log(HELP);
  if (args.command === 'version') return console.log(version());

  if (args.command === 'setup') {
    try {
      const r = await runSetup({ remove: args.remove, dryRun: args.dryRun, port: args.port });
      if (args.dryRun) {
        console.log(`(dry-run) ${r.settingsFile} akan menjadi:\n${JSON.stringify(r.settings, null, 2)}`);
        return;
      }
      if (args.remove) {
        console.log(r.removed ? `Hooks v-off dicopot dari ${r.settingsFile} (${r.removed} entri).` : `Tidak ada hooks v-off di ${r.settingsFile}.`);
      } else {
        console.log(`Hooks v-off terpasang di ${r.settingsFile} untuk ${HOOK_EVENTS.length} event.`);
        console.log(`Skrip hook: ${r.scriptFile} (port ${args.port}).`);
        console.log('Sesi Claude Code yang baru dimulai akan muncul di Ruang Tim. Jalankan: npx v-off');
      }
      if (r.backupFile) console.log(`Cadangan settings lama: ${r.backupFile}`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
    return;
  }

  const host = process.env.V_OFF_HOST ?? '127.0.0.1';
  try {
    const app = await startApp({ host, port: args.port });
    console.log(`v-off berjalan di ${app.url}  (Ctrl+C untuk berhenti)`);
    if (args.open) openBrowser(app.url);
    const shutdown = () => void app.close().then(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === 'EADDRINUSE') {
      if (await alreadyRunning(host, args.port)) {
        const url = `http://${host}:${args.port}`;
        console.log(`v-off sudah berjalan di ${url}`);
        if (args.open) openBrowser(url);
        return;
      }
      console.error(`Port ${args.port} sudah dipakai program lain. Pakai --port atau V_OFF_PORT.`);
    } else {
      console.error(e.message);
    }
    process.exit(1);
  }
}

// Run only when executed directly (tests import parseArgs).
function invokedDirectly(): boolean {
  if (!process.argv[1]) return false;
  try {
    // npx and global installs run through a symlink or shim.
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (invokedDirectly()) void main();
