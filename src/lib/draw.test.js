import assert from 'node:assert/strict';
import test from 'node:test';
import { colonyColor, drawPheromones, drawTrips, rankPheromonePairs, TOP_PHEROMONE_PAIRS } from './draw.js';

const nodes = Array.from({ length: 8 }, (_, index) => ({ x: index / 8, y: (index % 3) / 3 }));

function matrix(value) {
  return nodes.map(() => nodes.map(() => value));
}

function recordingContext() {
  return {
    strokes: [],
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      this.strokes.push({ color: this.strokeStyle, width: this.lineWidth });
    },
  };
}

test('ranks undirected pairs by pheromone and guarantees 20 highlighted edges', () => {
  const pheromones = matrix(0.001);
  pheromones[2][5] = 8;
  pheromones[5][2] = 4;
  pheromones[1][6] = 2;
  pheromones[6][1] = 2;
  const pairs = rankPheromonePairs(pheromones, nodes);
  assert.equal(pairs.length, 28);
  assert.deepEqual([pairs[0].from, pairs[0].to, pairs[0].value], [2, 5, 6]);
  assert.deepEqual([pairs[1].from, pairs[1].to], [1, 6]);
  assert.equal(pairs.filter((pair) => pair.highlighted).length, TOP_PHEROMONE_PAIRS);
  assert.ok(pairs.every((pair) => pair.from < pair.to));
});

test('uniform pheromones still draw 20 clearly visible pairs and the remaining context', () => {
  const context = recordingContext();
  drawPheromones(context, nodes, matrix(0.01), 500, 'gray');
  assert.equal(context.strokes.length, 28);
  const prominent = context.strokes.filter((stroke) => Number(stroke.color.split(',').at(-1).replace(')', '')) >= 0.4);
  assert.equal(prominent.length, TOP_PHEROMONE_PAIRS);
  assert.ok(context.strokes.every((stroke) => Number(stroke.color.split(',').at(-1).replace(')', '')) >= 0.1));
});

test('grayscale uses light gray with transparency and restrained widths', () => {
  const pheromones = matrix(0.01);
  pheromones[0][1] = 10;
  pheromones[1][0] = 10;
  const context = recordingContext();
  drawPheromones(context, nodes, pheromones, 500, 'gray');
  assert.ok(context.strokes.every((stroke) => stroke.color.startsWith('rgba(220,220,220,')));
  assert.ok(context.strokes.every((stroke) => stroke.width <= 2.2));
  assert.ok(context.strokes.every((stroke) => stroke.width >= 0.55));
  assert.notEqual(context.strokes[0].color, context.strokes.at(-1).color);
  assert.equal(context.strokes.at(-1).width, 2.2);
});

test('both heatmap modes preserve visible weak pairs and avoid thick strokes', () => {
  for (const style of ['heat', 'heat-width']) {
    const context = recordingContext();
    drawPheromones(context, nodes, matrix(0.01), 500, style);
    assert.equal(context.strokes.length, 28);
    assert.ok(context.strokes.every((stroke) => stroke.width <= 2.2));
    assert.ok(context.strokes.every((stroke) => stroke.color.startsWith('rgba(')));
  }
});

test('maps with fewer than 20 pairs highlight every available pair', () => {
  const smallNodes = nodes.slice(0, 3);
  const pairs = rankPheromonePairs(smallNodes.map(() => smallNodes.map(() => 0.01)), smallNodes);
  assert.equal(pairs.length, 3);
  assert.ok(pairs.every((pair) => pair.highlighted));
});

test('colony overlays draw only the highlighted pairs in the colony color', () => {
  const context = recordingContext();
  drawPheromones(context, nodes, matrix(0.01), 500, 'heat', { tint: colonyColor(2), highlightedOnly: true });
  assert.equal(context.strokes.length, TOP_PHEROMONE_PAIRS);
  assert.ok(context.strokes.every((stroke) => stroke.color.startsWith('rgba(59,130,246,')));
});

test('best trips take their colony color when there are several colonies', () => {
  const colors = [];
  const context = {
    ...recordingContext(),
    lineJoin: '',
    setLineDash() {},
    stroke() {
      colors.push(this.strokeStyle);
    },
  };
  const path = [0, 1, 0, 2, 0, 3, 0];
  drawTrips(context, nodes, path, 500, 2, 2);
  assert.deepEqual(colors, [colonyColor(0), colonyColor(1), colonyColor(0)]);
  colors.length = 0;
  drawTrips(context, nodes, path, 500, 2);
  assert.deepEqual(colors, [colonyColor(0), colonyColor(1), colonyColor(2)]);
});