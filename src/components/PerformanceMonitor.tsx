// --- Performance Monitor ---
// Tracks FPS, detects sustained drops, auto-degrades quality.
// Shows warning badge when performance is degraded.

import { useEffect, useRef, useState, useCallback } from 'react';

export interface PerfState {
  fps: number;
  degraded: boolean;
}

interface PerformanceMonitorProps {
  /** Called when degradation state changes */
  onDegradationChange?: (degraded: boolean) => void;
  /** Current FPS for display */
  children?: (state: PerfState) => React.ReactNode;
}

/** FPS threshold below which we degrade (sustained for DEGRADE_WINDOW frames) */
const DEGRADE_FPS = 30;
/** FPS threshold above which we recover (sustained for RECOVER_WINDOW frames) */
const RECOVER_FPS = 45;
/** Number of consecutive low-FPS frames before degrading */
const DEGRADE_WINDOW = 180; // ~3 seconds at 60fps
/** Number of consecutive good-FPS frames before recovering */
const RECOVER_WINDOW = 300; // ~5 seconds at 60fps

export function PerformanceMonitor({ onDegradationChange, children }: PerformanceMonitorProps) {
  const [perfState, setPerfState] = useState<PerfState>({ fps: 60, degraded: false });
  const fpsRef = useRef(60);
  const degradedRef = useRef(false);
  const lowFrameCount = useRef(0);
  const highFrameCount = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const rafRef = useRef(0);

  const onDegradationChangeRef = useRef(onDegradationChange);
  onDegradationChangeRef.current = onDegradationChange;

  const tick = useCallback(() => {
    frameCountRef.current++;
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    // Compute FPS every 500ms
    if (elapsed >= 500) {
      const fps = (frameCountRef.current / elapsed) * 1000;
      fpsRef.current = fps;
      frameCountRef.current = 0;
      lastTimeRef.current = now;

      // Track sustained drops/recoveries
      if (fps < DEGRADE_FPS) {
        lowFrameCount.current += elapsed;
        highFrameCount.current = 0;
      } else if (fps > RECOVER_FPS) {
        highFrameCount.current += elapsed;
        lowFrameCount.current = 0;
      } else {
        // In the middle zone - don't change counters rapidly
        lowFrameCount.current = Math.max(0, lowFrameCount.current - elapsed * 0.5);
        highFrameCount.current = Math.max(0, highFrameCount.current - elapsed * 0.5);
      }

      // Degrade if sustained low FPS
      if (!degradedRef.current && lowFrameCount.current > DEGRADE_WINDOW * 16.67) {
        degradedRef.current = true;
        onDegradationChangeRef.current?.(true);
        setPerfState({ fps, degraded: true });
      }
      // Recover if sustained high FPS
      else if (degradedRef.current && highFrameCount.current > RECOVER_WINDOW * 16.67) {
        degradedRef.current = false;
        onDegradationChangeRef.current?.(false);
        setPerfState({ fps, degraded: false });
      }
      else {
        setPerfState({ fps, degraded: degradedRef.current });
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  return children ? <>{children(perfState)}</> : null;
}
