// --- Wave Playground Renderers ---
// 2D heatmap and 3D isometric surface rendering.
// PERF: 256-entry color LUTs eliminate per-pixel array allocations (~480K/frame).
//       Pre-allocated scratch arrays eliminate per-quad tuple allocations in 3D.
//       Cached fillStyle strings avoid per-quad template literal construction.

import type { WaveSimulation } from './WaveSimulation';
import type { ColorScheme, ColorSchemeKey } from './types';
import { COLOR_SCHEMES } from './constants';

// --- Color Lookup Tables (256 entries x 3 channels) ---
// Pre-computed RGB for positive and negative at 256 intensity levels.
// Eliminates ~480K short-lived array allocations per frame in 2D mode.
interface ColorLUT {
  posR: Uint8Array; posG: Uint8Array; posB: Uint8Array;
  negR: Uint8Array; negG: Uint8Array; negB: Uint8Array;
}

const colorLUTs = new Map<ColorSchemeKey, ColorLUT>();

export function getColorLUT(key: ColorSchemeKey): ColorLUT {
  let lut = colorLUTs.get(key);
  if (lut) return lut;

  const scheme = COLOR_SCHEMES[key];
  lut = {
    posR: new Uint8Array(256), posG: new Uint8Array(256), posB: new Uint8Array(256),
    negR: new Uint8Array(256), negG: new Uint8Array(256), negB: new Uint8Array(256),
  };
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const pos = scheme.positive(t);
    const neg = scheme.negative(t);
    lut.posR[i] = pos[0]; lut.posG[i] = pos[1]; lut.posB[i] = pos[2];
    lut.negR[i] = neg[0]; lut.negG[i] = neg[1]; lut.negB[i] = neg[2];
  }
  colorLUTs.set(key, lut);
  return lut;
}

// Pre-allocated ImageData reuse -- avoids creating new ImageData every frame
let cachedImageData: ImageData | null = null;
let cachedW = 0;
let cachedH = 0;

/**
 * Render the wave field as a 2D color-mapped heatmap.
 * OPTIMIZED: 256-entry LUT lookups instead of per-pixel function calls + array allocations.
 * Reuses ImageData across frames.
 */
export function render2D(
  ctx: CanvasRenderingContext2D,
  sim: WaveSimulation,
  w: number,
  h: number,
  scheme: ColorScheme,
  schemeKey?: ColorSchemeKey,
): void {
  // Reuse ImageData when dimensions match (avoids ~2MB allocation per frame)
  if (!cachedImageData || cachedW !== w || cachedH !== h) {
    cachedImageData = ctx.createImageData(w, h);
    cachedW = w;
    cachedH = h;
  }
  const data = cachedImageData.data;
  const bgR = scheme.bg[0];
  const bgG = scheme.bg[1];
  const bgB = scheme.bg[2];
  const showEnergy = sim.energyTrailEnabled;

  // Use LUT for zero-allocation color lookups
  const lut = getColorLUT(schemeKey ?? 'ocean');

  // Direct array access -- bypass getValue()/getEnergyValue() overhead
  const current = sim.current;
  const energyMap = sim.energyMap;
  const cellSize = sim.cellSize;
  const cols = sim.cols;
  const rows = sim.rows;
  const invCellSize = 1 / cellSize;

  let prevGy = -1;
  let rowOffset = 0;

  for (let y = 0; y < h; y++) {
    // Compute grid Y once per scanline (same for all pixels in row if cellSize > 1)
    const gy = (y * invCellSize) | 0; // fast floor
    if (gy !== prevGy) {
      rowOffset = gy < rows ? gy * cols : -1;
      prevGy = gy;
    }
    const pixelRowOffset = y * w;

    for (let x = 0; x < w; x++) {
      const gx = (x * invCellSize) | 0;
      const idx4 = (pixelRowOffset + x) << 2; // * 4 via shift

      let r: number, g: number, b: number;

      if (rowOffset < 0 || gx >= cols) {
        r = bgR; g = bgG; b = bgB;
      } else {
        const gridIdx = rowOffset + gx;
        const value = current[gridIdx];
        const absVal = value < 0 ? -value : value;
        // Quantize intensity to 0-255 LUT index (branchless)
        const intensity = absVal > 2 ? 255 : (absVal * 127.5) | 0;

        if (intensity === 0) {
          r = bgR; g = bgG; b = bgB;
        } else if (value > 0) {
          r = lut.posR[intensity]; g = lut.posG[intensity]; b = lut.posB[intensity];
        } else {
          r = lut.negR[intensity]; g = lut.negG[intensity]; b = lut.negB[intensity];
        }

        // Blend energy trail as warm glow overlay (skip when energy negligible)
        if (showEnergy) {
          const energy = energyMap[gridIdx];
          if (energy > 0.0125) { // 0.0125 * 0.4 ~ 0.005 threshold
            const eIntensity = energy > 2.5 ? 1 : energy * 0.4;
            const blend = eIntensity * 0.35;
            const invBlend = 1 - blend;
            const eG = 220 + 35 * eIntensity;
            const eB = 140 + 60 * (1 - eIntensity);
            r = (r * invBlend + 255 * blend) | 0;
            g = (g * invBlend + eG * blend) | 0;
            b = (b * invBlend + eB * blend) | 0;
            if (r > 255) r = 255;
            if (g > 255) g = 255;
            if (b > 255) b = 255;
          }
        }
      }

      data[idx4] = r;
      data[idx4 + 1] = g;
      data[idx4 + 2] = b;
      data[idx4 + 3] = 255;
    }
  }
  ctx.putImageData(cachedImageData, 0, 0);
}

// --- 3D Renderer ---
// Pre-allocated buffers to avoid per-frame allocation
let heightBuffer: Float32Array | null = null;

// Pre-allocated scratch vectors for projection (eliminates per-quad [x,y] tuple allocations)
const _proj = new Float64Array(8); // 4 projected points × 2 coords

// Pre-computed fillStyle/strokeStyle string cache (avoids per-quad template literal + Math.floor)
// Key: r<<16 | g<<8 | b quantized to 6-bit per channel (64×64×64 = 262K entries)
const _fillCache = new Map<number, string>();
const _strokeCache = new Map<number, string>();

function getFillStyle(r: number, g: number, b: number): string {
  // Quantize to 6-bit per channel for cache key (262K possible entries)
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let s = _fillCache.get(key);
  if (s) return s;
  s = `rgb(${r},${g},${b})`;
  _fillCache.set(key, s);
  return s;
}

function getStrokeStyle(r: number, g: number, b: number): string {
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let s = _strokeCache.get(key);
  if (s) return s;
  s = `rgba(${r},${g},${b},0.4)`;
  _strokeCache.set(key, s);
  return s;
}

/**
 * Render the wave field as a 3D isometric surface mesh.
 * OPTIMIZED: pre-allocated projection scratch, cached style strings.
 */
export function render3D(
  ctx: CanvasRenderingContext2D,
  sim: WaveSimulation,
  w: number,
  h: number,
  scheme: ColorScheme,
  schemeKey?: ColorSchemeKey,
): void {
  ctx.fillStyle = `rgb(${scheme.bg.join(',')})`;
  ctx.fillRect(0, 0, w, h);

  const step = 6;
  const gridW = Math.floor(sim.cols / (step / sim.cellSize));
  const gridH = Math.floor(sim.rows / (step / sim.cellSize));
  const heightScale = 40;
  const tiltX = 0.65;
  const tiltY = 0.35;
  const scaleX = w / (gridW + gridH * tiltX);
  const scaleY = (h * 0.7) / (gridH * tiltY + 1);

  const offsetX = w * 0.1;
  const offsetY = h * 0.15;
  const baseX = offsetX + gridH * tiltX * scaleX * 0.5;
  const baseY = offsetY + h * 0.3;

  // Use LUT for zero-allocation color in 3D
  const lut = getColorLUT(schemeKey ?? 'ocean');

  // Build height map from simulation
  const heightLen = gridW * gridH;
  if (!heightBuffer || heightBuffer.length < heightLen) {
    heightBuffer = new Float32Array(heightLen);
  }
  const current = sim.current;
  const cellSize = sim.cellSize;
  const cols = sim.cols;
  const rows = sim.rows;
  const stepOverCell = step / cellSize;
  for (let gy = 0; gy < gridH; gy++) {
    const simRow = ((gy * stepOverCell) | 0);
    const hRow = gy * gridW;
    for (let gx = 0; gx < gridW; gx++) {
      const simCol = ((gx * stepOverCell) | 0);
      heightBuffer[hRow + gx] = (simRow < rows && simCol < cols)
        ? current[simRow * cols + simCol] * heightScale
        : 0;
    }
  }
  const heights = heightBuffer;

  // Draw from back to front (painter's algorithm)
  for (let gy = 0; gy < gridH - 1; gy++) {
    const hRow = gy * gridW;
    const hRowNext = (gy + 1) * gridW;
    for (let gx = 0; gx < gridW - 1; gx++) {
      const h0 = heights[hRow + gx];
      const h1 = heights[hRow + gx + 1];
      const h2 = heights[hRowNext + gx + 1];
      const h3 = heights[hRowNext + gx];

      const avgH = (h0 + h1 + h2 + h3) * 0.25;
      const absAvg = avgH < 0 ? -avgH : avgH;
      const normalizedH = absAvg > heightScale * 0.4 ? 1 : absAvg / (heightScale * 0.4);

      // Inline projection into scratch array (eliminates 4 tuple allocations per quad)
      _proj[0] = (gx - gy * tiltX) * scaleX + baseX;
      _proj[1] = (gy * tiltY - h0 * 0.03) * scaleY + baseY;
      _proj[2] = (gx + 1 - gy * tiltX) * scaleX + baseX;
      _proj[3] = (gy * tiltY - h1 * 0.03) * scaleY + baseY;
      _proj[4] = (gx + 1 - (gy + 1) * tiltX) * scaleX + baseX;
      _proj[5] = ((gy + 1) * tiltY - h2 * 0.03) * scaleY + baseY;
      _proj[6] = (gx - (gy + 1) * tiltX) * scaleX + baseX;
      _proj[7] = ((gy + 1) * tiltY - h3 * 0.03) * scaleY + baseY;

      // LUT color lookup (zero allocation)
      const lutIdx = (normalizedH * 255) | 0;
      let cr: number, cg: number, cb: number;
      if (avgH > 0) {
        cr = lut.posR[lutIdx]; cg = lut.posG[lutIdx]; cb = lut.posB[lutIdx];
      } else {
        cr = lut.negR[lutIdx]; cg = lut.negG[lutIdx]; cb = lut.negB[lutIdx];
      }

      const slope = (h1 > h0 ? h1 - h0 : h0 - h1) + (h3 > h0 ? h3 - h0 : h0 - h3);
      const shade = slope * 0.05 + 0.6;
      const s = shade > 1 ? 1 : shade;

      const sr = (cr * s) | 0;
      const sg = (cg * s) | 0;
      const sb = (cb * s) | 0;

      ctx.fillStyle = getFillStyle(sr, sg, sb);
      ctx.strokeStyle = getStrokeStyle((sr * 0.7) | 0, (sg * 0.7) | 0, (sb * 0.7) | 0);
      ctx.lineWidth = 0.5;

      ctx.beginPath();
      ctx.moveTo(_proj[0], _proj[1]);
      ctx.lineTo(_proj[2], _proj[3]);
      ctx.lineTo(_proj[4], _proj[5]);
      ctx.lineTo(_proj[6], _proj[7]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Grid lines for depth perception
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  for (let gy = 0; gy < gridH; gy += 3) {
    const hRow = gy * gridW;
    ctx.beginPath();
    for (let gx = 0; gx < gridW; gx++) {
      const hVal = heights[hRow + gx] ?? 0;
      const sx = (gx - gy * tiltX) * scaleX + baseX;
      const sy = (gy * tiltY - hVal * 0.03) * scaleY + baseY;
      if (gx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}
