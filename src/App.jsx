import { useMemo, useState } from 'react';
import { AntColony } from '../Model/AntColony.js';
import { useColonySimulation } from './hooks/useColonySimulation.js';
import { GRAY_GRADIENT_CSS, HEAT_GRADIENT_CSS, TOP_PHEROMONE_PAIRS, WORLD_HEIGHT, splitTrips } from './lib/draw.js';
import { withId } from './lib/nodes.js';
import { MapCanvas } from './components/MapCanvas.jsx';
import { ParametersPanel } from './components/ParametersPanel.jsx';
import { BestRouteMinimap } from './components/BestRouteMinimap.jsx';
import { ConvergenceChart } from './components/ConvergenceChart.jsx';
import { ProbabilityBars } from './components/ProbabilityBars.jsx';
import { BestHistoryNavigator } from './components/BestHistoryNavigator.jsx';

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
  pheromoneStyle: 'gray',
  showBestOverlay: false,
  showAntTrace: true,
  mapView: 'pheromones',
};

const MAP_VIEWS = [
  { id: 'pheromones', label: 'Pheromones' },
  { id: 'best', label: 'Best path' },
];

const TOOLS = [
  { id: 'add', label: 'Add / move' },
  { id: 'base', label: 'Set base' },
  { id: 'delete', label: 'Delete' },
];

const PHEROMONE_STYLES = [
  { id: 'gray', label: 'Light gray' },
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
  const [selectedBest, setSelectedBest] = useState(null);

  const setParam = (key, value) => setParams((p) => ({ ...p, [key]: value }));
  // Past routes belong to the map they were found on, so any edit returns to the live route.
  const editNodes = (update) => {
    setSelectedBest(null);
    setNodes(update);
  };

  const maxDemand = useMemo(() => Math.max(0, ...nodes.slice(1).map((n) => n.demand)), [nodes]);
  const canRun = nodes.length >= 2 && maxDemand <= params.capacity;

  const { simRef, snapshot, running, setRunning, reset, step, error } = useColonySimulation(nodes, params, canRun);

  const trips = snapshot ? splitTrips(snapshot.bestPath).length : 0;
  const hasBest = snapshot && Number.isFinite(snapshot.bestLength);

  const history = snapshot?.history ?? [];
  const selectedIndex = selectedBest !== null && selectedBest < history.length ? selectedBest : null;
  const bestEntry = selectedIndex !== null ? history[selectedIndex] : null;
  const shownBest = bestEntry ?? {
    nodes: snapshot?.nodes,
    path: snapshot?.bestPath ?? [],
    length: snapshot?.bestLength ?? Infinity,
  };
  const shownTrips = splitTrips(shownBest.path).length;

  const selectBest = (index) => {
    setSelectedBest(index);
    if (index !== null) setParam('mapView', 'best');
  };

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
          <button
            type="button"
            onClick={() => {
              setSelectedBest(null);
              reset();
            }}
          >
            Reset
          </button>
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
          onDemandChange={(v) => editNodes((prev) => prev.map((n, i) => (i === selected ? { ...n, demand: v } : n)))}
          onDeleteSelected={() => {
            editNodes((prev) => prev.filter((_, i) => i !== selected));
            setSelected(null);
          }}
          onRandomMap={() => {
            editNodes(randomMap(params));
            setSelected(null);
          }}
          onClear={() => {
            editNodes((prev) => [prev[0] ?? withId({ x: 0.5, y: WORLD_HEIGHT / 2, demand: 0 })]);
            setSelected(null);
          }}
        />

        <section className="map-area">
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Map view">
              {MAP_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={params.mapView === v.id}
                  className={params.mapView === v.id ? 'active' : ''}
                  onClick={() => setParam('mapView', v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="segmented">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" className={tool === t.id ? 'active' : ''} onClick={() => setTool(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            {params.mapView === 'pheromones' && (
              <>
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
                    checked={params.showAntTrace}
                    onChange={(e) => setParam('showAntTrace', e.target.checked)}
                  />
                  Trace current ant
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={params.showBestOverlay}
                    onChange={(e) => setParam('showBestOverlay', e.target.checked)}
                  />
                  Overlay best route
                </label>
              </>
            )}
          </div>

          <div className="map-wrap">
            <MapCanvas
              simRef={simRef}
              nodes={nodes}
              onNodesChange={editNodes}
              selected={selected}
              onSelect={setSelected}
              tool={tool}
              newDemand={params.newDemand}
              pheromoneStyle={params.pheromoneStyle}
              showBestOverlay={params.showBestOverlay}
              showAntTrace={params.showAntTrace}
              view={params.mapView}
              bestEntry={bestEntry}
            />
          </div>

          <div className="map-footer">
            <small>Click to add a customer · drag to move · right-click to delete · number = demand</small>
            {params.mapView === 'pheromones' ? (
              <div className="pheromone-legend">
                <span>Top {Math.min(TOP_PHEROMONE_PAIRS, nodes.length * (nodes.length - 1) / 2)}</span>
                <span>τ {snapshot && Number.isFinite(snapshot.range.min) ? snapshot.range.min.toExponential(2) : '—'}</span>
                <span
                  className="gradient"
                  style={{ background: params.pheromoneStyle === 'gray' ? GRAY_GRADIENT_CSS : HEAT_GRADIENT_CSS }}
                />
                <span>{snapshot && Number.isFinite(snapshot.range.max) ? snapshot.range.max.toExponential(2) : '—'}</span>
              </div>
            ) : (
              <div className="pheromone-legend">
                <span>
                  {bestEntry ? `Best ${selectedIndex + 1} of ${history.length} · tour ${bestEntry.iter}` : 'Latest best'}
                </span>
                <span>
                  {Number.isFinite(shownBest.length)
                    ? `${shownBest.length.toFixed(3)} · ${shownTrips} vehicle${shownTrips === 1 ? '' : 's'}`
                    : 'no route yet'}
                </span>
              </div>
            )}
          </div>
        </section>

        <aside className="panel side">
          <section>
            <h3>{bestEntry ? 'Previous best route' : 'Best route'}</h3>
            <BestRouteMinimap nodes={shownBest.nodes} bestPath={shownBest.path} bestLength={shownBest.length} />
            <BestHistoryNavigator history={history} selected={selectedIndex} onSelect={selectBest} />
          </section>
          <section>
            <h3>Best length evolution</h3>
            <ConvergenceChart
              history={history}
              iter={snapshot?.iter ?? 0}
              selected={selectedIndex}
              onSelect={selectBest}
            />
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
