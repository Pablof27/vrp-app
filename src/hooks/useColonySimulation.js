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

function computeTau0(vrp, params) {
  if (!params.autoTau0) return params.tau0;
  const lnn = nearestNeighborLength(vrp);
  return lnn > 0 ? 1 / (vrp.nodes.length * lnn) : 1;
}

export function createSimulation(nodes, params) {
  const vrp = colony.buildVrp(nodes, params.capacity);
  const tau0 = computeTau0(vrp, params);
  return {
    vrp,
    nodeIds: nodes.map((node) => node.id),
    tau0,
    pheromones: colony.resetPheromones({ n: nodes.length, tau0 }),
    bestPath: { path: [], length: Infinity },
    iter: 0,
    globalUpdates: 0,
    ant: null,
    history: [],
    version: 0,
  };
}

export function updateSimulation(sim, nodes, params) {
  const newIds = nodes.map((node) => node.id);
  if (nodes.length === 0 || newIds[0] !== sim.nodeIds[0]) return createSimulation(nodes, params);

  const previousIndex = new Map(sim.nodeIds.map((id, i) => [id, i]));
  const oldIndexOf = newIds.map((id) => previousIndex.get(id) ?? -1);
  const newIndexOf = sim.nodeIds.map(() => -1);
  oldIndexOf.forEach((oi, ni) => {
    if (oi >= 0) newIndexOf[oi] = ni;
  });
  const structural = sim.nodeIds.length !== newIds.length || oldIndexOf.some((oi, ni) => oi !== ni);

  sim.vrp = colony.buildVrp(nodes, params.capacity);
  sim.nodeIds = newIds;
  sim.tau0 = computeTau0(sim.vrp, params);
  if (structural) sim.pheromones = colony.remapPheromones(sim.pheromones, oldIndexOf, sim.tau0);

  if (sim.bestPath.path.length > 0) {
    const repaired = colony.repairPath(sim.vrp, sim.bestPath.path.map((i) => newIndexOf[i]));
    sim.bestPath.path = repaired.path;
    sim.bestPath.length = repaired.length;
    const point = { iter: sim.iter, length: repaired.length, changed: true };
    const last = sim.history[sim.history.length - 1];
    // Coalesce consecutive edits (e.g. dragging) that happen within the same tour count.
    if (last?.changed && last.iter === sim.iter) sim.history[sim.history.length - 1] = point;
    else sim.history.push(point);
  }

  if (sim.ant) {
    const ant = sim.ant;
    const from = newIndexOf[ant.from];
    const to = newIndexOf[ant.to];
    if (from < 0 || to < 0 || !colony.adaptAnt(sim.vrp, ant.state, newIndexOf)) {
      sim.ant = newAnt(sim);
    } else {
      const fraction = ant.edgeLength > 0 ? ant.progress / ant.edgeLength : 1;
      ant.from = from;
      ant.to = to;
      ant.edgeLength = sim.vrp.distances[from][to];
      ant.progress = fraction * ant.edgeLength;
      if (structural) ant.decision = null;
    }
  }

  sim.version++;
  return sim;
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

function ensureAnt(sim) {
  if (!sim.ant) sim.ant = newAnt(sim);
  return sim.ant;
}

function recordImprovement(sim, before) {
  if (sim.bestPath.length < before) sim.history.push({ iter: sim.iter, length: sim.bestPath.length });
}

function completeAnt(sim, state, mp) {
  const before = sim.bestPath.length;
  const result = colony.finishAnt(state, mp, sim.pheromones, sim.bestPath, sim.iter);
  sim.pheromones = result.pheromones;
  sim.iter++;
  if (sim.iter % mp.m === 0) sim.globalUpdates++;
  recordImprovement(sim, before);
}

// Called when an ant reaches the node it was heading to: finish the tour if needed, then decide the next arc.
function arrive(sim, ant, mp) {
  if (ant.state.done) {
    completeAnt(sim, ant.state, mp);
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

export function advanceAnimated(sim, params, dt) {
  const mp = modelParams(sim, params);
  const ant = ensureAnt(sim);
  let travel = params.speed * dt;
  for (let hops = 0; hops < MAX_HOPS_PER_FRAME; hops++) {
    const remaining = ant.edgeLength - ant.progress;
    if (travel < remaining) {
      ant.progress += travel;
      break;
    }
    travel -= remaining;
    arrive(sim, ant, mp);
  }
  sim.version++;
}

export function stepSimulation(sim, params) {
  const mp = modelParams(sim, params);
  arrive(sim, ensureAnt(sim), mp);
  sim.version++;
}

export function advanceFast(sim, params, tours) {
  const mp = modelParams(sim, params);
  for (let k = 0; k < tours; k++) {
    const ant = ensureAnt(sim);
    while (!ant.state.done) {
      colony.step(sim.vrp, mp, sim.pheromones, ant.state, sim.bestPath.length);
    }
    completeAnt(sim, ant.state, mp);
    sim.ant = null;
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

export function useColonySimulation(nodes, params, canRun) {
  const simRef = useRef(null);
  const nodesRef = useRef(nodes);
  const paramsRef = useRef(params);
  nodesRef.current = nodes;
  paramsRef.current = params;

  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  const publish = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    setSnapshot({
      iter: sim.iter,
      globalUpdates: sim.globalUpdates,
      activeAnt: sim.ant ? sim.iter + 1 : null,
      bestLength: sim.bestPath.length,
      bestPath: sim.bestPath.path.slice(),
      history: sim.history.slice(),
      nodes: sim.vrp.nodes,
      tau0: sim.tau0,
      range: pheromoneRange(sim.pheromones),
      decision: describeDecision(sim, sim.ant?.decision),
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
    simRef.current = createSimulation(nodesRef.current, paramsRef.current);
    setError(null);
    publish();
  }, [publish]);

  useEffect(() => {
    const sim = simRef.current;
    simRef.current = sim ? updateSimulation(sim, nodes, paramsRef.current) : createSimulation(nodes, paramsRef.current);
    setError(null);
    publish();
  }, [nodes, params.capacity, params.tau0, params.autoTau0, publish]);

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
      else stepSimulation(simRef.current, p);
    });
    publish();
  }, [guarded, publish]);

  return { simRef, snapshot, running, setRunning, reset, step, error };
}
