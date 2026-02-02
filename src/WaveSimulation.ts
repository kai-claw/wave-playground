export interface WaveSource {
  x: number;
  y: number;
  frequency: number;
  amplitude: number;
  phase: number;
  active: boolean;
  vx?: number; // velocity for Doppler effect
  vy?: number;
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
  }
  
  clear(): void {
    this.current.fill(0);
    this.previous.fill(0);
    this.velocity.fill(0);
    this.sources = [];
    this.walls = [];
  }
  
  step(time: number): void {
    // CFL sub-stepping: if c*dt/dx > CFL_LIMIT, split into sub-steps
    const cflRatio = this.waveSpeed * this.dt; // dx=1 in grid space
    const subSteps = Math.max(1, Math.ceil(cflRatio / WaveSimulation.CFL_LIMIT));
    const subDt = this.dt / subSteps;
    
    // Add wave sources (once per full step, not per sub-step)
    for (const source of this.sources) {
      if (!source.active) continue;
      
      const sx = Math.round(source.x);
      const sy = Math.round(source.y);
      
      if (sx >= 0 && sx < this.cols && sy >= 0 && sy < this.rows) {
        const idx = this.getIndex(sx, sy);
        const freq = source.frequency + (source.vx || 0) * 0.001; // Simple Doppler
        this.current[idx] += source.amplitude * Math.sin(time * freq + source.phase);
      }
      
      // Update source position for Doppler effect
      if (source.vx) source.x += source.vx * this.dt;
      if (source.vy) source.y += source.vy * this.dt;
    }
    
    // Sub-stepped wave equation: u_tt = c²∇²u
    for (let s = 0; s < subSteps; s++) {
      this.substep(subDt);
    }
    
    // NaN/Infinity recovery guard
    this.stabilityGuard();
  }
  
  private substep(dt: number): void {
    const c2 = this.waveSpeed * this.waveSpeed;
    const dt2 = dt * dt;
    
    for (let y = 1; y < this.rows - 1; y++) {
      for (let x = 1; x < this.cols - 1; x++) {
        const idx = this.getIndex(x, y);
        
        // Check if we're inside a wall
        if (this.isInsideWall(x, y)) {
          this.current[idx] = 0;
          this.previous[idx] = 0;
          continue;
        }
        
        // Laplacian (discrete)
        const laplacian = (
          this.current[this.getIndex(x + 1, y)] +
          this.current[this.getIndex(x - 1, y)] +
          this.current[this.getIndex(x, y + 1)] +
          this.current[this.getIndex(x, y - 1)] -
          4 * this.current[idx]
        );
        
        // Wave equation with amplitude clamping
        const newValue = 2 * this.current[idx] - this.previous[idx] + c2 * dt2 * laplacian;
        this.previous[idx] = this.current[idx];
        // Clamp to prevent runaway growth even within CFL bounds
        this.current[idx] = Math.max(-50, Math.min(50, newValue * this.damping));
      }
    }
    
    // Boundary conditions
    this.applyBoundaryConditions();
  }
  
  /** Detect and recover from NaN/Infinity corruption */
  private stabilityGuard(): void {
    let corrupted = false;
    for (let i = 0; i < this.current.length; i++) {
      if (!isFinite(this.current[i])) {
        corrupted = true;
        break;
      }
    }
    if (corrupted) {
      // Soft reset: zero the field but keep sources/walls
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

  /** Sample wave amplitude along a line from (x1,y1) to (x2,y2) in pixel coords */
  sampleLine(px1: number, py1: number, px2: number, py2: number, numSamples: number = 128): Float32Array {
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const x = px1 + (px2 - px1) * t;
      const y = py1 + (py2 - py1) * t;
      samples[i] = this.getValue(x, y);
    }
    return samples;
  }

  getValue(x: number, y: number): number {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    
    if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) return 0;
    
    return this.current[this.getIndex(gx, gy)];
  }
}