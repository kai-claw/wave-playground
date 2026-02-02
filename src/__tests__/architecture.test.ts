import { describe, it, expect } from 'vitest';
import { COLOR_SCHEMES, PRESETS, PRESET_NAMES, CINEMATIC_INTERVAL, DEFAULT_CONTROLS } from '../constants';
import { render2D, render3D } from '../renderers';
import type { Controls, ProbeLine, InteractionMode, ColorSchemeKey } from '../types';

describe('Module Architecture', () => {
  it('types module exports all required interfaces', () => {
    // Verify type-level exports compile (runtime check on type shapes)
    const controls: Controls = { ...DEFAULT_CONTROLS };
    expect(controls.wavelength).toBe(60);
    expect(controls.visualMode).toBe('2D');

    const probe: ProbeLine = { x1: 0, y1: 0, x2: 100, y2: 100 };
    expect(probe.x1).toBe(0);

    const mode: InteractionMode = 'impulse';
    expect(mode).toBe('impulse');

    const key: ColorSchemeKey = 'aurora';
    expect(key).toBe('aurora');
  });

  it('constants module exports all data', () => {
    expect(Object.keys(COLOR_SCHEMES)).toHaveLength(6);
    expect(Object.keys(PRESETS)).toHaveLength(8);
    expect(PRESET_NAMES).toHaveLength(8);
    expect(CINEMATIC_INTERVAL).toBe(12000);
    expect(DEFAULT_CONTROLS).toBeDefined();
  });

  it('renderers module exports render functions', () => {
    expect(typeof render2D).toBe('function');
    expect(typeof render3D).toBe('function');
  });
});

describe('Color Schemes', () => {
  const SCHEME_NAMES: ColorSchemeKey[] = ['ocean', 'thermal', 'neon', 'aurora', 'plasma', 'grayscale'];

  SCHEME_NAMES.forEach(name => {
    describe(name, () => {
      it('has positive, negative, and bg properties', () => {
        const scheme = COLOR_SCHEMES[name];
        expect(typeof scheme.positive).toBe('function');
        expect(typeof scheme.negative).toBe('function');
        expect(scheme.bg).toHaveLength(3);
      });

      it('positive returns valid RGB at intensity 0', () => {
        const [r, g, b] = COLOR_SCHEMES[name].positive(0);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(0);
      });

      it('positive returns valid RGB at intensity 1', () => {
        const [r, g, b] = COLOR_SCHEMES[name].positive(1);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeLessThanOrEqual(255);
      });

      it('negative returns valid RGB at intensity 0', () => {
        const [r, g, b] = COLOR_SCHEMES[name].negative(0);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(0);
      });

      it('negative returns valid RGB at intensity 1', () => {
        const [r, g, b] = COLOR_SCHEMES[name].negative(1);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeLessThanOrEqual(255);
      });

      it('bg values are valid RGB', () => {
        const [r, g, b] = COLOR_SCHEMES[name].bg;
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      });
    });
  });
});

describe('Presets', () => {
  it('all presets have descriptions', () => {
    Object.entries(PRESETS).forEach(([_name, preset]) => {
      expect(preset.description).toBeTruthy();
      expect(typeof preset.description).toBe('string');
    });
  });

  it('all presets have sources or walls', () => {
    Object.entries(PRESETS).forEach(([_name, preset]) => {
      const hasSources = preset.sources && preset.sources.length > 0;
      const hasWalls = preset.walls && preset.walls.length > 0;
      expect(hasSources || hasWalls).toBe(true);
    });
  });

  it('all source coordinates are in 0-1 range', () => {
    Object.entries(PRESETS).forEach(([_name, preset]) => {
      preset.sources?.forEach(source => {
        expect(source.x).toBeGreaterThanOrEqual(0);
        expect(source.x).toBeLessThanOrEqual(1);
        expect(source.y).toBeGreaterThanOrEqual(0);
        expect(source.y).toBeLessThanOrEqual(1);
      });
    });
  });

  it('all wall coordinates are in 0-1 range', () => {
    Object.entries(PRESETS).forEach(([_name, preset]) => {
      preset.walls?.forEach(wall => {
        expect(wall.x1).toBeGreaterThanOrEqual(0);
        expect(wall.x1).toBeLessThanOrEqual(1);
        expect(wall.y1).toBeGreaterThanOrEqual(0);
        expect(wall.y1).toBeLessThanOrEqual(1);
        expect(wall.x2).toBeGreaterThanOrEqual(0);
        expect(wall.x2).toBeLessThanOrEqual(1);
        expect(wall.y2).toBeGreaterThanOrEqual(0);
        expect(wall.y2).toBeLessThanOrEqual(1);
      });
    });
  });

  it('slit positions are between 0 and 1', () => {
    Object.entries(PRESETS).forEach(([_name, preset]) => {
      preset.walls?.forEach(wall => {
        wall.slits?.forEach(slit => {
          expect(slit.start).toBeGreaterThanOrEqual(0);
          expect(slit.start).toBeLessThanOrEqual(1);
          expect(slit.end).toBeGreaterThanOrEqual(0);
          expect(slit.end).toBeLessThanOrEqual(1);
          expect(slit.end).toBeGreaterThan(slit.start);
        });
      });
    });
  });

  it('PRESET_NAMES matches PRESETS keys', () => {
    expect(PRESET_NAMES).toEqual(Object.keys(PRESETS));
  });

  it('all 8 presets are present', () => {
    const expected = [
      'Double Slit', 'Single Slit', 'Ripple Tank', 'Two Sources',
      'Standing Waves', 'Corner Reflector', 'Triple Source', 'Waveguide',
    ];
    expected.forEach(name => {
      expect(PRESETS[name]).toBeDefined();
    });
  });
});

describe('Default Controls', () => {
  it('has valid default values', () => {
    expect(DEFAULT_CONTROLS.wavelength).toBe(60);
    expect(DEFAULT_CONTROLS.amplitude).toBe(1);
    expect(DEFAULT_CONTROLS.waveSpeed).toBe(0.5);
    expect(DEFAULT_CONTROLS.damping).toBe(0.995);
    expect(DEFAULT_CONTROLS.cellSize).toBe(4);
    expect(DEFAULT_CONTROLS.reflectiveBoundaries).toBe(false);
    expect(DEFAULT_CONTROLS.visualMode).toBe('2D');
    expect(DEFAULT_CONTROLS.colorScheme).toBe('ocean');
    expect(DEFAULT_CONTROLS.interactionMode).toBe('source');
  });

  it('colorScheme matches a valid scheme', () => {
    expect(COLOR_SCHEMES[DEFAULT_CONTROLS.colorScheme]).toBeDefined();
  });
});
