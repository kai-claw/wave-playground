import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WaveSimulation } from './WaveSimulation';
import './App.css';

// Error boundary for canvas crash recovery
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          height: '100vh', background: '#0a0e1a', color: '#e0e0e0', flexDirection: 'column',
          gap: '16px'
        }}>
          <h2>🌊 Something went wrong</h2>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{
              padding: '10px 20px', background: '#4fc3f7', color: '#000',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Controls {
  wavelength: number;
  amplitude: number;
  waveSpeed: number;
  damping: number;
  cellSize: number;
  reflectiveBoundaries: boolean;
  visualMode: '2D' | '3D';
  colorScheme: 'ocean' | 'thermal' | 'neon' | 'grayscale';
}

const COLOR_SCHEMES = {
  ocean: {
    positive: (i: number) => [Math.floor(20 + 60 * i), Math.floor(120 + 135 * i), Math.floor(200 + 55 * i)],
    negative: (i: number) => [Math.floor(10 + 30 * i), Math.floor(30 + 60 * i), Math.floor(100 + 80 * i)],
    bg: [8, 12, 28],
  },
  thermal: {
    positive: (i: number) => [Math.floor(255 * i), Math.floor(120 * i), Math.floor(20 * i)],
    negative: (i: number) => [Math.floor(20 * i), Math.floor(80 * i), Math.floor(255 * i)],
    bg: [10, 10, 10],
  },
  neon: {
    positive: (i: number) => [Math.floor(40 + 215 * i), Math.floor(255 * i), Math.floor(100 + 155 * i)],
    negative: (i: number) => [Math.floor(180 * i), Math.floor(50 + 100 * i), Math.floor(255 * i)],
    bg: [5, 5, 15],
  },
  grayscale: {
    positive: (i: number) => { const v = Math.floor(255 * i); return [v, v, v]; },
    negative: (i: number) => { const v = Math.floor(180 * i); return [v, v, v]; },
    bg: [0, 0, 0],
  },
};

// Presets use relative coordinates (0-1) for responsive sizing
interface PresetDef {
  walls?: Array<{
    x1: number; y1: number; x2: number; y2: number;
    slits?: Array<{ start: number; end: number }>;
  }>;
  reflective?: boolean;
  sources?: Array<{ x: number; y: number; freq?: number }>;
  description: string;
}

const PRESETS: Record<string, PresetDef> = {
  'Double Slit': {
    walls: [{ x1: 0.375, y1: 0, x2: 0.375, y2: 1, slits: [{ start: 0.40, end: 0.46 }, { start: 0.54, end: 0.60 }] }],
    sources: [{ x: 0.125, y: 0.5 }],
    description: 'Classic quantum experiment — watch interference patterns form behind the slits',
  },
  'Single Slit': {
    walls: [{ x1: 0.375, y1: 0, x2: 0.375, y2: 1, slits: [{ start: 0.46, end: 0.54 }] }],
    sources: [{ x: 0.125, y: 0.5 }],
    description: 'Observe diffraction — waves bending around a single opening',
  },
  'Ripple Tank': {
    walls: [],
    sources: [{ x: 0.5, y: 0.5 }],
    description: 'Open water — click to drop more sources and watch interference',
  },
  'Two Sources': {
    walls: [],
    sources: [{ x: 0.375, y: 0.33 }, { x: 0.375, y: 0.67 }],
    description: 'Two coherent sources — constructive & destructive interference',
  },
  'Standing Waves': {
    reflective: true,
    walls: [],
    sources: [{ x: 0.5, y: 0.5 }],
    description: 'Reflective boundaries create standing wave patterns',
  },
  'Corner Reflector': {
    reflective: true,
    walls: [
      { x1: 0.625, y1: 0.167, x2: 0.625, y2: 0.667 },
      { x1: 0.625, y1: 0.667, x2: 0.25, y2: 0.667 },
    ],
    sources: [{ x: 0.4375, y: 0.417 }],
    description: 'Waves reflecting off an L-shaped barrier',
  },
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<WaveSimulation | null>(null);
  const animationRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const dragSourceRef = useRef<number>(-1);
  const timeRef = useRef(0);
  const canvasSizeRef = useRef({ w: 800, h: 600 });

  const [controls, setControls] = useState<Controls>({
    wavelength: 50,
    amplitude: 1,
    waveSpeed: 0.5,
    damping: 0.995,
    cellSize: 4,
    reflectiveBoundaries: false,
    visualMode: '2D',
    colorScheme: 'ocean',
  });

  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [sourceCount, setSourceCount] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(true);

  // ──────── Responsive canvas ────────
  const resizeCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    canvasSizeRef.current = { w, h };

    // Re-create simulation for new size
    const sim = new WaveSimulation(w, h, controls.cellSize);
    sim.waveSpeed = controls.waveSpeed;
    sim.damping = controls.damping;
    sim.reflectiveBoundaries = controls.reflectiveBoundaries;

    // Carry over sources if possible
    if (simulationRef.current) {
      sim.sources = simulationRef.current.sources;
      sim.walls = simulationRef.current.walls;
    }

    simulationRef.current = sim;
  }, [controls.cellSize, controls.waveSpeed, controls.damping, controls.reflectiveBoundaries]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeCanvas]);

  // ──────── Sync params ────────
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.waveSpeed = controls.waveSpeed;
      simulationRef.current.damping = controls.damping;
      simulationRef.current.reflectiveBoundaries = controls.reflectiveBoundaries;
    }
  }, [controls.waveSpeed, controls.damping, controls.reflectiveBoundaries]);

  // ──────── 2D Rendering ────────
  const render2D = (ctx: CanvasRenderingContext2D, sim: WaveSimulation, w: number, h: number) => {
    const scheme = COLOR_SCHEMES[controls.colorScheme];
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    const [bgR, bgG, bgB] = scheme.bg;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const value = sim.getValue(x, y);
        const intensity = Math.min(1, Math.abs(value) * 0.5);
        const idx = (y * w + x) * 4;

        if (intensity < 0.01) {
          data[idx] = bgR;
          data[idx + 1] = bgG;
          data[idx + 2] = bgB;
        } else if (value > 0) {
          const [r, g, b] = scheme.positive(intensity);
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
        } else {
          const [r, g, b] = scheme.negative(intensity);
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
        }
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };

  // ──────── 3D Isometric Surface Rendering ────────
  const render3D = (ctx: CanvasRenderingContext2D, sim: WaveSimulation, w: number, h: number) => {
    const scheme = COLOR_SCHEMES[controls.colorScheme];
    ctx.fillStyle = `rgb(${scheme.bg.join(',')})`;
    ctx.fillRect(0, 0, w, h);

    const step = 6; // Grid step for the surface mesh
    const gridW = Math.floor(sim.cols / (step / sim.cellSize));
    const gridH = Math.floor(sim.rows / (step / sim.cellSize));
    const heightScale = 40; // How much wave values translate to visual height
    const tiltX = 0.65; // Isometric tilt factor
    const tiltY = 0.35;
    const scaleX = w / (gridW + gridH * tiltX);
    const scaleY = (h * 0.7) / (gridH * tiltY + 1);

    const offsetX = w * 0.1;
    const offsetY = h * 0.15;

    // Project a grid point to screen space
    const project = (gx: number, gy: number, height: number): [number, number] => {
      const sx = (gx - gy * tiltX) * scaleX + offsetX + gridH * tiltX * scaleX * 0.5;
      const sy = (gy * tiltY - height * 0.03) * scaleY + offsetY + h * 0.3;
      return [sx, sy];
    };

    // Build height map from simulation
    const heights: number[][] = [];
    for (let gy = 0; gy < gridH; gy++) {
      heights[gy] = [];
      for (let gx = 0; gx < gridW; gx++) {
        const simX = gx * step;
        const simY = gy * step;
        heights[gy][gx] = sim.getValue(simX, simY) * heightScale;
      }
    }

    // Draw from back to front (painter's algorithm)
    for (let gy = 0; gy < gridH - 1; gy++) {
      for (let gx = 0; gx < gridW - 1; gx++) {
        const h0 = heights[gy][gx];
        const h1 = heights[gy][gx + 1];
        const h2 = heights[gy + 1][gx + 1];
        const h3 = heights[gy + 1][gx];

        const avgH = (h0 + h1 + h2 + h3) / 4;
        const normalizedH = Math.min(1, Math.abs(avgH) / (heightScale * 0.4));

        const [x0, y0] = project(gx, gy, h0);
        const [x1, y1] = project(gx + 1, gy, h1);
        const [x2, y2] = project(gx + 1, gy + 1, h2);
        const [x3, y3] = project(gy + 1 === gridH ? gx : gx, gy + 1, h3);

        // Color based on height
        let r: number, g: number, b: number;
        if (avgH > 0) {
          [r, g, b] = scheme.positive(normalizedH);
        } else {
          [r, g, b] = scheme.negative(normalizedH);
        }

        // Shading based on slope (simple lighting)
        const slope = Math.abs(h1 - h0) + Math.abs(h3 - h0);
        const shade = Math.min(1, 0.6 + slope * 0.05);

        ctx.fillStyle = `rgb(${Math.floor(r * shade)},${Math.floor(g * shade)},${Math.floor(b * shade)})`;
        ctx.strokeStyle = `rgba(${Math.floor(r * shade * 0.7)},${Math.floor(g * shade * 0.7)},${Math.floor(b * shade * 0.7)},0.4)`;
        ctx.lineWidth = 0.5;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Draw grid lines for depth perception
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (let gy = 0; gy < gridH; gy += 3) {
      ctx.beginPath();
      for (let gx = 0; gx < gridW; gx++) {
        const [sx, sy] = project(gx, gy, heights[gy]?.[gx] ?? 0);
        if (gx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
  };

  // ──────── Main render ────────
  const render = useCallback((canvas: HTMLCanvasElement, sim: WaveSimulation) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = canvasSizeRef.current;

    if (controls.visualMode === '2D') {
      render2D(ctx, sim, w, h);
    } else {
      render3D(ctx, sim, w, h);
    }

    // Draw sources as glowing dots
    sim.sources.forEach((source) => {
      const x = source.x * sim.cellSize;
      const y = source.y * sim.cellSize;

      // Glow
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 12);
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.4, 'rgba(100,200,255,0.5)');
      gradient.addColorStop(1, 'rgba(100,200,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw walls
    ctx.lineWidth = 3;
    sim.walls.forEach(wall => {
      const x1 = wall.x1 * sim.cellSize;
      const y1 = wall.y1 * sim.cellSize;
      const x2 = wall.x2 * sim.cellSize;
      const y2 = wall.y2 * sim.cellSize;

      // Wall shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x1 + 1, y1 + 1);
      ctx.lineTo(x2 + 1, y2 + 1);
      ctx.stroke();

      // Wall
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw slits as bright gaps
      if (wall.slits) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 5;
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
      }
    });

    // HUD — source count
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 8, 120, 28);
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '12px monospace';
    ctx.fillText(`Sources: ${sim.sources.length}`, 16, 26);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.visualMode, controls.colorScheme]);

  // ──────── Animation loop ────────
  useEffect(() => {
    const animate = () => {
      const canvas = canvasRef.current;
      const sim = simulationRef.current;

      if (canvas && sim) {
        if (isPlaying) {
          sim.step(timeRef.current);
          timeRef.current += 1;
        }
        render(canvas, sim);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, render]);

  // ──────── Interaction ────────
  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const sim = simulationRef.current;
    if (!sim) return;

    const { x, y } = getCanvasCoords(e);

    // Check if clicking on a source
    for (let i = 0; i < sim.sources.length; i++) {
      const source = sim.sources[i];
      const sx = source.x * sim.cellSize;
      const sy = source.y * sim.cellSize;
      if (Math.hypot(x - sx, y - sy) < 14) {
        isDraggingRef.current = true;
        dragSourceRef.current = i;
        return;
      }
    }

    // Right-click removes nearest source
    if (e.button === 2) {
      e.preventDefault();
      let minDist = Infinity;
      let minIdx = -1;
      sim.sources.forEach((s, i) => {
        const d = Math.hypot(x - s.x * sim.cellSize, y - s.y * sim.cellSize);
        if (d < minDist) { minDist = d; minIdx = i; }
      });
      if (minIdx >= 0 && minDist < 30) {
        sim.sources.splice(minIdx, 1);
        setSourceCount(sim.sources.length);
      }
      return;
    }

    // Otherwise add source
    const frequency = 2 * Math.PI / controls.wavelength;
    sim.addSource(x, y, frequency, controls.amplitude);
    setSourceCount(sim.sources.length);
    setShowHelp(false);
  }, [controls.wavelength, controls.amplitude]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const sim = simulationRef.current;
    if (!sim) return;

    const { x, y } = getCanvasCoords(e);
    const source = sim.sources[dragSourceRef.current];
    if (source) {
      const oldX = source.x;
      const oldY = source.y;
      source.x = x / sim.cellSize;
      source.y = y / sim.cellSize;
      source.vx = (source.x - oldX) * 0.1;
      source.vy = (source.y - oldY) * 0.1;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      const sim = simulationRef.current;
      const source = sim?.sources[dragSourceRef.current];
      if (source) {
        source.vx = 0;
        source.vy = 0;
      }
    }
    isDraggingRef.current = false;
    dragSourceRef.current = -1;
  }, []);

  // ──────── Touch support ────────
  const getTouchCoords = useCallback((e: React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0] || e.changedTouches[0];
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const sim = simulationRef.current;
    if (!sim) return;
    const { x, y } = getTouchCoords(e);

    // Check if touching a source (for drag)
    for (let i = 0; i < sim.sources.length; i++) {
      const source = sim.sources[i];
      const sx = source.x * sim.cellSize;
      const sy = source.y * sim.cellSize;
      if (Math.hypot(x - sx, y - sy) < 24) { // larger touch target
        isDraggingRef.current = true;
        dragSourceRef.current = i;
        return;
      }
    }

    // Two-finger touch removes nearest source
    if (e.touches.length >= 2) {
      let minDist = Infinity;
      let minIdx = -1;
      sim.sources.forEach((s, i) => {
        const d = Math.hypot(x - s.x * sim.cellSize, y - s.y * sim.cellSize);
        if (d < minDist) { minDist = d; minIdx = i; }
      });
      if (minIdx >= 0 && minDist < 40) {
        sim.sources.splice(minIdx, 1);
        setSourceCount(sim.sources.length);
      }
      return;
    }

    // Single tap adds source
    const frequency = 2 * Math.PI / controls.wavelength;
    sim.addSource(x, y, frequency, controls.amplitude);
    setSourceCount(sim.sources.length);
    setShowHelp(false);
  }, [controls.wavelength, controls.amplitude, getTouchCoords]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!isDraggingRef.current) return;
    const sim = simulationRef.current;
    if (!sim) return;

    const { x, y } = getTouchCoords(e);
    const source = sim.sources[dragSourceRef.current];
    if (source) {
      const oldX = source.x;
      const oldY = source.y;
      source.x = x / sim.cellSize;
      source.y = y / sim.cellSize;
      source.vx = (source.x - oldX) * 0.1;
      source.vy = (source.y - oldY) * 0.1;
    }
  }, [getTouchCoords]);

  const handleTouchEnd = useCallback(() => {
    if (isDraggingRef.current) {
      const sim = simulationRef.current;
      const source = sim?.sources[dragSourceRef.current];
      if (source) {
        source.vx = 0;
        source.vy = 0;
      }
    }
    isDraggingRef.current = false;
    dragSourceRef.current = -1;
  }, []);

  // ──────── Keyboard shortcuts ────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(p => !p);
          break;
        case 'Escape':
          setShowHelp(false);
          break;
        case 'c':
        case 'C':
          clearSimulation();
          break;
        case 'h':
        case 'H':
          setShowHelp(h => !h);
          break;
        case 'p':
        case 'P':
          setShowControls(s => !s);
          break;
        case '1': loadPreset('Double Slit'); break;
        case '2': loadPreset('Single Slit'); break;
        case '3': loadPreset('Ripple Tank'); break;
        case '4': loadPreset('Two Sources'); break;
        case '5': loadPreset('Standing Waves'); break;
        case '6': loadPreset('Corner Reflector'); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.wavelength, controls.amplitude]);

  // ──────── Presets ────────
  const loadPreset = useCallback((name: string) => {
    const sim = simulationRef.current;
    if (!sim) return;

    sim.clear();
    const preset = PRESETS[name];
    if (!preset) return;

    const { w, h } = canvasSizeRef.current;

    if (preset.reflective) {
      setControls(prev => ({ ...prev, reflectiveBoundaries: true }));
      sim.reflectiveBoundaries = true;
    } else {
      setControls(prev => ({ ...prev, reflectiveBoundaries: false }));
      sim.reflectiveBoundaries = false;
    }

    // Scale relative (0-1) coordinates to actual canvas size
    preset.walls?.forEach(wall => {
      sim.addWall(
        wall.x1 * w, wall.y1 * h,
        wall.x2 * w, wall.y2 * h,
        wall.slits
      );
    });

    const frequency = 2 * Math.PI / controls.wavelength;
    preset.sources?.forEach(s => {
      sim.addSource(s.x * w, s.y * h, s.freq ?? frequency, controls.amplitude);
    });

    setSourceCount(sim.sources.length);
    setActivePreset(name);
    setShowHelp(false);
    timeRef.current = 0;
  }, [controls.wavelength, controls.amplitude]);

  const clearSimulation = () => {
    simulationRef.current?.clear();
    setSourceCount(0);
    setActivePreset(null);
    timeRef.current = 0;
  };

  // ──────── Render UI ────────
  return (
    <ErrorBoundary>
    <div className="app" onContextMenu={e => e.preventDefault()}>
      <div className="canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Wave simulation canvas. Click to add wave sources, drag to move them. Use keyboard shortcuts: Space to play/pause, C to clear, H for help, 1-6 for presets."
          tabIndex={0}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {showHelp && sourceCount === 0 && (
          <div className="help-overlay">
            <div className="help-content">
              <h2>🌊 Wave Playground</h2>
              <p>Click anywhere to drop a wave source</p>
              <p className="help-sub">Drag sources for Doppler effect · Right-click to remove</p>
              <p className="help-sub">Or try a preset →</p>
            </div>
          </div>
        )}
      </div>

      <button
        className="toggle-controls"
        onClick={() => setShowControls(!showControls)}
        title={showControls ? 'Hide controls' : 'Show controls'}
        aria-label={showControls ? 'Hide controls panel' : 'Show controls panel'}
        aria-expanded={showControls}
      >
        {showControls ? '✕' : '☰'}
      </button>

      <div className={`controls ${showControls ? 'show' : 'hide'}`} role="region" aria-label="Simulation controls">
        <h3>Wave Playground</h3>

        {/* Transport */}
        <div className="control-group transport">
          <button className="btn-play" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button className="btn-clear" onClick={clearSimulation}>⟲ Clear</button>
        </div>

        {/* View */}
        <div className="control-group">
          <label>View Mode</label>
          <div className="button-row">
            <button
              className={controls.visualMode === '2D' ? 'active' : ''}
              onClick={() => setControls(prev => ({ ...prev, visualMode: '2D' }))}
            >
              2D Heatmap
            </button>
            <button
              className={controls.visualMode === '3D' ? 'active' : ''}
              onClick={() => setControls(prev => ({ ...prev, visualMode: '3D' }))}
            >
              3D Surface
            </button>
          </div>
        </div>

        <div className="control-group">
          <label>Color Scheme</label>
          <select
            value={controls.colorScheme}
            onChange={(e) => setControls(prev => ({ ...prev, colorScheme: e.target.value as Controls['colorScheme'] }))}
          >
            <option value="ocean">🌊 Ocean</option>
            <option value="thermal">🔥 Thermal</option>
            <option value="neon">💚 Neon</option>
            <option value="grayscale">⬜ Grayscale</option>
          </select>
        </div>

        {/* Wave params */}
        <div className="control-section">
          <h4>Wave Parameters</h4>

          <div className="control-group">
            <label htmlFor="wavelength-slider">Wavelength: <span className="value">{controls.wavelength}</span></label>
            <input
              id="wavelength-slider"
              type="range" min="15" max="120"
              value={controls.wavelength}
              aria-valuenow={controls.wavelength}
              aria-valuemin={15} aria-valuemax={120}
              onChange={(e) => setControls(prev => ({ ...prev, wavelength: Number(e.target.value) }))}
            />
          </div>

          <div className="control-group">
            <label htmlFor="amplitude-slider">Amplitude: <span className="value">{controls.amplitude.toFixed(1)}</span></label>
            <input
              id="amplitude-slider"
              type="range" min="0.1" max="3" step="0.1"
              value={controls.amplitude}
              aria-valuenow={controls.amplitude}
              aria-valuemin={0.1} aria-valuemax={3}
              onChange={(e) => setControls(prev => ({ ...prev, amplitude: Number(e.target.value) }))}
            />
          </div>

          <div className="control-group">
            <label htmlFor="speed-slider">Speed: <span className="value">{controls.waveSpeed.toFixed(2)}</span></label>
            <input
              id="speed-slider"
              type="range" min="0.1" max="1.5" step="0.05"
              value={controls.waveSpeed}
              aria-valuenow={controls.waveSpeed}
              aria-valuemin={0.1} aria-valuemax={1.5}
              onChange={(e) => setControls(prev => ({ ...prev, waveSpeed: Number(e.target.value) }))}
            />
          </div>

          <div className="control-group">
            <label htmlFor="damping-slider">Damping: <span className="value">{controls.damping.toFixed(3)}</span></label>
            <input
              id="damping-slider"
              type="range" min="0.980" max="1.000" step="0.001"
              value={controls.damping}
              aria-valuenow={controls.damping}
              aria-valuemin={0.98} aria-valuemax={1.0}
              onChange={(e) => setControls(prev => ({ ...prev, damping: Number(e.target.value) }))}
            />
          </div>

          <div className="control-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={controls.reflectiveBoundaries}
                onChange={(e) => setControls(prev => ({ ...prev, reflectiveBoundaries: e.target.checked }))}
              />
              Reflective Boundaries
            </label>
          </div>
        </div>

        {/* Presets */}
        <div className="control-section">
          <h4>Presets</h4>
          <div className="preset-grid">
            {Object.entries(PRESETS).map(([name, preset]) => (
              <button
                key={name}
                className={`preset-btn ${activePreset === name ? 'active' : ''}`}
                onClick={() => loadPreset(name)}
                title={preset.description}
              >
                {name}
              </button>
            ))}
          </div>
          {activePreset && (
            <p className="preset-desc">{PRESETS[activePreset]?.description}</p>
          )}
        </div>

        {/* Help */}
        <div className="instructions">
          <h4>How to Use</h4>
          <p>🖱️ <strong>Click</strong> canvas to add wave sources</p>
          <p>✋ <strong>Drag</strong> a source to move it (Doppler effect!)</p>
          <p>🗑️ <strong>Right-click</strong> near a source to remove it</p>
          <p>📐 Try <strong>Double Slit</strong> to see quantum interference</p>
          <p>🔄 Toggle <strong>3D Surface</strong> for a height-map view</p>
        </div>

        <div className="control-section">
          <h4>Keyboard Shortcuts</h4>
          <div className="instructions">
            <p><kbd>Space</kbd> Play / Pause</p>
            <p><kbd>C</kbd> Clear simulation</p>
            <p><kbd>H</kbd> Toggle help</p>
            <p><kbd>P</kbd> Toggle panel</p>
            <p><kbd>1</kbd>–<kbd>6</kbd> Load presets</p>
          </div>
        </div>

        <div className="footer">
          <a href="https://github.com/kai-claw/wave-playground" target="_blank" rel="noopener noreferrer">
            GitHub ↗
          </a>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}

export default App;
