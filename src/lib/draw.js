import { useEffect, useState } from 'react';

// The world is 1 unit wide and 0.9 tall, matching AntColony.newMap.
export const WORLD_HEIGHT = 0.9;

const INFERNO = [
  [0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106], [186, 54, 85],
  [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164],
];

export const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${INFERNO.map((c) => `rgb(${c.join(',')})`).join(', ')})`;
export const GRAY_GRADIENT_CSS = 'linear-gradient(to right, rgb(225,225,225), rgb(20,20,20))';

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

export function drawPheromones(ctx, nodes, pheromones, scale, style) {
  const n = nodes.length;
  if (n < 2 || pheromones.length !== n) return;
  const { min, max } = pheromoneRange(pheromones);
  const span = max - min;
  if (!(span > 0)) return;

  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const t = ((pheromones[i][j] + pheromones[j][i]) / 2 - min) / span;
      if (t > 0.01) edges.push([i, j, t]);
    }
  }
  // Strong edges last so they stay on top.
  edges.sort((a, b) => a[2] - b[2]);

  ctx.lineCap = 'round';
  for (const [i, j, t] of edges) {
    if (style === 'gray') {
      const l = Math.round(225 - 205 * t);
      ctx.strokeStyle = `rgb(${l},${l},${l})`;
      ctx.lineWidth = 0.5 + 7 * t;
    } else {
      const [r, g, b] = heatRgb(t);
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.25 + 0.75 * t})`;
      ctx.lineWidth = style === 'heat-width' ? 0.5 + 7 * t : 2;
    }
    ctx.beginPath();
    ctx.moveTo(nodes[i].x * scale, nodes[i].y * scale);
    ctx.lineTo(nodes[j].x * scale, nodes[j].y * scale);
    ctx.stroke();
  }
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
