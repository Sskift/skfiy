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
- Add a formal product smoke wrapper, `npm run smoke:cli`, that runs the compiled `dist/skfiy` through the safe CLI command matrix with an isolated HOME and no source-tree shim.
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
- `skfiy smoke <ui|desktop-session|ghostty|chrome|dashboard|codex-plugin|finder|voice|money-run> --output <path>`
- `skfiy release check --json-output <path>`
- `skfiy alpha artifact`

Mutating-looking commands are explicit subcommands. `skfiy chrome install-host` and `skfiy chrome uninstall-host` now report `executesSystemMutation: true`. `skfiy smoke <target>` now also reports `executesSystemMutation: true` because it launches product smoke scripts and may open apps, inspect the desktop, or create isolated test fixtures. Release and alpha artifact commands still return plan/skeleton output.

`skfiy smoke <target> --output <path> [--require-passed]` runs the repo-local smoke script directly with the current Node runtime rather than shelling through npm. The wrapper normalizes `--output` to an absolute artifact path, forwards other smoke-specific flags, captures the smoke JSON, and returns a stable dashboard-friendly JSON summary with `result`, `exitCode`, `scriptPath`, and `scriptArgs`.

`npm run smoke:cli` is the binary CLI gate for command stability. Its product path is `dist/skfiy -> skfiy CLI command matrix`; it runs `status --json`, `doctor --json`, `chrome status`, `mcp serve --stdio --json`, `dashboard --no-open --port 0 --json`, `release check --json-output`, `alpha artifact`, and the CLI-wrapped `smoke dashboard --json`. Chrome status uses `.skfiy-cli-smoke/home` as an isolated HOME, requires both Native Messaging host evidence and extension-adapter readiness evidence, dashboard is terminated after JSON evidence is collected, and the nested dashboard smoke owns its own product smoke lock.

`skfiy mcp serve --stdio` is the first Codex plugin adapter command. The CLI command surface marks it as read-only and non-mutating, and `src/main/skfiy-mcp-server.ts` defines newline-delimited JSON-RPC stdio transport plus handlers for `initialize`, `tools/list`, `tools/call skfiy.status`, and `tools/call skfiy.doctor`. The repo-local Codex plugin scaffold now lives under `plugins/skfiy/`, with `.codex-plugin/plugin.json`, `.mcp.json`, `skills/control-skfiy/SKILL.md`, and SVG assets. The packaged-binary and staged marketplace install product gap is covered by `smoke:codex-plugin`; the remaining plugin distribution gap is installing the marketplace entry in a fresh Codex app session and proving the cached plugin path resolves the installed `skfiy` binary without a repo checkout.

## Codex Plugin Install and Marketplace Notes

Codex plugin packaging stays an adapter layer. A repo-local scaffold is not enough for product proof: release validation must also cover a marketplace entry, installation into Codex's plugin cache, and a fresh Codex thread loading the skill and MCP server from the installed plugin.

- The repo plugin root remains `plugins/skfiy/`, with `.codex-plugin/plugin.json` pointing to `skills/` and `.mcp.json`.
- Marketplace entries must use lowercase `skfiy`, a local `source.path` relative to the marketplace root, and explicit installation/authentication policy fields.
- Iterating on an already installed local plugin should use the Codex plugin cachebuster/reinstall flow rather than hand-editing cached plugin files.
- Installing, disabling, or uninstalling the Codex plugin must not start desktop control, erase local replay evidence, or replace the standalone `skfiy.app` runtime.
- `smoke:codex-plugin` is the local product gate: it copies `plugins/skfiy/` into `.skfiy-plugin-install/codex-plugin/marketplace/plugins/skfiy`, writes a repo-local `marketplace.json` with `source.path: ./plugins/skfiy`, reads `.mcp.json` from that staged marketplace install instead of the source checkout, substitutes the packaged `dist/skfiy` path for the installed `skfiy` command, starts `mcp serve --stdio`, sends `initialize`, `tools/list`, and `tools/call skfiy.status`, and requires JSON-RPC-only stdout plus structured status.
- The smoke evidence must include `repoCheckoutUsedForMcp=false`, `marketplaceManifest`, `marketplaceManifestPath`, and `installedPluginRoot` so dashboards can distinguish staged install proof from direct scaffold proof.
- MCP initialize response now includes short safety instructions for read-only status/doctor use, no desktop control without explicit user approval, app-policy/replay ownership inside skfiy, and the boundary between dashboard/plugin adapter and standalone app runtime.
- Codex plugin smoke now requires those initialize instructions, so a plugin-facing MCP server without the safety contract cannot be classified as `passed`.
- A later installed-plugin smoke should run from a fresh Codex app session and prove the cached plugin can find the installed `skfiy` binary without using the source checkout.

## Chrome Native Messaging Host

`skfiy chrome status|install-host|uninstall-host` still owns the user-level Chrome manifest lifecycle. `skfiy chrome status` now returns both the raw `nativeHost` manifest status and a derived `extension` adapter state so dashboard, CLI, and future Codex plugin consumers can distinguish host installation from live extension connection. The packaged `dist/skfiy` shim can now also act as the Native Messaging host when Chrome launches it over stdin/stdout: it reads Chrome's length-prefixed JSON frames, validates schema version/request id/payload size, applies an injectable app-policy block before dispatch, and writes framed JSON responses. The Chrome extension background worker now waits for `port.onMessage` and returns native-host responses instead of fire-and-forget posting.

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
- `GET /snapshot.json`: read-only operator snapshot with runtime health, permissions, current turn, replay, smoke evidence, long-horizon state, and alerts. When `skfiy dashboard` starts the server, the default snapshot reads the local workspace for package metadata, `dist/skfiy.app`, `dist/skfiy`, `dist/skfiy.app` code-signature state, the dashboard server PID/uptime, packaged-helper permission status, packaged-helper desktop-session status, user-level Chrome Native Messaging host manifest status for the packaged CLI, and the latest `.skfiy-smoke/*.json` artifact per smoke target, including artifact age/stale state for local operator warnings. The Chrome extension field now distinguishes native-host installed/missing/mismatched/invalid evidence from the still-pending live extension connection.
- `GET /` and `GET /index.html`: a minimal static HTML shell using the same panel inventory.
- unsupported methods/routes: `405` or `404`.

The CLI wraps this helper through `skfiy dashboard`. It binds only `127.0.0.1`, opens the clean local URL by default, and skips opening when `--no-open` is present.

## Product Smoke

`npm run smoke:cli -- --output .skfiy-smoke/cli.json --require-passed` is the repeatable compiled CLI matrix gate. It requires `runnerHasTmux=false`, rejects source-tree CLI shims, writes an isolated HOME under `.skfiy-cli-smoke/home`, checks every command returns JSON with `schemaVersion: 1`, rejects token leakage, proves the dashboard command can start and be terminated cleanly, and proves `skfiy smoke dashboard --json` can drive the existing dashboard product smoke through the packaged CLI.

`npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed` is the repeatable dashboard gate. It uses the same product smoke lock as other packaged smokes, proves the built CLI path instead of a source-tree shim, requires `runnerHasTmux=false`, confirms the loopback bind and descriptor match the CLI output, fetches `/snapshot.json`, checks required snapshot panels plus workspace-backed runtime/smoke evidence, requires app signing to be valid, requires dashboard PID/uptime evidence, requires helper permission and desktop-session evidence, requires Chrome Native Messaging host evidence in the snapshot even when the host is missing, checks the static shell contains descriptor and snapshot links, and keeps tokens out of stdout, descriptor JSON, snapshot JSON, and shell HTML.

`npm run smoke:codex-plugin -- --output .skfiy-smoke/codex-plugin.json --require-passed` is the repeatable Codex plugin adapter gate. It proves the plugin scaffold can be copied into a staged marketplace install whose `.mcp.json` points to the installed `skfiy` command, but executes the packaged `dist/skfiy` binary during repo-local smoke so CI and local dogfood can validate the product path before touching the user's global Codex marketplace.

## Status Probe

`skfiy status --json` now runs read-only probes instead of returning only placeholders. It reports whether `dist/skfiy.app` and its packaged helper exist, reads helper permission states, reads desktop-session controllability, checks the Chrome Native Messaging host when `--extension-id <id>` is provided, derives extension-adapter readiness from that host status, and checks a running dashboard descriptor when `--dashboard-url <url>` is provided. Missing helpers or failed probes degrade to `unknown`/`not-running` fields so dashboards can render the output without treating status collection itself as a hard failure.

## Doctor Probe

`skfiy doctor --json` now turns the same read-only probes into operator-facing diagnostics. It reports a machine-readable `result`, `diagnostics[]`, and de-duplicated `nextActions[]` for helper placement, Screen Recording, Accessibility, desktop lock/sleep/loginwindow blockers, Chrome Native Messaging host setup, dashboard availability, app signature identity, and Finder Automation proof. The command stays non-mutating; it tells the operator exactly which command or System Settings panel to open next.

## Integration Notes

- Build output will place the modules under `dist/main/` through the existing Electron TypeScript config.
- `scripts/skfiy-cli.mjs` is intentionally not registered in `package.json`; run it directly only after built artifacts exist.
- `bin/skfiy.mjs` is the packaged CLI entry copied to `dist/skfiy`; `scripts/skfiy-cli.mjs` remains a source-tree debug shim only.
- Future implementation should replace remaining skeleton states with live app/helper/permission/dashboard/extension-session probes without changing the top-level JSON keys.
- Future dashboard server work should keep tokens out of logs and stdout by default.
