import type { AgentEvent, AgentWithRuntime, Department } from '../../src/shared/types.js';
import { feedLine, formatTime } from './present.js';

const FEED_SIZE = 10;

export function ActivityFeed({ events, agents, departments, onSelect }: {
  events: AgentEvent[];
  agents: AgentWithRuntime[];
  departments: Department[];
  onSelect: (id: string) => void;
}) {
  const visible = agents.filter((a) => !a.hidden).length;
  const desks = departments.filter((d) => d.desk).length;
  return (
    <div className="panel feed">
      <div className="feed-head">
        <h2>Aktivitas terbaru</h2>
        <span className="muted">{visible} agent · {desks} meja tim, 2 ruangan pribadi · yang idle boleh main di ruang santai</span>
      </div>
      {events.length === 0 ? (
        <p className="muted">Belum ada aktivitas. Jalankan Claude Code dengan hooks v-off, atau tunggu transkrip terbaca.</p>
      ) : (
        <ul aria-live="polite">
          {events.slice(0, FEED_SIZE).map((ev, i) => {
            const line = feedLine(ev, agents, departments);
            return (
              <li key={`${ev.ts}-${ev.agentId}-${i}`}>
                <span className="mono muted">{formatTime(ev.ts)}</span>
                <span className="dot" style={{ background: line.dot }} aria-hidden="true" />
                <span>
                  <button type="button" className="link-btn" onClick={() => onSelect(ev.agentId)}>{line.who}</button>{' '}
                  <span className="feed-what">{line.what}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
