// Avoids 1/0 when two nodes share the same position.
const MIN_DISTANCE = 1e-9;

export class AntColony {

    // Runs one complete ant tour and applies the pheromone updates.
    advance(vrp, params, pheromones, bestPath, iter) {
        const ant = this.createAnt(vrp);
        while (!ant.done) {
            this.step(vrp, params, pheromones, ant, bestPath.length);
        }
        const result = this.finishAnt(ant, params, pheromones, bestPath, iter);
        return {pheromones: result.pheromones, bestPath: result.bestPath};
    }

    createAnt(vrp) {
        return {
            // The base (node 0) is not a customer, so it is never a candidate.
            nonVisited: vrp.nodes.map((node, i) => i).filter((i) => i !== 0),
            path: [0],
            capacity: vrp.capacity,
            distance: 0,
            done: false,
        };
    }

    candidateScores(vrp, params, pheromones, ant) {
        const from = ant.path[ant.path.length - 1];
        return ant.nonVisited.map((j) =>
            pheromones[from][j] * (1 / Math.max(vrp.distances[from][j], MIN_DISTANCE)) ** params.beta
        );
    }

    // Probability of each candidate being selected: q0 on the argmax (exploitation) + (1-q0) roulette (exploration).
    selectionProbabilities(scores, q0) {
        const sum = scores.reduce((a, b) => a + b, 0);
        const best = scores.indexOf(Math.max(...scores));
        return scores.map((s, i) => ({
            exploit: i === best ? q0 : 0,
            explore: sum > 0 ? (1 - q0) * s / sum : 0,
        }));
    }

    // Moves the ant one arc. Mutates `ant` and returns a description of the decision.
    step(vrp, params, pheromones, ant, bestLength = Infinity) {
        const from = ant.path[ant.path.length - 1];

        if (ant.nonVisited.length === 0 || ant.distance > bestLength) {
            const kind = ant.nonVisited.length === 0 ? 'finish' : 'abort';
            if (from !== 0) {
                ant.distance += vrp.distances[from][0];
                ant.path.push(0);
            }
            ant.done = true;
            return {kind, from, next: 0, chosen: 0, candidates: [], scores: [], exploited: false};
        }

        const scores = this.candidateScores(vrp, params, pheromones, ant);
        const exploited = Math.random() < params.q0;

        let idx;
        if (exploited) {
            idx = scores.indexOf(Math.max(...scores));
        } else {
            const sum = scores.reduce((a, b) => a + b, 0);
            idx = this.rouletteWheel(scores.map((s) => s / sum));
        }

        const candidates = ant.nonVisited.slice();
        const chosen = candidates[idx];
        let next = chosen;
        let kind = 'move';

        if (vrp.nodes[chosen].demand > ant.capacity) {
            if (from === 0) {
                throw new Error(`Node ${chosen} demand (${vrp.nodes[chosen].demand}) exceeds the vehicle capacity (${vrp.capacity}).`);
            }
            next = 0;
            kind = 'reload';
            ant.capacity = vrp.capacity;
        } else {
            ant.capacity -= vrp.nodes[chosen].demand;
            ant.nonVisited.splice(idx, 1);
        }

        ant.distance += vrp.distances[from][next];
        ant.path.push(next);

        return {kind, from, next, chosen, candidates, scores, exploited};
    }

    finishAnt(ant, params, pheromones, bestPath, iter) {
        const improved = ant.distance < bestPath.length;
        if (improved) {
            bestPath.path = ant.path;
            bestPath.length = ant.distance;
        }

        pheromones = this.evaporatePheromones(pheromones, params);

        if (iter !== 0 && iter % params.m === 0) {
            pheromones = this.globalUpdate(pheromones, bestPath.path, bestPath.length, params);
        }

        return {pheromones, bestPath, improved};
    }

    pathLength(vrp, path) {
        let length = 0;
        for (let k = 0; k < path.length - 1; k++) {
            length += vrp.distances[path[k]][path[k + 1]];
        }
        return length;
    }

    // oldIndexOf[newIndex] is the node's previous index, or -1 for new nodes (which start at tau0).
    remapPheromones(pheromones, oldIndexOf, tau0) {
        return oldIndexOf.map((oi) =>
            oldIndexOf.map((oj) => (oi >= 0 && oj >= 0 ? pheromones[oi][oj] : tau0))
        );
    }

    // Makes a route valid for a changed problem: drops removed nodes (-1), inserts missing
    // customers at their cheapest position and adds base returns where capacity is exceeded.
    repairPath(vrp, path) {
        const n = vrp.nodes.length;
        const seen = new Set();
        const route = path.filter((i) => {
            if (i < 0 || seen.has(i)) return i === 0;
            seen.add(i);
            return true;
        });
        if (route[0] !== 0) route.unshift(0);
        if (route[route.length - 1] !== 0) route.push(0);

        const d = vrp.distances;
        for (let c = 1; c < n; c++) {
            if (seen.has(c)) continue;
            let bestK = 0;
            let bestCost = Infinity;
            for (let k = 0; k < route.length - 1; k++) {
                const cost = d[route[k]][c] + d[c][route[k + 1]] - d[route[k]][route[k + 1]];
                if (cost < bestCost) {
                    bestCost = cost;
                    bestK = k;
                }
            }
            route.splice(bestK + 1, 0, c);
        }

        const result = [0];
        let load = vrp.capacity;
        for (const i of route.slice(1)) {
            if (i !== 0 && vrp.nodes[i].demand > load && result[result.length - 1] !== 0) {
                result.push(0);
                load = vrp.capacity;
            }
            if (i === 0) {
                if (result[result.length - 1] !== 0) result.push(0);
                load = vrp.capacity;
                continue;
            }
            result.push(i);
            load -= vrp.nodes[i].demand;
        }
        if (result[result.length - 1] !== 0) result.push(0);

        return {path: result, length: this.pathLength(vrp, result)};
    }

    // Adapts an in-progress ant to a changed problem. newIndexOf[oldIndex] is -1 for removed nodes.
    // Returns false when its partial tour is no longer feasible.
    adaptAnt(vrp, ant, newIndexOf) {
        const path = ant.path.map((i) => newIndexOf[i]).filter((i) => i >= 0);
        let load = vrp.capacity;
        for (const i of path) {
            if (i === 0) {
                load = vrp.capacity;
            } else {
                load -= vrp.nodes[i].demand;
                if (load < 0) return false;
            }
        }
        const visited = new Set(path);
        ant.path = path;
        ant.capacity = load;
        ant.distance = this.pathLength(vrp, path);
        ant.nonVisited = vrp.nodes.map((node, i) => i).filter((i) => i !== 0 && !visited.has(i));
        if (ant.nonVisited.length > 0) ant.done = false;
        return true;
    }

    buildVrp(nodes, capacity) {
        const distances = nodes.map((node) =>
            nodes.map((other) => Math.sqrt((node.x - other.x)**2 + (node.y - other.y)**2))
        );
        return {nodes: nodes, capacity: capacity, distances: distances};
    }

    newMap(n, capacity = 20, demand = {min:1, max:10}) {
        const nodes = this.randomNodes(n, 0.97, 0.97*0.9, 0.03, 0.03*0.9, demand.min, demand.max);
        return this.buildVrp(nodes, capacity);
    }

    resetPheromones(params) {
        let pheromones = [];
        for (let i = 0; i < params.n; i++) {
            pheromones.push([]);
            for (let j = 0; j < params.n; j++) {
                pheromones[i].push(params.tau0)
            }
        }

        return pheromones;
    }

    rouletteWheel(probabilities) {
        let sum = 0;
        const r = Math.random();
        for (let i = 0; i < probabilities.length; i++) {
            sum += probabilities[i];
            if (r <= sum) return i;
        }
        return probabilities.length - 1;
    }

    randomNodes(n, wmax, hmax, wmin, hmin, dmax, dmin) {
      const nodes = [{x: (wmax + wmin)*0.5, y: (hmax + hmin)*0.5, demand: 0}];
      for (let i = 1; i < n; i++) {
        nodes.push({
          x: Math.random() * (wmax - wmin) + wmin,
          y: Math.random() * (hmax - hmin) + hmin,
          demand: Math.floor(Math.random() * (dmax - dmin) + dmin),
        });
      }
      return nodes;
    }

    globalUpdate(pheromones, bestPath, bestPathLength, params) {

        for (let i = 0; i < bestPath.length - 1; i++) {
            pheromones[bestPath[i]][bestPath[i+1]] = (1 - params.alpha) * pheromones[bestPath[i]][bestPath[i+1]] + params.alpha/bestPathLength;
            pheromones[bestPath[i+1]][bestPath[i]] = (1 - params.alpha) * pheromones[bestPath[i+1]][bestPath[i]] + params.alpha/bestPathLength;
        }

        return pheromones;
    }

    evaporatePheromones(pheromones, params) {
        let newPheromones =  pheromones.map(function(row) {
            return row.map(function(p) {
                // console.log("before: " + p)
                // console.log("after: " + Number((1-params.alpha) * p + params.alpha * params.tau0))
                return (1-params.alpha) * p + params.alpha * params.tau0;
            })
        });

        return newPheromones;
    }
}