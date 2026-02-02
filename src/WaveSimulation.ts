export interface WaveSource {
  x: number;
  y: number;
  frequency: number;
  amplitude: number;
  phase: number;
  active: boolean;
  vx?: number; // velocity for Doppler effect
  vy?: number;
  // Orbital motion
  orbitCenterX?: number; // grid coords
  orbitCenterY?: number;
  orbitRadius?: number;  // grid units
  orbitSpeed?: number;   // radians per step
  orbitAngle?: number;   // current angle
}

export interface Wall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  slits?: Array<{ start: number; end: number }>; // positions along the wall
}

export class WaveSimulation {
  width: number;
  height: number;
  cellSize: number;
  cols: number;
  rows: number;
  
  // Wave field data
  current: Float32Array;
  previous: Float32Array;
  velocity: Float32Array;
  
  // Energy trail (max hold) — tracks peak amplitude with slow decay
  energyMap: Float32Array;
  energyTrailEnabled: boolean = false;
  energyDecay: number = 0.997; // slow fade for long-exposure effect
  
  // Pre-computed wall mask: 1 = wall cell, 0 = open (avoids per-cell wall checks in inner loop)
  wallMask: Uint8Array;
  private wallMaskDirty: boolean = true;
  
  // Pre-allocated sample buffer for probe line (avoids per-frame Float32Array allocation)
  private sampleBuffer: Float32Array = new Float32Array(256);
  
  // Simulation parameters
  waveSpeed: number = 0.5;
  damping: number = 0.995;
  dt: number = 1.0;
  
  // CFL stability: max c*dt/dx for 2D wave equation is 1/sqrt(2) ≈ 0.707
  // We use sub-stepping to maintain stability at any waveSpeed
  static readonly CFL_LIMIT = 0.5; // conservative (stable margin)
  
  sources: WaveSource[] = [];
  walls: Wall[] = [];
  reflectiveBoundaries: boolean = false;
  
  constructor(width: number, height: number, cellSize: number = 4) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    
    const size = this.cols * this.rows;
    this.current = new Float32Array(size);
    this.previous = new Float32Array(size);
    this.velocity = new Float32Array(size);
    this.energyMap = new Float32Array(size);
    this.wallMask = new Uint8Array(size);
  }
  
  getIndex(x: number, y: number): number {
    return y * this.cols + x;
  }
  
  addSource(x: number, y: number, frequency: number = 0.05, amplitude: number = 1): void {
    this.sources.push({
      x: x / this.cellSize,
      y: y / this.cellSize,
      frequency,
      amplitude,
      phase: 0,
      active: true
    });
  }
  
  addWall(x1: number, y1: number, x2: number, y2: number, slits?: Array<{ start: number; end: number }>): void {
    this.walls.push({
      x1: x1 / this.cellSize,
      y1: y1 / this.cellSize,
      x2: x2 / this.cellSize,
      y2: y2 / this.cellSize,
      slits
    });
    this.wallMaskDirty = true;
  }
  
  clear(): void {
    this.current.fill(0);
    this.previous.fill(0);
    this.velocity.fill(0);
    this.energyMap.fill(0);
    this.wallMask.fill(0);
    this.sources = [];
    this.walls = [];
    this.wallMaskDirty = true;
  }

  /** Rebuild the wall mask bitmap from current walls. O(cols*rows*walls) but only runs when walls change. */
  rebuildWallMask(): void {
    if (!this.wallMaskDirty) return;
    this.wallMask.fill(0);
    if (this.walls.length === 0) { this.wallMaskDirty = false; return; }
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (this.isInsideWall(x, y)) {
          this.wallMask[y * this.cols + x] = 1;
        }
      }
    }
    this.wallMaskDirty = false;
  }
  
  step(time: number): void {
    // CFL sub-stepping: if c*dt/dx > CFL_LIMIT, split into sub-steps
    const cflRatio = this.waveSpeed * this.dt; // dx=1 in grid space
    const subSteps = Math.max(1, Math.ceil(cflRatio / WaveSimulation.CFL_LIMIT));
    const subDt = this.dt / subSteps;
    
    // Rebuild wall mask if walls changed (O(grid) but only when dirty)
    this.rebuildWallMask();
    
    // Update orbital sources
    for (const source of this.sources) {
      if (source.orbitCenterX != null && source.orbitRadius != null && source.orbitSpeed != null) {
        source.orbitAngle = (source.orbitAngle ?? 0) + source.orbitSpeed;
        const newX = source.orbitCenterX + source.orbitRadius * Math.cos(source.orbitAngle);
        const newY = (source.orbitCenterY ?? source.orbitCenterX) + source.orbitRadius * Math.sin(source.orbitAngle);
        // Set velocity for Doppler effect
        source.vx = (newX - source.x) * 0.1;
        source.vy = (newY - source.y) * 0.1;
        source.x = newX;
        source.y = newY;
      }
    }

    // Add wave sources (once per full step, not per sub-step)
    for (const source of this.sources) {
      if (!source.active) continue;
      
      const sx = Math.round(source.x);
      const sy = Math.round(source.y);
      
      if (sx >= 0 && sx < this.cols && sy >= 0 && sy < this.rows) {
        const idx = sy * this.cols + sx;
        const freq = source.frequency + (source.vx || 0) * 0.001; // Simple Doppler
        this.current[idx] += source.amplitude * Math.sin(time * freq + source.phase);
      }
      
      // Update source position for Doppler/manual velocity
      if (!source.orbitCenterX) {
        if (source.vx) source.x += source.vx * this.dt;
        if (source.vy) source.y += source.vy * this.dt;
      }
    }
    
    // Sub-stepped wave equation: u_tt = c²∇²u
    for (let s = 0; s < subSteps; s++) {
      this.substep(subDt);
    }
    
    // Update energy trail map (max hold with slow decay)
    if (this.energyTrailEnabled) {
      for (let i = 0; i < this.current.length; i++) {
        const absVal = Math.abs(this.current[i]);
        this.energyMap[i] = Math.max(this.energyMap[i] * this.energyDecay, absVal);
      }
    }

    // NaN/Infinity recovery guard
    this.stabilityGuard();
  }
  
  private substep(dt: number): void {
    const c2 = this.waveSpeed * this.waveSpeed;
    const dt2 = dt * dt;
    const cols = this.cols;
    const cur = this.current;
    const prev = this.previous;
    const mask = this.wallMask;
    const damp = this.damping;
    const c2dt2 = c2 * dt2;
    
    for (let y = 1; y < this.rows - 1; y++) {
      const rowIdx = y * cols;
      for (let x = 1; x < cols - 1; x++) {
        const idx = rowIdx + x;
        
        // Wall mask lookup: single array access vs. iterating all walls
        if (mask[idx]) {
          cur[idx] = 0;
          prev[idx] = 0;
          continue;
        }
        
        // Laplacian (discrete) — inlined index calculations
        const laplacian = (
          cur[idx + 1] +
          cur[idx - 1] +
          cur[idx + cols] +
          cur[idx - cols] -
          4 * cur[idx]
        );
        
        // Wave equation with amplitude clamping (conditional > Math.max/min for V8)
        const newValue = (2 * cur[idx] - prev[idx] + c2dt2 * laplacian) * damp;
        prev[idx] = cur[idx];
        cur[idx] = newValue > 50 ? 50 : newValue < -50 ? -50 : newValue;
      }
    }
    
    // Boundary conditions
    this.applyBoundaryConditions();
  }
  
  /** Detect and recover from NaN/Infinity corruption — samples sparse points instead of full scan */
  private stabilityGuard(): void {
    const cur = this.current;
    const len = cur.length;
    // Sample 16 evenly-spaced points + corners for fast corruption detection
    // Covers full grid with O(1) cost instead of O(n)
    const stride = (len >>> 4) || 1; // len/16 floored
    for (let i = 0; i < len; i += stride) {
      if (!isFinite(cur[i])) {
        // Corruption found — full reset
        this.current.fill(0);
        this.previous.fill(0);
        this.velocity.fill(0);
        return;
      }
    }
    // Also check last element (corners)
    if (!isFinite(cur[len - 1])) {
      this.current.fill(0);
      this.previous.fill(0);
      this.velocity.fill(0);
    }
  }
  
  private isInsideWall(x: number, y: number): boolean {
    for (const wall of this.walls) {
      if (this.isPointOnWall(x, y, wall)) {
        // Check if point is in a slit
        if (wall.slits) {
          const t = this.getParametricPosition(x, y, wall);
          for (const slit of wall.slits) {
            if (t >= slit.start && t <= slit.end) {
              return false; // Inside slit, not blocked
            }
          }
        }
        return true; // Inside wall, blocked
      }
    }
    return false;
  }
  
  private isPointOnWall(x: number, y: number, wall: Wall): boolean {
    const distance = this.distanceToLine(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
    return distance < 0.7; // Tolerance for wall thickness
  }
  
  private distanceToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    
    if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const projection = { x: x1 + t * dx, y: y1 + t * dy };
    return Math.sqrt((px - projection.x) ** 2 + (py - projection.y) ** 2);
  }
  
  private getParametricPosition(x: number, y: number, wall: Wall): number {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const len2 = dx * dx + dy * dy;
    
    if (len2 === 0) return 0;
    
    return ((x - wall.x1) * dx + (y - wall.y1) * dy) / len2;
  }
  
  private applyBoundaryConditions(): void {
    if (this.reflectiveBoundaries) {
      // Reflective boundaries
      for (let x = 0; x < this.cols; x++) {
        this.current[this.getIndex(x, 0)] = this.current[this.getIndex(x, 1)];
        this.current[this.getIndex(x, this.rows - 1)] = this.current[this.getIndex(x, this.rows - 2)];
      }
      for (let y = 0; y < this.rows; y++) {
        this.current[this.getIndex(0, y)] = this.current[this.getIndex(1, y)];
        this.current[this.getIndex(this.cols - 1, y)] = this.current[this.getIndex(this.cols - 2, y)];
      }
    } else {
      // Absorbing boundaries
      for (let x = 0; x < this.cols; x++) {
        this.current[this.getIndex(x, 0)] = 0;
        this.current[this.getIndex(x, this.rows - 1)] = 0;
      }
      for (let y = 0; y < this.rows; y++) {
        this.current[this.getIndex(0, y)] = 0;
        this.current[this.getIndex(this.cols - 1, y)] = 0;
      }
    }
  }
  
  /** Apply a one-shot gaussian impulse — creates a perfect expanding ring */
  applyImpulse(pixelX: number, pixelY: number, radius: number = 8, amplitude: number = 3): void {
    const cx = Math.floor(pixelX / this.cellSize);
    const cy = Math.floor(pixelY / this.cellSize);
    const r = Math.ceil(radius / this.cellSize);
    const sigma = r * 0.5;
    const sigma2 = sigma * sigma;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 1 || gx >= this.cols - 1 || gy < 1 || gy >= this.rows - 1) continue;

        const dist2 = dx * dx + dy * dy;
        if (dist2 > r * r) continue;

        const gaussian = amplitude * Math.exp(-dist2 / (2 * sigma2));
        const idx = this.getIndex(gx, gy);
        this.current[idx] += gaussian;
      }
    }
  }

  /** Sample wave amplitude along a line from (x1,y1) to (x2,y2) in pixel coords.
   *  Reuses pre-allocated buffer to avoid per-frame Float32Array allocation. */
  sampleLine(px1: number, py1: number, px2: number, py2: number, numSamples: number = 128): Float32Array {
    // Grow buffer if needed (rare — only if caller requests more than 256 samples)
    if (this.sampleBuffer.length < numSamples) {
      this.sampleBuffer = new Float32Array(numSamples);
    }
    const samples = this.sampleBuffer;
    const invCellSize = 1 / this.cellSize;
    const cols = this.cols;
    const rows = this.rows;
    const cur = this.current;
    const invN = 1 / (numSamples - 1);
    const dx = (px2 - px1) * invN;
    const dy = (py2 - py1) * invN;
    for (let i = 0; i < numSamples; i++) {
      const gx = ((px1 + dx * i) * invCellSize) | 0; // fast floor via bitwise OR
      const gy = ((py1 + dy * i) * invCellSize) | 0;
      samples[i] = (gx >= 0 && gx < cols && gy >= 0 && gy < rows)
        ? cur[gy * cols + gx]
        : 0;
    }
    return samples.subarray(0, numSamples);
  }

  getValue(x: number, y: number): number {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    
    if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) return 0;
    
    return this.current[this.getIndex(gx, gy)];
  }

  /** Get energy trail value at a pixel coordinate */
  getEnergyValue(x: number, y: number): number {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) return 0;
    return this.energyMap[this.getIndex(gx, gy)];
  }

  /** Add a source that orbits in a circle — creates stunning Doppler spiral patterns */
  addOrbitalSource(
    centerX: number, centerY: number,
    radius: number, speed: number,
    frequency: number = 0.05, amplitude: number = 1,
    startAngle: number = 0,
  ): void {
    const cx = centerX / this.cellSize;
    const cy = centerY / this.cellSize;
    const r = radius / this.cellSize;
    this.sources.push({
      x: cx + r * Math.cos(startAngle),
      y: cy + r * Math.sin(startAngle),
      frequency,
      amplitude,
      phase: 0,
      active: true,
      orbitCenterX: cx,
      orbitCenterY: cy,
      orbitRadius: r,
      orbitSpeed: speed,
      orbitAngle: startAngle,
    });
  }
}