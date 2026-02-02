import { useRef, useEffect, useState, useCallback } from 'react';
import { WaveSimulation } from './WaveSimulation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { render2D, render3D } from './renderers';
import { COLOR_SCHEMES, PRESETS, PRESET_NAMES, CINEMATIC_INTERVAL, DEFAULT_CONTROLS } from './constants';
import type { Controls, ProbeLine } from './types';
import './App.css';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<WaveSimulation | null>(null);
  const animationRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const dragSourceRef = useRef<number>(-1);
  const timeRef = useRef(0);
  const canvasSizeRef = useRef({ w: 800, h: 600 });

  const [controls, setControls] = useState<Controls>({ ...DEFAULT_CONTROLS });
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [sourceCount, setSourceCount] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Cinematic autoplay state
  const [cinematic, setCinematic] = useState(false);
  const cinematicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cinematicIndexRef = useRef(0);
  const [cinematicProgress, setCinematicProgress] = useState(0);

  // Drawing mode state
  const drawPointsRef = useRef<Array<{x: number; y: number}>>([]);
  const isDrawingRef = useRef(false);

  // Probe line state
  const [probeLine, setProbeLine] = useState<ProbeLine | null>(null);
  const isPlacingProbeRef = useRef(false);
  const probeStartRef = useRef<{x: number; y: number} | null>(null);

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

    const sim = new WaveSimulation(w, h, controls.cellSize);
    sim.waveSpeed = controls.waveSpeed;
    sim.damping = controls.damping;
    sim.reflectiveBoundaries = controls.reflectiveBoundaries;

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

  // ──────── Auto-load preset on first mount ────────
  const hasAutoLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoLoadedRef.current && simulationRef.current) {
      hasAutoLoadedRef.current = true;
      requestAnimationFrame(() => loadPreset('Double Slit'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationRef.current]);

  // ──────── Cinematic autoplay ────────
  useEffect(() => {
    if (cinematic) {
      cinematicIndexRef.current = PRESET_NAMES.indexOf(activePreset ?? '') + 1;
      setCinematicProgress(0);
      const startTime = Date.now();
      cinematicTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const currentCycle = Math.floor(elapsed / CINEMATIC_INTERVAL);
        setCinematicProgress((elapsed % CINEMATIC_INTERVAL) / CINEMATIC_INTERVAL);
        const targetIdx = (cinematicIndexRef.current + currentCycle) % PRESET_NAMES.length;
        if (PRESET_NAMES[targetIdx] !== activePreset) {
          loadPreset(PRESET_NAMES[targetIdx]);
        }
      }, 100);
    }
    return () => {
      if (cinematicTimerRef.current) clearInterval(cinematicTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinematic]);

  // ──────── Sync params ────────
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.waveSpeed = controls.waveSpeed;
      simulationRef.current.damping = controls.damping;
      simulationRef.current.reflectiveBoundaries = controls.reflectiveBoundaries;
    }
  }, [controls.waveSpeed, controls.damping, controls.reflectiveBoundaries]);

  // ──────── Render overlays (sources, walls, probe, HUD) ────────
  const renderOverlays = useCallback((
    ctx: CanvasRenderingContext2D,
    sim: WaveSimulation,
    w: number,
    h: number,
  ) => {
    const scheme = COLOR_SCHEMES[controls.colorScheme];
    const t = timeRef.current;

    // Draw sources with pulsing glow and expanding rings
    sim.sources.forEach((source) => {
      const x = source.x * sim.cellSize;
      const y = source.y * sim.cellSize;
      const pulse = 0.5 + 0.5 * Math.sin(t * source.frequency + source.phase);
      const outerR = 10 + 8 * pulse;
      const coreR = 2.5 + 1.5 * pulse;
      const glowAlpha = 0.4 + 0.5 * pulse;

      for (let ring = 0; ring < 3; ring++) {
        const ringPhase = (t * source.frequency * 0.3 + ring * 2.1) % (Math.PI * 2);
        const ringProgress = ringPhase / (Math.PI * 2);
        const ringRadius = 18 + ringProgress * 45;
        const ringAlpha = (1 - ringProgress) * 0.25 * source.amplitude;
        if (ringAlpha > 0.02) {
          ctx.strokeStyle = `rgba(100, 200, 255, ${ringAlpha.toFixed(3)})`;
          ctx.lineWidth = 1.5 * (1 - ringProgress * 0.7);
          ctx.beginPath();
          ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, outerR);
      gradient.addColorStop(0, `rgba(255,255,255,${(0.85 + 0.15 * pulse).toFixed(2)})`);
      gradient.addColorStop(0.3, `rgba(100,200,255,${glowAlpha.toFixed(2)})`);
      gradient.addColorStop(0.7, `rgba(60,150,220,${(glowAlpha * 0.3).toFixed(2)})`);
      gradient.addColorStop(1, 'rgba(100,200,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, outerR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255,255,255,${(0.9 + 0.1 * pulse).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, coreR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(200,235,255,${(0.4 * pulse).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, coreR * 0.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw walls
    ctx.lineWidth = 3;
    sim.walls.forEach(wall => {
      const x1 = wall.x1 * sim.cellSize;
      const y1 = wall.y1 * sim.cellSize;
      const x2 = wall.x2 * sim.cellSize;
      const y2 = wall.y2 * sim.cellSize;

      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x1 + 1, y1 + 1);
      ctx.lineTo(x2 + 1, y2 + 1);
      ctx.stroke();

      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (wall.slits) {
        ctx.strokeStyle = `rgb(${scheme.bg.join(',')})`;
        ctx.lineWidth = 7;
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

        ctx.strokeStyle = 'rgba(100, 200, 255, 0.15)';
        ctx.lineWidth = 12;
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

    // Draw paint trail preview
    if (isDrawingRef.current && drawPointsRef.current.length > 1) {
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const pts = drawPointsRef.current;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(79, 195, 247, 0.15)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }

    // Draw probe line and waveform
    if (probeLine) {
      const { x1, y1, x2, y2 } = probeLine;

      ctx.strokeStyle = 'rgba(255, 200, 50, 0.3)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 200, 50, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      [{ x: x1, y: y1 }, { x: x2, y: y2 }].forEach(pt => {
        ctx.fillStyle = 'rgba(255, 200, 50, 0.9)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });

      const samples = sim.sampleLine(x1, y1, x2, y2, 128);
      const chartW = 200;
      const chartH = 80;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const chartX = Math.min(w - chartW - 10, Math.max(10, midX - chartW / 2));
      const chartY = Math.min(h - chartH - 10, Math.max(10, midY - chartH - 20));

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeStyle = 'rgba(255, 200, 50, 0.4)';
      ctx.lineWidth = 1;
      const borderR = 8;
      ctx.beginPath();
      ctx.roundRect(chartX - 4, chartY - 4, chartW + 8, chartH + 8, borderR);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartX, chartY + chartH / 2);
      ctx.lineTo(chartX + chartW, chartY + chartH / 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 200, 50, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let maxAbs = 0;
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > maxAbs) maxAbs = a;
      }
      const scale = maxAbs > 0.01 ? (chartH * 0.4) / maxAbs : 1;
      for (let i = 0; i < samples.length; i++) {
        const sx = chartX + (i / (samples.length - 1)) * chartW;
        const sy = chartY + chartH / 2 - samples[i] * scale;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 200, 50, 0.1)';
      ctx.beginPath();
      ctx.moveTo(chartX, chartY + chartH / 2);
      for (let i = 0; i < samples.length; i++) {
        const sx = chartX + (i / (samples.length - 1)) * chartW;
        const sy = chartY + chartH / 2 - samples[i] * scale;
        ctx.lineTo(sx, sy);
      }
      ctx.lineTo(chartX + chartW, chartY + chartH / 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 200, 50, 0.7)';
      ctx.font = '10px monospace';
      ctx.fillText('PROBE', chartX + 4, chartY + 12);
    }

    // HUD badge
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 165, 30, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(8, 8, 165, 30, 8);
    ctx.stroke();
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '12px monospace';
    const modeLabel = controls.interactionMode === 'impulse' ? '💧' : controls.interactionMode === 'draw' ? '🖌️' : '🔵';
    ctx.fillText(`${modeLabel} Sources: ${sim.sources.length}`, 18, 27);
    ctx.restore();
  }, [controls.colorScheme, controls.interactionMode, probeLine]);

  // ──────── Main render ────────
  const render = useCallback((canvas: HTMLCanvasElement, sim: WaveSimulation) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = canvasSizeRef.current;
    const scheme = COLOR_SCHEMES[controls.colorScheme];

    if (controls.visualMode === '2D') {
      render2D(ctx, sim, w, h, scheme);
    } else {
      render3D(ctx, sim, w, h, scheme);
    }

    renderOverlays(ctx, sim, w, h);
  }, [controls.visualMode, controls.colorScheme, renderOverlays]);

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

  // ──────── Interaction helpers ────────
  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const sim = simulationRef.current;
    if (!sim) return;
    const { x, y } = getCanvasCoords(e);

    if (e.button === 2) {
      e.preventDefault();
      setProbeLine(null);
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

    if (isPlacingProbeRef.current) {
      if (!probeStartRef.current) {
        probeStartRef.current = { x, y };
        setProbeLine({ x1: x, y1: y, x2: x, y2: y });
      }
      return;
    }

    const mode = controls.interactionMode;
    if (mode === 'impulse') {
      sim.applyImpulse(x, y, 30, controls.amplitude * 3);
      setShowHelp(false);
    } else if (mode === 'draw') {
      isDrawingRef.current = true;
      drawPointsRef.current = [{ x, y }];
      setShowHelp(false);
    } else {
      const frequency = 2 * Math.PI / controls.wavelength;
      sim.addSource(x, y, frequency, controls.amplitude);
      setSourceCount(sim.sources.length);
      setShowHelp(false);
    }
  }, [controls.wavelength, controls.amplitude, controls.interactionMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const sim = simulationRef.current;
    if (!sim) return;
    const { x, y } = getCanvasCoords(e);

    if (isDraggingRef.current) {
      const source = sim.sources[dragSourceRef.current];
      if (source) {
        const oldX = source.x;
        const oldY = source.y;
        source.x = x / sim.cellSize;
        source.y = y / sim.cellSize;
        source.vx = (source.x - oldX) * 0.1;
        source.vy = (source.y - oldY) * 0.1;
      }
      return;
    }

    if (isDrawingRef.current) {
      const pts = drawPointsRef.current;
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 12) pts.push({ x, y });
      return;
    }

    if (isPlacingProbeRef.current && probeStartRef.current) {
      setProbeLine({
        x1: probeStartRef.current.x, y1: probeStartRef.current.y,
        x2: x, y2: y,
      });
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      const sim = simulationRef.current;
      const source = sim?.sources[dragSourceRef.current];
      if (source) { source.vx = 0; source.vy = 0; }
      isDraggingRef.current = false;
      dragSourceRef.current = -1;
      return;
    }

    if (isDrawingRef.current) {
      const sim = simulationRef.current;
      if (sim) {
        const pts = drawPointsRef.current;
        const frequency = 2 * Math.PI / controls.wavelength;
        pts.forEach(pt => sim.addSource(pt.x, pt.y, frequency, controls.amplitude * 0.5));
        setSourceCount(sim.sources.length);
      }
      isDrawingRef.current = false;
      drawPointsRef.current = [];
      return;
    }

    if (isPlacingProbeRef.current) {
      isPlacingProbeRef.current = false;
      probeStartRef.current = null;
    }
    isDraggingRef.current = false;
    dragSourceRef.current = -1;
  }, [controls.wavelength, controls.amplitude]);

  // ──────── Touch support ────────
  const getTouchCoords = useCallback((e: React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0] || e.changedTouches[0];
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const sim = simulationRef.current;
    if (!sim) return;
    const { x, y } = getTouchCoords(e);

    for (let i = 0; i < sim.sources.length; i++) {
      const source = sim.sources[i];
      const sx = source.x * sim.cellSize;
      const sy = source.y * sim.cellSize;
      if (Math.hypot(x - sx, y - sy) < 24) {
        isDraggingRef.current = true;
        dragSourceRef.current = i;
        return;
      }
    }

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

    const mode = controls.interactionMode;
    if (mode === 'impulse') {
      sim.applyImpulse(x, y, 30, controls.amplitude * 3);
      setShowHelp(false);
    } else if (mode === 'draw') {
      isDrawingRef.current = true;
      drawPointsRef.current = [{ x, y }];
      setShowHelp(false);
    } else {
      const frequency = 2 * Math.PI / controls.wavelength;
      sim.addSource(x, y, frequency, controls.amplitude);
      setSourceCount(sim.sources.length);
      setShowHelp(false);
    }
  }, [controls.wavelength, controls.amplitude, controls.interactionMode, getTouchCoords]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const sim = simulationRef.current;
    if (!sim) return;
    const { x, y } = getTouchCoords(e);

    if (isDraggingRef.current) {
      const source = sim.sources[dragSourceRef.current];
      if (source) {
        const oldX = source.x;
        const oldY = source.y;
        source.x = x / sim.cellSize;
        source.y = y / sim.cellSize;
        source.vx = (source.x - oldX) * 0.1;
        source.vy = (source.y - oldY) * 0.1;
      }
      return;
    }

    if (isDrawingRef.current) {
      const pts = drawPointsRef.current;
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 12) pts.push({ x, y });
    }
  }, [getTouchCoords]);

  const handleTouchEnd = useCallback(() => {
    if (isDraggingRef.current) {
      const sim = simulationRef.current;
      const source = sim?.sources[dragSourceRef.current];
      if (source) { source.vx = 0; source.vy = 0; }
      isDraggingRef.current = false;
      dragSourceRef.current = -1;
      return;
    }

    if (isDrawingRef.current) {
      const sim = simulationRef.current;
      if (sim) {
        const pts = drawPointsRef.current;
        const frequency = 2 * Math.PI / controls.wavelength;
        pts.forEach(pt => sim.addSource(pt.x, pt.y, frequency, controls.amplitude * 0.5));
        setSourceCount(sim.sources.length);
      }
      isDrawingRef.current = false;
      drawPointsRef.current = [];
      return;
    }
    isDraggingRef.current = false;
    dragSourceRef.current = -1;
  }, [controls.wavelength, controls.amplitude]);

  // ──────── Keyboard shortcuts ────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(p => !p);
          break;
        case 'Escape':
          setShowHelp(false);
          break;
        case 'c': case 'C': clearSimulation(); break;
        case 'h': case 'H': setShowHelp(h => !h); break;
        case 'p': case 'P': setShowControls(s => !s); break;
        case 'i': case 'I':
          setControls(prev => ({ ...prev, interactionMode: prev.interactionMode === 'impulse' ? 'source' : 'impulse' }));
          break;
        case 'd': case 'D':
          setControls(prev => ({ ...prev, interactionMode: prev.interactionMode === 'draw' ? 'source' : 'draw' }));
          break;
        case 'a': case 'A': setCinematic(c => !c); break;
        case 'l': case 'L':
          if (isPlacingProbeRef.current) {
            isPlacingProbeRef.current = false;
            probeStartRef.current = null;
          } else if (probeLine) {
            setProbeLine(null);
          } else {
            isPlacingProbeRef.current = true;
          }
          break;
        case '1': loadPreset('Double Slit'); break;
        case '2': loadPreset('Single Slit'); break;
        case '3': loadPreset('Ripple Tank'); break;
        case '4': loadPreset('Two Sources'); break;
        case '5': loadPreset('Standing Waves'); break;
        case '6': loadPreset('Corner Reflector'); break;
        case '7': loadPreset('Triple Source'); break;
        case '8': loadPreset('Waveguide'); break;
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

    preset.walls?.forEach(wall => {
      sim.addWall(wall.x1 * w, wall.y1 * h, wall.x2 * w, wall.y2 * h, wall.slits);
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
              <p className="help-sub">Try 💧 Splash for impulse rings · 🖌️ Paint to draw wave shapes</p>
              <p className="help-sub">Drag sources for Doppler · Right-click to remove</p>
            </div>
          </div>
        )}

        {cinematic && activePreset && (
          <div className="cinematic-badge">
            <span className="cinematic-dot" />
            <div className="cinematic-info">
              <span className="cinematic-label">{activePreset}</span>
              <span className="cinematic-desc">{PRESETS[activePreset]?.description}</span>
            </div>
            <div className="cinematic-progress">
              <div className="cinematic-progress-fill" style={{ width: `${cinematicProgress * 100}%` }} />
            </div>
          </div>
        )}

        {!showHelp && !cinematic && (
          <div className="instructions-bar">
            <span><kbd>Space</kbd> Play/Pause</span>
            <span><kbd>C</kbd> Clear</span>
            <span><kbd>H</kbd> Help</span>
            <span><kbd>1</kbd>–<kbd>8</kbd> Presets</span>
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

        <div className="control-group transport">
          <button className={`btn-play ${isPlaying ? 'playing' : ''}`} onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button className="btn-clear" onClick={clearSimulation}>⟲ Clear</button>
        </div>

        <div className="control-group">
          <label>Interaction Mode</label>
          <div className="mode-row">
            <button
              className={`mode-btn ${controls.interactionMode === 'source' ? 'active' : ''}`}
              onClick={() => setControls(prev => ({ ...prev, interactionMode: 'source' }))}
              title="Click to place continuous wave sources"
            >🔵 Source</button>
            <button
              className={`mode-btn ${controls.interactionMode === 'impulse' ? 'active' : ''}`}
              onClick={() => setControls(prev => ({ ...prev, interactionMode: 'impulse' }))}
              title="Click to drop a splash impulse — expanding ring wave"
            >💧 Splash</button>
            <button
              className={`mode-btn ${controls.interactionMode === 'draw' ? 'active' : ''}`}
              onClick={() => setControls(prev => ({ ...prev, interactionMode: 'draw' }))}
              title="Draw to paint wave emitter trails"
            >🖌️ Paint</button>
          </div>
        </div>

        <div className="control-group">
          <div className="probe-row">
            <button
              className={`probe-btn ${probeLine ? 'active' : ''}`}
              onClick={() => {
                if (probeLine) {
                  setProbeLine(null);
                } else {
                  isPlacingProbeRef.current = true;
                  probeStartRef.current = null;
                }
              }}
              title="Place a measurement line to see live waveform cross-section"
            >📏 {probeLine ? 'Clear Probe' : 'Place Probe'}</button>
          </div>
        </div>

        <div className="control-group">
          <label>View Mode</label>
          <div className="button-row">
            <button className={controls.visualMode === '2D' ? 'active' : ''} onClick={() => setControls(prev => ({ ...prev, visualMode: '2D' }))}>2D Heatmap</button>
            <button className={controls.visualMode === '3D' ? 'active' : ''} onClick={() => setControls(prev => ({ ...prev, visualMode: '3D' }))}>3D Surface</button>
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
            <option value="aurora">🌌 Aurora</option>
            <option value="plasma">🔮 Plasma</option>
            <option value="grayscale">⬜ Grayscale</option>
          </select>
        </div>

        <div className="control-section">
          <h4>Wave Parameters</h4>
          <div className="control-group">
            <label htmlFor="wavelength-slider">Wavelength: <span className="value">{controls.wavelength}</span></label>
            <input id="wavelength-slider" type="range" min="15" max="120" value={controls.wavelength} aria-valuenow={controls.wavelength} aria-valuemin={15} aria-valuemax={120} onChange={(e) => setControls(prev => ({ ...prev, wavelength: Number(e.target.value) }))} />
          </div>
          <div className="control-group">
            <label htmlFor="amplitude-slider">Amplitude: <span className="value">{controls.amplitude.toFixed(1)}</span></label>
            <input id="amplitude-slider" type="range" min="0.1" max="3" step="0.1" value={controls.amplitude} aria-valuenow={controls.amplitude} aria-valuemin={0.1} aria-valuemax={3} onChange={(e) => setControls(prev => ({ ...prev, amplitude: Number(e.target.value) }))} />
          </div>
          <div className="control-group">
            <label htmlFor="speed-slider">Speed: <span className="value">{controls.waveSpeed.toFixed(2)}</span></label>
            <input id="speed-slider" type="range" min="0.1" max="1.5" step="0.05" value={controls.waveSpeed} aria-valuenow={controls.waveSpeed} aria-valuemin={0.1} aria-valuemax={1.5} onChange={(e) => setControls(prev => ({ ...prev, waveSpeed: Number(e.target.value) }))} />
          </div>
          <div className="control-group">
            <label htmlFor="damping-slider">Damping: <span className="value">{controls.damping.toFixed(3)}</span></label>
            <input id="damping-slider" type="range" min="0.980" max="1.000" step="0.001" value={controls.damping} aria-valuenow={controls.damping} aria-valuemin={0.98} aria-valuemax={1.0} onChange={(e) => setControls(prev => ({ ...prev, damping: Number(e.target.value) }))} />
          </div>
          <div className="control-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={controls.reflectiveBoundaries} onChange={(e) => setControls(prev => ({ ...prev, reflectiveBoundaries: e.target.checked }))} />
              Reflective Boundaries
            </label>
          </div>
        </div>

        <div className="control-section">
          <h4>Presets</h4>
          <div className="preset-grid">
            {Object.entries(PRESETS).map(([name, preset]) => (
              <button key={name} className={`preset-btn ${activePreset === name ? 'active' : ''}`} onClick={() => { loadPreset(name); setCinematic(false); }} title={preset.description}>
                {name}
              </button>
            ))}
          </div>
          {activePreset && <p className="preset-desc">{PRESETS[activePreset]?.description}</p>}
          <button className={`cinematic-btn ${cinematic ? 'active' : ''}`} onClick={() => setCinematic(c => !c)} title="Auto-cycle through all presets (keyboard: A)">
            {cinematic ? '⏸ Stop Autoplay' : '🎬 Cinematic Autoplay'}
          </button>
        </div>

        <div className="instructions">
          <h4>How to Use</h4>
          <p>🔵 <strong>Source</strong> — Click to place continuous emitters</p>
          <p>💧 <strong>Splash</strong> — Click for expanding ring impulse</p>
          <p>🖌️ <strong>Paint</strong> — Drag to draw emitter trails</p>
          <p>📏 <strong>Probe</strong> — Place a line, see live waveform</p>
          <p>✋ <strong>Drag</strong> sources for Doppler effect</p>
          <p>🗑️ <strong>Right-click</strong> to remove sources / probe</p>
        </div>

        <div className="control-section">
          <h4>Keyboard Shortcuts</h4>
          <div className="instructions">
            <p><kbd>Space</kbd> Play / Pause</p>
            <p><kbd>C</kbd> Clear simulation</p>
            <p><kbd>I</kbd> Toggle Splash mode</p>
            <p><kbd>D</kbd> Toggle Paint mode</p>
            <p><kbd>A</kbd> Cinematic autoplay</p>
            <p><kbd>L</kbd> Toggle Probe line</p>
            <p><kbd>H</kbd> Toggle help</p>
            <p><kbd>P</kbd> Toggle panel</p>
            <p><kbd>1</kbd>–<kbd>8</kbd> Load presets</p>
          </div>
        </div>

        <div className="footer">
          <a href="https://github.com/kai-claw/wave-playground" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}

export default App;
