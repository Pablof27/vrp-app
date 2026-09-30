export function BestHistoryNavigator({ history, selected, onSelect }) {
  if (history.length === 0) return null;
  const last = history.length - 1;
  const index = selected ?? last;
  const entry = history[index];

  return (
    <div className="history-nav">
      <div className="history-controls">
        <button type="button" aria-label="Previous best route" disabled={index === 0} onClick={() => onSelect(index - 1)}>‹</button>
        <input
          type="range"
          aria-label="Best route history"
          min={0}
          max={last}
          step={1}
          value={index}
          disabled={last === 0}
          onChange={(e) => onSelect(Number(e.target.value))}
        />
        <button type="button" aria-label="Next best route" disabled={index === last} onClick={() => onSelect(index + 1)}>›</button>
        <button type="button" className={selected === null ? 'active' : ''} disabled={selected === null} onClick={() => onSelect(null)}>
          Live
        </button>
      </div>
      <small>
        {selected === null ? 'Latest' : `Best ${index + 1} of ${history.length}`} · tour {entry.iter}
        {entry.changed && <span className="history-edited"> · after map edit</span>}
      </small>
    </div>
  );
}
