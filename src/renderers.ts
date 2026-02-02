// ─── Wave Playground Renderers ───
// 2D heatmap and 3D isometric surface rendering extracted from App.tsx

import type { WaveSimulation } from './WaveSimulation';
import type { ColorScheme } from './types';

// Pre-allocated ImageData reuse — avoids creating new ImageData every frame
let cachedImageData: ImageData | null = null;
let cachedW = 0;
let cachedH = 0;

// Pre-allocated 3D height buffer — avoids nested array allocation per frame
let heightBuffer: Float32Array | null = null;

/**
 * Render the wave field as a 2D color-mapped heatmap.
 * OPTIMIZED: reads directly from sim.current/energyMap Float32Arrays,
 * eliminating per-pixel getValue()/getEnergyValue() function call overhead.
 * Reuses ImageData across frames.
 */
export function render2D(
  ctx: CanvasRenderingContext2D,
  sim: WaveSimulation,
  w: number,
  h: number,
  scheme: ColorScheme,
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

  // Direct array access — bypass getValue()/getEnergyValue() overhead
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
        const intensity = absVal > 2 ? 1 : absVal * 0.5;

        if (intensity < 0.01) {
          r = bgR; g = bgG; b = bgB;
        } else if (value > 0) {
          const c = scheme.positive(intensity);
          r = c[0]; g = c[1]; b = c[2];
        } else {
          const c = scheme.negative(intensity);
          r = c[0]; g = c[1]; b = c[2];
        }

        // Blend energy trail as warm glow overlay
        if (showEnergy) {
          const energy = energyMap[gridIdx];
          const eIntensity = energy > 2.5 ? 1 : energy * 0.4;
          if (eIntensity > 0.005) {
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

/**
 * Render the wave field as a 3D isometric surface mesh.
 * Uses painter's algorithm (back-to-front) with height-based coloring and slope shading.
 */
export function render3D(
  ctx: CanvasRenderingContext2D,
  sim: WaveSimulation,
  w: number,
  h: number,
  scheme: ColorScheme,
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

  const project = (gx: number, gy: number, height: number): [number, number] => {
    const sx = (gx - gy * tiltX) * scaleX + offsetX + gridH * tiltX * scaleX * 0.5;
    const sy = (gy * tiltY - height * 0.03) * scaleY + offsetY + h * 0.3;
    return [sx, sy];
  };

  // Build height map from simulation — flat Float32Array (avoids nested array allocation)
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
  // Alias for readability
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

      const avgH = (h0 + h1 + h2 + h3) / 4;
      const normalizedH = Math.min(1, Math.abs(avgH) / (heightScale * 0.4));

      const [x0, y0] = project(gx, gy, h0);
      const [x1, y1] = project(gx + 1, gy, h1);
      const [x2, y2] = project(gx + 1, gy + 1, h2);
      const [x3, y3] = project(gy + 1 === gridH ? gx : gx, gy + 1, h3);

      let r: number, g: number, b: number;
      if (avgH > 0) {
        [r, g, b] = scheme.positive(normalizedH);
      } else {
        [r, g, b] = scheme.negative(normalizedH);
      }

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

  // Grid lines for depth perception
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  for (let gy = 0; gy < gridH; gy += 3) {
    const hRow = gy * gridW;
    ctx.beginPath();
    for (let gx = 0; gx < gridW; gx++) {
      const [sx, sy] = project(gx, gy, heights[hRow + gx] ?? 0);
      if (gx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}
