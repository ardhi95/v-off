import os from 'node:os';
import path from 'node:path';

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** v-off's own data directory (config, history). Override with V_OFF_HOME. */
export function vOffHome(): string {
  return expandHome(process.env.V_OFF_HOME ?? '~/.v-off');
}

/** Claude Code's data directory. Honors CLAUDE_CONFIG_DIR like Claude Code does. */
export function claudeHome(): string {
  return expandHome(process.env.CLAUDE_CONFIG_DIR ?? '~/.claude');
}
