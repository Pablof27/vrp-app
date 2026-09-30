let nextId = 0;

// Stable ids let the colony keep pheromones and routes when nodes are added or removed.
export function withId(node) {
  return { ...node, id: nextId++ };
}
