import { useCallback, useEffect, useRef, useState } from 'react';
import { AntColony } from '../../Model/AntColony.js';
import { pheromoneRange } from '../lib/draw.js';

const colony = new AntColony();
const MAX_HOPS_PER_FRAME = 1000;
const PUBLISH_INTERVAL_MS = 100;

// Capacity-aware nearest-neighbour tour, used for the classic ACS τ0 = 1 / (n · L_nn).
function nearestNeighborLength(vrp) {
  const remaining = new Set(vrp.nodes.map((_, i) => i).filter((i) => i !== 0));
  let at = 0;
  let load = vrp.capacity;
  let length = 0;
  while (remaining.size > 0) {
    let best = -1;
    let bestDistance = Infinity;
    for (const j of remaining) {
      if (vrp.nodes[j].demand <= load && vrp.distances[at][j] < bestDistance) {
        best = j;
        bestDistance = vrp.distances[at][j];
      }
    }
    if (best === -1) {
      if (at === 0) break;
      length += vrp.distances[at][0];
      at = 0;
      load = vrp.capacity;
      continue;
    }
    length += bestDistance;
    load -= vrp.nodes[best].demand;
    at = best;
    remaining.delete(best);
  }
  return length + vrp.distances[at][0];
}

function createSimulation(nodes, params) {
  const vrp = colony.buildVrp(nodes, params.capacity);
  let tau0 = params.tau0;
  if (params.autoTau0) {
    const lnn = nearestNeighborLength(vrp);
    tau0 = lnn > 0 ? 1 / (nodes.length * lnn) : 1;
  }
  return {
    vrp,
    tau0,
    pheromones: colony.resetPheromones({ n: nodes.length, tau0 }),
    bestPath: { path: [], length: Infinity },
    iter: 0,
    ants: [],
    history: [],
    version: 0,
  };
}

function modelParams(sim, params) {
  return {
    n: sim.vrp.nodes.length,
    m: params.m,
    beta: params.beta,
    q0: params.q0,
    alpha: params.alpha,
    tau0: sim.tau0,
  };
}

function newAnt(sim) {
  return { state: colony.createAnt(sim.vrp), from: 0, to: 0, progress: 0, edgeLength: 0, decision: null };
}

function syncAnts(sim, m) {
  while (sim.ants.length < m) sim.ants.push(newAnt(sim));
  if (sim.ants.length > m) sim.ants.length = m;
}

function recordImprovement(sim, before) {
  if (sim.bestPath.length < before) sim.history.push({ iter: sim.iter, length: sim.bestPath.length });
}

// Called when an ant reaches the node it was heading to: finish the tour if needed, then decide the next arc.
function arrive(sim, ant, mp) {
  if (ant.state.done) {
    const before = sim.bestPath.length;
    const { pheromones } = colony.finishAnt(ant.state, mp, sim.pheromones, sim.bestPath, sim.iter);
    sim.pheromones = pheromones;
    sim.iter++;
    recordImprovement(sim, before);
    ant.state = colony.createAnt(sim.vrp);
  }
  const capacity = ant.state.capacity;
  const decision = colony.step(sim.vrp, mp, sim.pheromones, ant.state, sim.bestPath.length);
  ant.decision = { ...decision, capacity, q0: mp.q0 };
  ant.from = decision.from;
  ant.to = decision.next;
  ant.progress = 0;
  ant.edgeLength = sim.vrp.distances[decision.from][decision.next];
}

function advanceAnimated(sim, params, dt) {
  const mp = modelParams(sim, params);
  syncAnts(sim, params.m);
  const budget = params.speed * dt;
  for (const ant of sim.ants) {
    let travel = budget;
    for (let hops = 0; hops < MAX_HOPS_PER_FRAME; hops++) {
      const remaining = ant.edgeLength - ant.progress;
      if (travel < remaining) {
        ant.progress += travel;
        break;
      }
      travel -= remaining;
      arrive(sim, ant, mp);
    }
  }
  sim.version++;
}

function hopAll(sim, params) {
  const mp = modelParams(sim, params);
  syncAnts(sim, params.m);
  for (const ant of sim.ants) arrive(sim, ant, mp);
  sim.version++;
}

function advanceFast(sim, params, tours) {
  const mp = modelParams(sim, params);
  sim.ants = [];
  for (let k = 0; k < tours; k++) {
    const before = sim.bestPath.length;
    const result = colony.advance(sim.vrp, mp, sim.pheromones, sim.bestPath, sim.iter);
    sim.pheromones = result.pheromones;
    sim.iter++;
    recordImprovement(sim, before);
  }
  sim.version++;
}

function describeDecision(sim, decision) {
  if (!decision) return null;
  const probabilities = colony.selectionProbabilities(decision.scores, decision.q0);
  return {
    kind: decision.kind,
    from: decision.from,
    chosen: decision.chosen,
    exploited: decision.exploited,
    capacity: decision.capacity,
    rows: decision.candidates.map((node, i) => {
      const demand = sim.vrp.nodes[node].demand;
      return { node, demand, fits: demand <= decision.capacity, ...probabilities[i] };
    }),
  };
}

export function useColonySimulation(nodes, params, trackedAnt, canRun) {
  const simRef = useRef(null);
  const paramsRef = useRef(params);
  const trackedRef = useRef(trackedAnt);
  paramsRef.current = params;
  trackedRef.current = trackedAnt;

  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  const publish = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    setSnapshot({
      iter: sim.iter,
      bestLength: sim.bestPath.length,
      bestPath: sim.bestPath.path.slice(),
      history: sim.history.slice(),
      nodes: sim.vrp.nodes,
      tau0: sim.tau0,
      range: pheromoneRange(sim.pheromones),
      decision: describeDecision(sim, sim.ants[trackedRef.current]?.decision),
    });
  }, []);

  const guarded = useCallback((fn) => {
    try {
      fn();
      return true;
    } catch (e) {
      setError(e.message);
      setRunning(false);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    simRef.current = createSimulation(nodes, paramsRef.current);
    setError(null);
    publish();
  }, [nodes, publish]);

  useEffect(reset, [reset, params.capacity, params.tau0, params.autoTau0]);

  useEffect(publish, [trackedAnt, publish]);

  useEffect(() => {
    if (!canRun) setRunning(false);
  }, [canRun]);

  useEffect(() => {
    if (!running) return undefined;
    let frame;
    let last = performance.now();
    let lastPublish = 0;
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const p = paramsRef.current;
      const ok = guarded(() => {
        if (p.fastMode) advanceFast(simRef.current, p, p.toursPerFrame);
        else advanceAnimated(simRef.current, p, dt);
      });
      if (!ok) return;
      if (now - lastPublish > PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        publish();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      publish();
    };
  }, [running, guarded, publish]);

  const step = useCallback(() => {
    const p = paramsRef.current;
    guarded(() => {
      if (p.fastMode) advanceFast(simRef.current, p, p.toursPerFrame);
      else hopAll(simRef.current, p);
    });
    publish();
  }, [guarded, publish]);

  return { simRef, snapshot, running, setRunning, reset, step, error };
}
