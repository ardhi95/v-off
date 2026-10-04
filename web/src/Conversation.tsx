import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, SessionOverview } from '../../src/shared/types.js';
import { api } from './actions.js';
import { STATUS_STYLE } from './office/layout.js';
import { formatTime, liveChat, logKind, presenceText, sessionColor, sessionTabLabels } from './present.js';

interface Props {
  agentId: string;
  agentName: string;
  sessions: SessionOverview[];
  /** Live feed (all agents); this agent's entries stream into the chat as they arrive. */
  events: AgentEvent[];
}

/** Sessions whose history is loaded into the chat: the active ones, or the newest when none is. */
const MAX_LIVE_SESSIONS = 4;

const TONE: Record<'done' | 'wait' | 'error', { bg: string; fg: string }> = {
  done: { bg: 'rgba(53,184,122,.16)', fg: '#7fe0ae' },
  wait: { bg: 'rgba(139,123,255,.2)', fg: '#c4b8ff' },
  error: { bg: 'rgba(239,106,60,.2)', fg: '#ffa98a' },
};

/**
 * "Percakapan": a live chat of every active session of the agent, merged by time. Nothing to
 * click: new actions stream in from SSE, the view follows the newest message, and each active
 * session shows a presence line ("sedang bekerja…"). Bubbles are summaries (prompt size, files,
 * commands), never the text of prompts or answers.
 */
export function Conversation({ agentId, agentName, sessions, events }: Props) {
  const active = sessions.filter((s) => s.active);
  const shown = (active.length ? active : sessions.slice(0, 1)).slice(0, MAX_LIVE_SESSIONS);
  // Refetch a session's history only when its last activity moves.
  const key = shown.map((s) => `${s.sessionId}@${s.lastActivityAt}`).join(',');
  const [fetched, setFetched] = useState<Map<string, AgentEvent[]>>(new Map());
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let live = true;
    Promise.all(shown.map((s) => api.session(s.sessionId).then((d) => [s.sessionId, d.events] as const, () => null)))
      .then((rows) => {
        if (!live) return;
        setFetched(new Map(rows.filter((r): r is readonly [string, AgentEvent[]] => !!r)));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Live entries of the shown sessions, plus brand-new sessions the list has not caught up with.
  const known = sessions.map((s) => s.sessionId).join(',');
  const liveMine = useMemo(() => {
    const ids = new Set(shown.map((s) => s.sessionId)), all = new Set(known.split(','));
    return events.filter((e) => e.agentId === agentId && (ids.has(e.sessionId) || !all.has(e.sessionId)));
  }, [events, key, known, agentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const chat = useMemo(() => liveChat(fetched, liveMine, agentId), [fetched, liveMine, agentId]);

  const labels = new Map(sessionTabLabels(sessions).map((l, i) => [sessions[i]!.sessionId, l]));
  const multi = shown.length > 1;

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat, key]);

  const presence = shown.map((s) => ({ s, text: presenceText(s.status) })).filter((p) => p.text);
  const tag = (sid: string) =>
    multi ? (
      <span className="chat-sess mono" style={{ color: sessionColor(sid), borderColor: sessionColor(sid) }}>{labels.get(sid) ?? sid.slice(0, 4)}</span>
    ) : null;

  return (
    <section aria-label={`Percakapan ${agentName}`} className="convo">
      <h3 className="label">
        <span className={`live-dot${active.length ? ' blink' : ''}`} style={{ background: active.length ? '#35b87a' : '#8a90a0' }} aria-hidden="true" />
        {active.length ? `Percakapan langsung · ${active.length} sesi aktif` : 'Percakapan terakhir'}
      </h3>
      <div
        className="convo-feed"
        ref={scroller}
        tabIndex={0}
        role="log"
        aria-live="polite"
        aria-label={`Obrolan ${agentName}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {chat.length === 0 && <p className="muted small">Belum ada aktivitas tercatat.</p>}
        {chat.map((item) => {
          const k = `${item.sessionId}|${item.ts}|${item.kind}`;
          if (item.kind === 'status') {
            const t = TONE[item.tone];
            return (
              <div key={k} className="chat-status chat-in">
                {tag(item.sessionId)}
                <span style={{ background: t.bg, color: t.fg }}>{item.text}</span>
                <time className="mono muted">{formatTime(item.ts)}</time>
              </div>
            );
          }
          if (item.kind === 'user') {
            return (
              <div key={k} className="chat-row chat-user chat-in">
                <div className="chat-bubble">
                  <span className="chat-who">Anda {tag(item.sessionId)}</span>
                  {item.text}
                  <time className="mono">{formatTime(item.ts)}</time>
                </div>
              </div>
            );
          }
          return (
            <div key={k} className="chat-row chat-agent chat-in">
              <div className="chat-bubble">
                <span className="chat-who">{agentName} {tag(item.sessionId)}</span>
                {item.more > 0 && <span className="chat-more muted">+{item.more} aksi sebelumnya</span>}
                <ul>
                  {item.actions.map((ev, j) => {
                    const kind = logKind(ev);
                    return (
                      <li key={j}>
                        <span className="log-kind" style={{ background: kind.bg, color: kind.fg }}>{kind.label}</span>
                        <span className="mono log-detail" title={ev.detail}>{ev.detail}</span>
                      </li>
                    );
                  })}
                </ul>
                <time className="mono">{formatTime(item.ts)}</time>
              </div>
            </div>
          );
        })}
        {presence.map(({ s, text }) => (
          <div key={s.sessionId} className={`chat-presence${s.status === 'macet' ? ' is-block' : ''}`}>
            {s.status === 'kerja' || s.status === 'bicara' ? (
              <span className="typing" aria-hidden="true"><i /><i /><i /></span>
            ) : (
              <span className="convo-dot" style={{ background: STATUS_STYLE[s.status].fill }} aria-hidden="true" />
            )}
            <span>
              <strong>{agentName}</strong> {text}
              {multi && <> di {tag(s.sessionId)}</>}
              {s.status === 'macet' && s.block ? `: ${s.block.reason}` : ''}
            </span>
          </div>
        ))}
      </div>
      <p className="muted small">Diperbarui otomatis. Ringkasan aksi saja; isi prompt dan jawaban tidak ditampilkan.</p>
    </section>
  );
}

