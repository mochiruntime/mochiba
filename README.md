# Mochiba: EPFL Diagonale MOBA

A multiplayer single-lane MOBA set on the EPFL campus "Diagonale" thoroughfare, built with **TypeScript**, **Three.js**, and an authoritative **60 Hz Node.js WebSocket** game loop.

## Architecture

```
                  ┌───────────────────────────────┐
                  │         Shared (TS)           │
                  │ Protocol Packets, Map Config, │
                  │     Lane Boundary Math        │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
┌───────────────────────────────┐       ┌─────────────────────────────────────┐
│       Client (Vite/TS)        │       │        Server (Node.js/TS)          │
│ • Three.js 3D Viewport        │       │ • 60 Hz Authoritative Simulation    │
│ • Free Look (Edge Pan)        │◄─────►│ • RTS Movement Step & Lane Clamping │
│ • 'Z' Key Camera Lock         │ (WS)  │ • Snapshot Delta Broadcasting       │
│ • Mouse Wheel Tactical Zoom   │       │ • Blue/Red Team Auto-Assignment     │
│ • Right-Click Move Target     │       └─────────────────────────────────────┘
└───────────────────────────────┘
```

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Mode
Run the 60 Hz server and Vite client concurrently:
```bash
# Terminal 1: Game Server (port 3001)
npm run dev:server

# Terminal 2: Web Client (port 3000)
npm run dev:client
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Automated Tests
Run Vitest across all monorepo workspaces:
```bash
npm test
```

### 4. Production Build
```bash
npm run build
```

## Controls
- **Right Click**: Move champion to clicked ground coordinate along the Diagonale (clicks outside the corridor are directionally clamped to the lane border).
- **Edge Pan (Free Look)**: Move cursor to viewport edges to pan the camera across the map.
- **Z Key**: Toggle camera lock (rigidly tracks player character; deactivates edge pan).
- **Mouse Scroll**: Zoom in/out between tactical MOBA limits (50m – 160m).
