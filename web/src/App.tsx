import { useEffect, useState } from 'react';
import { useOfficeData } from './api.js';
import { OfficeStage } from './OfficeStage.js';

function useClock(): string {
  const fmt = () =>
    new Date().toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const t = setInterval(() => setNow(fmt()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function App() {
  const { state, error, live } = useOfficeData();
  const [selected, setSelected] = useState<string | null>(null);
  const clock = useClock();

  return (
    <div style={{ minHeight: '100vh' }}>
      <header className="topbar">
        <div className="brand">
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <rect x="1" y="1" width="28" height="28" rx="9" fill="#f5b83d" />
            <ellipse cx="15" cy="17" rx="8" ry="4.5" fill="#1a1205" />
            <circle cx="8" cy="10" r="2.6" fill="#1a1205" />
            <circle cx="15" cy="8.5" r="2.6" fill="#1a1205" />
            <circle cx="22" cy="10" r="2.6" fill="#1a1205" />
          </svg>
          Kantor Agent
        </div>
        <nav className="nav" aria-label="Navigasi utama">
          <a href="/" className="nav-link is-active" aria-current="page">Ruang Tim</a>
          <a className="nav-link" aria-disabled="true" title="Segera hadir">Laporan</a>
          <a className="nav-link" aria-disabled="true" title="Segera hadir">Pengaturan Tim</a>
        </nav>
        <div className="topbar-right">
          <span className="live">
            <span className={`live-dot${live ? ' blink' : ''}`} style={{ background: live ? '#35b87a' : '#8a90a0' }} />
            {live ? 'Langsung' : 'Menyambung…'}
          </span>
          <span className="mono" style={{ color: '#b9bfcc' }}>{clock}</span>
        </div>
      </header>
      <main>
        <h1 className="page-title">Ruang Tim</h1>
        {error && <div className="notice" role="alert">{error}</div>}
        {state ? (
          <section aria-label="Kantor 3D">
            <OfficeStage agents={state.agents} departments={state.departments} selected={selected} onSelect={setSelected} />
          </section>
        ) : (
          !error && <p style={{ color: 'var(--muted)' }}>Memuat kantor…</p>
        )}
      </main>
    </div>
  );
}
