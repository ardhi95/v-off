import type { AgentWithRuntime } from '../../src/shared/types.js';
import { FILTERS, filterCounts, type FilterKey } from './present.js';

export function FilterBar({ agents, value, onChange }: { agents: AgentWithRuntime[]; value: FilterKey; onChange: (f: FilterKey) => void }) {
  const counts = filterCounts(agents);
  return (
    <div className="filters" role="group" aria-label="Filter status">
      {FILTERS.map((f) => (
        <button key={f.key} type="button" className={`chip${value === f.key ? ' is-on' : ''}`} aria-pressed={value === f.key} onClick={() => onChange(f.key)}>
          <span className="dot" style={{ background: f.dot }} aria-hidden="true" />
          {f.label}
          <span className="mono chip-count">{counts[f.key]}</span>
        </button>
      ))}
    </div>
  );
}
