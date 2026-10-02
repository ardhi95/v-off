import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { AgentWithRuntime, Department } from '../../src/shared/types.js';
import { podsFrom, STATUS_STYLE, VIEWS } from './office/layout.js';
import { OfficeRenderer } from './office/renderer.js';
import { toSceneAgents } from './sceneAgents.js';

interface Props {
  agents: AgentWithRuntime[];
  departments: Department[];
  selected: string | null;
  onSelect: (id: string) => void;
  isDim?: (a: AgentWithRuntime) => boolean;
  cleanerAction: string;
  onCleanerAction: (text: string) => void;
}

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

/** 3D office canvas with name tags, room labels, and camera controls. */
export const OfficeStage = forwardRef<OfficeStageHandle, Props>(function OfficeStage(
  { agents, departments, selected, onSelect, isDim, cleanerAction, onCleanerAction },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: number } | null>(null);
  const [noGL, setNoGL] = useState(false);
  const [view, setView] = useState<string>('kantor');
  const [auto, setAuto] = useState(false);
  const onCleanerRef = useRef(onCleanerAction);
  onCleanerRef.current = onCleanerAction;
  const reduce = usePrefersReducedMotion();

  const pods = useMemo(() => podsFrom(departments), [departments]);
  const scene = useMemo(() => toSceneAgents(agents, departments, isDim), [agents, departments, isDim]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

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
    r.setAgents(sceneRef.current);
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
    rendererRef.current?.setAgents(scene);
  }, [scene]);

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
      cam()?.focus(p[0]!, p[2]!);
      setView('');
    },
  }), []);
  const goView = (key: string) => {
    const v = VIEWS[key];
    if (!v) return;
    cam()?.view(v);
    setView(key);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const c = cam();
    if (!c || e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, yaw: c.goal.yaw, pitch: c.goal.pitch, moved: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = dragRef.current, c = cam();
    if (!g || !c) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    g.moved = Math.max(g.moved, Math.abs(dx) + Math.abs(dy));
    if (g.moved < 4) return;
    c.orbitTo(g.yaw - dx * 0.006, g.pitch + dy * 0.005);
    rendererRef.current?.invalidate();
    if (view) setView('');
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = dragRef.current;
    dragRef.current = null;
    const canvas = canvasRef.current, r = rendererRef.current;
    if (g && g.moved < 4 && canvas && r) {
      const rc = canvas.getBoundingClientRect();
      const id = r.pickAt(e.clientX - rc.left, e.clientY - rc.top);
      if (id) onSelect(id);
    }
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const ceo = agents.find((a) => a.seat && 'room' in a.seat && a.seat.room === 'ceo');
  const cto = agents.find((a) => a.seat && 'room' in a.seat && a.seat.room === 'cto');
  const roomLabels = [
    { key: 'r:ceo', label: ceo ? `Ruang CEO · ${ceo.name}` : 'Ruang CEO' },
    { key: 'r:cto', label: cto ? `Ruang CTO · ${cto.name}` : 'Ruang CTO' },
    { key: 'r:tv', label: 'Papan Sprint' },
    { key: 'r:santai', label: 'Ruang Santai' },
  ];

  return (
    <div
      className="stage"
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => (dragRef.current = null)}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Tampilan 3D kantor: meja tiap tim, ruang CEO dan CTO berdinding kaca, pusat keamanan, ruang santai, dan agent sebagai karakter hewan"
      />
      {roomLabels.map((r) => (
        <span key={r.key} className="room-tag" data-k3d={r.key}>{r.label}</span>
      ))}
      {pods.map((p) => (
        <span key={p.id} className="room-tag dept" data-k3d={'d:' + p.id} style={{ '--c': p.c } as React.CSSProperties}>{p.label}</span>
      ))}
      {agents.filter((a) => !a.hidden).map((a) => {
        const st = STATUS_STYLE[a.runtime.status];
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
            <span className="tag-avatar" style={{ background: a.shirt }}>{a.name.charAt(0).toUpperCase()}</span>
            <span>{a.name}</span>
            <span className="tag-short">{a.short}</span>
            <span className={`tag-dot${a.runtime.status === 'macet' ? ' blink' : ''}`} style={{ background: st.fill }} />
            {a.walker && <span className="tag-extra">{cleanerAction}</span>}
          </button>
        );
      })}
      {noGL && <div className="stage-fallback">Browser ini tidak mendukung WebGL, jadi tampilan 3D tidak bisa ditampilkan.</div>}
      <div className="cam-bar" onPointerDown={stop}>
        {Object.entries(VIEWS).map(([key, v]) => (
          <button key={key} type="button" className={`cam${view === key ? ' is-on' : ''}`} aria-pressed={view === key} onClick={() => goView(key)}>
            {v.label}
          </button>
        ))}
        <span className="cam-sep" aria-hidden="true" />
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
      <span className="stage-hint">Seret untuk memutar · scroll untuk zoom · klik karakter untuk memilih</span>
    </div>
  );
});
