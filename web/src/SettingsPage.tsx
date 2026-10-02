import { useEffect, useMemo, useState } from 'react';
import { SPECIES_IDS, type Agent, type AgentWithRuntime, type Config, type Department, type ModelPrice } from '../../src/shared/types.js';
import { SPECIES } from './office/layout.js';
import { formatTokens, inkOn } from './present.js';
import {
  assignFolder, isDirty, newAgent, newDepartment, rulesToText, seatForDept, SHIRT_COLORS, textToRules, TOOLS,
} from './settingsModel.js';

interface ModelSeen {
  model: string;
  tokens: number;
  priced: boolean;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

const SOURCE_INFO: { key: keyof Config['sources']; name: string; path: string; ready: boolean }[] = [
  { key: 'claudeCode', name: 'Claude Code', path: '~/.claude/projects/', ready: true },
  { key: 'codex', name: 'Codex CLI', path: '~/.codex/sessions/', ready: false },
  { key: 'gemini', name: 'Gemini CLI', path: '~/.gemini/tmp/', ready: false },
  { key: 'webhook', name: 'Webhook umum (CI, skrip)', path: 'POST /api/status', ready: true },
];

export function SettingsPage({ agents: live, onToast, onDirtyChange }: {
  agents: AgentWithRuntime[];
  onToast: (msg: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [models, setModels] = useState<ModelSeen[]>([]);
  const [ruleText, setRuleText] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [newDept, setNewDept] = useState('');
  const [newModel, setNewModel] = useState('');
  const [logPathsText, setLogPathsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    const [cfg, m] = await Promise.all([getJson<Config>('/api/config'), getJson<ModelSeen[]>('/api/models')]);
    setSaved(cfg);
    setDraft(cfg);
    setModels(m);
    setRuleText(Object.fromEntries(cfg.agents.map((a) => [a.id, rulesToText(a.match)])));
    setLogPathsText(cfg.cleaner.logPaths.join('\n'));
    setError(null);
  };
  useEffect(() => {
    load().catch((e: Error) => setError(`Pengaturan gagal dimuat (${e.message}).`));
  }, []);

  const dirty = !!(saved && draft && isDirty(saved, draft));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const ruleErrors = useMemo(
    () => Object.fromEntries(Object.entries(ruleText).map(([id, text]) => [id, textToRules(text).errors])),
    [ruleText],
  );
  const hasRuleErrors = Object.values(ruleErrors).some((e) => e.length > 0);
  const guests = live.filter((a) => a.guest && a.runtime.cwd);

  if (error && !draft) return <div className="notice" role="alert">{error}</div>;
  if (!draft || !saved) return <p className="muted">Memuat pengaturan…</p>;

  const set = (fn: (c: Config) => Config) => setDraft((d) => (d ? fn(d) : d));
  const setAgent = (id: string, patch: Partial<Agent>) =>
    set((c) => ({ ...c, agents: c.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const setDept = (id: string, patch: Partial<Department>) =>
    set((c) => ({ ...c, departments: c.departments.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const changeDept = (a: Agent, deptId: string) => {
    const seat = seatForDept(a, deptId, draft.agents, draft.departments);
    setAgent(a.id, { dept: deptId, seat });
  };
  const setRules = (id: string, text: string) => {
    setRuleText((r) => ({ ...r, [id]: text }));
    const { rules, errors } = textToRules(text);
    if (!errors.length) setAgent(id, { match: rules });
  };
  const setPrice = (model: string, patch: Partial<ModelPrice>) =>
    set((c) => ({ ...c, pricing: { ...c.pricing, [model]: { ...c.pricing[model]!, ...patch } } }));

  const addAgent = () => {
    const a = newAgent(draft);
    set((c) => ({ ...c, agents: [...c.agents, a] }));
    setRuleText((r) => ({ ...r, [a.id]: rulesToText(a.match) }));
    setOpen(a.id);
  };
  const deleteAgent = (id: string) => {
    set((c) => ({ ...c, agents: c.agents.filter((a) => a.id !== id) }));
    setConfirmDelete(null);
    setOpen(null);
  };
  const addDept = () => {
    const label = newDept.trim();
    if (!label || draft.departments.some((d) => d.label.toLowerCase() === label.toLowerCase())) return;
    set((c) => ({ ...c, departments: [...c.departments, newDepartment(label, c.departments)] }));
    setNewDept('');
  };
  const addModel = (model: string) => {
    const m = model.trim();
    if (!m || draft.pricing[m]) return;
    set((c) => ({ ...c, pricing: { ...c.pricing, [m]: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } } }));
    setNewModel('');
  };

  const save = async () => {
    if (hasRuleErrors) {
      setError('Perbaiki aturan pemetaan yang salah dulu.');
      return;
    }
    setSaving(true);
    try {
      const body: Config = { ...draft, cleaner: { ...draft.cleaner, logPaths: logPathsText.split('\n').map((s) => s.trim()).filter(Boolean) } };
      const res = await fetch('/api/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json()) as Config & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSaved(data);
      setDraft(data);
      setError(null);
      setSavedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':'));
      onToast('Pengaturan tersimpan');
      setModels(await getJson<ModelSeen[]>('/api/models'));
    } catch (e) {
      setError(`Gagal menyimpan: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };
  const reset = () => {
    setDraft(saved);
    setRuleText(Object.fromEntries(saved.agents.map((a) => [a.id, rulesToText(a.match)])));
    setLogPathsText(saved.cleaner.logPaths.join('\n'));
    setError(null);
  };

  const shown = draft.agents.filter((a) => !a.hidden).length;
  const unpriced = models.filter((m) => !draft.pricing[m.model] && !m.priced);

  return (
    <div className="settings">
      <div>
        <h1 className="page-title" style={{ margin: 0 }}>Pengaturan Tim</h1>
        <p className="muted report-desc">Beri nama, peran, departemen, dan warna untuk setiap agent yang muncul di lantai kantor.</p>
      </div>

      <div className="settings-layout">
        <section className="panel card" aria-labelledby="h-ag">
          <div className="card-head">
            <h2 id="h-ag" className="card-title">Daftar agent</h2>
            <span className="mono muted small">{shown} dari {draft.agents.length} tampil di lantai</span>
          </div>
          <div className="table-scroll">
            <div className="agents-table">
              <div className="arow ahead" aria-hidden="true">
                <span />
                <span>Nama</span>
                <span>Peran</span>
                <span>Departemen</span>
                <span>Tool</span>
                <span>Hewan</span>
                <span>Warna baju</span>
                <span>Tampil</span>
                <span />
              </div>
              {draft.agents.map((a) => {
                const errs = ruleErrors[a.id] ?? [];
                const isOpen = open === a.id;
                return (
                  <div key={a.id} className="agent-block">
                    <div className="arow" style={{ opacity: a.hidden ? 0.5 : 1 }}>
                      <span className="who-avatar" style={{ background: a.shirt, color: inkOn(a.shirt) }} aria-hidden="true">{(a.name || '?').charAt(0).toUpperCase()}</span>
                      <label><span className="sr-only">Nama agent {a.id}</span>
                        <input className="field" value={a.name} maxLength={60} onChange={(e) => setAgent(a.id, { name: e.target.value })} />
                      </label>
                      <label><span className="sr-only">Peran {a.name}</span>
                        <input className="field" value={a.role} maxLength={80} onChange={(e) => setAgent(a.id, { role: e.target.value })} />
                      </label>
                      <label><span className="sr-only">Departemen {a.name}</span>
                        <select className="field" value={a.dept} onChange={(e) => changeDept(a, e.target.value)}>
                          {draft.departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                        </select>
                      </label>
                      <label><span className="sr-only">Tool {a.name}</span>
                        <select className="field" value={a.tool} onChange={(e) => setAgent(a.id, { tool: e.target.value })}>
                          {[...new Set([...TOOLS, a.tool])].map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label><span className="sr-only">Hewan {a.name}</span>
                        <select className="field" value={a.animal} onChange={(e) => setAgent(a.id, { animal: e.target.value as Agent['animal'] })}>
                          {SPECIES_IDS.map((s) => <option key={s} value={s}>{SPECIES[s].label}</option>)}
                        </select>
                      </label>
                      <div role="group" aria-label={`Warna baju ${a.name}`} className="swatches">
                        {[...SHIRT_COLORS.slice(0, 4), ...(SHIRT_COLORS.slice(0, 4).some(([c]) => c === a.shirt) ? [] : [[a.shirt, 'warna sekarang'] as [string, string]])].map(([c, n]) => (
                          <button key={c} type="button" className={`sw${a.shirt === c ? ' is-on' : ''}`} style={{ background: c }} aria-label={`Warna ${n}`} aria-pressed={a.shirt === c} onClick={() => setAgent(a.id, { shirt: c })} />
                        ))}
                        <label className="sw sw-pick" title="Warna lain">
                          <span className="sr-only">Warna lain untuk {a.name}</span>
                          <input type="color" value={a.shirt} onChange={(e) => setAgent(a.id, { shirt: e.target.value })} />
                        </label>
                      </div>
                      <label className="toggle"><input type="checkbox" checked={!a.hidden} onChange={(e) => setAgent(a.id, { hidden: !e.target.checked || undefined })} /><span className="sr-only">Tampilkan {a.name} di lantai</span></label>
                      <button type="button" className={`btn btn-ghost btn-sm${errs.length ? ' has-error' : ''}`} aria-expanded={isOpen} aria-controls={`detail-${a.id}`} onClick={() => setOpen(isOpen ? null : a.id)}>
                        {isOpen ? 'Tutup' : 'Detail'}
                      </button>
                    </div>
                    {isOpen && (
                      <div className="agent-detail" id={`detail-${a.id}`}>
                        <label className="stack-field">
                          <span>Peran singkat (di label nama)</span>
                          <input className="field" value={a.short} maxLength={30} onChange={(e) => setAgent(a.id, { short: e.target.value })} />
                        </label>
                        <label className="stack-field">
                          <span>Aturan pemetaan sesi (satu per baris, dicek berurutan)</span>
                          <textarea
                            className="field area mono"
                            rows={4}
                            value={ruleText[a.id] ?? ''}
                            aria-invalid={errs.length > 0}
                            aria-describedby={`rules-help-${a.id}`}
                            onChange={(e) => setRules(a.id, e.target.value)}
                          />
                          <span id={`rules-help-${a.id}`} className="muted small">
                            Contoh: <code>folder: ~/work/pmo-portal/**</code> · <code>branch: feat/timesheet-*</code> · <code>env: V_OFF_AGENT={a.id}</code> · <code>sesi: nama-sesi</code>
                          </span>
                          {errs.map((e) => <span key={e} className="field-error" role="alert">{e}</span>)}
                        </label>
                        <label className="stack-field">
                          <span>Celetukan (satu per baris, maks 80 karakter)</span>
                          <textarea
                            className="field area"
                            rows={3}
                            value={(a.quips ?? []).join('\n')}
                            onChange={(e) => setAgent(a.id, { quips: e.target.value.split('\n').map((q) => q.slice(0, 80)) })}
                            onBlur={(e) => setAgent(a.id, { quips: e.target.value.split('\n').map((q) => q.trim()).filter(Boolean) })}
                          />
                        </label>
                        <div className="detail-foot">
                          <span className="mono muted small">id: {a.id}</span>
                          {confirmDelete === a.id ? (
                            <span className="confirm">
                              Hapus {a.name}?
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteAgent(a.id)}>Ya, hapus</button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Batal</button>
                            </span>
                          ) : (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(a.id)}>Hapus agent</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <button type="button" className="btn btn-dark" style={{ marginTop: 12 }} onClick={addAgent}>+ Tambah agent</button>
        </section>

        <div className="settings-side">
          {guests.length > 0 && (
            <section className="panel card" aria-labelledby="h-guest">
              <h2 id="h-guest" className="card-title">Sesi tanpa agent</h2>
              <p className="muted small" style={{ margin: '0 0 10px' }}>Tetapkan folder sesi ke agent. Aturan <code>folder:</code> ditambahkan; simpan untuk menerapkan.</p>
              <ul className="plain-list">
                {guests.map((g) => (
                  <GuestRow key={g.id} cwd={g.runtime.cwd!} agents={draft.agents} onAssign={(id) => set((c) => {
                    const next = assignFolder(c, id, g.runtime.cwd!);
                    const a = next.agents.find((x) => x.id === id)!;
                    setRuleText((r) => ({ ...r, [id]: rulesToText(a.match) }));
                    return next;
                  })} />
                ))}
              </ul>
            </section>
          )}

          <section className="panel card" aria-labelledby="h-dep">
            <h2 id="h-dep" className="card-title">Departemen / ruangan</h2>
            <ul className="plain-list">
              {draft.departments.map((d) => {
                const n = draft.agents.filter((a) => a.dept === d.id).length;
                return (
                  <li key={d.id} className="dept-item">
                    <label className="dept-color" title="Warna departemen">
                      <span className="sr-only">Warna {d.label}</span>
                      <input type="color" value={d.color} onChange={(e) => setDept(d.id, { color: e.target.value })} />
                    </label>
                    <label className="grow"><span className="sr-only">Nama departemen {d.id}</span>
                      <input className="field" value={d.label} maxLength={80} onChange={(e) => setDept(d.id, { label: e.target.value })} />
                    </label>
                    <span className="mono muted small nowrap">{n} agent{d.desk ? '' : ' · tanpa meja'}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={n > 0}
                      title={n > 0 ? 'Pindahkan agent-nya dulu' : undefined}
                      onClick={() => set((c) => ({ ...c, departments: c.departments.filter((x) => x.id !== d.id) }))}
                    >
                      Hapus
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="inline-add">
              <label className="grow"><span className="sr-only">Nama departemen baru</span>
                <input className="field" placeholder="mis. Tim Keuangan" value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addDept()} />
              </label>
              <button type="button" className="btn btn-dark" onClick={addDept}>+ Tambah</button>
            </div>
            <p className="muted small" style={{ margin: '8px 0 0' }}>Departemen baru belum punya meja di denah; agent-nya duduk di kursi kosong.</p>
          </section>

          <section className="panel card" aria-labelledby="h-src">
            <h2 id="h-src" className="card-title">Sumber data</h2>
            <p className="muted small" style={{ margin: '0 0 10px' }}>Dibaca lokal dari komputer ini. Tidak ada data yang dikirim keluar.</p>
            {SOURCE_INFO.map((s) => (
              <div key={s.key} className="source-row">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={draft.sources[s.key].enabled}
                    disabled={!s.ready}
                    onChange={(e) => set((c) => ({ ...c, sources: { ...c.sources, [s.key]: { ...c.sources[s.key], enabled: e.target.checked } } }))}
                  />
                  <span className="src-text">
                    <strong>{s.name}</strong>
                    <span className="mono muted small">{s.ready ? s.path : 'adapter belum tersedia'}</span>
                  </span>
                </label>
                {s.key === 'claudeCode' && (
                  <label className="stack-field">
                    <span className="small muted">Folder transkrip (kosong = default)</span>
                    <input
                      className="field mono"
                      placeholder="~/.claude/projects"
                      value={draft.sources.claudeCode.path ?? ''}
                      onChange={(e) => set((c) => ({ ...c, sources: { ...c.sources, claudeCode: { ...c.sources.claudeCode, path: e.target.value || undefined } } }))}
                    />
                  </label>
                )}
              </div>
            ))}
            <div className="endpoint">
              <div className="muted small">Endpoint untuk tool lain (CI, skrip):</div>
              <code className="mono">POST http://127.0.0.1:{window.location.port || '4747'}/api/status</code>
            </div>
          </section>

          <section className="panel card span-2" aria-labelledby="h-price">
            <h2 id="h-price" className="card-title">Harga model (US$ per 1 juta token)</h2>
            <p className="muted small" style={{ margin: '0 0 10px' }}>Dipakai untuk estimasi biaya. Nama model boleh awalan, mis. <code>claude-sonnet-4</code> berlaku untuk semua versinya.</p>
            {Object.keys(draft.pricing).length === 0 && <p className="muted small">Belum ada harga. Biaya tampil “—”.</p>}
            {Object.entries(draft.pricing).map(([m, p]) => (
              <div key={m} className="price-row">
                <span className="mono price-model" title={m}>{m}</span>
                {(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((k) => (
                  <label key={k} className="stack-field price-field">
                    <span className="small muted">{{ input: 'Input', output: 'Output', cacheRead: 'Cache baca', cacheWrite: 'Cache tulis' }[k]}</span>
                    <input className="field mono" type="number" min={0} step="0.01" value={p[k]} onChange={(e) => setPrice(m, { [k]: Math.max(0, Number(e.target.value) || 0) })} />
                  </label>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={`Hapus harga ${m}`}
                  onClick={() => set((c) => {
                    const pricing = { ...c.pricing };
                    delete pricing[m];
                    return { ...c, pricing };
                  })}
                >
                  ✕
                </button>
              </div>
            ))}
            {unpriced.length > 0 && (
              <div className="muted small" style={{ margin: '8px 0' }}>
                Model terdeteksi tanpa harga:{' '}
                {unpriced.map((m) => (
                  <button key={m.model} type="button" className="chip chip-sm" onClick={() => addModel(m.model)}>
                    + {m.model} <span className="mono">({formatTokens(m.tokens)})</span>
                  </button>
                ))}
              </div>
            )}
            <div className="inline-add">
              <label className="grow"><span className="sr-only">Nama model baru</span>
                <input className="field mono" placeholder="nama model" value={newModel} onChange={(e) => setNewModel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addModel(newModel)} />
              </label>
              <button type="button" className="btn btn-dark" onClick={() => addModel(newModel)}>+ Tambah</button>
            </div>
          </section>

          <section className="panel card" aria-labelledby="h-rules">
            <h2 id="h-rules" className="card-title">Aturan status &amp; office boy</h2>
            <div className="num-grid">
              <label className="stack-field">
                <span className="small">“Bekerja” jika ada aktivitas dalam (detik)</span>
                <input className="field mono" type="number" min={10} value={draft.rules.workWindowSec} onChange={(e) => set((c) => ({ ...c, rules: { ...c.rules, workWindowSec: Number(e.target.value) } }))} />
              </label>
              <label className="stack-field">
                <span className="small">“Istirahat” setelah tanpa aktivitas (detik)</span>
                <input className="field mono" type="number" min={60} value={draft.rules.idleAfterSec} onChange={(e) => set((c) => ({ ...c, rules: { ...c.rules, idleAfterSec: Number(e.target.value) } }))} />
              </label>
              <label className="stack-field">
                <span className="small">Pindai cache tiap (menit)</span>
                <input className="field mono" type="number" min={1} value={draft.cleaner.intervalMin} onChange={(e) => set((c) => ({ ...c, cleaner: { ...c.cleaner, intervalMin: Number(e.target.value) } }))} />
              </label>
            </div>
            <label className="stack-field" style={{ marginTop: 10 }}>
              <span className="small">Folder log (file *.log &gt; 7 hari dihitung; satu per baris)</span>
              <textarea
                className="field area mono"
                rows={2}
                value={logPathsText}
                onChange={(e) => {
                  setLogPathsText(e.target.value);
                  set((c) => ({ ...c, cleaner: { ...c.cleaner, logPaths: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } }));
                }}
              />
            </label>
            <p className="muted small" style={{ margin: '8px 0 0' }}>Office boy hanya menghitung ukuran (dry-run). Tidak ada file yang dihapus.</p>
          </section>

          <section className="panel card" aria-labelledby="h-sua">
            <h2 id="h-sua" className="card-title">Suasana kantor</h2>
            <label className="toggle">
              <input type="checkbox" checked={draft.ambience.animations} onChange={(e) => set((c) => ({ ...c, ambience: { ...c.ambience, animations: e.target.checked } }))} />
              <span>Animasi karakter (jalan, bermain, kamera)</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={draft.ambience.blockedSound} onChange={(e) => set((c) => ({ ...c, ambience: { ...c.ambience, blockedSound: e.target.checked } }))} />
              <span>Suara notifikasi saat agent terblokir</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={false} disabled />
              <span className="muted">Acara sosial saat sepi (rehat kopi, stand-up) · belum tersedia</span>
            </label>
          </section>
        </div>
      </div>

      <div className="save-bar">
        {error && <span role="alert" className="save-error">{error}</span>}
        <span role="status" className="save-status" style={{ color: dirty ? '#ffb48f' : '#7fe0a8' }}>
          {dirty ? 'Ada perubahan yang belum disimpan' : savedAt ? `Tersimpan pukul ${savedAt}` : 'Semua pengaturan tersimpan'}
        </span>
        <button type="button" className="btn btn-dark" disabled={!dirty || saving} onClick={reset}>Batalkan</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button>
      </div>
    </div>
  );
}

function GuestRow({ cwd, agents, onAssign }: { cwd: string; agents: Agent[]; onAssign: (id: string) => void }) {
  const [target, setTarget] = useState(agents.find((a) => !a.walker)?.id ?? '');
  return (
    <li className="guest-row">
      <span className="mono small guest-cwd" title={cwd}>{cwd}</span>
      <label><span className="sr-only">Agent untuk {cwd}</span>
        <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
          {agents.filter((a) => !a.walker).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <button type="button" className="btn btn-dark btn-sm" disabled={!target} onClick={() => onAssign(target)}>Tetapkan</button>
    </li>
  );
}
