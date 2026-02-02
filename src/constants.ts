// ─── Wave Playground Constants ───
// Color schemes and presets extracted from monolithic App.tsx

import type { ColorScheme, ColorSchemeKey, Controls, PresetDef } from './types';

export const COLOR_SCHEMES: Record<ColorSchemeKey, ColorScheme> = {
  ocean: {
    positive: (i: number) => [Math.floor(15 + 50 * i), Math.floor(100 + 155 * i), Math.floor(180 + 75 * i)],
    negative: (i: number) => [Math.floor(8 + 25 * i), Math.floor(25 + 70 * i), Math.floor(80 + 100 * i)],
    bg: [6, 10, 24],
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
  aurora: {
    positive: (i: number) => [Math.floor(20 + 80 * i), Math.floor(200 + 55 * i), Math.floor(120 + 100 * i)],
    negative: (i: number) => [Math.floor(100 + 80 * i), Math.floor(30 + 80 * i), Math.floor(180 + 75 * i)],
    bg: [4, 8, 16],
  },
  plasma: {
    positive: (i: number) => [Math.floor(255 * i), Math.floor(50 + 100 * i * i), Math.floor(200 * (1 - i * 0.5))],
    negative: (i: number) => [Math.floor(40 + 60 * i), Math.floor(20 + 40 * i), Math.floor(180 + 75 * i)],
    bg: [8, 4, 12],
  },
  grayscale: {
    positive: (i: number) => { const v = Math.floor(255 * i); return [v, v, v]; },
    negative: (i: number) => { const v = Math.floor(180 * i); return [v, v, v]; },
    bg: [0, 0, 0],
  },
};

// Presets use relative coordinates (0-1) for responsive sizing
export const PRESETS: Record<string, PresetDef> = {
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
  'Triple Source': {
    walls: [],
    sources: [
      { x: 0.5, y: 0.25 },
      { x: 0.33, y: 0.67 },
      { x: 0.67, y: 0.67 },
    ],
    description: 'Three coherent sources in a triangle — complex Moiré-like interference',
  },
  'Waveguide': {
    walls: [
      { x1: 0, y1: 0.35, x2: 0.8, y2: 0.35 },
      { x1: 0, y1: 0.65, x2: 0.8, y2: 0.65 },
    ],
    sources: [{ x: 0.05, y: 0.5 }],
    description: 'Waves channeled through a corridor — observe waveguide modes',
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);

export const CINEMATIC_INTERVAL = 12000; // 12s per preset

export const DEFAULT_CONTROLS: Controls = {
  wavelength: 60,
  amplitude: 1,
  waveSpeed: 0.5,
  damping: 0.995,
  cellSize: 4,
  reflectiveBoundaries: false,
  visualMode: '2D',
  colorScheme: 'ocean',
  interactionMode: 'source',
};
