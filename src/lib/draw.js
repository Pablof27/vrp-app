import { useEffect, useState } from 'react';

// The world is 1 unit wide and 0.9 tall, matching AntColony.newMap.
export const WORLD_HEIGHT = 0.9;

const INFERNO = [
  [0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106], [186, 54, 85],
  [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164],
];

export const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${INFERNO.map((_, index) => {
  const strength = index / (INFERNO.length - 1);
  return `rgba(${heatRgb(0.55 + 0.45 * strength).join(',')},${0.4 + 0.5 * strength})`;
}).join(', ')})`;
export const GRAY_GRADIENT_CSS = 'linear-gradient(to right, rgba(220,220,220,0.4), rgba(220,220,220,0.9))';
export const TOP_PHEROMONE_PAIRS = 20;

export const TRIP_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#e11d48', '#a855f7', '#eab308', '#14b8a6', '#ec4899'];

export const THEMES = {
  light: {
    background: '#f8fafc', node: '#ffffff', nodeStroke: '#0f172a', text: '#0f172a',
    depot: '#0f172a', depotText: '#ffffff', best: '#2563eb', selected: '#f59e0b', tracked: '#dc2626',
  },
  dark: {
    background: '#0b0f19', node: '#1e293b', nodeStroke: '#e2e8f0', text: '#e2e8f0',
    depot: '#e2e8f0', depotText: '#0b0f19', best: '#22d3ee', selected: '#f59e0b', tracked: '#ffffff',
  },
};

export function heatRgb(t) {
  const x = Math.min(Math.max(t, 0), 1) * (INFERNO.length - 1);
  const i = Math.min(Math.floor(x), INFERNO.length - 2);
  const f = x - i;
  const a = INFERNO[i];
  const b = INFERNO[i + 1];
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f));
}

export function antColor(i) {
  return `hsl(${(i * 137.5) % 360} 90% 60%)`;
}

export function nodeRadius(demand) {
  return 6 + 1.6 * Math.sqrt(Math.max(demand, 0));
}

export function splitTrips(path) {
  const trips = [];
  let current = [0];
  for (let k = 1; k < path.length; k++) {
    current.push(path[k]);
    if (path[k] === 0) {
      if (current.length > 2) trips.push(current);
      current = [0];
    }
  }
  return trips;
}

export function pheromoneRange(pheromones) {
  let min = Infinity;
  let max = -Infinity;
  const n = pheromones.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = (pheromones[i][j] + pheromones[j][i]) / 2;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, max };
}

export function rankPheromonePairs(pheromones, nodes) {
  const edges = [];
  for (let from = 0; from < pheromones.length; from++) {
    for (let to = from + 1; to < pheromones.length; to++) {
      edges.push({
        from,
        to,
        value: (pheromones[from][to] + pheromones[to][from]) / 2,
        distance: Math.hypot(nodes[from].x - nodes[to].x, nodes[from].y - nodes[to].y),
      });
    }
  }
  edges.sort((first, second) => second.value - first.value || first.distance - second.distance);
  const min = edges.at(-1)?.value ?? 0;
  const span = (edges[0]?.value ?? min) - min;
  return edges.map((edge, rank) => ({
    ...edge,
    strength: span > 0 ? Math.sqrt((edge.value - min) / span) : 0,
    highlighted: rank < TOP_PHEROMONE_PAIRS,
  }));
}

export function drawPheromones(ctx, nodes, pheromones, scale, style) {
  if (nodes.length < 2 || pheromones.length !== nodes.length) return;
  const edges = rankPheromonePairs(pheromones, nodes);
  const contextOpacity = Math.min(0.12, 2.4 / nodes.length);
  ctx.save();
  ctx.lineCap = 'round';
  for (let index = edges.length - 1; index >= 0; index--) {
    const { from, to, strength, highlighted } = edges[index];
    const opacity = highlighted ? 0.4 + 0.5 * strength : contextOpacity + 0.2 * strength;
    const color = style === 'gray' ? [220, 220, 220] : heatRgb(0.55 + 0.45 * strength);
    ctx.strokeStyle = `rgba(${color.join(',')},${opacity})`;
    ctx.lineWidth = style === 'heat'
      ? (highlighted ? 1.2 : 0.7)
      : (highlighted ? 0.9 + 1.3 * strength : 0.65 + 0.45 * strength);
    ctx.beginPath();
    ctx.moveTo(nodes[from].x * scale, nodes[from].y * scale);
    ctx.lineTo(nodes[to].x * scale, nodes[to].y * scale);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPolyline(ctx, points, scale, color, width, dash = []) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(points[0].x * scale, points[0].y * scale);
  for (let k = 1; k < points.length; k++) ctx.lineTo(points[k].x * scale, points[k].y * scale);
  ctx.stroke();
  ctx.restore();
}

export function drawTrips(ctx, nodes, path, scale, width) {
  splitTrips(path).forEach((trip, k) => {
    drawPolyline(ctx, trip.map((i) => nodes[i]), scale, TRIP_COLORS[k % TRIP_COLORS.length], width);
  });
}

export function drawDepot(ctx, depot, scale, size, theme) {
  const x = depot.x * scale;
  const y = depot.y * scale;
  ctx.fillStyle = theme.depot;
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
  if (size >= 12) {
    ctx.fillStyle = theme.depotText;
    ctx.font = `bold ${Math.round(size * 0.6)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', x, y + 0.5);
  }
}

// Tracks the CSS width of a canvas and keeps its backing store in sync with the device pixel ratio.
export function useCanvasSize(canvasRef) {
  const [size, setSize] = useState({ width: 0, dpr: 1 });
  useEffect(() => {
    const canvas = canvasRef.current;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(width * WORLD_HEIGHT * dpr);
      setSize({ width, dpr });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);
  return size;
}
