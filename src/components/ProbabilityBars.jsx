const MAX_ROWS = 12;

const nodeLabel = (i) => (i === 0 ? 'Base' : `#${i}`);

export function ProbabilityBars({ decision, activeAnt, fastMode }) {
  return (
    <div className="prob">
      <div className="prob-header">
        <span>Ant <b>{activeAnt ?? '-'}</b></span>
        <span className="legend">
          <i className="swatch exploit" /> exploit (q0)
          <i className="swatch explore" /> explore
        </span>
      </div>
      <DecisionBody decision={decision} fastMode={fastMode} />
    </div>
  );
}

function DecisionBody({ decision, fastMode }) {
  if (fastMode) return <p className="muted">Individual ant decisions are not shown in fast mode.</p>;
  if (!decision) return <p className="muted">Press play or step to see the next-node probabilities.</p>;
  if (decision.kind === 'finish') return <p className="muted">All customers served — returning to the base.</p>;
  if (decision.kind === 'abort') return <p className="muted">Tour is already longer than the best one — aborting to the base.</p>;

  const rows = decision.rows
    .map((r) => ({ ...r, total: r.exploit + r.explore }))
    .sort((a, b) => b.total - a.total);
  const shown = rows.slice(0, MAX_ROWS);
  const hidden = rows.slice(MAX_ROWS);
  const scale = rows[0]?.total || 1;

  return (
    <>
      <p className="prob-caption">
        At <b>{nodeLabel(decision.from)}</b> with load left <b>{decision.capacity}</b>: picked{' '}
        <b>{nodeLabel(decision.chosen)}</b> by {decision.exploited ? 'exploitation (q < q0)' : 'roulette wheel'}
        {decision.kind === 'reload' && <span className="warn"> — doesn&apos;t fit, back to base</span>}
      </p>
      {shown.map((r) => (
        <div
          key={r.node}
          className={`prob-row${r.node === decision.chosen ? ' chosen' : ''}${r.fits ? '' : ' nofit'}`}
          title={r.fits ? undefined : 'Demand exceeds the remaining load: choosing it sends the ant back to the base'}
        >
          <span className="prob-label">{nodeLabel(r.node)} <small>d{r.demand}</small></span>
          <span className="prob-track">
            <span className="seg exploit" style={{ width: `${(r.exploit / scale) * 100}%` }} />
            <span className="seg explore" style={{ width: `${(r.explore / scale) * 100}%` }} />
          </span>
          <span className="prob-value">{(r.total * 100).toFixed(1)}%</span>
        </div>
      ))}
      {hidden.length > 0 && (
        <p className="muted">
          +{hidden.length} more ({(hidden.reduce((s, r) => s + r.total, 0) * 100).toFixed(1)}%)
        </p>
      )}
    </>
  );
}
