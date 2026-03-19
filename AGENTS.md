# AGENTS.md — Blob Office Plugin

Guidelines for AI agents working on this OpenCode visualization plugin.

## Project Overview

Blob Office is an OpenCode plugin that visualizes AI coding sessions as animated characters in a virtual office. The plugin runs in Bun, communicates over WebSocket, and renders via p5.js in a browser viewer.

## Build & Development Commands

```bash
# No build step — TypeScript runs directly via Bun
# OpenCode auto-runs `bun install` when plugin loads

# Install plugin into ~/.config/opencode/plugins/
bash install.sh

# Start the mock WebSocket server (for local dev/testing)
bun run mock-server            # or: bun run blob-office-mock-server.ts 2727
```

## Test Commands

```bash
# All tests (unit + integration + e2e via custom runner)
bun run test                   # → bun tests/run-tests.ts

# Single suite
bun run test:unit              # Unit tests only (bun:test)
bun run test:integration       # Integration tests only (bun:test)
bun run test:e2e               # E2E tests only (bun:test runner)

# Run a single test file directly
bun test tests/unit/helpers.test.ts
bun test tests/integration/websocket.test.ts

# Playwright visual/E2E tests (separate from the bun test runner)
bun run test:visual            # playwright test (headless)
bun run test:visual:headed     # playwright test --headed
bun run test:visual:ui         # playwright test --ui (interactive)
bun run test:states            # playwright test tests/e2e/state-capture.spec.ts

# Watch mode
bun run test:watch
```

Unit/integration tests use `bun:test` (`describe`/`it`/`expect`). Playwright E2E tests use `@playwright/test`. The mock server (`blob-office-mock-server.ts`) starts automatically via Playwright's `globalSetup` for visual tests.

## Code Style Guidelines

### TypeScript (blob-office.ts)

- **Runtime**: Bun (not Node.js) — use Bun APIs (`Bun.serve()`, `Bun.write()`)
- **Module system**: ES modules (`"type": "module"` in package.json)
- **Indentation**: Tabs (not spaces)
- **Quotes**: Single quotes for strings (double quotes acceptable in JSDoc/comments)
- **Semicolons**: Required at end of statements
- **Trailing commas**: Use in multi-line arrays/objects
- **Types**: Explicit types for all function params and return values

### Imports

```typescript
// External/type imports first
import type { Plugin } from "@opencode-ai/plugin";
import type { AgentState } from "./blob-office.ts";

// Node/Bun built-ins
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";

// Local imports — use relative paths with .ts extension
import { hueFromId, folderName } from "../../blob-office.ts";
import { createMockPlugin } from "../mocks/mock-opencode.ts";
```

- Use `import type` for type-only imports
- Include `.ts` extension in relative imports (Bun requires it)
- Group: types → built-ins → local

### Naming Conventions

- `PascalCase` — types, interfaces, classes (`AgentState`, `BlobOfficeMockServer`, `Plugin`)
- `camelCase` — functions, variables, parameters (`hueFromId`, `toolStatus`, `syncWs`)
- `UPPER_SNAKE_CASE` — constants and config objects (`TOOL_STATUS`, `IGNORE_PATTERNS`, `BROADCAST_DEBOUNCE_MS`)

### Section Comments

Use decorative section headers to organize code:

```typescript
// ─── Types ────────────────────────────────────────────────────────────────────
// ─── Helpers ──────────────────────────────────────────────────────────────────
// ─── Plugin ───────────────────────────────────────────────────────────────────
// ─── Mock Server ──────────────────────────────────────────────────────────────
```

### Code Patterns

- **Guard clauses**: Prefer early returns over nested ifs
- **Null safety**: Always check optional values before use
- **Type assertions**: Use `as Type` sparingly; prefer type guards
- **Record types**: Use `Record<K, V>` for key-value mappings
- **Async/await**: Use for all async operations
- **Export**: Export types and pure functions from `blob-office.ts` for test access

### Error Handling

```typescript
// Silently fail for non-critical operations (notifications, logging, etc.)
try {
  await someOptionalOperation();
} catch {
  // Ignore — OK for fire-and-forget operations
}

// For test cleanup, use afterEach to stop servers
afterEach(() => {
  if (server) { server.stop(); server = null; }
});
```

## Architecture

### File Structure

```
├── blob-office.ts              # Main plugin — exports types, helpers, Plugin
├── blob-office.html            # Browser viewer — p5.js, WebSocket client
├── blob-office-mock-server.ts  # Mock WS server for testing (BlobOfficeMockServer class)
├── blob-office-test.ts         # Diagnostic/progressive test plugin
├── bin/blob-office.js          # CLI entry point
├── scenarios/index.ts          # Pre-built test scenarios (lifecycle, multi-agent, etc.)
├── tests/
│   ├── run-tests.ts            # Custom test runner with report generation
│   ├── mocks/mock-opencode.ts  # Mock OpenCode plugin environment
│   ├── unit/                   # bun:test — helpers.test.ts, plugin-logic.test.ts
│   ├── integration/            # bun:test — websocket.test.ts
│   └── e2e/                    # Playwright — simple.spec.ts, viewer.spec.ts, etc.
├── playwright.config.ts        # Playwright config (chromium, sequential, global setup)
├── install.sh                  # Setup script for ~/.config/opencode/plugins/
└── package.json                # ES module, scripts, peer/dev dependencies
```

### Plugin Lifecycle

1. Plugin loads via OpenCode's plugin system (`BlobOfficePlugin` export)
2. Attempts to start server on port 2727 (scans up to 10 ports) — serves both HTML viewer and WebSocket (`/ws`)
3. If port taken, connects as client to existing server
4. Listens to OpenCode events via hooks
5. Broadcasts agent state updates to connected browser viewers

### Key Hooks

- `tool.execute.before` — Agent starts using a tool → update status
- `tool.execute.after` — Tool execution complete → revert to thinking
- `event` — Session lifecycle (created, deleted, status, idle, error, permission, message)

### WebSocket Protocol

```typescript
// Server → Clients
{ type: "snapshot", agents: AgentState[] }
{ type: "heartbeat", timestamp: number }
{ type: "serverclosing", reason: string }

// Client → Server (multi-instance sync)
{ type: "agent_update", agents: AgentState[] }
{ type: "full_sync", agents: AgentState[] }
```

## Adding New Features

### Add support for a new OpenCode tool

1. Add to `TOOL_STATUS` map in `blob-office.ts`:
   ```typescript
   newtool: "reading",  // or "editing", "running", etc.
   ```
2. Add label in `toolLabel()`:
   ```typescript
   newtool: "🔍 searching",
   ```
3. Add test cases in `tests/unit/helpers.test.ts`
4. Update viewer's `STATUS_CFG` in `blob-office.html` if new animation needed

### Change the WebSocket port

1. Edit `WS_BASE_PORT` in `blob-office.ts`
2. Edit `WS_URL` in `blob-office.html`
3. Re-run `bash install.sh`

## Dependencies

- `@opencode-ai/plugin` — Peer dep, provided by OpenCode runtime
- `ws` — WebSocket library (runtime dependency)
- `@playwright/test` — E2E testing (dev only)
- `typescript` — Type checking (dev only)
- `p5.js` — Loaded from CDN in HTML viewer

Keep dependencies minimal — no bundler, no framework.
