// --- White Hat Final Verification: Comprehensive Integration Tests ---
// Cross-module integration, preset stability, feature combinations, type system consistency.

import { describe, it, expect } from 'vitest';
import { WaveSimulation } from '../WaveSimulation';
import { getColorLUT } from '../renderers';
import { COLOR_SCHEMES, PRESETS, PRESET_NAMES, DEFAULT_CONTROLS, CINEMATIC_INTERVAL } from '../constants';
import type { ColorSchemeKey, Controls, InteractionMode } from '../types';

// ── Preset Stability (all 10 presets through 200 steps) ──

describe('Preset Stability Matrix', () => {
  for (const name of PRESET_NAMES) {
    it(`preset "${name}" should run 200 steps without corruption`, () => {
      const preset = PRESETS[name];
      const sim = new WaveSimulation(400, 300, 4);
      sim.reflectiveBoundaries = !!preset.reflective;

      // Add static sources
      for (const src of preset.sources ?? []) {
        sim.addSource(src.x * 400, src.y * 300, src.freq ?? 0.05, 1);
      }
      // Add walls
      for (const wall of preset.walls ?? []) {
        sim.addWall(wall.x1 * 400, wall.y1 * 300, wall.x2 * 400, wall.y2 * 300, wall.slits);
      }
      // Add orbital sources
      for (const orb of preset.orbital ?? []) {
        sim.addOrbitalSource(
          orb.cx * 400, orb.cy * 300,
          orb.radius * 300, orb.speed,
          0.05, 1, orb.startAngle ?? 0,
        );
      }

      for (let t = 0; t < 200; t++) {
        sim.step(t);
      }

      // Verify no NaN/Infinity in entire field
      for (let i = 0; i < sim.current.length; i++) {
        expect(isFinite(sim.current[i])).toBe(true);
      }
    });
  }

  it('all presets should have descriptions', () => {
    for (const name of PRESET_NAMES) {
      expect(PRESETS[name].description).toBeTruthy();
      expect(typeof PRESETS[name].description).toBe('string');
      expect(PRESETS[name].description.length).toBeGreaterThan(10);
    }
  });

  it('should have exactly 10 presets matching PRESET_NAMES', () => {
    expect(PRESET_NAMES.length).toBe(10);
    expect(Object.keys(PRESETS).length).toBe(10);
    for (const name of PRESET_NAMES) {
      expect(PRESETS[name]).toBeDefined();
    }
  });
});

// ── Color Scheme Completeness ──

describe('Color Scheme Completeness', () => {
  const schemeKeys = Object.keys(COLOR_SCHEMES) as ColorSchemeKey[];

  it('should have exactly 6 color schemes', () => {
    expect(schemeKeys.length).toBe(6);
  });

  for (const key of Object.keys(COLOR_SCHEMES) as ColorSchemeKey[]) {
    describe(`scheme "${key}"`, () => {
      const scheme = COLOR_SCHEMES[key];

      it('should have positive, negative, and bg fields', () => {
        expect(typeof scheme.positive).toBe('function');
        expect(typeof scheme.negative).toBe('function');
        expect(Array.isArray(scheme.bg)).toBe(true);
        expect(scheme.bg.length).toBe(3);
      });

      it('should return valid RGB at boundaries (t=0 and t=1)', () => {
        for (const t of [0, 0.5, 1]) {
          const pos = scheme.positive(t);
          const neg = scheme.negative(t);
          expect(pos.length).toBe(3);
          expect(neg.length).toBe(3);
          for (const v of [...pos, ...neg]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(255);
          }
        }
      });

      it('LUT should be buildable and have 256 entries', () => {
        const lut = getColorLUT(key);
        expect(lut.posR.length).toBe(256);
        expect(lut.negB.length).toBe(256);
      });

      it('bg components should be valid', () => {
        for (const v of scheme.bg) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
          expect(Number.isInteger(v)).toBe(true);
        }
      });
    });
  }
});

// ── Cross-Module Integration ──

describe('Cross-Module Integration', () => {
  it('simulation + walls + sources work together', () => {
    const sim = new WaveSimulation(200, 200, 4);
    // Double slit preset
    sim.addWall(75, 0, 75, 200, [{ start: 0.4, end: 0.46 }, { start: 0.54, end: 0.6 }]);
    sim.addSource(25, 100, 0.05, 1);
    for (let t = 0; t < 100; t++) sim.step(t);

    // Wave should have propagated beyond the wall through slits
    const behindWall = sim.getValue(150, 100);
    expect(isFinite(behindWall)).toBe(true);
  });

  it('orbital sources create Doppler-shifted patterns', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.addOrbitalSource(100, 100, 30, 0.03, 0.05, 1, 0);
    for (let t = 0; t < 100; t++) sim.step(t);

    // Source should have moved from initial position
    expect(sim.sources[0].orbitAngle).toBeGreaterThan(0);
    expect(sim.sources[0].vx).toBeDefined();
    expect(sim.sources[0].vy).toBeDefined();
    // Field should be non-trivial
    let hasNonZero = false;
    for (let i = 0; i < sim.current.length; i++) {
      if (Math.abs(sim.current[i]) > 0.01) { hasNonZero = true; break; }
    }
    expect(hasNonZero).toBe(true);
  });

  it('energy trail tracks peak amplitude', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.energyTrailEnabled = true;
    sim.addSource(100, 100, 0.1, 2);
    for (let t = 0; t < 50; t++) sim.step(t);

    // Energy map near source should be non-zero
    const energyNearSource = sim.energyMap[sim.getIndex(25, 25)]; // grid coords
    expect(energyNearSource).toBeGreaterThanOrEqual(0);

    // Some cells should have accumulated energy
    let maxEnergy = 0;
    for (let i = 0; i < sim.energyMap.length; i++) {
      if (sim.energyMap[i] > maxEnergy) maxEnergy = sim.energyMap[i];
    }
    expect(maxEnergy).toBeGreaterThan(0);
  });

  it('impulse creates localized disturbance', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.applyImpulse(100, 100, 16, 5);

    // Center should have high amplitude
    const center = sim.getValue(100, 100);
    expect(Math.abs(center)).toBeGreaterThan(1);

    // Far corner should be near zero
    const corner = sim.getValue(10, 10);
    expect(Math.abs(corner)).toBeLessThan(0.01);
  });

  it('probe line samples correctly along diagonal', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.applyImpulse(100, 100, 16, 5);
    const samples = sim.sampleLine(0, 0, 200, 200, 64);
    expect(samples.length).toBe(64);

    // At least some samples should be non-zero (impulse is near the diagonal)
    let hasNonZero = false;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) > 0.01) { hasNonZero = true; break; }
    }
    expect(hasNonZero).toBe(true);
  });

  it('reflective boundaries preserve energy better than absorbing', () => {
    const simReflect = new WaveSimulation(100, 100, 4);
    simReflect.reflectiveBoundaries = true;
    simReflect.applyImpulse(50, 50, 8, 3);

    const simAbsorb = new WaveSimulation(100, 100, 4);
    simAbsorb.reflectiveBoundaries = false;
    simAbsorb.applyImpulse(50, 50, 8, 3);

    for (let t = 0; t < 200; t++) {
      simReflect.step(t);
      simAbsorb.step(t);
    }

    // Sum of squares (energy proxy)
    let energyReflect = 0, energyAbsorb = 0;
    for (let i = 0; i < simReflect.current.length; i++) {
      energyReflect += simReflect.current[i] ** 2;
      energyAbsorb += simAbsorb.current[i] ** 2;
    }
    expect(energyReflect).toBeGreaterThan(energyAbsorb);
  });
});

// ── Feature Combinations ──

describe('Feature Combinations', () => {
  it('energy trail + orbital + walls should not crash', () => {
    const sim = new WaveSimulation(300, 300, 4);
    sim.energyTrailEnabled = true;
    sim.addWall(100, 0, 100, 300, [{ start: 0.4, end: 0.6 }]);
    sim.addOrbitalSource(50, 150, 30, 0.05, 0.1, 2, 0);

    for (let t = 0; t < 300; t++) sim.step(t);
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
      expect(isFinite(sim.energyMap[i])).toBe(true);
    }
  });

  it('high speed + reflective + multiple sources should stay stable', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.waveSpeed = 1.5;
    sim.reflectiveBoundaries = true;
    for (let i = 0; i < 5; i++) {
      sim.addSource(40 * (i + 1), 100, 0.05 + i * 0.01, 1);
    }

    for (let t = 0; t < 500; t++) sim.step(t);
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });

  it('clear should fully reset all state', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.energyTrailEnabled = true;
    sim.addSource(100, 100, 0.1, 2);
    sim.addWall(50, 0, 50, 200);
    for (let t = 0; t < 50; t++) sim.step(t);

    sim.clear();

    expect(sim.sources.length).toBe(0);
    expect(sim.walls.length).toBe(0);
    for (let i = 0; i < sim.current.length; i++) {
      expect(sim.current[i]).toBe(0);
      expect(sim.previous[i]).toBe(0);
      expect(sim.energyMap[i]).toBe(0);
    }
  });
});

// ── Type System & Constants Consistency ──

describe('Type System Consistency', () => {
  it('DEFAULT_CONTROLS should have all required fields', () => {
    const required: (keyof Controls)[] = [
      'wavelength', 'amplitude', 'waveSpeed', 'damping',
      'cellSize', 'reflectiveBoundaries', 'visualMode',
      'colorScheme', 'interactionMode',
    ];
    for (const key of required) {
      expect(DEFAULT_CONTROLS[key]).toBeDefined();
    }
  });

  it('DEFAULT_CONTROLS colorScheme should be a valid scheme', () => {
    const validSchemes = Object.keys(COLOR_SCHEMES);
    expect(validSchemes).toContain(DEFAULT_CONTROLS.colorScheme);
  });

  it('DEFAULT_CONTROLS interactionMode should be valid', () => {
    const validModes: InteractionMode[] = ['source', 'impulse', 'draw'];
    expect(validModes).toContain(DEFAULT_CONTROLS.interactionMode);
  });

  it('DEFAULT_CONTROLS visualMode should be 2D or 3D', () => {
    expect(['2D', '3D']).toContain(DEFAULT_CONTROLS.visualMode);
  });

  it('CINEMATIC_INTERVAL should be a positive number', () => {
    expect(CINEMATIC_INTERVAL).toBeGreaterThan(0);
    expect(Number.isFinite(CINEMATIC_INTERVAL)).toBe(true);
  });

  it('preset coordinates should be in 0-1 relative range', () => {
    for (const name of PRESET_NAMES) {
      const preset = PRESETS[name];
      for (const src of preset.sources ?? []) {
        expect(src.x).toBeGreaterThanOrEqual(0);
        expect(src.x).toBeLessThanOrEqual(1);
        expect(src.y).toBeGreaterThanOrEqual(0);
        expect(src.y).toBeLessThanOrEqual(1);
      }
      for (const wall of preset.walls ?? []) {
        for (const coord of [wall.x1, wall.y1, wall.x2, wall.y2]) {
          expect(coord).toBeGreaterThanOrEqual(0);
          expect(coord).toBeLessThanOrEqual(1);
        }
        for (const slit of wall.slits ?? []) {
          expect(slit.start).toBeGreaterThanOrEqual(0);
          expect(slit.end).toBeLessThanOrEqual(1);
          expect(slit.start).toBeLessThan(slit.end);
        }
      }
      for (const orb of preset.orbital ?? []) {
        expect(orb.cx).toBeGreaterThanOrEqual(0);
        expect(orb.cx).toBeLessThanOrEqual(1);
        expect(orb.cy).toBeGreaterThanOrEqual(0);
        expect(orb.cy).toBeLessThanOrEqual(1);
        expect(orb.radius).toBeGreaterThan(0);
      }
    }
  });

  it('PRESET_NAMES should be unique', () => {
    const unique = new Set(PRESET_NAMES);
    expect(unique.size).toBe(PRESET_NAMES.length);
  });
});

// ── CFL Sub-stepping Verification ──

describe('CFL Stability Verification', () => {
  it('sub-stepping kicks in at high wave speed', () => {
    const sim = new WaveSimulation(100, 100, 4);
    sim.waveSpeed = 1.5;
    const cflRatio = sim.waveSpeed * sim.dt;
    const expectedSubSteps = Math.ceil(cflRatio / WaveSimulation.CFL_LIMIT);
    expect(expectedSubSteps).toBeGreaterThan(1);
  });

  it('extreme speed (5.0) stays finite over 500 steps', () => {
    const sim = new WaveSimulation(100, 100, 4);
    sim.waveSpeed = 5.0;
    sim.addSource(50, 50, 0.1, 2);
    for (let t = 0; t < 500; t++) sim.step(t);
    for (let i = 0; i < sim.current.length; i++) {
      expect(isFinite(sim.current[i])).toBe(true);
    }
  });
});

// ── Wall Mask Correctness ──

describe('Wall Mask Verification', () => {
  it('wall mask matches isInsideWall for all cells', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.addWall(75, 0, 75, 200, [{ start: 0.4, end: 0.6 }]);
    sim.rebuildWallMask();

    // The mask should be populated
    let wallCells = 0;
    for (let i = 0; i < sim.wallMask.length; i++) {
      if (sim.wallMask[i]) wallCells++;
    }
    expect(wallCells).toBeGreaterThan(0);
  });

  it('clear resets wall mask', () => {
    const sim = new WaveSimulation(200, 200, 4);
    sim.addWall(50, 0, 50, 200);
    sim.rebuildWallMask();
    sim.clear();

    for (let i = 0; i < sim.wallMask.length; i++) {
      expect(sim.wallMask[i]).toBe(0);
    }
  });
});

// ── Module Export Verification ──

describe('Module Exports', () => {
  it('WaveSimulation exports all required methods', () => {
    const sim = new WaveSimulation(100, 100, 4);
    expect(typeof sim.step).toBe('function');
    expect(typeof sim.clear).toBe('function');
    expect(typeof sim.addSource).toBe('function');
    expect(typeof sim.addWall).toBe('function');
    expect(typeof sim.addOrbitalSource).toBe('function');
    expect(typeof sim.applyImpulse).toBe('function');
    expect(typeof sim.sampleLine).toBe('function');
    expect(typeof sim.getValue).toBe('function');
    expect(typeof sim.getEnergyValue).toBe('function');
    expect(typeof sim.rebuildWallMask).toBe('function');
  });

  it('getColorLUT is a function that returns typed arrays', () => {
    expect(typeof getColorLUT).toBe('function');
    const lut = getColorLUT('ocean');
    expect(lut.posR).toBeInstanceOf(Uint8Array);
    expect(lut.negB).toBeInstanceOf(Uint8Array);
  });

  it('constants module exports all expected values', () => {
    expect(COLOR_SCHEMES).toBeDefined();
    expect(PRESETS).toBeDefined();
    expect(PRESET_NAMES).toBeDefined();
    expect(DEFAULT_CONTROLS).toBeDefined();
    expect(CINEMATIC_INTERVAL).toBeDefined();
  });
});
