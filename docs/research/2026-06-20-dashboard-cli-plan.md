# Dashboard CLI Groundwork Plan

Date: 2026-06-20

Source plan: `docs/research/2026-06-16-voice-computer-control-long-plan.md`, sections "Dashboard and Operator Plane", "Binary, CLI, and Native Host", and "Recommended Next Move".

## OpenClaw Reference Shape

OpenClaw's dashboard pattern is a local gateway Control UI opened by `openclaw dashboard`: it serves a clean local URL, keeps the Control UI as an admin surface, gates WebSocket/auth access, avoids printing tokens into logs, and focuses on gateway health, sessions, agents, task activity, logs, and operational alerts.

Control UI is an admin surface, so skfiy should treat any future remote dashboard mode as privileged and require explicit authentication, scope, and transport choices.

For skfiy, the equivalent surface is not the primary user experience. The pet and voice turn remain the entry point. The dashboard is the operator plane for Computer Use evidence: permission state, desktop-session health, app/helper/extension runtime status, active turn state, replay screenshots/actions, host/app policy, smoke artifacts, dogfood/release readiness, and long-horizon `money-run` supervision.

## Binary and CLI Product Contract

The dashboard and CLI must run from the same compiled product identity as the app:

- `skfiy.app` is the user-facing signed app bundle.
- `skfiy-helper` is embedded under `skfiy.app/Contents/MacOS`.
- `skfiy` is the packaged CLI shim shipped beside the app or installed by the release package.
- Chrome Native Messaging host manifests point to the packaged `skfiy` CLI path.
- `skfiy dashboard`, `skfiy status`, `skfiy doctor`, `skfiy chrome`, `skfiy mcp serve --stdio`, and `skfiy smoke` must work without tmux, source-tree dev servers, or loose helper binaries.
- JSON output from these commands is a product API for the dashboard and future Codex plugin adapter, so field names should evolve with compatibility tests.

## Scope Landed

- Add a pure CLI command surface module for planned operator commands.
- Add JSON-safe output skeletons for command consumers and future dashboard polling.
- Add a pure dashboard descriptor module for loopback bind metadata and the initial operator panel list.
- Add a dashboard HTTP response helper and loopback server for `/descriptor.json`, `/`, and `/index.html`.
- Add an optional source-tree CLI shim that imports built main-process JavaScript only.
- Wire `skfiy chrome status|install-host|uninstall-host` to user-level Chrome Native Messaging manifest status/install/uninstall when a Chrome extension id is provided.
- Add a formal product smoke wrapper, `npm run smoke:dashboard`, that launches the built `dist/skfiy` CLI with `dashboard --no-open --port 0 --json`, fetches `/descriptor.json` plus the dashboard shell, rejects token leakage, and terminates the dashboard process after evidence collection.

## Command Surface

The initial surface is mostly metadata and normalization. It does not run smokes, write release checks, or create alpha artifacts. Chrome Native Messaging host status/install/uninstall is the first real mutation-capable CLI slice and writes only the user-level Chrome manifest path. `skfiy dashboard` now starts the loopback dashboard server.

Commands represented:

- `skfiy status --json`
- `skfiy doctor`
- `skfiy dashboard [--no-open] [--port <port>] [--json]`
- `skfiy chrome status`
- `skfiy chrome install-host`
- `skfiy chrome uninstall-host`
- `skfiy mcp serve --stdio`
- `skfiy smoke <ui|desktop-session|ghostty|chrome|dashboard|finder|voice|money-run> --output <path>`
- `skfiy release check --json-output <path>`
- `skfiy alpha artifact`

Mutating-looking commands are explicit subcommands. `skfiy chrome install-host` and `skfiy chrome uninstall-host` now report `executesSystemMutation: true`. `skfiy smoke <target>` now also reports `executesSystemMutation: true` because it launches product smoke scripts and may open apps, inspect the desktop, or create isolated test fixtures. Release and alpha artifact commands still return plan/skeleton output.

`skfiy smoke <target> --output <path> [--require-passed]` runs the repo-local smoke script directly with the current Node runtime rather than shelling through npm. The wrapper normalizes `--output` to an absolute artifact path, forwards other smoke-specific flags, captures the smoke JSON, and returns a stable dashboard-friendly JSON summary with `result`, `exitCode`, `scriptPath`, and `scriptArgs`.

`skfiy mcp serve --stdio` is the first Codex plugin adapter command. The CLI command surface marks it as read-only and non-mutating, and `src/main/skfiy-mcp-server.ts` defines newline-delimited JSON-RPC stdio transport plus handlers for `initialize`, `tools/list`, `tools/call skfiy.status`, and `tools/call skfiy.doctor`. The remaining product gap is generating the actual Codex plugin scaffold and proving an installed plugin can launch the packaged `skfiy` binary.

## Chrome Native Messaging Host

`skfiy chrome status|install-host|uninstall-host` still owns the user-level Chrome manifest lifecycle. The packaged `dist/skfiy` shim can now also act as the Native Messaging host when Chrome launches it over stdin/stdout: it reads Chrome's length-prefixed JSON frames, validates schema version/request id/payload size, applies an injectable app-policy block before dispatch, and writes framed JSON responses. The Chrome extension background worker now waits for `port.onMessage` and returns native-host responses instead of fire-and-forget posting.

## Dashboard Descriptor

The dashboard descriptor always binds to `127.0.0.1`, even if a caller provides a broader requested host. It exposes:

- local HTTP URL metadata
- optional-token auth policy with `tokenPrinted: false`
- SSE update transport metadata
- append-only event store metadata
- panel list for runtime health, permissions, current turn, replay, app policy, smoke evidence, long-horizon supervision, alerts, and dogfood/release

The dashboard remains optional for Computer Use execution. Future Electron wiring should consume this descriptor instead of inventing a second panel inventory.

`src/main/dashboard-server.ts` now exposes a read-only response helper plus `startDashboardServer()`. It serves:

- `GET /descriptor.json`: descriptor JSON with no requested-host echo and no token output.
- `GET /snapshot.json`: read-only operator snapshot with runtime health, permissions, current turn, replay, smoke evidence, long-horizon state, and alerts. When `skfiy dashboard` starts the server, the default snapshot reads the local workspace for package metadata, `dist/skfiy.app`, `dist/skfiy`, and the latest `.skfiy-smoke/*.json` artifact per smoke target.
- `GET /` and `GET /index.html`: a minimal static HTML shell using the same panel inventory.
- unsupported methods/routes: `405` or `404`.

The CLI wraps this helper through `skfiy dashboard`. It binds only `127.0.0.1`, opens the clean local URL by default, and skips opening when `--no-open` is present.

## Product Smoke

`npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed` is the repeatable dashboard gate. It uses the same product smoke lock as other packaged smokes, proves the built CLI path instead of a source-tree shim, requires `runnerHasTmux=false`, confirms the loopback bind and descriptor match the CLI output, fetches `/snapshot.json`, checks required snapshot panels plus workspace-backed runtime/smoke evidence, checks the static shell contains descriptor and snapshot links, and keeps tokens out of stdout, descriptor JSON, snapshot JSON, and shell HTML.

## Status Probe

`skfiy status --json` now runs read-only probes instead of returning only placeholders. It reports whether `dist/skfiy.app` and its packaged helper exist, reads helper permission states, reads desktop-session controllability, checks the Chrome Native Messaging host when `--extension-id <id>` is provided, and checks a running dashboard descriptor when `--dashboard-url <url>` is provided. Missing helpers or failed probes degrade to `unknown`/`not-running` fields so dashboards can render the output without treating status collection itself as a hard failure.

## Doctor Probe

`skfiy doctor --json` now turns the same read-only probes into operator-facing diagnostics. It reports a machine-readable `result`, `diagnostics[]`, and de-duplicated `nextActions[]` for helper placement, Screen Recording, Accessibility, desktop lock/sleep/loginwindow blockers, Chrome Native Messaging host setup, dashboard availability, app signature identity, and Finder Automation proof. The command stays non-mutating; it tells the operator exactly which command or System Settings panel to open next.

## Integration Notes

- Build output will place the modules under `dist/main/` through the existing Electron TypeScript config.
- `scripts/skfiy-cli.mjs` is intentionally not registered in `package.json`; run it directly only after built artifacts exist.
- Future implementation should replace skeleton states with real app/helper/permission/dashboard/extension probes without changing the top-level JSON keys.
- Future dashboard server work should keep tokens out of logs and stdout by default.
