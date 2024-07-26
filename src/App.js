import './App.css';
import './Model/AntColony.js';

import React, { useEffect, useRef } from 'react';
import { AntColony } from './Model/AntColony.js';


function NumberInput({value, onChange, text, step=1, min, max}) {
  return (
    <span class="NumberInput" style={{backgroundColor: "lightcoral"}}>
      <label>{text}</label>
      <input type="number" value={value} onChange={onChange} step={step} min={min} max={max} style={{width:"3.8%",height: "20px", borderRadius: "5px", border: "5px"}}/>
    </ span>
  )
}

function Button({text, onClick}) {
  return (
    <button class="Button" onClick={onClick}>{text}</button>
  )
}


function App() {

  let aco = new AntColony()

  const [l, setL] = React.useState(Math.round(window.innerWidth*0.4));
  const [params, setParams] = React.useState({alpha: 0.1, beta: 2.3, q0: 0.95, tau0: 1/50, m:5, n:25})
  const [r, setR] = React.useState(0.85)
  const [vrp, setVrp] = React.useState(aco.newMap(params.n))
  const [pheromones, setPheromones] = React.useState(aco.resetPheromones(params))
  const [bestPath, setBestPath] = React.useState({path: [0], length: Infinity})
  const [running, setRunning] = React.useState(false)
  const intervalRef = React.useRef(null);
  const iter = React.useRef(0);

  const updateParams = (key) => {
    return (event, val) => {
      const newParams = {...params}
      newParams[key] = Number(event.target.value)
      setParams(newParams)
    }
  }


  return (
    <div class="App" >
      <h1 style={{color:"rgb(237, 236, 236)"}}>Weighted Graph Example</h1>
      <div class="ControlPanel" style={{backgroundColor: "lavender", height:"auto"}}>
        <label class="NumberInput" style={{backgroundColor: "lightcoral"}}>{"Número de hormigas: " + iter.current}</label>
        <Button text={running ? "Stop" : "Run"} onClick={() => {
          if (running) {
            setRunning(false)
            clearInterval(intervalRef.current)
            return
          }

          setRunning(true)
          clearInterval(intervalRef.current)
          intervalRef.current = setInterval(() => {
            const result = aco.advance(vrp, params, pheromones, bestPath, iter.current)
            const newBestPath = {...result.bestPath}
            setBestPath(newBestPath)
            const newPheromones = result.pheromones.map(row => row.map(p => p))
            setPheromones(newPheromones)
            iter.current += 1
          }, 500)
        }}/>
        <Button text={"Reset"} onClick={() => {
          setPheromones(aco.resetPheromones(params))
          setBestPath({path: [0], length: Infinity})
          iter.current = 0
          if (running) {
            clearInterval(intervalRef.current)
            setRunning(false)
          }
        }}/>
        <Button text={"New Map"} onClick={() => {
          setVrp(aco.newMap(params.n))
          setPheromones(aco.resetPheromones(params))
          setBestPath({path: [0], length: Infinity})
          if (params.n < vrp.nodes.length) {
          }
          if (running) {
            clearInterval(intervalRef.current)
            setRunning(false)
          }
        }}/>
        <NumberInput value={l} text={" Window size: "} onChange={(event, val) => setL(event.target.value)}/>
        <NumberInput value={params.n} text={"n: "} min={5} max={200} step={1} onChange={updateParams('n')}/>
        <NumberInput value={params.alpha} text={" alpha: "} min={.01} max={.5} step={.01} onChange={updateParams('alpha')}/>
        <NumberInput value={params.beta} text={" beta: "} min={.1} max={3.5} step={.1} onChange={updateParams('beta')}/>
        <NumberInput value={params.q0} text={" q0: "} min={.5} max={0.99} step={.01} onChange={updateParams('q0')}/>
        <NumberInput value={params.m} text={" m: "} min={5} max={100} step={1} onChange={updateParams('m')}/>
      </div>
      <div class="Canvas">
        <MapCanvas nodes={vrp.nodes} pheromones={pheromones} l={l*1} r={r}/>
        <MapCanvas nodes={vrp.nodes} bestPath={bestPath} l={l*1}/>
      </div>
      <div style={{backgroundColor: "grey"}}>
        <label>{r.toFixed(2)}</label>
        <input type="range" min="0" max="1" step="any" class="slider" value={r*1} onChange={(event, value) => {setR(Number(event.target.value))}}/>
      </div>
    </div>
  );
};

function MapCanvas({nodes, pheromones, bestPath, l, r=1}) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);


    if (bestPath !== undefined) {
      const beautifulColors = ["aqua", "blue", "fuchsia", "green", "lime", "maroon", "navy", "olive", "purple", "red", "silver", "teal", "yellow", "black"]
      let color = 0
      ctx.beginPath();
      ctx.moveTo(nodes[bestPath.path[0]].x*l, nodes[bestPath.path[0]].y*l);
      bestPath.path.slice(1).forEach(i => {
        ctx.lineTo(nodes[i].x*l, nodes[i].y*l);
        ctx.strokeStyle = beautifulColors[color];
        if (i === 0) {
          ctx.stroke();
          color = (color + 1) % beautifulColors.length
          ctx.beginPath();
          ctx.moveTo(nodes[i].x*l, nodes[i].y*l);
        }
      });
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (pheromones !== undefined) {
      // Draw arcs
      const minp = Math.min(...pheromones.flat())
      const maxp = Math.max(...pheromones.flat())
      
      const scale = maxp - minp === 0 ? 1 : maxp - minp
      // const delta = maxp - minp === 0 ? 0.004 : 0
      // console.log(pheromones)
      const normalPheromones = pheromones.map(row => row.map(p => ((p-minp)*0.98/(scale)) + minp))
      // console.log(normalPheromones)
      
      
      nodes.forEach((node, i) => {
        nodes.forEach((other, j) => {
                  
          if (i === j) {
            return;
          }
          
          if (normalPheromones[i][j] < r) {
            return;
          }
          
          ctx.beginPath();
          ctx.moveTo(node.x*l, node.y*l);
          ctx.lineTo(other.x*l, other.y*l);
          ctx.lineWidth = (normalPheromones[i][j]-r)*3/(1-r);
          ctx.stroke();
        });
      });

    }
    
    
    // Draw nodes
    ctx.beginPath();
    ctx.arc(nodes[0].x*l, nodes[0].y*l, 8, 0, 2 * Math.PI);
    ctx.fillStyle = "rgb(240, 128, 128)";
    ctx.fill();
    nodes.slice(1).forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x*l, node.y*l, node.demand*5/10+4, 0, 2 * Math.PI);
      ctx.fillStyle = "rgb(128, 150, 240)";
      ctx.fill();
      // ctx.stroke();
    });

  }, [nodes, pheromones, bestPath, l, r]);

  return <canvas ref={canvasRef} width={`${l}px`} height={`${l*.9}px`} style={{backgroundColor: "rgb(220, 220, 220)", borderRadius: "30px", margin: "0px 50px"}}/>;
}

export default App;
