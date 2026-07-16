# loopat

Self-hosted AI workspace built around context management. Monorepo with two workspaces: `server/` (Hono + Bun) and `web/` (React 19 + Vite + Tailwind v4).

## Tech stack

- **Runtime**: Bun (server + build tooling)
- **Server**: Hono, TypeScript, Claude Agent SDK, Codex CLI runtime, podman (sandbox containers)
- **Web**: React 19, Vite 8, Tailwind CSS v4, Zustand, assistant-ui, xterm.js, CodeMirror, Milkdown
- **Infra**: Docker (oven/bun base), rootless podman inside container
- **Tests**: Playwright (e2e + dogfood)
- **Rust**: Two small binaries in `server/src/serve-rs` and `server/src/port-proxy-rs`, built as part of `web build`

## Agent runtimes

- Providers declare `runtime: "claude" | "codex"`; legacy provider configs default to Claude.
- Claude runs through the Agent SDK inside podman. Codex runs through the host CLI and must not initialize Claude settings, plugins, MCP servers, containers, or the Anthropic egress gateway.
- Keep Codex command construction, environment mapping, and JSONL parsing in `server/src/codex-cli.ts`. Session code owns lifecycle and UI event translation only.
- Add focused adapter tests when Codex CLI arguments or event parsing changes. Preserve the existing Claude path unless a migration is explicitly required.

## Development

```bash
bun run dev          # start server + web concurrently (localhost)
bun run dev:host     # same but bind 0.0.0.0
bun run dev:server   # server only
bun run dev:web      # web only
```

Server default port: 10001. Vite dev default port: 5173.

Push directly to `main` — no PR workflow for daily development.

## Testing

The must-run test suite is the **dogfood e2e tests** — they boot a real stack (podman sshd container + backend + Vite + real AI) and drive a browser through it.

```bash
# Full dogfood suite (requires podman + ANTHROPIC_API_KEY)
bun run dogfood

# Smoke subset (first-5-minutes scenarios)
bun run dogfood:smoke

# Individual suites
bun run dogfood:first-run
bun run dogfood:journey
bun run dogfood:sync
```

Prerequisites: `podman` installed, `ANTHROPIC_API_KEY` exported. Missing either = hard fail (never skip).

There's also a lighter `e2e/` suite that uses mocked backends:

```bash
bun run test:e2e
```

## Build

```bash
bun run build        # install deps + build web (includes Rust binaries)
bun run build:web    # web only (cargo + tsc + vite)
```

## Release

Versions follow `0.1.x`. Release flow:

```bash
npm version patch    # bumps package.json, commits, tags v0.1.x
git push origin main --tags
```

Pushing a `v*` tag triggers two GitHub Actions:
- **publish.yml** — publishes to npm
- **docker.yml** — builds multi-arch (amd64 + arm64) Docker image to `ghcr.io/simpx/loopat`

## Project structure

```
server/src/       — Hono API server (index.ts = main entry)
web/src/          — React SPA (pages/, components/, lib/)
dogfood/          — end-to-end tests against real stack (playwright)
e2e/              — lighter e2e tests (mocked backend)
behavior/         — product behavior specs
bin/              — CLI entry point (loopat.mjs)
scripts/          — install/setup scripts
docs/             — documentation
public/           — static assets
```
