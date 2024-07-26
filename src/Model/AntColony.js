
export class AntColony {

    advance(vrp, params, pheromones, bestPath, iter) {

        console.log("from advance: " + iter);
        console.log(pheromones)

        let nonVisited = vrp.nodes.map(function(node, i) {
            return i;
        });
        let path = [0];
        let capacity = vrp.capacity;
        let distance = 0;
        
        while (nonVisited.length > 0) {
            
            if (distance > bestPath.length) {
                break;
            }
            
            let q = Math.random();

            // let candidateArcs = nonVisited.map((i) => {
            //     return pheromones[path[path.length-1]][i] * (1/vrp.distances[path[path.length-1]][i]) ** params.beta;
            // })

            let candidateArcs = []
            for (let i = 0; i < nonVisited.length; i++) {
                candidateArcs.push(pheromones[path[path.length-1]][nonVisited[i]] * (1/vrp.distances[path[path.length-1]][nonVisited[i]]) ** params.beta);
            }

            
            let idx;
            if (q < params.q0) {
                idx = candidateArcs.indexOf(Math.max(...candidateArcs));
            }
            
            if (q >= params.q0) {
                let sum = candidateArcs.reduce(function(a, b) {
                    return a + b;
                }, 0);
                let probabilities = candidateArcs.map(function(p) {
                    return p/sum;
                });
                idx = this.rouletteWheel(probabilities);
            }
            
            let next = nonVisited[idx];
            
            capacity -= vrp.nodes[next].demand;
            
            if (capacity < 0) {
                next = 0;
                idx = -1;
                capacity = vrp.capacity;
            }
            
            distance += vrp.distances[path[path.length-1]][next];
            path.push(next);
            if (idx !== -1) nonVisited.splice(idx, 1);
        }
        distance += vrp.distances[path[path.length-1]][0];
        path.push(0);

        if (distance < bestPath.length) {
            bestPath.path = path;
            bestPath.length = distance;
        }

        pheromones = this.evaporatePheromones(pheromones, params);

        if (iter !== 0 && iter % params.m === 0) {
            pheromones = this.globalUpdate(pheromones, bestPath.path, bestPath.length, params);
        }

        return {pheromones: pheromones, bestPath: bestPath};
    }

    newMap(n, capacity = 20, demand = {min:1, max:10}) {
        const nodes = this.randomNodes(n, 0.97, 0.97*0.9, 0.03, 0.03*0.9, demand.min, demand.max);
        const distances = nodes.map(function(node, i) {
            return nodes.map(function(other, j) {
                return Math.sqrt((node.x - other.x)**2 + (node.y - other.y)**2)
            })
        })
        return {nodes: nodes, capacity: capacity, distances: distances};
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