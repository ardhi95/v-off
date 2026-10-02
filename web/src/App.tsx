import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentWithRuntime } from '../../src/shared/types.js';
import { copyText } from './actions.js';
import { ActivityFeed } from './ActivityFeed.js';
import { AgentPanel } from './AgentPanel.js';
import { useOfficeData } from './api.js';
import { FilterBar } from './FilterBar.js';
import { assignSpotsSticky, cleanerStops } from './office/behavior.js';
import type { PlaySpot } from './office/layout.js';
import { OfficeStage, type OfficeStageHandle } from './OfficeStage.js';
import { defaultSelection, formatBytes, matchesFilter, resumeCommand, type FilterKey } from './present.js';
import { toSceneAgents } from './sceneAgents.js';
import { ReportPage } from './ReportPage.js';
import { SessionDialog } from './SessionDialog.js';

type Page = 'ruang' | 'laporan';

function pageOf(pathname: string): Page {
  return pathname.replace(/\/+$/, '') === '/laporan' ? 'laporan' : 'ruang';
}

/** Minimal client-side routing: "/" Ruang Tim, "/laporan" Laporan. */
function usePage(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(() => pageOf(window.location.pathname));
  useEffect(() => {
    const on = () => setPage(pageOf(window.location.pathname));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const go = useCallback((p: Page) => {
    const path = p === 'laporan' ? '/laporan' : '/';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setPage(p);
    window.scrollTo(0, 0);
  }, []);
  return [page, go];
}

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

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function useToast(): [string, (msg: string) => void] {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 2600);
  }, []);
  return [toast, show];
}

function useEventCounter(newest: unknown): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (newest) setN((x) => x + 1);
  }, [newest]);
  return n;
}

export function App() {
  const { state, error, live } = useOfficeData();
  const [page, go] = usePage();
  useEffect(() => {
    document.title = page === 'laporan' ? 'v-off · Laporan' : 'v-off · Ruang Tim';
  }, [page]);
  const navLink = (p: Page, label: string, href: string) => (
    <a
      href={href}
      className={`nav-link${page === p ? ' is-active' : ''}`}
      aria-current={page === p ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(p);
      }}
    >
      {label}
    </a>
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('semua');
  const [cleanerAction, setCleanerAction] = useState('Berkeliling mencari cache…');
  const [sessionOpen, setSessionOpen] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const stageRef = useRef<OfficeStageHandle>(null);
  const clock = useClock();
  const now = useNow(30_000);

  const agents = useMemo(() => state?.agents ?? [], [state]);
  const departments = useMemo(() => state?.departments ?? [], [state]);
  const selected = picked && agents.some((a) => a.id === picked && !a.hidden) ? picked : defaultSelection(agents);
  // Pin the default choice so the panel does not jump once that agent's status changes.
  useEffect(() => {
    if (selected && selected !== picked) setPicked(selected);
  }, [selected, picked]);
  const agent = agents.find((a) => a.id === selected);
  const isDim = useCallback((a: AgentWithRuntime) => !matchesFilter(filter, a.runtime.status), [filter]);
  // Sticky spots: idle agents keep their game while others come and go.
  const prevSpots = useRef(new Map<string, PlaySpot>());
  const spots = useMemo(() => {
    const next = assignSpotsSticky(toSceneAgents(agents, departments), prevSpots.current);
    prevSpots.current = next;
    return next;
  }, [agents, departments]);
  const cleanerItems = state?.cleaner.items;
  // Counts live events so the report refreshes as new activity arrives.
  const eventCount = useEventCounter(state?.events[0]);
  const stops = useMemo(() => cleanerStops(cleanerItems ?? [], agents, formatBytes), [cleanerItems, agents]);

  const onMessage = async (sessionId: string) => {
    const cmd = resumeCommand(sessionId);
    showToast((await copyText(cmd)) ? `Disalin: ${cmd}` : `Salin manual: ${cmd}`);
  };

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
          {navLink('ruang', 'Ruang Tim', '/')}
          {navLink('laporan', 'Laporan', '/laporan')}
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
        {error && <div className="notice" role="alert">{error}</div>}
        {page === 'laporan' && state && (
          <ReportPage agents={agents} departments={departments} eventCount={eventCount} onToast={showToast} />
        )}
        {page === 'ruang' && <h1 className="page-title">Ruang Tim</h1>}
        {page !== 'ruang' ? null : state ? (
          <>
            <FilterBar agents={agents} value={filter} onChange={setFilter} />
            <div className="main-grid">
              <section aria-label="Kantor 3D" className="stack">
                <OfficeStage
                  ref={stageRef}
                  agents={agents}
                  departments={departments}
                  selected={selected}
                  onSelect={setPicked}
                  isDim={isDim}
                  cleanerAction={cleanerAction}
                  onCleanerAction={setCleanerAction}
                  spots={spots}
                  cleanerStops={stops}
                  animations={state.ambience?.animations !== false}
                />
                <ActivityFeed events={state.events} agents={agents} departments={departments} onSelect={setPicked} />
              </section>
              {agent ? (
                <AgentPanel
                  agent={agent}
                  departments={departments}
                  events={state.events}
                  spot={spots.get(agent.id)}
                  cleaner={state.cleaner}
                  cleanerAction={cleanerAction}
                  now={now}
                  onToast={showToast}
                  onFocus={() => stageRef.current?.focus(agent.id)}
                  onOpenSession={setSessionOpen}
                  onMessage={onMessage}
                />
              ) : (
                <aside className="panel agent-panel empty-panel">Belum ada agent. Tambahkan di Pengaturan.</aside>
              )}
            </div>
            {sessionOpen && <SessionDialog sessionId={sessionOpen} onClose={() => setSessionOpen(null)} />}
          </>
        ) : (
          !error && <p className="muted">Memuat kantor…</p>
        )}
        {toast && <div role="status" className="toast">{toast}</div>}
      </main>
    </div>
  );
}
