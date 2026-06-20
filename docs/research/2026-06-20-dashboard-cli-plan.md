# Dashboard CLI Groundwork Plan

Date: 2026-06-20

Source plan: `docs/research/2026-06-16-voice-computer-control-long-plan.md`, sections "Dashboard and Operator Plane", "Binary, CLI, and Native Host", and "Recommended Next Move".

## Scope Landed

- Add a pure CLI command surface module for planned operator commands.
- Add JSON-safe output skeletons for command consumers and future dashboard polling.
- Add a pure dashboard descriptor module for loopback bind metadata and the initial operator panel list.
- Add an optional source-tree CLI shim that imports built main-process JavaScript only.

## Command Surface

The initial surface is metadata and normalization only. It does not start a dashboard, install a Chrome Native Messaging host, run smokes, write release checks, or create alpha artifacts.

Commands represented:

- `skfiy status --json`
- `skfiy doctor`
- `skfiy dashboard [--no-open] [--port <port>] [--json]`
- `skfiy chrome status`
- `skfiy chrome install-host`
- `skfiy chrome uninstall-host`
- `skfiy smoke <ui|desktop-session|ghostty|chrome|finder|voice|money-run> --output <path>`
- `skfiy release check --json-output <path>`
- `skfiy alpha artifact`

Mutating-looking commands are explicit subcommands, but the current module marks them as plan-only with `executesSystemMutation: false`.

## Dashboard Descriptor

The dashboard descriptor always binds to `127.0.0.1`, even if a caller provides a broader requested host. It exposes:

- local HTTP URL metadata
- optional-token auth policy with `tokenPrinted: false`
- SSE update transport metadata
- append-only event store metadata
- panel list for runtime health, permissions, current turn, replay, app policy, smoke evidence, long-horizon supervision, alerts, and dogfood/release

The dashboard remains optional for Computer Use execution. Future Electron or HTTP wiring should consume this descriptor instead of inventing a second panel inventory.

## Integration Notes

- Build output will place the modules under `dist/main/` through the existing Electron TypeScript config.
- `scripts/skfiy-cli.mjs` is intentionally not registered in `package.json`; run it directly only after built artifacts exist.
- Future implementation should replace skeleton states with real app/helper/permission/dashboard/extension probes without changing the top-level JSON keys.
- Future dashboard server work should keep tokens out of logs and stdout by default.
