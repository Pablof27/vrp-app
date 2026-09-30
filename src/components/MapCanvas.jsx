import { useEffect, useRef } from 'react';
import {
  THEMES, WORLD_HEIGHT, antColor, drawDepot, drawPheromones, drawPolyline, drawTrips, nodeRadius, useCanvasSize,
} from '../lib/draw.js';
import { withId } from '../lib/nodes.js';
import { activePheromones } from '../hooks/useColonySimulation.js';

function antPosition(ant, nodes) {
  const a = nodes[ant.from];
  const b = nodes[ant.to];
  const f = ant.edgeLength > 0 ? ant.progress / ant.edgeLength : 1;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function drawNodes(ctx, nodes, scale, theme, selected, visited, detail) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  nodes.forEach((node, i) => {
    if (i === 0) return;
    const x = node.x * scale;
    const y = node.y * scale;
    ctx.beginPath();
    ctx.arc(x, y, nodeRadius(node.demand) * detail, 0, Math.PI * 2);
    ctx.fillStyle = theme.node;
    ctx.globalAlpha = visited.has(i) ? 0.45 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = i === selected ? 3 : 1.5 * detail;
    ctx.strokeStyle = i === selected ? theme.selected : theme.nodeStroke;
    ctx.stroke();
    if (detail >= 0.7) {
      ctx.fillStyle = theme.text;
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(String(node.demand), x, y + 0.5);
    }
  });

  if (nodes.length > 0) {
    drawDepot(ctx, nodes[0], scale, 18 * detail, theme);
    if (selected === 0) {
      ctx.strokeStyle = theme.selected;
      ctx.lineWidth = 3;
      ctx.strokeRect(nodes[0].x * scale - 11, nodes[0].y * scale - 11, 22, 22);
    }
  }
}

// Historical entries are drawn on the map they were found on, which may differ from the current one.
function drawBestView(ctx, sim, props, scale, theme, detail) {
  const entry = props.bestEntry;
  const nodes = entry ? entry.nodes : props.nodes;
  const routeNodes = entry ? entry.nodes : sim?.vrp.nodes;
  const path = entry ? entry.path : sim?.bestPath.path ?? [];
  if (routeNodes && path.length > 1) drawTrips(ctx, routeNodes, path, scale, Math.max(1.5, 3 * detail));
  drawNodes(ctx, nodes, scale, theme, entry ? null : props.selected, new Set(), detail);
}

function drawScene(ctx, sim, props, { width, dpr }) {
  const theme = THEMES.dark;
  const scale = width;
  // The read-only minimap shrinks nodes and markers to stay legible at small sizes.
  const detail = props.interactive ? 1 : Math.min(1, Math.max(0.4, width / 700));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, width * WORLD_HEIGHT);

  if (props.view === 'best') {
    drawBestView(ctx, sim, props, scale, theme, detail);
    return;
  }

  const simNodes = sim?.vrp.nodes;
  const ant = sim?.ant;
  const color = antColor(sim?.iter ?? 0);

  if (sim && simNodes.length > 1) {
    drawPheromones(ctx, simNodes, activePheromones(sim), scale, props.pheromoneStyle);

    if (props.showBestOverlay && sim.bestPath.path.length > 1) {
      drawPolyline(ctx, sim.bestPath.path.map((i) => simNodes[i]), scale, theme.best, 2.5, [8, 6]);
    }

    if (ant && props.showAntTrace) {
      const walked = ant.state.path.slice(0, -1).map((i) => simNodes[i]);
      walked.push(antPosition(ant, simNodes));
      drawPolyline(ctx, walked, scale, color, 1.5);
    }
  }

  drawNodes(ctx, props.nodes, scale, theme, props.selected, new Set(ant?.state.path), detail);

  if (ant && simNodes.length > 1) {
    const position = antPosition(ant, simNodes);
    ctx.beginPath();
    ctx.arc(position.x * scale, position.y * scale, Math.max(3, 5.5 * detail), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.tracked;
    ctx.stroke();
  }
}

export function MapCanvas({
  simRef, nodes, onNodesChange, selected, onSelect, tool, newDemand, pheromoneStyle, showBestOverlay, showAntTrace,
  view, bestEntry, interactive = true,
}) {
  const canvasRef = useRef(null);
  const size = useCanvasSize(canvasRef);
  const dragRef = useRef(null);
  const propsRef = useRef(null);
  const dirtyRef = useRef(true);
  propsRef.current = { nodes, selected, pheromoneStyle, showBestOverlay, showAntTrace, view, bestEntry, interactive, size };

  useEffect(() => {
    dirtyRef.current = true;
  });

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    let frame;
    let lastSim = null;
    let lastVersion = -1;
    const loop = () => {
      const sim = simRef.current;
      const props = propsRef.current;
      if (props.size.width > 0 && (dirtyRef.current || sim !== lastSim || sim?.version !== lastVersion)) {
        dirtyRef.current = false;
        lastSim = sim;
        lastVersion = sim?.version;
        drawScene(ctx, sim, props, props.size);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [simRef]);

  const toWorld = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.width, 0), WORLD_HEIGHT),
    };
  };

  const hitTest = (p) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const d = Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) * size.width;
      if (d <= (i === 0 ? 12 : nodeRadius(nodes[i].demand) + 3)) return i;
    }
    return -1;
  };

  const deleteNode = (index) => {
    onNodesChange(nodes.filter((_, i) => i !== index));
    onSelect(null);
  };

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    const p = toWorld(e);
    const hit = hitTest(p);

    if (tool === 'delete') {
      if (hit > 0) deleteNode(hit);
      return;
    }
    if (tool === 'base') {
      onNodesChange(nodes.map((node, i) => (i === 0 ? { ...node, x: p.x, y: p.y } : node)));
      onSelect(0);
      return;
    }
    if (hit >= 0) {
      onSelect(hit);
      dragRef.current = hit;
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      onNodesChange([...nodes, withId({ x: p.x, y: p.y, demand: newDemand })]);
      onSelect(nodes.length);
    }
  };

  const handlePointerMove = (e) => {
    if (dragRef.current === null) return;
    const index = dragRef.current;
    const p = toWorld(e);
    onNodesChange((prev) => prev.map((node, i) => (i === index ? { ...node, x: p.x, y: p.y } : node)));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    const hit = hitTest(toWorld(e));
    if (hit > 0) deleteNode(hit);
  };

  if (!interactive) return <canvas ref={canvasRef} className="minimap-canvas" />;

  return (
    <canvas
      ref={canvasRef}
      className={`map-canvas tool-${tool}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
    />
  );
}
