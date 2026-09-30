import assert from 'node:assert/strict';
import test from 'node:test';
import { AntColony } from './AntColony.js';

class RecordingColony extends AntColony {
    events = [];
    startingPheromones = [];

    step(vrp, params, pheromones, ant, bestLength) {
        if (ant.path.length === 1) this.startingPheromones.push(pheromones[0][0][0]);
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
    const params = { n: 3, m: interval, beta: 2, q0: 1, alpha: 0.25, tau0: 0.1, colonies: 1 };
    let pheromones = colony.resetPheromones({ n: 3, tau0: 1, colonies: 1 });
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

// Base + 3 customers in a row; capacity 1 forces one vehicle trip per customer.
function threeTrips(colonies, m = 1) {
    const colony = new AntColony();
    const vrp = colony.buildVrp([
        { x: 0, y: 0, demand: 0 },
        { x: 0.1, y: 0, demand: 1 },
        { x: 0.2, y: 0, demand: 1 },
        { x: 0.3, y: 0, demand: 1 },
    ], 1);
    const params = { n: 4, m, beta: 2, q0: 1, alpha: 0.25, tau0: 0.1, colonies };
    return { colony, vrp, params, pheromones: colony.resetPheromones(params) };
}

test('trips are handed over to the next colony circularly, starting with the first one', () => {
    const { colony, vrp, params, pheromones } = threeTrips(2);
    for (let tour = 0; tour < 2; tour++) {
        const ant = colony.createAnt(vrp);
        const moves = [];
        while (!ant.done) {
            const d = colony.step(vrp, params, pheromones, ant);
            moves.push([d.kind, d.colony, ant.colony]);
        }
        assert.deepEqual(moves, [
            ['move', 0, 0], ['reload', 0, 1],
            ['move', 1, 1], ['reload', 1, 0],
            ['move', 0, 0], ['finish', 0, 0],
        ]);
        assert.deepEqual(ant.path, [0, 1, 0, 2, 0, 3, 0]);
        assert.deepEqual(colony.arcColonies(ant.path, 2), [0, 0, 1, 1, 0, 0]);
    }
});

test('customers served by a previous colony are not offered to the next one', () => {
    const { colony, vrp, params, pheromones } = threeTrips(3);
    const ant = colony.createAnt(vrp);
    colony.step(vrp, params, pheromones, ant);
    colony.step(vrp, params, pheromones, ant);
    const handover = colony.step(vrp, params, pheromones, ant);
    assert.equal(handover.colony, 1);
    assert.deepEqual(handover.candidates, [2, 3]);
});

test('each colony follows only its own pheromones', () => {
    const { colony, vrp, params, pheromones } = threeTrips(2);
    // Only colony 1 is strongly attracted to the farthest customer.
    pheromones[1][0][3] = 1000;
    const ant = colony.createAnt(vrp);
    while (!ant.done) colony.step(vrp, params, pheromones, ant);
    assert.deepEqual(ant.path, [0, 1, 0, 3, 0, 2, 0]);
});

test('all colonies evaporate and each one reinforces only its own trips of the best tour', () => {
    const { colony, vrp, params, pheromones } = threeTrips(3);
    const bestPath = { path: [], length: Infinity };
    const result = colony.advance(vrp, params, pheromones, bestPath, 0);
    const evaporated = 0.75 * 0.1 + 0.25 * 0.1;
    // Each trip walks base->customer and back, so both arcs reinforce the same undirected pair.
    const once = 0.75 * evaporated + 0.25 / bestPath.length;
    const reinforced = 0.75 * once + 0.25 / bestPath.length;
    assert.deepEqual(bestPath.path, [0, 1, 0, 2, 0, 3, 0]);
    for (let c = 0; c < 3; c++) {
        for (let customer = 1; customer <= 3; customer++) {
            const expected = customer === c + 1 ? reinforced : evaporated;
            assert.equal(result.pheromones[c][0][customer], expected);
            assert.equal(result.pheromones[c][customer][0], expected);
        }
    }
});

test('extra colonies stay unused when fewer trips are needed', () => {
    const { colony, vrp, params, pheromones } = threeTrips(5);
    const bestPath = { path: [], length: Infinity };
    const result = colony.advance(vrp, params, pheromones, bestPath, 0);
    const evaporated = 0.75 * 0.1 + 0.25 * 0.1;
    for (const c of [3, 4]) {
        assert.ok(result.pheromones[c].every((row) => row.every((p) => p === evaporated)));
    }
});