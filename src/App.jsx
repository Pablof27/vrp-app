import { useMemo, useState } from 'react';
import { AntColony } from '../Model/AntColony.js';
import { useColonySimulation } from './hooks/useColonySimulation.js';
import { GRAY_GRADIENT_CSS, HEAT_GRADIENT_CSS, WORLD_HEIGHT, splitTrips } from './lib/draw.js';
import { withId } from './lib/nodes.js';
import { MapCanvas } from './components/MapCanvas.jsx';
import { ParametersPanel } from './components/ParametersPanel.jsx';
import { BestRouteMinimap } from './components/BestRouteMinimap.jsx';
import { ConvergenceChart } from './components/ConvergenceChart.jsx';
import { ProbabilityBars } from './components/ProbabilityBars.jsx';

const colony = new AntColony();

const DEFAULT_PARAMS = {
  capacity: 20,
  newDemand: 3,
  randomCount: 20,
  demandMin: 1,
  demandMax: 8,
  m: 10,
  beta: 2,
  q0: 0.9,
  alpha: 0.1,
  tau0: 0.01,
  autoTau0: true,
  speed: 0.6,
  fastMode: false,
  toursPerFrame: 20,
  pheromoneStyle: 'heat',
  showBestOverlay: false,
};

const TOOLS = [
  { id: 'add', label: 'Add / move' },
  { id: 'base', label: 'Set base' },
  { id: 'delete', label: 'Delete' },
];

const PHEROMONE_STYLES = [
  { id: 'gray', label: 'Grayscale + width' },
  { id: 'heat', label: 'Heatmap' },
  { id: 'heat-width', label: 'Heatmap + width' },
];

function randomMap(params) {
  return colony.newMap(params.randomCount + 1, params.capacity, { min: params.demandMin, max: params.demandMax }).nodes.map(withId);
}

export function App() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [nodes, setNodes] = useState(() => randomMap(DEFAULT_PARAMS));
  const [selected, setSelected] = useState(null);
  const [tool, setTool] = useState('add');

  const setParam = (key, value) => setParams((p) => ({ ...p, [key]: value }));

  const maxDemand = useMemo(() => Math.max(0, ...nodes.slice(1).map((n) => n.demand)), [nodes]);
  const canRun = nodes.length >= 2 && maxDemand <= params.capacity;

  const { simRef, snapshot, running, setRunning, reset, step, error } = useColonySimulation(nodes, params, canRun);

  const trips = snapshot ? splitTrips(snapshot.bestPath).length : 0;
  const hasBest = snapshot && Number.isFinite(snapshot.bestLength);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Ant Colony · VRP</h1>
        <div className="controls">
          <button type="button" className="primary" disabled={!canRun} onClick={() => setRunning(!running)}>
            {running ? 'Pause' : 'Play'}
          </button>
          <button type="button" disabled={!canRun || running} onClick={step}>
            {params.fastMode ? `+${params.toursPerFrame} tours` : 'Step'}
          </button>
          <button type="button" onClick={reset}>Reset</button>
        </div>
        <div className="stats">
          <span>Tours <b>{snapshot?.iter ?? 0}</b></span>
          <span>Global updates <b>{snapshot?.globalUpdates ?? 0}</b></span>
          <span>Best <b>{hasBest ? snapshot.bestLength.toFixed(3) : '—'}</b></span>
          <span>Vehicles <b>{hasBest ? trips : '—'}</b></span>
          <span>Customers <b>{nodes.length - 1}</b></span>
        </div>
      </header>

      {(error || !canRun) && (
        <div className="banner">
          {error ?? (nodes.length < 2
            ? 'Add at least one customer to start.'
            : `A node has demand ${maxDemand}, above the vehicle capacity (${params.capacity}).`)}
        </div>
      )}

      <main className="layout">
        <ParametersPanel
          params={params}
          setParam={setParam}
          nodes={nodes}
          selected={selected}
          maxDemand={maxDemand}
          tau0={snapshot?.tau0}
          onDemandChange={(v) => setNodes((prev) => prev.map((n, i) => (i === selected ? { ...n, demand: v } : n)))}
          onDeleteSelected={() => {
            setNodes((prev) => prev.filter((_, i) => i !== selected));
            setSelected(null);
          }}
          onRandomMap={() => {
            setNodes(randomMap(params));
            setSelected(null);
          }}
          onClear={() => {
            setNodes((prev) => [prev[0] ?? withId({ x: 0.5, y: WORLD_HEIGHT / 2, demand: 0 })]);
            setSelected(null);
          }}
        />

        <section className="map-area">
          <div className="toolbar">
            <div className="segmented">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" className={tool === t.id ? 'active' : ''} onClick={() => setTool(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="segmented">
              {PHEROMONE_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={params.pheromoneStyle === s.id ? 'active' : ''}
                  onClick={() => setParam('pheromoneStyle', s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={params.showBestOverlay}
                onChange={(e) => setParam('showBestOverlay', e.target.checked)}
              />
              Overlay best route
            </label>
          </div>

          <div className="map-wrap">
            <MapCanvas
              simRef={simRef}
              nodes={nodes}
              onNodesChange={setNodes}
              selected={selected}
              onSelect={setSelected}
              tool={tool}
              newDemand={params.newDemand}
              pheromoneStyle={params.pheromoneStyle}
              showBestOverlay={params.showBestOverlay}
            />
          </div>

          <div className="map-footer">
            <small>Click to add a customer · drag to move · right-click to delete · number = demand</small>
            <div className="pheromone-legend">
              <span>τ {snapshot && Number.isFinite(snapshot.range.min) ? snapshot.range.min.toExponential(2) : '—'}</span>
              <span
                className="gradient"
                style={{ background: params.pheromoneStyle === 'gray' ? GRAY_GRADIENT_CSS : HEAT_GRADIENT_CSS }}
              />
              <span>{snapshot && Number.isFinite(snapshot.range.max) ? snapshot.range.max.toExponential(2) : '—'}</span>
            </div>
          </div>
        </section>

        <aside className="panel side">
          <section>
            <h3>Best route</h3>
            <BestRouteMinimap nodes={snapshot?.nodes} bestPath={snapshot?.bestPath ?? []} bestLength={snapshot?.bestLength ?? Infinity} />
          </section>
          <section>
            <h3>Best length evolution</h3>
            <ConvergenceChart history={snapshot?.history ?? []} iter={snapshot?.iter ?? 0} />
          </section>
          <section>
            <h3>Next-node probability</h3>
            <ProbabilityBars
              decision={snapshot?.decision}
              activeAnt={snapshot?.activeAnt}
              fastMode={params.fastMode}
            />
          </section>
        </aside>
      </main>
    </div>
  );
}
