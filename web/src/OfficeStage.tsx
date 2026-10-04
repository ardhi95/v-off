import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { AgentWithRuntime, Department, LimitState } from '../../src/shared/types.js';
import { pickQuip } from './office/behavior.js';
import { allViews, DESK_VIEW_PREFIX, podsFrom, SLEEP_STYLE, STATUS_STYLE, VIEWS, type Bed, type PlaySpot } from './office/layout.js';
import { OfficeRenderer } from './office/renderer.js';
import { inkOn, officeOffText } from './present.js';
import { toSceneAgents } from './sceneAgents.js';

interface Props {
  agents: AgentWithRuntime[];
  departments: Department[];
  selected: string | null;
  onSelect: (id: string) => void;
  isDim?: (a: AgentWithRuntime) => boolean;
  cleanerAction: string;
  onCleanerAction: (text: string) => void;
  /** Sticky play-spot assignment for idle agents (App owns it so the panel agrees). */
  spots: Map<string, PlaySpot>;
  /** Office boy stops from the cache scan: OB_PATH index -> label. */
  cleanerStops: Map<number, string>;
  /** Ambience setting; false behaves like prefers-reduced-motion. */
  animations: boolean;
  /** Dorm beds while the office is off (usage limit), else empty. */
  beds: ReadonlyMap<string, Bed>;
  limit: LimitState | null;
  onOpenOffice: () => void;
}

const QUIP_EVERY_MS = 3600;
const QUIP_SHOW_MS = 2800;

export interface OfficeStageHandle {
  /** Move the camera close to an agent ("Arahkan kamera"). */
  focus(id: string): void;
}

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

interface Drag {
  x: number;
  y: number;
  /** Last pointer position, for incremental panning. */
  lx: number;
  ly: number;
  yaw: number;
  pitch: number;
  moved: number;
  pan: boolean;
  pinch?: { mid: [number, number]; dist: number };
}

/** 3D office canvas with name tags, room labels, and camera controls. */
export const OfficeStage = forwardRef<OfficeStageHandle, Props>(function OfficeStage(
  { agents, departments, selected, onSelect, isDim, cleanerAction, onCleanerAction, spots, cleanerStops, animations, beds, limit, onOpenOffice },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);
  const dragRef = useRef<Drag | null>(null);
  /** Pointers currently down on the stage (two fingers = pan + pinch zoom). */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const [panMode, setPanMode] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [view, setView] = useState<string>('kantor');
  const [auto, setAuto] = useState(false);
  const onCleanerRef = useRef(onCleanerAction);
  onCleanerRef.current = onCleanerAction;
  const reduce = usePrefersReducedMotion() || !animations;
  const [quip, setQuip] = useState<{ id: string; text: string } | null>(null);

  // Keyed by content: every /api/state reload brings a new departments array, and
  // a new pods identity would recreate the renderer (and reset the camera).
  const podsKey = JSON.stringify(podsFrom(departments));
  const pods = useMemo(() => JSON.parse(podsKey) as ReturnType<typeof podsFrom>, [podsKey]);
  const scene = useMemo(() => toSceneAgents(agents, departments, isDim), [agents, departments, isDim]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const spotsRef = useRef(spots);
  spotsRef.current = spots;
  const bedsRef = useRef(beds);
  bedsRef.current = beds;
  const stopsRef = useRef(cleanerStops);
  stopsRef.current = cleanerStops;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // (Re)create the renderer when the floor plan or motion preference changes.
  useEffect(() => {
    const canvas = canvasRef.current, stage = stageRef.current;
    if (!canvas || !stage) return;
    let r: OfficeRenderer;
    try {
      r = new OfficeRenderer(canvas, pods, { reduceMotion: reduce, onCleanerAction: (s) => onCleanerRef.current(s) });
    } catch {
      setNoGL(true);
      return;
    }
    setNoGL(false);
    r.setAgents(sceneRef.current, spotsRef.current, bedsRef.current);
    r.setCleanerStops(stopsRef.current);
    r.start(stage);
    rendererRef.current = r;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      r.camera.zoom(e.deltaY > 0 ? 1.1 : 0.9);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      stage.removeEventListener('wheel', onWheel);
      r.destroy();
      rendererRef.current = null;
    };
  }, [pods, reduce]);

  useEffect(() => {
    rendererRef.current?.setAgents(scene, spots, beds);
  }, [scene, spots, beds]);

  // Office just went off: look at the dorm while everyone walks to bed.
  const offSince = limit?.since;
  useEffect(() => {
    if (offSince === undefined || reduce) return;
    const v = VIEWS.asrama;
    if (v) {
      rendererRef.current?.camera.view(v);
      setView('asrama');
    }
  }, [offSince, reduce]);

  useEffect(() => {
    rendererRef.current?.setCleanerStops(cleanerStops);
  }, [cleanerStops]);

  // Speech bubbles: every 3.6 s a random visible agent says something for 2.8 s.
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    let current: string | null = null;
    const tick = setInterval(() => {
      // Sleepers only snore.
      const q = pickQuip(sceneRef.current, (id) => (bedsRef.current.has(id) ? ['Zzz…'] : agentsRef.current.find((a) => a.id === id)?.quips), spotsRef.current, current);
      if (!q) return;
      current = q.id;
      setQuip(q);
      clearTimeout(hide);
      hide = setTimeout(() => {
        current = null;
        setQuip(null);
      }, QUIP_SHOW_MS);
    }, QUIP_EVERY_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(hide);
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setSelected(selected);
  }, [selected]);

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.auto = auto && !reduce;
  }, [auto, reduce]);

  // Labels are positioned by the renderer; re-place them after React re-renders.
  useEffect(() => {
    rendererRef.current?.invalidate();
  });

  const cam = () => rendererRef.current?.camera;
  useImperativeHandle(ref, () => ({
    focus(id: string) {
      const p = rendererRef.current?.anchor('h:' + id);
      if (!p) return;
      const bed = bedsRef.current.get(id);
      // Asleep: look down into the bedroom from the corridor side, over the low walls.
      if (bed) cam()?.view({ label: '', tx: p[0]!, ty: 50, tz: p[2]!, yaw: bed.dir === 1 ? -1.2 : 1.2, pitch: 0.82, dist: 620 });
      else cam()?.focus(p[0]!, p[2]!);
      setView('');
    },
  }), []);
  const views = useMemo(() => allViews(pods), [pods]);
  const deskPicked = view === 'tim' || view.startsWith(DESK_VIEW_PREFIX);
  const goView = (key: string) => {
    const v = views[key];
    if (!v) return;
    cam()?.view(v);
    setView(key);
  };

  // Drag: left = rotate, right/middle or Shift = pan (swapped by the "Geser" toggle).
  // Touch: one finger rotates, two fingers pan and pinch to zoom. Pointer capture keeps
  // the drag alive when the pointer leaves the canvas.
  const twoFinger = () => {
    const [a, b] = [...pointersRef.current.values()];
    return { mid: [(a!.x + b!.x) / 2, (a!.y + b!.y) / 2] as [number, number], dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
  };
  const startDrag = (x: number, y: number, pan: boolean, moved = 0) => {
    const c = cam();
    if (c) dragRef.current = { x, y, lx: x, ly: y, yaw: c.goal.yaw, pitch: c.goal.pitch, moved, pan };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!cam() || e.button > 2) return;
    if (e.button === 1) e.preventDefault(); // no autoscroll on middle-drag
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const pts = pointersRef.current;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      // Second finger: switch to pan + pinch; never a click.
      if (dragRef.current) dragRef.current = { ...dragRef.current, moved: 99, pinch: twoFinger() };
      return;
    }
    const modifier = e.shiftKey || e.metaKey || e.ctrlKey;
    startDrag(e.clientX, e.clientY, e.button !== 0 || panMode !== modifier);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = dragRef.current, c = cam(), pts = pointersRef.current;
    if (!g || !c || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const h = stageRef.current?.clientHeight ?? 600;
    if (g.pinch && pts.size >= 2) {
      const now = twoFinger();
      c.panBy(now.mid[0] - g.pinch.mid[0], now.mid[1] - g.pinch.mid[1], h);
      if (g.pinch.dist > 0 && now.dist > 0) c.zoom(g.pinch.dist / now.dist);
      g.pinch = now;
    } else {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      g.moved = Math.max(g.moved, Math.abs(dx) + Math.abs(dy));
      if (g.moved < 4) return;
      if (g.pan) c.panBy(e.clientX - g.lx, e.clientY - g.ly, h);
      else c.orbitTo(g.yaw - dx * 0.006, g.pitch + dy * 0.005);
      g.lx = e.clientX;
      g.ly = e.clientY;
    }
    rendererRef.current?.invalidate();
    if (view) setView('');
  };
  const endPointer = (e: React.PointerEvent, click: boolean) => {
    const pts = pointersRef.current;
    if (!pts.delete(e.pointerId)) return;
    const g = dragRef.current;
    if (pts.size === 1) {
      // One finger left after a pinch: keep rotating from there, without a click at the end.
      const [p] = [...pts.values()];
      startDrag(p!.x, p!.y, false, 99);
      return;
    }
    if (pts.size > 1) return;
    dragRef.current = null;
    const canvas = canvasRef.current, r = rendererRef.current;
    if (click && g && !g.pan && g.moved < 4 && canvas && r) {
      const rc = canvas.getBoundingClientRect();
      const id = r.pickAt(e.clientX - rc.left, e.clientY - rc.top);
      if (id) onSelect(id);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => endPointer(e, e.button === 0);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const ceo = agents.find((a) => a.seat && 'room' in a.seat && a.seat.room === 'ceo');
  const cto = agents.find((a) => a.seat && 'room' in a.seat && a.seat.room === 'cto');
  const roomLabels = [
    { key: 'r:ceo', label: ceo ? `Ruang CEO · ${ceo.name}` : 'Ruang CEO' },
    { key: 'r:cto', label: cto ? `Ruang CTO · ${cto.name}` : 'Ruang CTO' },
    { key: 'r:tv', label: 'Papan Sprint' },
    { key: 'r:santai', label: 'Ruang Santai' },
    { key: 'r:asrama', label: limit ? 'Asrama · kantor off' : 'Asrama' },
  ];

  return (
    <div
      className="stage"
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => endPointer(e, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Tampilan 3D kantor: meja tiap tim, ruang CEO dan CTO berdinding kaca, pusat keamanan, ruang santai, dan agent sebagai karakter hewan"
      />
      {roomLabels.map((r) => (
        <span key={r.key} className="room-tag" data-k3d={r.key}>{r.label}</span>
      ))}
      {agents.filter((a) => !a.hidden).map((a) => {
        const asleep = beds.has(a.id);
        const st = asleep ? SLEEP_STYLE : STATUS_STYLE[a.runtime.status];
        const sel = selected === a.id;
        const dim = isDim?.(a) ?? false;
        return (
          <button
            key={a.id}
            type="button"
            className={`tag${sel ? ' is-sel' : ''}${dim ? ' is-dim' : ''}`}
            data-k3d={'p:' + a.id}
            onClick={() => onSelect(a.id)}
            onPointerDown={stop}
            aria-pressed={sel}
            aria-label={`${a.name}, ${a.role}, ${st.label}`}
          >
            <span className="tag-avatar" style={{ background: a.shirt, color: inkOn(a.shirt) }}>{a.name.charAt(0).toUpperCase()}</span>
            <span className="tag-short">{a.short}</span>
            <span className={`tag-dot${a.runtime.status === 'macet' && !asleep ? ' blink' : ''}`} style={{ background: st.fill }} />
            {asleep ? <span className="tag-extra tag-zzz">Zzz</span> : a.walker && <span className="tag-extra">{cleanerAction}</span>}
            {quip?.id === a.id && !dim && <span className="quip" aria-hidden="true">{quip.text}</span>}
          </button>
        );
      })}
      {limit && (
        <div className="office-off" role="status" onPointerDown={stop}>
          <span className="office-off-dot" aria-hidden="true" />
          <span>{officeOffText(limit)}</span>
          <button type="button" className="cam" onClick={onOpenOffice}>Buka kantor</button>
        </div>
      )}
      {noGL && <div className="stage-fallback">Browser ini tidak mendukung WebGL, jadi tampilan 3D tidak bisa ditampilkan.</div>}
      <div className="cam-bar" onPointerDown={stop}>
        {Object.entries(VIEWS).map(([key, v]) => key === 'tim' ? (
          // Spotlight any team desk; "Semua meja tim" is the old single preset.
          <label key={key} className="cam-pick">
            <span className="sr-only">Sorot meja tim</span>
            <select
              className={`cam${deskPicked ? ' is-on' : ''}`}
              value={deskPicked ? view : ''}
              onChange={(e) => goView(e.target.value)}
            >
              <option value="" disabled hidden>{v.label}</option>
              <option value="tim">Semua meja tim</option>
              {pods.map((p) => <option key={p.id} value={DESK_VIEW_PREFIX + p.id}>{p.label}</option>)}
            </select>
          </label>
        ) : (
          <button key={key} type="button" className={`cam${view === key ? ' is-on' : ''}`} aria-pressed={view === key} onClick={() => goView(key)}>
            {v.label}
          </button>
        ))}
        <span className="cam-sep" aria-hidden="true" />
        <button
          type="button"
          className={`cam${panMode ? ' is-on' : ''}`}
          aria-pressed={panMode}
          title="Seret kiri untuk menggeser denah (Shift untuk memutar)"
          onClick={() => setPanMode(!panMode)}
        >
          Geser
        </button>
        <button type="button" className="cam" aria-label="Putar ke kiri" onClick={() => { cam()?.rotate(-0.5); setView(''); }}>↺</button>
        <button type="button" className="cam" aria-label="Putar ke kanan" onClick={() => { cam()?.rotate(0.5); setView(''); }}>↻</button>
        <button type="button" className="cam" aria-label="Perbesar" onClick={() => cam()?.zoom(0.82)}>+</button>
        <button type="button" className="cam" aria-label="Perkecil" onClick={() => cam()?.zoom(1.2)}>−</button>
        <button
          type="button"
          className={`cam${auto && !reduce ? ' is-on' : ''}`}
          aria-pressed={auto && !reduce}
          disabled={reduce}
          title={reduce ? 'Dimatikan karena preferensi kurangi gerakan' : undefined}
          onClick={() => { setAuto(!auto); setView(''); }}
        >
          Putar otomatis
        </button>
      </div>
      <span className="stage-hint">
        {panMode ? 'Seret untuk menggeser · Shift+seret untuk memutar' : 'Seret untuk memutar · seret kanan/Shift untuk menggeser'} · scroll untuk zoom · klik karakter untuk memilih
      </span>
    </div>
  );
});
