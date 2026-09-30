import assert from 'node:assert/strict';
import test from 'node:test';
import { AntColony } from '../../Model/AntColony.js';
import { advanceAnimated, advanceFast, createSimulation, stepSimulation, updateSimulation } from './useColonySimulation.js';

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