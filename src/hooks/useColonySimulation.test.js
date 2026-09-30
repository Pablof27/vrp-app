import assert from 'node:assert/strict';
import test from 'node:test';
import { AntColony } from '../../Model/AntColony.js';
import { advanceAnimated, advanceFast, createSimulation, shownPheromones, stepSimulation, updateSimulation, walkingColony } from './useColonySimulation.js';

const nodes = [
  { id: 0, x: 0.1, y: 0.1, demand: 0 },
  { id: 1, x: 0.6, y: 0.1, demand: 1 },
];
const params = { capacity: 5, m: 3, beta: 2, q0: 1, alpha: 0.25, tau0: 0.1, autoTau0: false, speed: 1 };

function recordEvents(context) {
  const events = [];
  for (const [method, event] of [['evaporatePheromones', 'evaporate'], ['globalUpdate', 'global']]) {
    const original = AntColony.prototype[method];
    context.mock.method(AntColony.prototype, method, function (...args) {
      events.push(event);
      return original.apply(this, args);
    });
  }
  const originalStep = AntColony.prototype.step;
  context.mock.method(AntColony.prototype, 'step', function (vrp, settings, pheromones, ant, bestLength) {
    if (ant.path.length === 1) events.push('start');
    return originalStep.call(this, vrp, settings, pheromones, ant, bestLength);
  });
  return events;
}

test('animation has one active ant regardless of m', () => {
  for (const interval of [1, 10, 50]) {
    const settings = { ...params, m: interval };
    const sim = createSimulation(nodes, settings);
    advanceAnimated(sim, settings, 0.1);
    assert.ok(sim.ant);
    assert.equal(Object.hasOwn(sim, 'ants'), false);
    assert.equal(sim.ant.progress, 0.1);
    assert.equal(sim.iter, 0);
    assert.equal(sim.globalUpdates, 0);
  }
});

test('steps finish, evaporate and reinforce before the next ant starts', (context) => {
  const events = recordEvents(context);
  const sim = createSimulation(nodes, params);
  for (let step = 0; step < 7; step++) stepSimulation(sim, params);
  assert.equal(sim.iter, 3);
  assert.equal(sim.globalUpdates, 1);
  assert.deepEqual(events, [
    'start', 'evaporate', 'start', 'evaporate', 'start', 'evaporate', 'global', 'start',
  ]);
});

test('evaporation waits for the animated ant to reach the base', (context) => {
  const events = recordEvents(context);
  const sim = createSimulation(nodes, { ...params, m: 1 });
  advanceAnimated(sim, { ...params, m: 1 }, 0.75);
  assert.equal(sim.ant.state.done, true);
  assert.equal(sim.iter, 0);
  assert.deepEqual(events, ['start']);
  advanceAnimated(sim, { ...params, m: 1 }, 0.25);
  assert.equal(sim.iter, 1);
  assert.deepEqual(events, ['start', 'evaporate', 'global', 'start']);
});

test('fast mode and animation use identical sequential pheromone updates', () => {
  const animated = createSimulation(nodes, params);
  const fast = createSimulation(nodes, params);
  for (let step = 0; step < 7; step++) stepSimulation(animated, params);
  advanceFast(fast, params, 3);
  assert.equal(fast.iter, animated.iter);
  assert.equal(fast.globalUpdates, animated.globalUpdates);
  assert.deepEqual(fast.pheromones, animated.pheromones);
  assert.deepEqual(fast.bestPath, animated.bestPath);
});

test('switching to fast mode completes the current ant instead of discarding it', (context) => {
  const events = recordEvents(context);
  const sim = createSimulation(nodes, params);
  stepSimulation(sim, params);
  advanceFast(sim, params, 1);
  assert.equal(sim.iter, 1);
  assert.equal(sim.ant, null);
  assert.deepEqual(events, ['start', 'evaporate']);
});

test('map edits preserve the active ant, progress, pheromones and completed tours', () => {
  const sim = createSimulation(nodes, params);
  advanceFast(sim, params, 1);
  advanceAnimated(sim, params, 0.25);
  const ant = sim.ant;
  const pheromones = sim.pheromones;
  const editedNodes = nodes.map((node) => node.id === 1 ? { ...node, x: 0.8, demand: 2 } : node);
  assert.equal(updateSimulation(sim, editedNodes, params), sim);
  assert.equal(sim.ant, ant);
  assert.equal(sim.iter, 1);
  assert.equal(sim.pheromones, pheromones);
  assert.equal(sim.ant.progress / sim.ant.edgeLength, 0.5);
  assert.equal(sim.ant.state.capacity, 3);
  assert.ok(Math.abs(sim.bestPath.length - 1.4) < 1e-12);
  assert.equal(sim.history.at(-1).changed, true);
});

test('history keeps each best route with the map it was found on', () => {
  const sim = createSimulation(nodes, params);
  advanceFast(sim, params, 1);
  const found = sim.history[0];
  assert.deepEqual(found.path, sim.bestPath.path);
  assert.notEqual(found.path, sim.bestPath.path);
  assert.equal(found.nodes, sim.vrp.nodes);

  const movedNodes = nodes.map((node) => node.id === 1 ? { ...node, x: 0.9 } : node);
  updateSimulation(sim, movedNodes, params);
  const edited = sim.history.at(-1);
  assert.equal(edited.nodes, movedNodes);
  assert.equal(found.nodes[1].x, 0.6);
  assert.ok(edited.length > found.length);
});

// Base + 3 customers with capacity 1: one trip per customer.
const tripNodes = [
  { id: 0, x: 0, y: 0, demand: 0 },
  { id: 1, x: 0.1, y: 0, demand: 1 },
  { id: 2, x: 0.2, y: 0, demand: 1 },
  { id: 3, x: 0.3, y: 0, demand: 1 },
];
const tripParams = { ...params, capacity: 1, colonies: 3 };

test('the walking colony changes only when the next trip leaves the base', () => {
  const sim = createSimulation(tripNodes, tripParams);
  const seen = [];
  for (let step = 0; step < 6; step++) {
    stepSimulation(sim, tripParams);
    seen.push([sim.ant.decision.kind, walkingColony(sim), sim.ant.state.colony]);
  }
  assert.deepEqual(seen, [
    ['move', 0, 0], ['reload', 0, 1],
    ['move', 1, 1], ['reload', 1, 2],
    ['move', 2, 2], ['finish', 2, 2],
  ]);
  assert.equal(sim.ant.decision.nextColony, 2);
});

test('pheromones can be shown for the walking colony, a chosen one or all of them', () => {
  const sim = createSimulation(tripNodes, tripParams);
  for (let step = 0; step < 3; step++) stepSimulation(sim, tripParams);
  assert.deepEqual(shownPheromones(sim, 'active').map((s) => s.colony), [1]);
  assert.deepEqual(shownPheromones(sim, 2).map((s) => s.colony), [2]);
  assert.deepEqual(shownPheromones(sim, 'all').map((s) => s.colony), [0, 1, 2]);
  assert.equal(shownPheromones(sim, 7)[0].colony, 1);
});

test('changing the number of colonies keeps learned pheromones and reassigns the current trip', () => {
  const sim = createSimulation(tripNodes, tripParams);
  advanceFast(sim, tripParams, 2);
  for (let step = 0; step < 5; step++) stepSimulation(sim, tripParams);
  const learned = sim.pheromones.slice(0, 2);
  assert.equal(sim.ant.state.colony, 2);

  const two = { ...tripParams, colonies: 2 };
  updateSimulation(sim, tripNodes, two);
  assert.equal(sim.pheromones.length, 2);
  assert.deepEqual(sim.pheromones, learned);
  assert.equal(sim.ant.state.colony, 0);
  assert.equal(sim.ant.decision, null);

  const four = { ...tripParams, colonies: 4 };
  updateSimulation(sim, tripNodes, four);
  assert.equal(sim.pheromones.length, 4);
  assert.ok(sim.pheromones[3].every((row) => row.every((p) => p === sim.tau0)));
  assert.equal(sim.ant.state.colony, 2);
  assert.equal(sim.history.at(-1).colonies, 4);
});