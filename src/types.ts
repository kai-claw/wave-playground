// ─── Wave Playground Types ───
// Centralized type definitions extracted from monolithic App.tsx

export type InteractionMode = 'source' | 'impulse' | 'draw';

export type ColorSchemeKey = 'ocean' | 'thermal' | 'neon' | 'aurora' | 'plasma' | 'grayscale';

export interface ProbeLine {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface Controls {
  wavelength: number;
  amplitude: number;
  waveSpeed: number;
  damping: number;
  cellSize: number;
  reflectiveBoundaries: boolean;
  visualMode: '2D' | '3D';
  colorScheme: ColorSchemeKey;
  interactionMode: InteractionMode;
}

export interface PresetDef {
  walls?: Array<{
    x1: number; y1: number; x2: number; y2: number;
    slits?: Array<{ start: number; end: number }>;
  }>;
  reflective?: boolean;
  sources?: Array<{ x: number; y: number; freq?: number }>;
  orbital?: Array<{
    cx: number; cy: number; radius: number; speed: number; startAngle?: number;
  }>;
  description: string;
}

export type ColorFunction = (intensity: number) => number[];

export interface ColorScheme {
  positive: ColorFunction;
  negative: ColorFunction;
  bg: number[];
}
