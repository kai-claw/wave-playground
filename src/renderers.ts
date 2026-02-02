// ─── Wave Playground Renderers ───
// 2D heatmap and 3D isometric surface rendering extracted from App.tsx

import type { WaveSimulation } from './WaveSimulation';
import type { ColorScheme } from './types';

/**
 * Render the wave field as a 2D color-mapped heatmap.
 * Each pixel maps directly to a simulation cell value.
 * When energyTrail is true, blends the max-hold energy map as a warm glow layer.
 */
export function render2D(
  ctx: CanvasRenderingContext2D,
  sim: WaveSimulation,
  w: number,
  h: number,
  scheme: ColorScheme,
): void {
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;
  const [bgR, bgG, bgB] = scheme.bg;
  const showEnergy = sim.energyTrailEnabled;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const value = sim.getValue(x, y);
      const intensity = Math.min(1, Math.abs(value) * 0.5);
      const idx = (y * w + x) * 4;

      let r: number, g: number, b: number;

      if (intensity < 0.01) {
        r = bgR; g = bgG; b = bgB;
      } else if (value > 0) {
        [r, g, b] = scheme.positive(intensity);
      } else {
        [r, g, b] = scheme.negative(intensity);
      }

      // Blend energy trail as warm glow overlay
      if (showEnergy) {
        const energy = sim.getEnergyValue(x, y);
        const eIntensity = Math.min(1, energy * 0.4);
        if (eIntensity > 0.005) {
          // Warm white-gold glow: lerp toward energy color
          const eR = 255;
          const eG = 220 + 35 * eIntensity;
          const eB = 140 + 60 * (1 - eIntensity);
          const blend = eIntensity * 0.35; // subtle overlay
          r = Math.min(255, Math.floor(r * (1 - blend) + eR * blend));
          g = Math.min(255, Math.floor(g * (1 - blend) + eG * blend));
          b = Math.min(255, Math.floor(b * (1 - blend) + eB * blend));
        }
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
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
    ctx.beginPath();
    for (let gx = 0; gx < gridW; gx++) {
      const [sx, sy] = project(gx, gy, heights[gy]?.[gx] ?? 0);
      if (gx === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}
