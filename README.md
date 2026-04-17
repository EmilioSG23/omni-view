# Omni View

# OmniView

See the screen of any device from anywhere.

## Monorepo structure

```
omni-view/
├── apps/
│   ├── agent/      — Rust screen-capture agent (WebSocket server)
│   ├── backend/    — NestJS API server
│   ├── desktop/    — Electron shell (loads apps/web, adds native OS integration)
│   ├── mobile/     — Expo (React Native) app
│   └── web/        — React + Vite SPA (shared UI for web and desktop)
├── packages/
│   └── shared/     — Shared TypeScript types and protocol contracts
├── package.json    — Workspace root (pnpm scripts)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Prerequisites

- [Node.js](https://nodejs.org) ≥ 20
- [pnpm](https://pnpm.io) ≥ 10
- [Rust + Cargo](https://rustup.rs) (for `apps/agent`)

## Getting started

```bash
# Install all workspace dependencies
pnpm install

# Start individual apps in development
pnpm dev:web       # React + Vite on http://localhost:5173
pnpm dev:backend   # NestJS on http://localhost:3000
pnpm dev:desktop   # Electron shell (start dev:web first)
pnpm dev:mobile    # Expo
pnpm dev:agent     # Rust agent
```

## Package naming

All workspace packages follow the `@omni-view/<name>` convention.
