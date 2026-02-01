import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WaveSimulation, WaveSource } from './WaveSimulation';
import './App.css';

interface Controls {
  wavelength: number;
  amplitude: number;
  waveSpeed: number;
  damping: number;
  cellSize: number;
  reflectiveBoundaries: boolean;
  visualMode: '2D' | '3D';
}

const PRESETS = {
  'Double Slit': { walls: [{ x1: 300, y1: 100, x2: 300, y2: 500, slits: [{ start: 0.4, end: 0.45 }, { start: 0.55, end: 0.6 }] }] },
  'Single Slit': { walls: [{ x1: 300, y1: 100, x2: 300, y2: 500, slits: [{ start: 0.47, end: 0.53 }] }] },
  'Ripple Tank': { walls: [] },
  'Standing Waves': { reflective: true, walls: [] }
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<WaveSimulation | null>(null);
  const animationRef = useRef<number>();
  const isDraggingRef = useRef(false);
  const dragSourceRef = useRef<number>(-1);
  
  const [controls, setControls] = useState<Controls>({
    wavelength: 50,
    amplitude: 1,
    waveSpeed: 0.5,
    damping: 0.995,
    cellSize: 4,
    reflectiveBoundaries: false,
    visualMode: '2D'
  });
  
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  
  // Initialize simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    canvas.width = 800;
    canvas.height = 600;
    
    simulationRef.current = new WaveSimulation(canvas.width, canvas.height, controls.cellSize);
    simulationRef.current.waveSpeed = controls.waveSpeed;
    simulationRef.current.damping = controls.damping;
    simulationRef.current.reflectiveBoundaries = controls.reflectiveBoundaries;
  }, [controls.cellSize]);
  
  // Update simulation parameters
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.waveSpeed = controls.waveSpeed;
      simulationRef.current.damping = controls.damping;
      simulationRef.current.reflectiveBoundaries = controls.reflectiveBoundaries;
    }
  }, [controls.waveSpeed, controls.damping, controls.reflectiveBoundaries]);
  
  // Animation loop
  useEffect(() => {
    let time = 0;
    
    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      
      const canvas = canvasRef.current;
      const simulation = simulationRef.current;
      
      if (canvas && simulation) {
        // Update simulation
        simulation.step(time);
        time += 1;
        
        // Render
        render(canvas, simulation);
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, controls.visualMode]);
  
  const render = (canvas: HTMLCanvasElement, simulation: WaveSimulation) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;
    
    if (controls.visualMode === '2D') {
      // 2D heatmap
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const value = simulation.getValue(x, y);
          const intensity = Math.max(0, Math.min(1, Math.abs(value) * 0.5));
          const idx = (y * canvas.width + x) * 4;
          
          if (value > 0) {
            // Red for positive
            data[idx] = Math.floor(255 * intensity);     // R
            data[idx + 1] = Math.floor(100 * intensity); // G
            data[idx + 2] = Math.floor(100 * intensity); // B
          } else {
            // Blue for negative
            data[idx] = Math.floor(100 * intensity);     // R
            data[idx + 1] = Math.floor(100 * intensity); // G
            data[idx + 2] = Math.floor(255 * intensity); // B
          }
          data[idx + 3] = 255; // A
        }
      }
    } else {
      // 3D-style visualization (simplified)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const value = simulation.getValue(x, y);
          const intensity = Math.max(0, Math.min(1, Math.abs(value) * 0.3));
          const height = value * 20;
          
          const idx = (y * canvas.width + x) * 4;
          if (value > 0) {
            data[idx] = Math.floor(255 * intensity);
            data[idx + 1] = Math.floor(255 * intensity);
            data[idx + 2] = 255;
          } else {
            data[idx] = 255;
            data[idx + 1] = Math.floor(100 * intensity);
            data[idx + 2] = Math.floor(100 * intensity);
          }
          data[idx + 3] = 255;
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Draw sources
    ctx.fillStyle = '#fff';
    simulation.sources.forEach((source, i) => {
      const x = source.x * simulation.cellSize;
      const y = source.y * simulation.cellSize;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Draw walls
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    simulation.walls.forEach(wall => {
      const x1 = wall.x1 * simulation.cellSize;
      const y1 = wall.y1 * simulation.cellSize;
      const x2 = wall.x2 * simulation.cellSize;
      const y2 = wall.y2 * simulation.cellSize;
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Draw slits as gaps
      if (wall.slits) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        wall.slits.forEach(slit => {
          const sx1 = x1 + (x2 - x1) * slit.start;
          const sy1 = y1 + (y2 - y1) * slit.start;
          const sx2 = x1 + (x2 - x1) * slit.end;
          const sy2 = y1 + (y2 - y1) * slit.end;
          
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        });
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
      }
    });
  };
  
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const simulation = simulationRef.current;
    if (!canvas || !simulation) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const frequency = 2 * Math.PI / controls.wavelength;
    simulation.addSource(x, y, frequency, controls.amplitude);
  }, [controls.wavelength, controls.amplitude]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const simulation = simulationRef.current;
    if (!canvas || !simulation) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicking on a source
    for (let i = 0; i < simulation.sources.length; i++) {
      const source = simulation.sources[i];
      const sx = source.x * simulation.cellSize;
      const sy = source.y * simulation.cellSize;
      const distance = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2);
      
      if (distance < 10) {
        isDraggingRef.current = true;
        dragSourceRef.current = i;
        return;
      }
    }
    
    // Otherwise add new source
    handleCanvasClick(e);
  }, [handleCanvasClick]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    
    const canvas = canvasRef.current;
    const simulation = simulationRef.current;
    if (!canvas || !simulation) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const source = simulation.sources[dragSourceRef.current];
    if (source) {
      const oldX = source.x;
      const oldY = source.y;
      source.x = x / simulation.cellSize;
      source.y = y / simulation.cellSize;
      
      // Calculate velocity for Doppler effect
      source.vx = (source.x - oldX) * 0.1;
      source.vy = (source.y - oldY) * 0.1;
    }
  }, []);
  
  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragSourceRef.current = -1;
  }, []);
  
  const loadPreset = (presetName: string) => {
    const simulation = simulationRef.current;
    if (!simulation) return;
    
    simulation.clear();
    const preset = PRESETS[presetName as keyof typeof PRESETS];
    
    if (preset.walls) {
      preset.walls.forEach(wall => {
        simulation.addWall(wall.x1, wall.y1, wall.x2, wall.y2, wall.slits);
      });
    }
    
    if (preset.reflective) {
      setControls(prev => ({ ...prev, reflectiveBoundaries: true }));
    }
  };
  
  const clearSimulation = () => {
    simulationRef.current?.clear();
  };
  
  return (
    <div className="app">
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
      
      <button 
        className="toggle-controls"
        onClick={() => setShowControls(!showControls)}
      >
        {showControls ? '◀' : '▶'}
      </button>
      
      <div className={`controls ${showControls ? 'show' : 'hide'}`}>
        <h3>Wave Playground</h3>
        
        <div className="control-group">
          <button onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button onClick={clearSimulation}>Clear</button>
        </div>
        
        <div className="control-group">
          <label>Wavelength: {controls.wavelength}</label>
          <input
            type="range"
            min="20"
            max="100"
            value={controls.wavelength}
            onChange={(e) => setControls(prev => ({ ...prev, wavelength: Number(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>Amplitude: {controls.amplitude.toFixed(1)}</label>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            value={controls.amplitude}
            onChange={(e) => setControls(prev => ({ ...prev, amplitude: Number(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>Speed: {controls.waveSpeed.toFixed(2)}</label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={controls.waveSpeed}
            onChange={(e) => setControls(prev => ({ ...prev, waveSpeed: Number(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>Damping: {controls.damping.toFixed(3)}</label>
          <input
            type="range"
            min="0.99"
            max="1"
            step="0.001"
            value={controls.damping}
            onChange={(e) => setControls(prev => ({ ...prev, damping: Number(e.target.value) }))}
          />
        </div>
        
        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={controls.reflectiveBoundaries}
              onChange={(e) => setControls(prev => ({ ...prev, reflectiveBoundaries: e.target.checked }))}
            />
            Reflective Boundaries
          </label>
        </div>
        
        <div className="control-group">
          <label>View Mode:</label>
          <select
            value={controls.visualMode}
            onChange={(e) => setControls(prev => ({ ...prev, visualMode: e.target.value as '2D' | '3D' }))}
          >
            <option value="2D">2D Heatmap</option>
            <option value="3D">3D Surface</option>
          </select>
        </div>
        
        <div className="control-group">
          <h4>Presets</h4>
          {Object.keys(PRESETS).map(preset => (
            <button key={preset} onClick={() => loadPreset(preset)}>
              {preset}
            </button>
          ))}
        </div>
        
        <div className="instructions">
          <h4>Instructions</h4>
          <p>• Click to add wave sources</p>
          <p>• Drag sources for Doppler effect</p>
          <p>• Use presets for specific demos</p>
        </div>
      </div>
    </div>
  );
}

export default App;