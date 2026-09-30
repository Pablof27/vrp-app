const W = 340;
const H = 190;
const M = { left: 48, right: 12, top: 12, bottom: 30 };

function ticks(min, max, count) {
  return Array.from({ length: count }, (_, k) => min + ((max - min) * k) / (count - 1));
}

export function ConvergenceChart({ history, iter, selected, onSelect }) {
  if (history.length === 0) {
    return <div className="chart-empty">No complete tour yet</div>;
  }

  const last = history[history.length - 1];
  const xMax = Math.max(iter, last.iter, 1);
  const lengths = history.map((h) => h.length);
  let yMin = Math.min(...lengths);
  let yMax = Math.max(...lengths);
  const pad = yMax - yMin > 1e-9 ? (yMax - yMin) * 0.08 : yMax * 0.05 || 1;
  yMin -= pad;
  yMax += pad;

  const x = (v) => M.left + (v / xMax) * (W - M.left - M.right);
  const y = (v) => M.top + ((yMax - v) / (yMax - yMin)) * (H - M.top - M.bottom);

  let d = `M${x(history[0].iter)},${y(history[0].length)}`;
  for (let k = 1; k < history.length; k++) d += `H${x(history[k].iter)}V${y(history[k].length)}`;
  d += `H${x(xMax)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart">
      {ticks(yMin, yMax, 4).map((v) => (
        <g key={`y${v}`}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className="grid" />
          <text x={M.left - 6} y={y(v)} className="tick" textAnchor="end" dominantBaseline="middle">{v.toFixed(2)}</text>
        </g>
      ))}
      {ticks(0, xMax, 5).map((v) => (
        <text key={`x${v}`} x={x(v)} y={H - M.bottom + 14} className="tick" textAnchor="middle">{Math.round(v)}</text>
      ))}
      <text x={(M.left + W - M.right) / 2} y={H - 3} className="axis-label" textAnchor="middle">ant tours</text>
      {history.filter((h) => h.changed).map((h) => (
        <line key={`c${h.iter}`} x1={x(h.iter)} x2={x(h.iter)} y1={M.top} y2={H - M.bottom} className="change" />
      ))}
      <path d={d} className="line" />
      {history.some((h) => h.changed) && (
        <text x={W - M.right} y={M.top + 8} className="axis-label change-label" textAnchor="end">┆ map edited</text>
      )}
      {selected !== null && history[selected] && (
        <line x1={x(history[selected].iter)} x2={x(history[selected].iter)} y1={M.top} y2={H - M.bottom} className="selected-marker" />
      )}
      {history.map((h, index) => (
        <g key={index} className="point" onClick={() => onSelect(index)}>
          <circle cx={x(h.iter)} cy={y(h.length)} r={7} className="hit" />
          <circle
            cx={x(h.iter)}
            cy={y(h.length)}
            r={index === selected ? 4.5 : 2.5}
            className={`dot${h.changed ? ' changed' : ''}${index === selected ? ' selected' : ''}`}
          />
          <title>{`tour ${h.iter}: ${h.length.toFixed(4)}${h.changed ? ' (map changed)' : ''} — click to view`}</title>
        </g>
      ))}
    </svg>
  );
}
