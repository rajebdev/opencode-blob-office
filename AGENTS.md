# AGENTS.md — Blob Office Plugin

Guidelines for AI agents working on this OpenCode visualization plugin.

> **Fork Status**: This repository is a fork of the original Session Character Visualizer concept by [@Caffa](https://github.com/Caffa). This fork (`cbrunnkvist/opencode-blob-office`) is intended to be the **final, canonical version** and will continue to evolve independently. We do not intend to merge changes back upstream.

## Project Overview

Blob Office is an OpenCode plugin that visualizes AI coding sessions as animated blob characters in a virtual office. Runs in Bun, communicates over WebSocket, renders via p5.js.

### Canonical Plugin Name

**The npm package name is `opencode-blob-office`.** When referencing this plugin in `opencode.json` or anywhere else, use exactly:

```json
"plugin": ["opencode-blob-office"]
```

Do NOT use:
- `blob-office` — wrong, doesn't exist as npm package
- `@Caffa/blob-office` — wrong, this is the fork not the original
- Any other variant

## Build & Test Commands

```bash
# No build step — TypeScript runs directly via Bun
# Install via OpenCode's plugin system
bunx opencode-blob-office install

# Start mock WebSocket server for local dev/testing
bun run mock-server

# Tests
bun run test                   # All tests (unit + integration + e2e)
bun run test:unit              # Unit tests only (bun:test)
bun run test:integration       # Integration tests only
bun run test:e2e               # E2E tests only
bun test tests/unit/helpers.test.ts    # Single test file

# Playwright visual tests
bun run test:visual            # Headless
bun run test:visual:headed     # With browser window
bun run test:visual:ui         # Interactive UI mode
bun run test:watch             # Watch mode
```

Unit/integration tests use `bun:test` (`describe`/`it`/`expect`). Playwright E2E tests use `@playwright/test`. The mock server starts automatically via Playwright's `globalSetup`.

## Code Style Guidelines

### TypeScript

- **Runtime**: Bun (not Node.js) — use Bun APIs (`Bun.serve()`, `Bun.write()`)
- **Module system**: ES modules (`"type": "module"` in package.json)
- **Indentation**: Tabs
- **Quotes**: Single quotes (double quotes acceptable in JSDoc/comments)
- **Semicolons**: Required
- **Trailing commas**: Use in multi-line arrays/objects
- **Types**: Explicit types for all function params and return values

### Imports

```typescript
// External/type imports first
import type { Plugin } from "@opencode-ai/plugin";
import type { AgentState } from "./blob-office.ts";

// Node/Bun built-ins
import { spawn } from "child_process";

// Local imports — use relative paths with .ts extension
import { hueFromId, folderName } from "../../blob-office.ts";
```

- Use `import type` for type-only imports
- Include `.ts` extension in relative imports (Bun requires it)
- Group: types → built-ins → local

### Naming Conventions

- `PascalCase` — types, interfaces, classes (`AgentState`, `BlobOfficeMockServer`)
- `camelCase` — functions, variables, parameters (`hueFromId`, `toolStatus`)
- `UPPER_SNAKE_CASE` — constants and config (`TOOL_STATUS`, `IGNORE_PATTERNS`)

### Section Comments

```typescript
// ─── Types ────────────────────────────────────────────────────────────────────
// ─── Helpers ──────────────────────────────────────────────────────────────────
// ─── Plugin ───────────────────────────────────────────────────────────────────
```

### Code Patterns

- **Guard clauses**: Prefer early returns over nested ifs
- **Null safety**: Always check optional values before use
- **Type assertions**: Use `as Type` sparingly; prefer type guards
- **Record types**: Use `Record<K, V>` for key-value mappings
- **Async/await**: Use for all async operations

### Error Handling

```typescript
// Silently fail for non-critical operations
try {
  await someOptionalOperation();
} catch {
  // Ignore — OK for fire-and-forget
}

// Test cleanup
afterEach(() => {
  if (server) { server.stop(); server = null; }
});
```

## Architecture

### Key Files

- `blob-office.ts` — Main plugin, exports types/helpers, serves HTML + WebSocket
- `blob-office.html` — Browser viewer, p5.js canvas, WebSocket client
- `blob-office-mock-server.ts` — Mock WS server for testing
- `tests/` — Unit (bun:test), integration, and Playwright E2E tests

### Plugin Lifecycle

1. Plugin loads via OpenCode's plugin system (`BlobOfficePlugin` export)
2. Starts server on port 2727 (scans up to 10 ports), serves HTML and WebSocket (`/ws`)
3. If port taken, connects as client to existing server
4. Listens to OpenCode events via hooks
5. Broadcasts agent state updates to browser viewers

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

## Adding Features

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
4. Update `STATUS_CFG` in `blob-office.html` if new animation needed

## Dependencies

- `@opencode-ai/plugin` — Peer dep, provided by OpenCode runtime
- `ws` — WebSocket library (runtime)
- `@playwright/test`, `typescript` — Dev dependencies
- `p5.js` — Loaded from CDN in HTML viewer

Keep dependencies minimal — no bundler, no framework.

## Releasing

**Always use `npm version` — never `git tag` manually.**

```bash
npm version patch   # or minor, major
git push && git push --tags
```

`npm version` bumps `package.json`, commits, and tags atomically. The tag push triggers CI to publish to npm with OIDC provenance.
