import assert from 'node:assert/strict';
import test from 'node:test';
import { AntColony } from './AntColony.js';

class RecordingColony extends AntColony {
    events = [];
    startingPheromones = [];

    step(vrp, params, pheromones, ant, bestLength) {
        if (ant.path.length === 1) this.startingPheromones.push(pheromones[0][0]);
        return super.step(vrp, params, pheromones, ant, bestLength);
    }

    evaporatePheromones(pheromones, params) {
        this.events.push('evaporate');
        return super.evaporatePheromones(pheromones, params);
    }

    globalUpdate(pheromones, bestPath, bestPathLength, params) {
        this.events.push('global');
        return super.globalUpdate(pheromones, bestPath, bestPathLength, params);
    }
}

function runAnts(interval, count) {
    const colony = new RecordingColony();
    const vrp = colony.buildVrp([
        { x: 0.1, y: 0.1, demand: 0 },
        { x: 0.4, y: 0.2, demand: 1 },
        { x: 0.8, y: 0.5, demand: 1 },
    ], 5);
    const params = { n: 3, m: interval, beta: 2, q0: 1, alpha: 0.25, tau0: 0.1 };
    let pheromones = colony.resetPheromones({ n: 3, tau0: 1 });
    const bestPath = { path: [], length: Infinity };

    for (let iter = 0; iter < count; iter++) {
        pheromones = colony.advance(vrp, params, pheromones, bestPath, iter).pheromones;
    }

    return { colony, bestPath };
}

test('evaporates after each ant and reinforces after exactly every m ants', () => {
    const { colony, bestPath } = runAnts(3, 6);
    assert.deepEqual(colony.events, [
        'evaporate', 'evaporate', 'evaporate', 'global',
        'evaporate', 'evaporate', 'evaporate', 'global',
    ]);
    assert.ok(Number.isFinite(bestPath.length));
    assert.equal(new Set(bestPath.path.filter((node) => node !== 0)).size, 2);
});

test('each new ant reads the pheromones left by the preceding ant', () => {
    const { colony } = runAnts(3, 4);
    let expected = 1;
    for (const initial of colony.startingPheromones) {
        assert.equal(initial, expected);
        expected = 0.75 * expected + 0.25 * 0.1;
    }
    assert.equal(colony.startingPheromones.length, 4);
});

test('m = 1 reinforces the best path after the very first ant', () => {
    const { colony } = runAnts(1, 2);
    assert.deepEqual(colony.events, ['evaporate', 'global', 'evaporate', 'global']);
});