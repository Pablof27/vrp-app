import { useEffect, useMemo, useRef } from 'react';
import { THEMES, TRIP_COLORS, WORLD_HEIGHT, drawDepot, drawPolyline, splitTrips, useCanvasSize } from '../lib/draw.js';

export function BestRouteMinimap({ nodes, bestPath, bestLength }) {
  const canvasRef = useRef(null);
  const size = useCanvasSize(canvasRef);
  const trips = useMemo(() => splitTrips(bestPath), [bestPath]);

  useEffect(() => {
    const { width, dpr } = size;
    if (!width || !nodes) return;
    const ctx = canvasRef.current.getContext('2d');
    const theme = THEMES.dark;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, width * WORLD_HEIGHT);

    trips.forEach((trip, k) => {
      drawPolyline(ctx, trip.map((i) => nodes[i]), width, TRIP_COLORS[k % TRIP_COLORS.length], 2);
    });

    nodes.forEach((node, i) => {
      if (i === 0) return;
      ctx.beginPath();
      ctx.arc(node.x * width, node.y * width, 3, 0, Math.PI * 2);
      ctx.fillStyle = theme.nodeStroke;
      ctx.fill();
    });
    if (nodes.length > 0) drawDepot(ctx, nodes[0], width, 10, theme);
  }, [nodes, trips, size]);

  return (
    <div>
      <canvas ref={canvasRef} className="minimap-canvas" />
      <div className="minimap-caption">
        {Number.isFinite(bestLength)
          ? <>Length <b>{bestLength.toFixed(3)}</b> · {trips.length} vehicle{trips.length === 1 ? '' : 's'}</>
          : 'No complete tour yet'}
      </div>
    </div>
  );
}
