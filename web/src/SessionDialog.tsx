import { useEffect, useRef, useState } from 'react';
import type { SessionSummary } from '../../src/shared/types.js';
import { api } from './actions.js';
import { formatDuration, formatTime, formatTokens, logKind } from './present.js';

/** Modal with the summarized session log: actions only, never prompt text. */
export function SessionDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    api.session(sessionId).then(setData, (e: Error) => setError(e.message));
  }, [sessionId]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="session-title" onClose={onClose} onCancel={onClose}>
      <div className="dialog-head">
        <h2 id="session-title">Sesi {data?.agentName ?? ''}</h2>
        <button type="button" className="btn btn-ghost" onClick={() => { ref.current?.close(); onClose(); }}>Tutup</button>
      </div>
      {error && <p role="alert" className="notice">{error}</p>}
      {!data && !error && <p className="muted">Memuat sesi…</p>}
      {data && (
        <>
          <p className="mono muted dialog-meta">
            {data.sessionId}
            {data.cwd ? ` · ${data.cwd}` : ''}
            {data.gitBranch ? ` · ${data.gitBranch}` : ''}
            {` · ${formatDuration((data.endedAt ?? data.lastActivityAt) - data.startedAt)} · ${formatTokens(data.tokens)} token`}
          </p>
          <p className="muted">Ringkasan aksi saja. Isi prompt dan file tidak ditampilkan.{data.truncated ? ' Hanya 300 aksi terakhir.' : ''}</p>
          <ol className="log">
            {data.events.map((ev, i) => {
              const k = logKind(ev);
              return (
                <li key={i}>
                  <span className="mono muted">{formatTime(ev.ts)}</span>
                  <span className="log-kind" style={{ background: k.bg, color: k.fg }}>{k.label}</span>
                  <span className="mono log-detail" title={ev.detail}>{ev.detail}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </dialog>
  );
}
