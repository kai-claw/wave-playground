# 🌊 Wave Playground

> Interactive wave physics simulator — drop sources, explore interference patterns, slit diffraction, Doppler spirals, and energy trails in real time.

**[▶ Live Demo](https://kai-claw.github.io/wave-playground/)**

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Tests](https://img.shields.io/badge/tests-114_passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)
![Bundle](https://img.shields.io/badge/bundle-71KB_gzip-blue)

---

## ✨ Features

### Core Simulation
| Feature | Description |
|---------|-------------|
| 🌊 Wave Equation Solver | Finite-difference 2D wave equation with CFL-stable sub-stepping |
| 🧱 Walls & Slits | Bitmap-masked obstacles with slit diffraction support |
| 🪞 Boundary Modes | Toggle absorbing ↔ reflective boundaries for standing waves |
| 🔄 Orbital Sources | Sources orbiting in circles producing Doppler spiral patterns |
| 💧 Impulse Mode | Click to drop gaussian pulse rings — stone-in-water physics |
| 🎨 Wave Paint Mode | Draw continuous emitter trails across the canvas |

### Visual Effects
| Feature | Description |
|---------|-------------|
| 🗺️ 2D Heatmap | Color-coded amplitude with 6 premium color schemes |
| 🏔️ 3D Isometric View | Height-mapped terrain rendering of wave displacement |
| ✨ Energy Trails | Long-exposure mode tracking peak amplitude with golden glow decay |
| 🌈 6 Color Schemes | Ocean · Thermal · Neon · Aurora · Plasma · Grayscale |
| 💎 Source Ring Pulses | Animated concentric rings synced to wave frequency |
| 🔦 Glowing Slit Gaps | Subtle blue glow highlighting wall openings |

### Interactive
| Feature | Description |
|---------|-------------|
| 📐 Measurement Probe | Place a line, see real-time waveform cross-section overlay |
| 🖱️ Drag Sources | Move sources for real-time Doppler effect |
| 🎬 Cinematic Autoplay | Auto-cycles 10 presets with smooth progress bar |
| ⌨️ Full Keyboard Control | 15+ shortcuts for hands-free operation |
| 📱 Touch Support | Mobile-friendly touch targets and gestures |
| ♿ Accessible | ARIA labels, focus outlines, reduced-motion support |

### Performance
| Feature | Description |
|---------|-------------|
| 🧮 Wall Mask Bitmap | Pre-computed Uint8Array eliminates per-cell function calls |
| 🖼️ ImageData Reuse | Cached frame buffer — zero per-frame allocation |
| ⚡ Direct Array Reads | Scanline rendering reads Float32Arrays directly |
| 📊 Sparse Stability Guard | O(1) corruption detection via 16-point sampling |

---

## 🎹 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `C` | Clear all sources & walls |
| `H` | Toggle help overlay |
| `P` | Toggle control panel |
| `S` / `I` / `D` | Switch mode: Source / Impulse / Draw |
| `L` | Toggle measurement probe |
| `T` | Toggle energy trails |
| `A` | Cinematic autoplay |
| `1`–`0` | Load presets (1=Double Slit … 0=Spirograph) |

---

## 🎭 Presets

| # | Preset | Description |
|---|--------|-------------|
| 1 | Double Slit | Classic quantum experiment — interference behind two slits |
| 2 | Single Slit | Diffraction — waves bending around a single opening |
| 3 | Ripple Tank | Open water — click to add sources, watch interference |
| 4 | Two Sources | Coherent sources — constructive & destructive interference |
| 5 | Standing Waves | Reflective boundaries creating resonance patterns |
| 6 | Corner Reflector | Waves reflecting off an L-shaped barrier |
| 7 | Triple Source | Triangle of sources — complex Moiré-like patterns |
| 8 | Waveguide | Corridor mode propagation through parallel walls |
| 9 | Orbital Dance | Twin orbiting sources — Doppler spirals |
| 0 | Spirograph | Counter-rotating orbitals weaving interference lace |

---

## 🏗️ Architecture

```
wave-playground/
├── src/
│   ├── WaveSimulation.ts    # Core physics engine (415 lines)
│   │                         Float32Array fields, CFL sub-stepping,
│   │                         impulse, orbital sources, wall mask bitmap
│   ├── renderers.ts          # 2D heatmap + 3D isometric renderers (301 lines)
│   │                         Direct array reads, ImageData reuse,
│   │                         energy trail overlay, source ring pulses
│   ├── constants.ts          # Color schemes, 10 presets, defaults (128 lines)
│   ├── types.ts              # TypeScript interfaces (44 lines)
│   ├── App.tsx               # Main React component + UI (982 lines)
│   │                         Canvas interaction, keyboard shortcuts,
│   │                         cinematic autoplay, probe overlay
│   ├── App.css               # Styles + micro-interactions (887 lines)
│   ├── components/
│   │   └── ErrorBoundary.tsx  # Crash recovery with reload
│   └── __tests__/
│       ├── WaveSimulation.test.ts  # 65 physics + stress tests
│       └── architecture.test.ts    # 49 module + preset tests
├── public/
│   ├── favicon.svg           # Custom wave SVG favicon
│   ├── manifest.json         # PWA manifest
│   ├── robots.txt
│   └── sitemap.xml
└── index.html                # SEO, OG tags, JSON-LD, loading spinner
```

**Total:** ~2,870 source LOC · 114 tests · 227 KB bundle (71 KB gzip)

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 7 |
| Rendering | Canvas 2D (no WebGL dependency) |
| Physics | Custom Float32Array wave engine |
| Testing | Vitest (114 tests) |
| CI/CD | GitHub Actions → GitHub Pages |

---

## 🔬 Physics

The simulation solves the 2D wave equation using finite differences:

```
∂²u/∂t² = c² ∇²u
```

| Concept | Implementation |
|---------|----------------|
| **Wave Equation** | Discrete Laplacian with 4-point stencil on Float32Array grid |
| **CFL Stability** | Auto-computed sub-steps: `ceil(c·dt / CFL_LIMIT)` |
| **Damping** | Per-step amplitude decay with configurable coefficient |
| **Walls** | Pre-computed Uint8Array bitmap mask — zero clamping |
| **Slit Diffraction** | Gap openings in wall mask where waves propagate through |
| **Doppler Effect** | Emerges naturally from moving source velocity modulation |
| **Impulse** | Gaussian pulse injection with configurable radius |
| **Orbital Motion** | Sources follow circular paths, velocity → Doppler shift |
| **Energy Trails** | Per-cell peak amplitude tracking with 0.997/step decay |
| **Boundary Modes** | Absorbing (copy edge) or reflective (mirror edge) |

---

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/kai-claw/wave-playground.git
cd wave-playground

# Install
npm install

# Dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Deploy to GitHub Pages
npm run deploy
```

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

Built by [kai-claw](https://github.com/kai-claw)
