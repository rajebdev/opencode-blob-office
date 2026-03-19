# Blob Office

![Demo](media-previews/main_show.gif)

An [OpenCode](https://github.com/anomalyco/opencode) plugin that visualizes AI coding sessions as animated blob characters in a virtual office.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

Each session appears as a colored blob with speech bubbles, status animations, and idle eye expressions. Subagents orbit their parents. The viewer runs in a browser via p5.js, connected over WebSocket.

![subagents](media-previews/subagents.gif)

> **Attribution**: This project is a fork of [Session Character Visualizer](https://github.com/Caffa/Session-Character-Visualizer) by [@Caffa](https://github.com/Caffa), who created the original concept, plugin architecture, and p5.js blob renderer. The `blob-office` npm package builds on that foundation.

---

## Installation

```bash
bunx blob-office install
```

Or with npx:

```bash
npx blob-office install
```

Restart OpenCode. The viewer opens automatically in your browser at `localhost:2727`.

### Manual

```bash
git clone https://github.com/cbrunnkvist/opencode-blob-office.git
cd opencode-blob-office
bash install.sh
```

---

## What This Fork Changes

This fork diverges from upstream in architecture and scope. Key differences:

- **Unified server** — single port serves both HTTP viewer and WebSocket (was separate)
- **Graceful disconnect** — blobs fade out on disconnect, viewer reconnects with backoff (was instant clear + "reconnecting...")
- **Idle eye expressions** — sleeping blobs occasionally peek, glance, or go half-lidded
- **Real filenames in code panels** — editing blobs show actual files being touched, not hardcoded list
- **File activity tracking** — all file-touching tools (read, glob, grep) tracked, not just writes
- **npm packaging** — `bunx blob-office install` / `npx blob-office install` with CLI
- **Test infrastructure** — bun:test unit/integration suite + Playwright E2E tests
- **Graceful shutdown** — `serverclosing` message on SIGINT/SIGTERM so viewer can fade + close

See upstream for the original: [Caffa/Session-Character-Visualizer](https://github.com/Caffa/Session-Character-Visualizer)

---

## Agent States

| State    | Visual                             | Description                                                        |
| -------- | ---------------------------------- | ------------------------------------------------------------------ |
| Idle     | Closed eyes, slow pulse            | Finished work, waiting. Subagents removed after 10s.               |
| Thinking | Expanding ring, sparkles           | Processing/generating. Eyes track rhythmically.                    |
| Editing  | Code panel with typewriter          | Writing/editing files. Panel shows actual filenames.               |
| Reading  | Glasses, book opens/closes          | Reading files, searching. Glasses wobble.                          |
| Running  | Fast pulse, motion streaks          | Executing bash commands.                                           |
| Waiting  | Nervous shake, bouncing question    | Blocked on permission, or supervising subagents.                   |
| Error    | X_X eyes, red pulse                 | Something went wrong.                                              |

Each agent gets a unique hue derived from its session ID. Subagents use parent hue +30°.

---

## Architecture

```
blob-office.ts          Plugin — hooks into OpenCode events, serves HTML + WebSocket
blob-office.html        Viewer — p5.js canvas, WebSocket client, all rendering
blob-office-mock-server.ts  Mock server for testing
```

- Single server on port 2727 (scans up to 2736 if taken)
- Event-driven via OpenCode hooks (`tool.execute.before/after`, `event`)
- Multiple OpenCode instances sync agents through the same server
- No bundler, no framework

---

## Development

```bash
# Run all tests
bun run test

# Unit tests only
bun run test:unit

# Playwright visual tests
bun run test:visual

# Mock server for local dev
bun run mock-server
```

---

## Troubleshooting

**Viewer doesn't open**: Navigate to `http://localhost:2727` manually.

**Port conflicts**: Plugin auto-discovers ports 2727–2736. Check OpenCode logs for `[blob-office]`.

**No agents appearing**: Check OpenCode logs, run `bun install` in plugin folder, check browser console.

---

## Releasing

```bash
npm version patch   # or minor, major
git push && git push --tags
```

`npm version` bumps `package.json`, commits, and tags atomically. The tag push triggers CI which runs tests and publishes to npm with provenance. Never use `git tag` manually.

---

## License

MIT — see upstream repository for original license terms.

---

## Related

- [Caffa/Session-Character-Visualizer](https://github.com/Caffa/Session-Character-Visualizer) — the original project this fork is based on
- [Caffa/Pixel-Office](https://github.com/Caffa/Pixel-Office) — similar concept for VSCode + Claude
- [OpenCode](https://github.com/anomalyco/opencode) — the AI coding tool this plugin extends
