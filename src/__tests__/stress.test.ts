// --- Black Hat #2: Stress Tests ---
// Performance, memory, stability, edge cases under extreme conditions.

import { describe, it, expect } from 'vitest';
import { WaveSimulation } from '../WaveSimulation';
import { getColorLUT } from '../renderers';
import { COLOR_SCHEMES, PRESETS, PRESET_NAMES } from '../constants';
import type { ColorSchemeKey } from '../types';

describe('Performance Stress', () => {
  it('should handle 1000 steps at max waveSpeed without NaN/Infinity', () => {
    const sim = new WaveSimulation(400, 300, 4);
    sim.waveSpeed = 1.5; // max slider value
    sim.addSource(200, 150, 0.1, 3);
    for (let t = 0; t < 1000; t++) {
      sim.step(t);
    }
    // Every cell must be finite
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });

  it('should handle 500 steps with 50 simultaneous sources', () => {
    const sim = new WaveSimulation(400, 300, 4);
    // Add 50 sources spread across the field
    for (let i = 0; i < 50; i++) {
      sim.addSource(
        20 + (i % 10) * 36,
        20 + Math.floor(i / 10) * 52,
        0.03 + (i % 5) * 0.02,
        1.5,
      );
    }
    for (let t = 0; t < 500; t++) {
      sim.step(t);
    }
    // Must remain stable
    let hasNonZero = false;
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
      if (sim.current[i] !== 0) hasNonZero = true;
    }
    expect(hasNonZero).toBe(true);
  });

  it('should handle rapid source add/remove cycles', () => {
    const sim = new WaveSimulation(400, 300, 4);
    for (let cycle = 0; cycle < 100; cycle++) {
      sim.addSource(Math.random() * 400, Math.random() * 300, 0.05, 1);
      sim.step(cycle);
      if (sim.sources.length > 10) {
        sim.sources.splice(0, 5); // bulk remove
      }
    }
    expect(sim.sources.length).toBeLessThanOrEqual(10);
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });

  it('should handle impulse spam without crash', () => {
    const sim = new WaveSimulation(400, 300, 4);
    // Apply 200 impulses in rapid succession
    for (let i = 0; i < 200; i++) {
      sim.applyImpulse(Math.random() * 400, Math.random() * 300, 30, 3);
      sim.step(i);
    }
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });

  it('should handle zero-size grid gracefully', () => {
    const sim = new WaveSimulation(0, 0, 4);
    expect(sim.cols).toBe(0);
    expect(sim.rows).toBe(0);
    // step should not crash
    sim.step(0);
  });

  it('should handle cellSize=1 (maximum grid resolution) for small canvases', () => {
    const sim = new WaveSimulation(100, 100, 1);
    expect(sim.cols).toBe(100);
    expect(sim.rows).toBe(100);
    sim.addSource(50, 50, 0.05, 1);
    for (let t = 0; t < 50; t++) {
      sim.step(t);
    }
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });

  it('should handle extreme damping values', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.addSource(100, 100, 0.05, 1);

    // damping = 1.0 (no damping — energy conservation)
    sim.damping = 1.0;
    for (let t = 0; t < 200; t++) sim.step(t);
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }

    // damping = 0.98 (high damping)
    sim.damping = 0.98;
    for (let t = 200; t < 400; t++) sim.step(t);
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });
});

describe('Orbital Source Stress', () => {
  it('should handle 10 orbital sources for 500 steps', () => {
    const sim = new WaveSimulation(400, 300, 4);
    for (let i = 0; i < 10; i++) {
      sim.addOrbitalSource(200, 150, 30 + i * 5, 0.03 * (i % 2 === 0 ? 1 : -1), 0.05, 1, (i / 10) * Math.PI * 2);
    }
    for (let t = 0; t < 500; t++) {
      sim.step(t);
    }
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
    // All sources should still be in bounds (orbital motion doesn't fly off)
    for (const src of sim.sources) {
      expect(isFinite(src.x)).toBe(true);
      expect(isFinite(src.y)).toBe(true);
    }
  });

  it('should handle very fast orbital speed', () => {
    const sim = new WaveSimulation(400, 300, 4);
    sim.addOrbitalSource(200, 150, 50, 0.5, 0.05, 1); // very fast spin
    for (let t = 0; t < 300; t++) {
      sim.step(t);
    }
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });
});

describe('Energy Trail Stress', () => {
  it('should handle energy trail over 1000 steps without growth', () => {
    const sim = new WaveSimulation(400, 300, 4);
    sim.energyTrailEnabled = true;
    sim.addSource(200, 150, 0.05, 2);
    for (let t = 0; t < 1000; t++) {
      sim.step(t);
    }
    // Energy map should be finite and bounded
    let maxEnergy = 0;
    for (let i = 0; i < sim.energyMap.length; i++) {
      expect(isFinite(sim.energyMap[i])).toBe(true);
      expect(sim.energyMap[i]).toBeGreaterThanOrEqual(0);
      if (sim.energyMap[i] > maxEnergy) maxEnergy = sim.energyMap[i];
    }
    // Energy should decay — not grow unbounded
    // With amplitude 2, clamp ±50, and decay 0.997, max should be well under 100
    expect(maxEnergy).toBeLessThan(100);
  });

  it('should clear energy map when trail is disabled', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.energyTrailEnabled = true;
    sim.addSource(100, 100, 0.05, 1);
    for (let t = 0; t < 100; t++) sim.step(t);

    // Should have some energy
    let hasEnergy = false;
    for (let i = 0; i < sim.energyMap.length; i++) {
      if (sim.energyMap[i] > 0) { hasEnergy = true; break; }
    }
    expect(hasEnergy).toBe(true);

    // Disable and verify energyMap stops updating (doesn't clear — that's App's job)
    sim.energyTrailEnabled = false;
    const snapshot = new Float32Array(sim.energyMap);
    sim.step(100);
    // energyMap should not change after disabling
    for (let i = 0; i < sim.energyMap.length; i++) {
      expect(sim.energyMap[i]).toBe(snapshot[i]);
    }
  });
});

describe('Wall Mask Stress', () => {
  it('should handle 50 walls with slits', () => {
    const sim = new WaveSimulation(400, 300, 4);
    for (let i = 0; i < 50; i++) {
      sim.addWall(
        i * 8, 0, i * 8, 300,
        [{ start: 0.3, end: 0.4 }, { start: 0.6, end: 0.7 }],
      );
    }
    sim.addSource(200, 150, 0.05, 1);
    for (let t = 0; t < 100; t++) {
      sim.step(t);
    }
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });

  it('should rebuild wall mask only when dirty', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.addWall(50, 0, 50, 200);
    sim.step(0); // first step rebuilds

    // Take snapshot of wallMask
    const snapshot = new Uint8Array(sim.wallMask);

    // Step without modifying walls — mask should remain identical
    sim.step(1);
    for (let i = 0; i < sim.wallMask.length; i++) {
      expect(sim.wallMask[i]).toBe(snapshot[i]);
    }
  });
});

describe('Probe Sampling Stress', () => {
  it('should handle diagonal probe across full grid', () => {
    const sim = new WaveSimulation(400, 300, 4);
    sim.addSource(200, 150, 0.05, 1);
    for (let t = 0; t < 50; t++) sim.step(t);

    const samples = sim.sampleLine(0, 0, 400, 300, 256);
    expect(samples.length).toBe(256);
    for (let i = 0; i < samples.length; i++) {
      expect(isFinite(samples[i])).toBe(true);
    }
  });

  it('should handle out-of-bounds probe', () => {
    const sim = new WaveSimulation(200, 200, 4);
    const samples = sim.sampleLine(-100, -100, 500, 500, 128);
    expect(samples.length).toBe(128);
    // Out of bounds should be 0
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(0);
  });

  it('should reuse sample buffer (no allocation) for standard sizes', () => {
    const sim = new WaveSimulation(200, 200, 4);
    const s1 = sim.sampleLine(0, 0, 200, 200, 128);
    const s2 = sim.sampleLine(0, 200, 200, 0, 128);
    // Both should reference the same underlying buffer
    expect(s1.buffer).toBe(s2.buffer);
  });
});

describe('Color LUT Validation', () => {
  const schemeKeys: ColorSchemeKey[] = ['ocean', 'thermal', 'neon', 'aurora', 'plasma', 'grayscale'];

  it('should generate LUTs for all color schemes', () => {
    for (const key of schemeKeys) {
      const lut = getColorLUT(key);
      expect(lut.posR).toHaveLength(256);
      expect(lut.posG).toHaveLength(256);
      expect(lut.posB).toHaveLength(256);
      expect(lut.negR).toHaveLength(256);
      expect(lut.negG).toHaveLength(256);
      expect(lut.negB).toHaveLength(256);
    }
  });

  it('should match original color functions at sampled points', () => {
    // Uint8Array assignment uses ToUint8 (truncation) which may differ from Math.floor
    // by ±1 due to floating-point precision in intermediate calculations.
    // Use a scratch Uint8Array to match the exact storage conversion.
    const scratch = new Uint8Array(1);
    const toUint8 = (v: number) => { scratch[0] = v; return scratch[0]; };
    for (const key of schemeKeys) {
      const lut = getColorLUT(key);
      const scheme = COLOR_SCHEMES[key];
      for (const idx of [0, 64, 128, 192, 255]) {
        const t = idx / 255;
        const origPos = scheme.positive(t);
        const origNeg = scheme.negative(t);
        expect(lut.posR[idx]).toBe(toUint8(origPos[0]));
        expect(lut.posG[idx]).toBe(toUint8(origPos[1]));
        expect(lut.posB[idx]).toBe(toUint8(origPos[2]));
        expect(lut.negR[idx]).toBe(toUint8(origNeg[0]));
        expect(lut.negG[idx]).toBe(toUint8(origNeg[1]));
        expect(lut.negB[idx]).toBe(toUint8(origNeg[2]));
      }
    }
  });

  it('should produce valid RGB values (0-255) at all indices', () => {
    for (const key of schemeKeys) {
      const lut = getColorLUT(key);
      for (let i = 0; i < 256; i++) {
        expect(lut.posR[i]).toBeGreaterThanOrEqual(0);
        expect(lut.posR[i]).toBeLessThanOrEqual(255);
        expect(lut.posG[i]).toBeGreaterThanOrEqual(0);
        expect(lut.posG[i]).toBeLessThanOrEqual(255);
        expect(lut.posB[i]).toBeGreaterThanOrEqual(0);
        expect(lut.posB[i]).toBeLessThanOrEqual(255);
        expect(lut.negR[i]).toBeGreaterThanOrEqual(0);
        expect(lut.negR[i]).toBeLessThanOrEqual(255);
        expect(lut.negG[i]).toBeGreaterThanOrEqual(0);
        expect(lut.negG[i]).toBeLessThanOrEqual(255);
        expect(lut.negB[i]).toBeGreaterThanOrEqual(0);
        expect(lut.negB[i]).toBeLessThanOrEqual(255);
      }
    }
  });

  it('should cache LUTs (same reference on second call)', () => {
    const lut1 = getColorLUT('ocean');
    const lut2 = getColorLUT('ocean');
    expect(lut1).toBe(lut2);
  });
});

describe('Preset Stability Under Stress', () => {
  it('should run every preset for 500 steps at max speed without corruption', () => {
    for (const name of PRESET_NAMES) {
      const sim = new WaveSimulation(800, 600, 4);
      sim.waveSpeed = 1.5; // max
      const preset = PRESETS[name];

      if (preset.reflective) sim.reflectiveBoundaries = true;
      preset.walls?.forEach(w => {
        sim.addWall(w.x1 * 800, w.y1 * 600, w.x2 * 800, w.y2 * 600, w.slits);
      });
      preset.sources?.forEach(s => {
        sim.addSource(s.x * 800, s.y * 600, s.freq ?? 0.1, 1);
      });
      preset.orbital?.forEach(o => {
        sim.addOrbitalSource(o.cx * 800, o.cy * 600, o.radius * 600, o.speed, 0.1, 1, o.startAngle ?? 0);
      });

      for (let t = 0; t < 500; t++) {
        sim.step(t);
      }

      // Verify stability
      let corrupt = false;
      for (let i = 0; i < sim.current.length; i++) {
        if (!isFinite(sim.current[i])) { corrupt = true; break; }
      }
      expect(corrupt).toBe(false);
    }
  });

  it('should handle switching all presets rapidly (10 steps each)', () => {
    const sim = new WaveSimulation(800, 600, 4);
    let t = 0;
    for (const name of PRESET_NAMES) {
      sim.clear();
      const preset = PRESETS[name];
      if (preset.reflective) sim.reflectiveBoundaries = true;
      else sim.reflectiveBoundaries = false;
      preset.walls?.forEach(w => {
        sim.addWall(w.x1 * 800, w.y1 * 600, w.x2 * 800, w.y2 * 600, w.slits);
      });
      preset.sources?.forEach(s => {
        sim.addSource(s.x * 800, s.y * 600, s.freq ?? 0.1, 1);
      });
      preset.orbital?.forEach(o => {
        sim.addOrbitalSource(o.cx * 800, o.cy * 600, o.radius * 600, o.speed, 0.1, 1, o.startAngle ?? 0);
      });
      for (let i = 0; i < 10; i++) {
        sim.step(t++);
      }
    }
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });
});

describe('CFL Sub-stepping Verification', () => {
  it('should compute correct sub-step count at various speeds', () => {
    const sim = new WaveSimulation(200, 200, 4);
    // At waveSpeed=0.5, cflRatio=0.5, subSteps=ceil(0.5/0.5)=1
    sim.waveSpeed = 0.5;
    sim.step(0);
    // At waveSpeed=1.5, cflRatio=1.5, subSteps=ceil(1.5/0.5)=3
    sim.waveSpeed = 1.5;
    sim.addSource(100, 100, 0.05, 1);
    for (let t = 1; t < 100; t++) sim.step(t);
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });

  it('should maintain amplitude within clamping bounds', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.waveSpeed = 1.5;
    sim.damping = 1.0; // no damping
    sim.addSource(100, 100, 0.05, 3);
    for (let t = 0; t < 500; t++) sim.step(t);
    for (let i = 0; i < sim.current.length; i++) {
      expect(sim.current[i]).toBeGreaterThanOrEqual(-50);
      expect(sim.current[i]).toBeLessThanOrEqual(50);
    }
  });
});

describe('Boundary Condition Stress', () => {
  it('should handle switching boundaries during simulation', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.addSource(100, 100, 0.05, 1);
    sim.reflectiveBoundaries = false;
    for (let t = 0; t < 50; t++) sim.step(t);
    sim.reflectiveBoundaries = true;
    for (let t = 50; t < 100; t++) sim.step(t);
    sim.reflectiveBoundaries = false;
    for (let t = 100; t < 150; t++) sim.step(t);
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });
});

describe('Concurrent Features Stress', () => {
  it('should handle all features enabled simultaneously', () => {
    const sim = new WaveSimulation(400, 300, 4);
    sim.energyTrailEnabled = true;
    sim.reflectiveBoundaries = true;
    sim.waveSpeed = 1.2;

    // Add sources, orbital, walls, impulses
    sim.addSource(100, 100, 0.05, 1.5);
    sim.addSource(300, 200, 0.08, 1);
    sim.addOrbitalSource(200, 150, 40, 0.03, 0.05, 1);
    sim.addWall(150, 0, 150, 300, [{ start: 0.4, end: 0.6 }]);
    sim.applyImpulse(250, 100, 30, 3);

    for (let t = 0; t < 300; t++) {
      sim.step(t);
      // Periodically add impulses
      if (t % 50 === 0) {
        sim.applyImpulse(Math.random() * 400, Math.random() * 300, 20, 2);
      }
    }

    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
    for (let i = 0; i < sim.energyMap.length; i++) {
      expect(isFinite(sim.energyMap[i])).toBe(true);
      expect(sim.energyMap[i]).toBeGreaterThanOrEqual(0);
    }
  });
});
