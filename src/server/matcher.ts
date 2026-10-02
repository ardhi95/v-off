import type { Agent, MatchRule } from '../shared/types.js';
import { expandHome } from './paths.js';
import type { SessionContext } from './sources/types.js';

/** Convert a glob (`*`, `**`, `?`) to an anchored RegExp. `**` crosses `/`, `*` does not. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        // "/**" also matches the directory itself.
        if (re.endsWith('/') && (i + 1 === glob.length || glob[i + 1] === '/')) {
          re = re.slice(0, -1) + '(?:/.*)?';
          if (glob[i + 1] === '/') i++;
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function ruleMatches(rule: MatchRule, ctx: SessionContext): boolean {
  if ('cwdGlob' in rule) {
    return !!ctx.cwd && globToRegExp(expandHome(rule.cwdGlob)).test(ctx.cwd.replace(/\/+$/, ''));
  }
  if ('gitBranch' in rule) {
    return !!ctx.gitBranch && globToRegExp(rule.gitBranch).test(ctx.gitBranch);
  }
  if ('env' in rule) {
    const eq = rule.env.indexOf('=');
    if (eq < 1 || !ctx.env) return false;
    return ctx.env[rule.env.slice(0, eq)] === rule.env.slice(eq + 1);
  }
  if ('sessionName' in rule) {
    return !!ctx.sessionName && ctx.sessionName === rule.sessionName;
  }
  return false;
}

/** SPEC §7: agents are checked in order, each agent's rules in order. First match wins. */
export function matchAgent(agents: Agent[], ctx: SessionContext): Agent | undefined {
  return agents.find((a) => !a.walker && a.match.some((r) => ruleMatches(r, ctx)));
}
