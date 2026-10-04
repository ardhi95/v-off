import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, AgentWithRuntime, Department } from '../../src/shared/types.js';
import { api } from './actions.js';
import { SLEEP_STYLE, STATUS_STYLE } from './office/layout.js';
import { formatTime, inkOn, locationOf, logKind, mentionsIn, presenceText, teamChat, type TeamChatItem } from './present.js';
import type { PlaySpot } from './office/layout.js';

interface Props {
  agents: AgentWithRuntime[];
  departments: Department[];
  /** Live feed, newest first; new entries arrive over SSE. */
  events: AgentEvent[];
  selected?: AgentWithRuntime;
  spot?: PlaySpot;
  asleep: boolean;
  onSelect: (id: string) => void;
  onFocus: () => void;
  onToast: (msg: string) => void;
  onOpenSession: (sessionId: string) => void;
  onMessage: (sessionId: string) => void;
}

const TONE: Record<'done' | 'wait' | 'error', { bg: string; fg: string }> = {
  done: { bg: 'rgba(53,184,122,.16)', fg: '#7fe0ae' },
  wait: { bg: 'rgba(139,123,255,.2)', fg: '#c4b8ff' },
  error: { bg: 'rgba(239,106,60,.2)', fg: '#ffa98a' },
};

/**
 * "Obrolan tim": the right panel as one live group chat of the whole office. Every agent posts
 * what it does (summaries only, never prompt or answer text), prompts show as "Anda → @agent",
 * names of other agents become mentions, and working agents show typing dots. Nothing to click
 * for updates: SSE entries stream in and the view follows the newest message. The agent picked
 * in the 3D office is pinned below the chat (status, block, actions) and its messages are highlighted.
 */
export function TeamChat({ agents, departments, events, selected: a, spot, asleep, onSelect, onFocus, onToast, onOpenSession, onMessage }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [busy, setBusy] = useState(false);
  const chat = useMemo(() => teamChat(events), [events]);
  const byId = useMemo(() => new Map(agents.map((x) => [x.id, x])), [agents]);
  const people = useMemo(() => agents.map((x) => ({ id: x.id, name: x.name })), [agents]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      onToast(ok);
    } catch (e) {
      onToast(`Gagal: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const avatar = (id: string, size = 30) => {
    const x = byId.get(id);
    const shirt = x?.shirt ?? '#8a90a0';
    return (
      <button type="button" className="chat-avatar" style={{ width: size, height: size, background: shirt, color: inkOn(shirt) }}
        onClick={() => onSelect(id)} aria-label={`Pilih ${x?.name ?? id}`}>
        {(x?.name ?? id).charAt(0).toUpperCase()}
      </button>
    );
  };
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const mentionChips = (text: string, self: string) =>
    mentionsIn(text, people, self).map((id) => (
      <button key={id} type="button" className="chat-mention" onClick={() => onSelect(id)}>@{nameOf(id)}</button>
    ));

  const working = agents.filter((x) => !x.walker && (x.runtime.status === 'kerja' || x.runtime.status === 'bicara'));
  const blocked = agents.filter((x) => x.runtime.status === 'macet');
  const rt = a?.runtime;
  const st = a ? (asleep ? SLEEP_STYLE : STATUS_STYLE[rt!.status]) : undefined;

  const message = (item: TeamChatItem, i: number) => {
    const key = `${item.ts}|${item.kind}|${i}`;
    if (item.kind === 'user') {
      const sel = item.to === a?.id;
      return (
        <div key={key} className={`chat-row chat-user chat-in${sel ? ' is-sel' : ''}`}>
          <div className="chat-bubble">
            <span className="chat-who">Anda → <button type="button" className="chat-mention" onClick={() => onSelect(item.to)}>@{nameOf(item.to)}</button></span>
            {item.text}
            <time className="mono">{formatTime(item.ts)}</time>
          </div>
        </div>
      );
    }
    const sel = item.agentId === a?.id;
    if (item.kind === 'status') {
      const t = TONE[item.tone];
      return (
        <div key={key} className={`chat-status chat-in${sel ? ' is-sel' : ''}`}>
          <span style={{ background: t.bg, color: t.fg }}><strong>{nameOf(item.agentId)}</strong> · {item.text}</span>
          {mentionChips(item.text, item.agentId)}
          <time className="mono muted">{formatTime(item.ts)}</time>
        </div>
      );
    }
    const x = byId.get(item.agentId);
    return (
      <div key={key} className={`chat-row chat-agent chat-in${sel ? ' is-sel' : ''}`}>
        {avatar(item.agentId)}
        <div className="chat-bubble">
          <span className="chat-who">
            <button type="button" className="chat-name" onClick={() => onSelect(item.agentId)}>{x?.name ?? item.agentId}</button>
            <span className="muted"> · {x?.short ?? ''}</span>
          </span>
          {item.more > 0 && <span className="chat-more muted">+{item.more} aksi sebelumnya</span>}
          <ul>
            {item.actions.map((ev, j) => {
              const k = logKind(ev);
              return (
                <li key={j}>
                  <span className="log-kind" style={{ background: k.bg, color: k.fg }}>{k.label}</span>
                  <span className="mono log-detail" title={ev.detail}>{ev.detail}</span>
                  {mentionChips(ev.detail, item.agentId)}
                </li>
              );
            })}
          </ul>
          <time className="mono">{formatTime(item.ts)}</time>
        </div>
      </div>
    );
  };

  return (
    <aside aria-label="Obrolan tim" className="panel agent-panel team-chat">
      <div className="team-head">
        <h2>
          <span className={`live-dot${working.length ? ' blink' : ''}`} style={{ background: working.length ? '#35b87a' : '#8a90a0' }} aria-hidden="true" />
          Obrolan tim
        </h2>
        <span className="muted small">{working.length} bekerja · {blocked.length} terblokir</span>
      </div>

      <div
        className="convo-feed team-feed"
        ref={scroller}
        tabIndex={0}
        role="log"
        aria-live="polite"
        aria-label="Pesan tim"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {chat.length === 0 && <p className="muted small">Belum ada aktivitas. Pesan agent muncul di sini secara langsung.</p>}
        {chat.map(message)}
        {working.map((x) => (
          <div key={x.id} className="chat-presence">
            <span className="typing" aria-hidden="true"><i /><i /><i /></span>
            <span><button type="button" className="chat-name" onClick={() => onSelect(x.id)}>{x.name}</button> {presenceText(x.runtime.status)}</span>
          </div>
        ))}
        {blocked.map((x) => (
          <div key={x.id} className="chat-presence is-block">
            <span className="convo-dot blink" style={{ background: STATUS_STYLE.macet.fill }} aria-hidden="true" />
            <span><button type="button" className="chat-name" onClick={() => onSelect(x.id)}>{x.name}</button> terblokir{x.runtime.block ? `: ${x.runtime.block.reason}` : ''}</span>
          </div>
        ))}
      </div>
      {a && rt && st && (
        <div className="pinned" style={{ borderColor: st.fill }}>
          <div className="pinned-row">
            <span className="avatar avatar-sm" style={{ background: a.shirt, color: inkOn(a.shirt) }} aria-hidden="true">{a.name.charAt(0).toUpperCase()}</span>
            <div className="pinned-id">
              <strong>{a.name}</strong>
              <span className="muted small">{a.role} · {locationOf(a, departments, spot, asleep)}</span>
            </div>
            <span className="pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
          </div>
          {rt.status === 'macet' && (
            <div role="alert" className="pinned-alert">
              <strong>{rt.block?.reason ?? 'Terblokir'}</strong>
              {rt.block?.hint && <span className="small">{rt.block.hint}</span>}
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => api.resolve(a.id), `Hambatan ${a.name} ditandai sudah ditangani`)}>
                Tandai sudah ditangani
              </button>
            </div>
          )}
          <div className="pinned-actions">
            <button type="button" className="btn btn-blue btn-sm" disabled={!rt.sessionId} onClick={() => rt.sessionId && onOpenSession(rt.sessionId)}>Lihat sesi</button>
            <button type="button" className="btn btn-dark btn-sm" disabled={!rt.sessionId} onClick={() => rt.sessionId && onMessage(rt.sessionId)}>Kirim pesan</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={onFocus}>Arahkan kamera</button>
            {!a.walker && !asleep && (rt.manualIdle ? (
              <button type="button" className="btn btn-pink btn-sm" disabled={busy} onClick={() => run(() => api.setIdle(a.id, false), `${a.name} kembali ke mejanya`)}>Kembali bekerja</button>
            ) : rt.status !== 'idle' && (
              <button type="button" className="btn btn-pink btn-sm" disabled={busy} onClick={() => run(() => api.setIdle(a.id, true), `${a.name} pergi ke ruang santai`)}>Istirahat</button>
            ))}
          </div>
        </div>
      )}

      <p className="muted small team-note">Diperbarui langsung. Ringkasan aksi saja; isi prompt dan jawaban tidak ditampilkan.</p>
    </aside>
  );
}
