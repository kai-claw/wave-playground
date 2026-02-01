# 🌊 Wave Playground

Interactive wave physics simulator built with React + Canvas. Drop wave sources, watch interference patterns form, explore slit diffraction and the Doppler effect — all in real time.

**[▶ Live Demo](https://kai-claw.github.io/wave-playground/)**

![Wave Playground](https://img.shields.io/badge/React-19-61DAFB?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript) ![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

- **Click to create wave sources** — drop point sources anywhere on the canvas
- **Drag sources for Doppler effect** — moving sources shift frequency in real time
- **2D Heatmap view** — color-coded amplitude visualization
- **3D Isometric surface view** — height-mapped terrain showing wave displacement
- **Slit diffraction presets** — single slit, double slit with visible interference fringes
- **Standing waves** — toggle reflective boundaries to see resonance patterns
- **6 built-in presets** — Double Slit, Single Slit, Ripple Tank, Two Sources, Standing Waves, Corner Reflector
- **4 color schemes** — Ocean, Thermal, Neon, Grayscale
- **Full parameter control** — wavelength, amplitude, speed, damping
- **Responsive canvas** — fills available space, works on desktop and mobile
- **Right-click to remove** sources

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/kai-claw/wave-playground.git
cd wave-playground

# Install
npm install

# Dev server
npm run dev

# Production build
npm run build
```

## 🔬 Physics

The simulation solves the 2D wave equation using finite differences:

```
∂²u/∂t² = c² ∇²u
```

Where:
- `u(x,y,t)` is the wave displacement field
- `c` is the wave speed
- `∇²` is the discrete Laplacian (4-point stencil)

Walls use a mask-based approach — grid cells inside walls are clamped to zero. Slits are openings in the mask where waves can propagate through.

The Doppler effect emerges naturally when you drag a source — the source's velocity modulates the effective frequency at each emission point.

## 🎮 Controls

| Action | Effect |
|--------|--------|
| Click canvas | Add a wave source |
| Drag a source | Move it (Doppler effect) |
| Right-click | Remove nearest source |
| Wavelength slider | Set source wavelength |
| Amplitude slider | Set source strength |
| Speed slider | Wave propagation speed |
| Damping slider | Energy loss per step |
| Reflective Boundaries | Toggle absorbing ↔ reflective edges |
| View Mode | Switch between 2D heatmap and 3D surface |

## 🏗️ Tech Stack

- **React 19** + TypeScript
- **Canvas 2D** rendering (no WebGL dependency)
- **Vite** build tooling
- **Custom wave engine** — `Float32Array`-backed simulation grid

## 📄 License

MIT

---

Built by [kai-claw](https://github.com/kai-claw)
