const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

function Slider({ label, hint, value, min, max, step, onChange, format = (v) => v }) {
  return (
    <label className="field">
      <span className="field-head">
        <span>{label}</span>
        <output>{format(value)}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function NumberField({ label, hint, value, min, max, step = 1, onChange, disabled }) {
  return (
    <label className="field">
      <span className="field-head">
        <span>{label}</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (!Number.isNaN(v)) onChange(clamp(v, min, max));
          }}
        />
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ParametersPanel({
  params, setParam, nodes, selected, onDemandChange, onDeleteSelected, onRandomMap, onClear, tau0, maxDemand,
}) {
  const selectedNode = selected !== null ? nodes[selected] : null;

  return (
    <aside className="panel">
      <section>
        <h3>Problem</h3>
        <NumberField
          label="Vehicle capacity"
          value={params.capacity}
          min={1}
          max={1000}
          onChange={(v) => setParam('capacity', v)}
          hint={maxDemand > params.capacity ? `A node needs ${maxDemand}: increase capacity or lower its demand.` : undefined}
        />
        <NumberField
          label="Demand for new nodes"
          value={params.newDemand}
          min={0}
          max={params.capacity}
          onChange={(v) => setParam('newDemand', v)}
        />
        <div className="selected-node">
          {selectedNode === null && <small>Click a node on the map to edit it.</small>}
          {selected === 0 && <small>Base selected — drag it or use the “Set base” tool to move it.</small>}
          {selected > 0 && selectedNode && (
            <>
              <NumberField
                label={`Node #${selected} demand`}
                value={selectedNode.demand}
                min={0}
                max={params.capacity}
                onChange={onDemandChange}
              />
              <button type="button" className="danger" onClick={onDeleteSelected}>Delete node #{selected}</button>
            </>
          )}
        </div>
      </section>

      <section>
        <h3>Random map</h3>
        <NumberField label="Customers" value={params.randomCount} min={1} max={200} onChange={(v) => setParam('randomCount', v)} />
        <div className="row">
          <NumberField label="Demand min" value={params.demandMin} min={0} max={params.capacity} onChange={(v) => setParam('demandMin', v)} />
          <NumberField label="max" value={params.demandMax} min={params.demandMin} max={params.capacity} onChange={(v) => setParam('demandMax', v)} />
        </div>
        <div className="row">
          <button type="button" onClick={onRandomMap}>Generate</button>
          <button type="button" onClick={onClear}>Clear</button>
        </div>
      </section>

      <section>
        <h3>Ant Colony System</h3>
        <Slider
          label="Ants per colony (m)"
          hint="Ants walking at once; global update every m tours."
          value={params.m}
          min={1}
          max={50}
          step={1}
          onChange={(v) => setParam('m', v)}
        />
        <Slider
          label="β (heuristic weight)"
          hint="Importance of 1/distance vs pheromone."
          value={params.beta}
          min={0}
          max={10}
          step={0.1}
          onChange={(v) => setParam('beta', v)}
          format={(v) => v.toFixed(1)}
        />
        <Slider
          label="q0 (exploitation)"
          hint="Probability of greedily picking the best arc."
          value={params.q0}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setParam('q0', v)}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="α (evaporation)"
          hint="Pheromone learning / evaporation rate."
          value={params.alpha}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => setParam('alpha', v)}
          format={(v) => v.toFixed(2)}
        />
        <label className="check">
          <input type="checkbox" checked={params.autoTau0} onChange={(e) => setParam('autoTau0', e.target.checked)} />
          Auto τ0 = 1 / (n · L<sub>nn</sub>)
        </label>
        <NumberField
          label="τ0 (initial pheromone)"
          value={params.autoTau0 ? Number(tau0?.toPrecision(3) ?? 0) : params.tau0}
          min={0}
          max={100}
          step="any"
          disabled={params.autoTau0}
          onChange={(v) => setParam('tau0', v)}
        />
        <small className="note">Changing capacity, τ0 or the nodes restarts the colony.</small>
      </section>

      <section>
        <h3>Simulation</h3>
        <Slider
          label="Ant speed"
          value={Math.log10(params.speed)}
          min={-1.3}
          max={1}
          step={0.01}
          onChange={(v) => setParam('speed', 10 ** v)}
          format={() => `${params.speed.toFixed(2)} u/s`}
        />
        <label className="check">
          <input type="checkbox" checked={params.fastMode} onChange={(e) => setParam('fastMode', e.target.checked)} />
          Fast mode (no animation)
        </label>
        {params.fastMode && (
          <Slider
            label="Tours per frame"
            value={params.toursPerFrame}
            min={1}
            max={500}
            step={1}
            onChange={(v) => setParam('toursPerFrame', v)}
          />
        )}
      </section>
    </aside>
  );
}
