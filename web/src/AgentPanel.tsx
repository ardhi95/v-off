import { useEffect, useMemo, useState } from 'react';
import type { AgentEvent, AgentWithRuntime, CleanerState, Department, SessionOverview } from '../../src/shared/types.js';
import { api } from './actions.js';
import { Conversation } from './Conversation.js';
import { SLEEP_STYLE, SPECIES, STATUS_STYLE, type PlaySpot } from './office/layout.js';
import { formatBytes, formatCost, formatDuration, formatTime, formatTokens, inkOn, locationOf, logKind, mergeLog } from './present.js';

interface Props {
  agent: AgentWithRuntime;
  departments: Department[];
  events: AgentEvent[];
  spot?: PlaySpot;
  /** Asleep in the dorm: the usage limit ran out and the office is off. */
  asleep?: boolean;
  cleaner: CleanerState;
  cleanerAction: string;
  now: number;
  onToast: (msg: string) => void;
  onFocus: () => void;
  onOpenSession: (sessionId: string) => void;
  onMessage: (sessionId: string) => void;
}

export function AgentPanel({ agent: a, departments, events, spot, asleep = false, cleaner, cleanerAction, now, onToast, onFocus, onOpenSession, onMessage }: Props) {
  const [fetched, setFetched] = useState<AgentEvent[]>([]);
  const [sessions, setSessions] = useState<SessionOverview[]>([]);
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);
  const rt = a.runtime;
  const st = asleep ? SLEEP_STYLE : STATUS_STYLE[rt.status];
  const dept = departments.find((d) => d.id === a.dept)?.label ?? a.dept;

  useEffect(() => {
    let live = true;
    setFetched([]);
    api.log(a.id).then((l) => live && setFetched(l), () => undefined);
    return () => {
      live = false;
    };
  }, [a.id]);

  // Sessions of this agent: loaded when the agent changes, refreshed (debounced) as its activity moves.
  useEffect(() => {
    setSessions([]);
    setSel('');
  }, [a.id]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.sessions(a.id).then((l) => live && setSessions(l), () => undefined);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [a.id, rt.status, rt.lastActivityAt, rt.sessionId]);

  const log = useMemo(() => mergeLog(fetched, events, a.id), [fetched, events, a.id]);
  // "Lihat sesi lengkap" and "Kirim pesan" follow the tab in view; the newest session otherwise.
  const shownSession = (sessions.find((s) => s.sessionId === sel) ?? sessions[0])?.sessionId ?? rt.sessionId;

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

  let task: string;
  if (asleep) {
    task = 'Tidur di Asrama. Limit pemakaian habis, jadi kantor off sampai limit pulih.';
  } else if (a.walker) {
    task = `${cleanerAction} (dry-run: ${cleaner.lastScanAt ? `${formatBytes(cleaner.totalBytes)} bisa dibersihkan` : 'belum dipindai'})`;
  } else if (rt.status === 'idle') {
    task = rt.manualIdle
      ? `Istirahat sebentar, sambil ${spot?.act ?? 'santai'}`
      : `Tidak ada aktivitas ≥ 10 menit${spot ? `, sambil ${spot.act}` : ''}`;
  } else {
    task = rt.lastAction ?? (rt.sessionId ? 'Sesi aktif' : 'Belum ada sesi');
  }

  return (
    <aside aria-label="Detail agent" className="panel agent-panel">
      <div className="agent-head">
        <span className="avatar" style={{ background: a.shirt, color: inkOn(a.shirt), boxShadow: `0 0 0 3px #161a22, 0 0 0 5px ${st.fill}` }} aria-hidden="true">
          {a.name.charAt(0).toUpperCase()}
        </span>
        <div className="agent-id">
          <h2>{a.name}</h2>
          <span className="sub">{a.role} · {dept}</span>
          <div className="pills">
            <span className="pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
            <span className="pill pill-outline mono">{a.tool}</span>
            <span className="pill pill-soft">{SPECIES[a.animal]?.label ?? a.animal}</span>
          </div>
        </div>
      </div>

      <div className="agent-body">
        <div className="location">
          <span className="dot" style={{ background: '#f5b83d' }} aria-hidden="true" />
          Lokasi: <strong>{locationOf(a, departments, spot, asleep)}</strong>
        </div>

        {rt.status === 'macet' && (
          <div role="alert" className="alert">
            <div className="alert-title">
              <span className="alert-icon blink" aria-hidden="true">!</span>
              <strong>{rt.block?.reason ?? 'Terblokir'}</strong>
            </div>
            {rt.block?.hint && <span className="alert-hint">{rt.block.hint}</span>}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => api.resolve(a.id), `Hambatan ${a.name} ditandai sudah ditangani`)}>
              Tandai sudah ditangani
            </button>
          </div>
        )}

        <div>
          <h3 className="label">{!asleep && (rt.status === 'kerja' || rt.status === 'macet') ? 'Aksi terakhir' : 'Tugas saat ini'}</h3>
          <p className="task">{task}</p>
          <span className="mono muted small">repo: {rt.repo ?? '—'}{rt.gitBranch ? ` · ${rt.gitBranch}` : ''}</span>
        </div>

        {a.walker && (
          <div>
            <h3 className="label">Bisa dibersihkan (dry-run)</h3>
            {cleaner.items.length === 0 ? (
              <p className="muted small">{cleaner.lastScanAt ? 'Tidak ada cache di daftar yang diizinkan.' : 'Pemindaian pertama sedang berjalan…'}</p>
            ) : (
              <>
                <ul className="cleaner-list">
                  {cleaner.items.slice(0, 6).map((it) => (
                    <li key={it.path} title={it.path}>
                      <span>{it.label}</span>
                      <span className="mono">{it.partial ? '≥ ' : ''}{formatBytes(it.bytes)}</span>
                    </li>
                  ))}
                </ul>
                <p className="muted small">
                  Total {formatBytes(cleaner.totalBytes)}. Dipindai {formatTime(cleaner.lastScanAt ?? now)}. Udin hanya menghitung; tidak ada file yang dihapus.
                </p>
              </>
            )}
          </div>
        )}

        <div className="stats">
          <div className="stat"><div className="stat-label">Token hari ini</div><div className="mono stat-value">{formatTokens(rt.tokensToday)}</div></div>
          <div className="stat">
            <div className="stat-label">Biaya (estimasi)</div>
            <div className="mono stat-value" title={rt.costToday === null ? 'Harga model belum diatur di Pengaturan' : undefined}>{formatCost(rt.costToday)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Durasi sesi</div>
            <div className="mono stat-value">{rt.sessionStartedAt ? formatDuration((rt.lastActivityAt ?? now) - rt.sessionStartedAt) : '—'}</div>
          </div>
        </div>

        {sessions.length > 0 ? (
          <Conversation agentName={a.name} sessions={sessions} selected={sel} onSelect={setSel} events={events} />
        ) : (
        <div>
          <h3 className="label">Log aktivitas</h3>
          {log.length === 0 ? (
            <p className="muted small">Belum ada aktivitas tercatat.</p>
          ) : (
            <ol className="log">
              {log.map((ev, i) => {
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
          )}
        </div>
        )}

        <div className="actions">
          <button type="button" className="btn btn-blue" disabled={!shownSession} onClick={() => shownSession && onOpenSession(shownSession)}>
            Lihat sesi lengkap
          </button>
          <button type="button" className="btn btn-dark" disabled={!shownSession} onClick={() => shownSession && onMessage(shownSession)}>
            Kirim pesan
          </button>
          <button type="button" className="btn btn-outline" onClick={onFocus}>Arahkan kamera</button>
          {asleep ? (
            <span className="muted small idle-note">Bangun otomatis saat limit pulih.</span>
          ) : !a.walker && (rt.manualIdle ? (
            <button type="button" className="btn btn-pink" disabled={busy} onClick={() => run(() => api.setIdle(a.id, false), `${a.name} kembali ke mejanya`)}>
              Kembali bekerja
            </button>
          ) : rt.status === 'idle' ? (
            <span className="muted small idle-note">Istirahat otomatis. Kembali ke meja saat ada aktivitas baru.</span>
          ) : (
            <button type="button" className="btn btn-pink" disabled={busy} onClick={() => run(() => api.setIdle(a.id, true), `${a.name} pergi ke ruang santai`)}>
              Istirahat &amp; main
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

