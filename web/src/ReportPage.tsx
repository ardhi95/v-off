import { useEffect, useMemo, useState } from 'react';
import type { AgentWithRuntime, Department, Period, Report } from '../../src/shared/types.js';
import { downloadPostcard } from './postcardPng.js';
import { formatCost, formatTokens, inkOn } from './present.js';
import { CHART_TITLE, chartBars, deptRows, PERIODS, periodDescription, postcard, scoreRows, type SortKey } from './reportModel.js';

const REFRESH_MS = 30_000;

function useReport(period: Period | null, refreshKey: number): { report: Report | null; error: string | null } {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!period) return;
    let live = true;
    const load = () =>
      fetch(`/api/report?period=${period}`)
        .then((r) => (r.ok ? (r.json() as Promise<Report>) : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((r) => live && (setReport(r), setError(null)))
        .catch((e: Error) => live && setError(`Laporan gagal dimuat (${e.message}).`));
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [period, refreshKey]);
  return { report, error };
}

export function ReportPage({ agents, departments, eventCount, onToast }: {
  agents: AgentWithRuntime[];
  departments: Department[];
  /** Changes when live events arrive, to refresh the numbers. */
  eventCount: number;
  onToast: (msg: string) => void;
}) {
  const [period, setPeriod] = useState<Period>('day');
  const [sort, setSort] = useState<SortKey>('biaya');
  const [hover, setHover] = useState<number | null>(null);
  // Refresh at most every 10 live events to keep the server load small.
  const { report, error } = useReport(period, Math.floor(eventCount / 10));
  // The end-of-day postcard always summarizes today, whatever period is shown.
  const { report: todayOnly } = useReport(period === 'day' ? null : 'day', Math.floor(eventCount / 10));
  const today = period === 'day' ? report : todayOnly;

  const score = useMemo(() => (report ? scoreRows(report, agents, sort) : null), [report, agents, sort]);
  const bars = useMemo(() => (report ? chartBars(report) : []), [report]);
  const depts = useMemo(() => (report ? deptRows(report, departments) : []), [report, departments]);

  if (error && !report) return <div className="notice" role="alert">{error}</div>;
  if (!report || !score) return <p className="muted">Memuat laporan…</p>;

  const t = report.totals;
  const activeAgents = score.rows.filter((r) => r.sessions > 0).length;
  const priced = t.cost !== null;
  const kpis = [
    { label: 'Total sesi', value: t.sessions.toLocaleString('id-ID'), sub: `${activeAgents} agent aktif` },
    { label: 'Tingkat sukses', value: t.successRate === null ? '—' : `${Math.round(t.successRate * 100)}%`, sub: 'sesi tanpa galat yang belum ditangani' },
    { label: 'Biaya', value: formatCost(t.cost), sub: priced ? 'estimasi dari pemakaian token' : 'atur harga model di Pengaturan' },
    { label: 'Token', value: formatTokens(t.tokens), sub: 'input + output + cache' },
    { label: 'Hambatan', value: t.blocks.toLocaleString('id-ID'), sub: 'izin, tes gagal, rate limit, build' },
  ];
  const vmax = Math.max(1, ...bars.map((b) => b.sessions));
  const todayRows = today ? scoreRows(today, agents, 'sesi').rows : score.rows;
  const pc = postcard(today ?? report, todayRows, formatCost);
  const sortBtn = (k: SortKey, label: string) => (
    <button type="button" className={`th-btn${sort === k ? ' is-on' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>
      {label} {sort === k ? '▼' : ''}
    </button>
  );
  const download = async () => {
    try {
      const d = new Date((today ?? report).to);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await downloadPostcard(pc, 'Salam dari Kantor Agent', `kartu-pos-v-off-${day}.png`);
      onToast('Kartu pos diunduh sebagai PNG');
    } catch (e) {
      onToast(`Gagal: ${(e as Error).message}`);
    }
  };

  return (
    <div className="report">
      <div className="report-head">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Laporan &amp; Scorecard</h1>
          <p className="muted report-desc">{periodDescription(report)} · biaya adalah estimasi</p>
        </div>
        <div role="group" aria-label="Periode" className="segs">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" className={`seg${period === p.key ? ' is-on' : ''}`} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="panel kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="mono kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="two">
        <section className="panel card" aria-labelledby="h-agent">
          <h2 id="h-agent" className="card-title">Scorecard per agent</h2>
          <p className="muted small" style={{ margin: '0 0 8px' }}>Klik judul kolom untuk mengurutkan.</p>
          <div className="table-scroll">
            <table className="score">
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col" aria-sort={sort === 'sesi' ? 'descending' : 'none'}>{sortBtn('sesi', 'Sesi')}</th>
                  <th scope="col" aria-sort={sort === 'sukses' ? 'descending' : 'none'}>{sortBtn('sukses', 'Sukses')}</th>
                  <th scope="col" aria-sort={sort === 'biaya' ? 'descending' : 'none'}>{sortBtn('biaya', score.byCost ? 'Biaya' : 'Token')}</th>
                  <th scope="col">{score.byCost ? 'Porsi biaya' : 'Porsi token'}</th>
                </tr>
              </thead>
              <tbody>
                {score.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="who">
                        <span className="who-avatar" style={{ background: r.shirt, color: inkOn(r.shirt) }} aria-hidden="true">{r.name.charAt(0).toUpperCase()}</span>
                        <div className="who-text">
                          <div className="who-name">{r.name}</div>
                          <div className="who-role">{r.role}</div>
                        </div>
                        {r.blocks > 0 && <span className="block-pill">{r.blocks} hambatan</span>}
                      </div>
                    </td>
                    <td className="mono">{r.sessions.toLocaleString('id-ID')}</td>
                    <td className="mono" style={{ color: r.successRate === null ? 'var(--muted)' : r.successRate < 0.85 ? '#ffa98a' : '#7fe0ae' }}>
                      {r.successRate === null ? '—' : `${Math.round(r.successRate * 100)}%`}
                    </td>
                    <td className="mono">{score.byCost ? formatCost(r.cost) : formatTokens(r.tokens)}</td>
                    <td>
                      <div className="share" role="img" aria-label={`${r.bar}% dari agent tertinggi`}>
                        <div style={{ width: `${r.bar}%`, background: r.shirt }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="stack">
          <section className="panel card" aria-labelledby="h-chart">
            <h2 id="h-chart" className="card-title">{CHART_TITLE[report.bucketUnit]}</h2>
            <p className="muted small" style={{ margin: '0 0 14px' }}>Jumlah sesi agent yang aktif</p>
            <div className="chart" onMouseLeave={() => setHover(null)}>
              {bars.map((b, i) => {
                const showValue = b.sessions > 0 && (b.sessions === vmax || b.current || hover === i);
                return (
                  <div
                    key={i}
                    className="bar-col"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`${b.title}: ${b.sessions} sesi, ${formatTokens(b.tokens)} token`}
                  >
                    <span className="mono bar-value" style={{ visibility: showValue ? 'visible' : 'hidden' }}>{b.sessions}</span>
                    <div className="bar" style={{ height: `${b.sessions ? Math.max(4, Math.round((b.sessions / vmax) * 82)) : 0}%`, background: b.current ? '#f5b83d' : '#5b8def' }} />
                    {hover === i && (
                      <div className="tip" role="tooltip">
                        <strong>{b.title}</strong>
                        <span>{b.sessions} sesi · {formatTokens(b.tokens)} token</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="bar-labels" aria-hidden="true">
              {bars.map((b, i) => <span key={i} className="mono">{b.label}</span>)}
            </div>
            <details className="table-view">
              <summary>Lihat sebagai tabel</summary>
              <table className="mini">
                <thead><tr><th scope="col">Waktu</th><th scope="col">Sesi</th><th scope="col">Token</th></tr></thead>
                <tbody>
                  {bars.map((b, i) => <tr key={i}><td>{b.title}</td><td className="mono">{b.sessions}</td><td className="mono">{formatTokens(b.tokens)}</td></tr>)}
                </tbody>
              </table>
            </details>
          </section>

          <section className="panel card" aria-labelledby="h-tim">
            <h2 id="h-tim" className="card-title">Per departemen</h2>
            {depts.length === 0 ? (
              <p className="muted small">Belum ada aktivitas pada periode ini.</p>
            ) : (
              <div className="depts">
                {depts.map((d) => (
                  <div key={d.id}>
                    <div className="dept-line">
                      <strong>{d.label}</strong>
                      <span className="mono">{d.sessions} sesi · {d.cost !== null ? formatCost(d.cost) : `${formatTokens(d.tokens)} token`}</span>
                    </div>
                    <div className="dept-bar" role="img" aria-label={`${d.pct}% dari total`}>
                      <div style={{ width: `${d.pct}%`, background: d.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="panel card postcard-section" aria-labelledby="h-pos">
        <div className="report-head">
          <div>
            <h2 id="h-pos" className="card-title" style={{ margin: 0 }}>Kartu pos akhir hari</h2>
            <p className="muted small" style={{ margin: '4px 0 0' }}>Ringkasan hari ini untuk dibagikan ke tim.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={download}>Unduh PNG</button>
        </div>
        <div className="postcard">
          <div className="postcard-people">
            {pc.people.map((p, i) => (
              <span key={i} style={{ background: p.color, color: inkOn(p.color) }} aria-hidden="true">{p.initial}</span>
            ))}
          </div>
          <div className="postcard-text">
            <span className="postcard-kicker">Salam dari Kantor Agent</span>
            <strong>{pc.date}</strong>
            <span>{pc.line1}</span>
            <span>{pc.line2}</span>
            <span>{pc.line3}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
