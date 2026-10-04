import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, SessionOverview } from '../../src/shared/types.js';
import { api } from './actions.js';
import { STATUS_STYLE } from './office/layout.js';
import { CHAT_ACTIONS_SHOWN, formatTime, logKind, sessionEvents, sessionTabLabels, toChat } from './present.js';

interface Props {
  agentName: string;
  sessions: SessionOverview[];
  /** Selected session id; falls back to the first tab. */
  selected: string;
  onSelect: (sessionId: string) => void;
  /** Live feed (all agents); entries of the selected session are appended as they arrive. */
  events: AgentEvent[];
}

const TONE: Record<'done' | 'wait' | 'error', { bg: string; fg: string }> = {
  done: { bg: 'rgba(53,184,122,.16)', fg: '#7fe0ae' },
  wait: { bg: 'rgba(139,123,255,.2)', fg: '#c4b8ff' },
  error: { bg: 'rgba(239,106,60,.2)', fg: '#ffa98a' },
};

/**
 * "Percakapan": one tab per active session of the agent, each shown as a chat. Bubbles are
 * summaries (prompt size, files, commands), never the text of prompts or answers.
 */
export function Conversation({ agentName, sessions, selected, onSelect, events }: Props) {
  const current = sessions.find((s) => s.sessionId === selected) ?? sessions[0];
  const sid = current?.sessionId ?? '';
  const lastAt = current?.lastActivityAt;
  const [fetched, setFetched] = useState<{ sid: string; events: AgentEvent[] }>({ sid: '', events: [] });
  const [error, setError] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  // Reload the session when it is picked and whenever its last activity moves.
  useEffect(() => {
    if (!sid) return;
    let live = true;
    api.session(sid).then(
      (d) => live && (setFetched({ sid, events: d.events }), setError(false)),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [sid, lastAt]);

  const chat = useMemo(
    () => toChat(sessionEvents(fetched.sid === sid ? fetched.events : [], events, sid)),
    [fetched, events, sid],
  );

  useEffect(() => {
    stick.current = true; // a new tab starts at the newest message
  }, [sid]);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat, sid]);

  const labels = sessionTabLabels(sessions);
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? sessions.length - 1 : (i + step + sessions.length) % sessions.length;
    const target = sessions[next]!;
    onSelect(target.sessionId);
    tabRefs.current.get(target.sessionId)?.focus();
  };

  const activeCount = sessions.filter((s) => s.active).length;
  return (
    <section aria-label={`Percakapan ${agentName}`} className="convo">
      <h3 className="label">
        Percakapan {activeCount > 0 ? `aktif · ${activeCount} sesi` : '· tidak ada sesi aktif'}
      </h3>
      <div role="tablist" aria-label="Sesi agent" className="convo-tabs">
        {sessions.map((s, i) => {
          const st = STATUS_STYLE[s.status];
          const on = s.sessionId === sid;
          return (
            <button
              key={s.sessionId}
              ref={(el) => {
                if (el) tabRefs.current.set(s.sessionId, el);
                else tabRefs.current.delete(s.sessionId);
              }}
              type="button"
              role="tab"
              id={`convo-tab-${s.sessionId}`}
              aria-selected={on}
              aria-controls="convo-panel"
              tabIndex={on ? 0 : -1}
              className={`convo-tab${on ? ' is-on' : ''}${s.active ? '' : ' is-quiet'}`}
              onClick={() => onSelect(s.sessionId)}
              onKeyDown={(e) => onTabKey(e, i)}
              title={`${s.cwd ?? ''}${s.gitBranch ? ` · ${s.gitBranch}` : ''}`}
            >
              <span className={`convo-dot${s.status === 'macet' ? ' blink' : ''}`} style={{ background: st.fill }} aria-hidden="true" />
              <span className="convo-tab-name">{labels[i]}</span>
              <span className="convo-tab-sub mono">{st.label} · {formatTime(s.lastActivityAt)}</span>
            </button>
          );
        })}
      </div>

      {current?.block && (
        <p role="status" className="convo-block">
          <strong>{current.block.reason}.</strong> {current.block.hint}
        </p>
      )}

      <div
        id="convo-panel"
        role="tabpanel"
        aria-labelledby={`convo-tab-${sid}`}
        className="convo-feed"
        ref={scroller}
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {error && chat.length === 0 && <p className="muted small">Percakapan sesi ini tidak bisa dimuat.</p>}
        {!error && chat.length === 0 && <p className="muted small">Belum ada aktivitas tercatat di sesi ini.</p>}
        {chat.map((item, i) => {
          if (item.kind === 'status') {
            const t = TONE[item.tone];
            return (
              <div key={i} className="chat-status">
                <span style={{ background: t.bg, color: t.fg }}>{item.text}</span>
                <time className="mono muted">{formatTime(item.ts)}</time>
              </div>
            );
          }
          if (item.kind === 'user') {
            return (
              <div key={i} className="chat-row chat-user">
                <div className="chat-bubble">
                  <span className="chat-who">Anda</span>
                  {item.text}
                  <time className="mono">{formatTime(item.ts)}</time>
                </div>
              </div>
            );
          }
          return (
            <div key={i} className="chat-row chat-agent">
              <div className="chat-bubble">
                <span className="chat-who">{agentName}</span>
                {item.more > 0 && <span className="chat-more muted">+{item.more} aksi sebelumnya</span>}
                <ul>
                  {item.actions.map((ev, j) => {
                    const k = logKind(ev);
                    return (
                      <li key={j}>
                        <span className="log-kind" style={{ background: k.bg, color: k.fg }}>{k.label}</span>
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
      </div>
      <p className="muted small">Ringkasan aksi saja. Isi prompt dan jawaban tidak ditampilkan. Menampilkan {CHAT_ACTIONS_SHOWN} aksi terbaru per giliran.</p>
    </section>
  );
}
