# Dashboard CLI Groundwork Plan

Date: 2026-06-20

Source plan: `docs/research/2026-06-16-voice-computer-control-long-plan.md`, sections "Dashboard and Operator Plane", "Binary, CLI, and Native Host", and "Recommended Next Move".

Research inputs checked before this plan update:

- OpenAI Codex plugin build docs, fetched 2026-06-20 from `https://developers.openai.com/codex/plugins/build`.
- OpenAI Codex Chrome extension docs, fetched 2026-06-20 from `https://developers.openai.com/codex/app/chrome-extension`.
- OpenAI Codex CLI plugin command reference, fetched 2026-06-20 from `https://developers.openai.com/codex/cli/reference`.
- OpenAI Codex app deep-link docs, fetched 2026-06-20 from `https://developers.openai.com/codex/app/commands`.
- OpenClaw docs, fetched 2026-06-20 from `https://docs.openclaw.ai/web/dashboard` and `https://docs.openclaw.ai/web/control-ui`.
- Manual recheck on 2026-06-20 through `fetch-codex-manual.mjs`: the local Codex manual was current, and the checked sections were `Build plugins`, `Plugins`, and `Codex Chrome extension`.
- Local Codex plugin cache inspection under `~/.codex/plugins/cache/`.
- Local `codex plugin --help`, `codex plugin add --help`, and `codex plugin marketplace --help` command output from the installed Codex CLI.
- Repo-local skfiy scaffold under `plugins/skfiy/`.

## Local Codex Plugin Implementation Findings

Codex plugins are installable bundles rather than runtime processes. Local cache inspection on 2026-06-20 matched the public OpenAI Codex plugin build docs:

- Installed plugins live under `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`.
- `.codex-plugin/plugin.json` is the entry point and points Codex at optional `skills/`, `.app.json`, `.mcp.json`, hooks, assets, and UI metadata.
- The bundled Chrome plugin cache entry contains `.codex-plugin/plugin.json`, `skills/`, docs, scripts, and assets. Chrome plugin cache entry has no `.app.json` and no `.mcp.json`; the Chrome browser extension/native-host pairing is a separate product integration surfaced by that plugin.
- The GitHub plugin cache entry has `.app.json` connector wiring beside `.codex-plugin/plugin.json`, proving connector-backed plugins do not need to own the target product runtime.
- The skfiy plugin scaffold should therefore stay thin: `plugins/skfiy/.codex-plugin/plugin.json` exposes the skill metadata, and `plugins/skfiy/.mcp.json` points at the installed `skfiy mcp serve --stdio` binary command.
- Codex plugin commands verified locally: `codex plugin add`, `codex plugin list`, `codex plugin remove`, and `codex plugin marketplace`. This matches the plan to test marketplace installation through Codex's own plugin manager instead of editing cached plugin files by hand.
- The marketplace command surface specifically exposes `codex plugin marketplace add/list/upgrade/remove`, and `codex plugin add` accepts either `plugin@marketplace` or `--marketplace <name>`. That is the correct automation surface for installed-plugin smoke setup.

The product rule is: the Codex plugin can inspect, diagnose, and request skfiy-controlled actions, but it must not become a second desktop-control runtime. Permission checks, app policy, replay records, Chrome Native Messaging, and stop/approval behavior stay inside the packaged `skfiy.app` plus `dist/skfiy` binary.

## OpenClaw Reference Shape

OpenClaw's dashboard pattern is a local gateway Control UI opened by `openclaw dashboard`: it serves a clean local URL, keeps the Control UI as an admin surface, gates WebSocket/auth access, avoids printing tokens into logs, and focuses on gateway health, sessions, agents, task activity, logs, and operational alerts. The OpenClaw docs explicitly recommend localhost/Tailscale/SSH-tunnel access, store bootstrap tokens in browser session storage rather than logs, and treat the Control UI as an admin surface.

Control UI reference capabilities that should inform skfiy's operator plane include sessions, cron, exec approvals, config, MCP server status, logs, updates, and live tool activity. The important product lesson is not to copy OpenClaw's chat-first UI; it is to make operational state inspectable, scoped, and recoverable while preserving the voice pet as the primary entry point.

Control UI is an admin surface, so skfiy should treat any future remote dashboard mode as privileged and require explicit authentication, scope, and transport choices.

For skfiy, the equivalent surface is not the primary user experience. The pet and voice turn remain the entry point. The dashboard is the operator plane for Computer Use evidence: permission state, desktop-session health, app/helper/extension runtime status, active turn state, replay screenshots/actions, host/app policy, smoke artifacts, dogfood/release readiness, and long-horizon `money-run` supervision.

## Binary and CLI Product Contract

The dashboard and CLI must run from the same compiled product identity as the app:

- `skfiy.app` is the user-facing signed app bundle.
- `skfiy-helper` is embedded under `skfiy.app/Contents/MacOS`.
- `skfiy` is the packaged CLI shim shipped beside the app or installed by the release package.
- Chrome Native Messaging host manifests point to the packaged `skfiy` CLI path.
- `skfiy commands --json`, `skfiy dashboard`, `skfiy status`, `skfiy doctor`, `skfiy chrome`, `skfiy mcp serve --stdio`, and `skfiy smoke` must work without tmux, source-tree dev servers, or loose helper binaries.
- JSON output from these commands is a product API for the dashboard and future Codex plugin adapter, so field names should evolve with compatibility tests.

## Binary and CLI Execution Plan

The binary plan is deliberately stricter than a developer convenience plan:

1. Make `dist/skfiy` the one CLI product entry for status, doctor, dashboard, Chrome Native Messaging, MCP, and smoke wrappers.
2. Keep `skfiy.app`, embedded `skfiy-helper`, and `dist/skfiy` on the same commit identity in release manifests and smoke evidence.
3. Treat `scripts/skfiy-cli.mjs` and npm scripts as development-only helpers; dogfood and release evidence must point at the packaged CLI or app bundle.
4. Add compatibility tests for every `--json` output consumed by dashboard, smoke, and plugin MCP tools before changing fields.
5. Keep mutating command names explicit: `chrome install-host`, `chrome uninstall-host`, `smoke <target>`, release signing, and alpha publishing must never hide behind a read-only status command.

`skfiy dashboard --json` is the launcher contract for agents and scripts. It should return the loopback URL, bind metadata, auth policy, server PID, and token-free descriptor evidence without requiring a browser to open.

## Scope Landed

- Add a pure CLI command surface module for planned operator commands.
- Add JSON-safe output skeletons for command consumers and future dashboard polling.
- Add a pure dashboard descriptor module for loopback bind metadata and the initial operator panel list.
- Add a dashboard HTTP response helper and loopback server for `/descriptor.json`, `/`, and `/index.html`.
- Add an optional source-tree CLI shim that imports built main-process JavaScript only.
- Wire `skfiy chrome status|install-host|uninstall-host` to user-level Chrome Native Messaging manifest status/install/uninstall when a Chrome extension id is provided.
- Add a formal product smoke wrapper, `npm run smoke:cli`, that runs the compiled `dist/skfiy` through the safe CLI command matrix with an isolated HOME and no source-tree shim.
- Add a lightweight binary CLI profile, `npm run smoke:cli:basic`, that runs the same compiled `dist/skfiy` through status, doctor, Chrome status, MCP stdio JSON, and dashboard launcher checks without release/alpha/nested dashboard smoke coupling.
- Add a formal product smoke wrapper, `npm run smoke:dashboard`, that launches the built `dist/skfiy` CLI with `dashboard --no-open --port 0 --json`, fetches `/descriptor.json` plus the dashboard shell, rejects token leakage, and terminates the dashboard process after evidence collection.
- Add `skfiy permissions open <screen-recording|accessibility|microphone|speech-recognition|automation-finder>` as a token-free, allowlisted macOS System Settings opener with stable JSON action-plan output.
- Add `GET /events` as the first SSE live-refresh endpoint; the dashboard shell uses `EventSource("/events")` with `/snapshot.json` fallback, and `smoke:dashboard` requires a token-free first `snapshot` event before classifying the packaged dashboard path as passed.
- Add a user-level Chrome host-policy state file at `~/Library/Application Support/skfiy/chrome-host-policy.json`, normalize it fail-closed to ask-by-default, expose it through `skfiy chrome status`, dashboard snapshots, and the Chrome Native Messaging `skfiy.host_policy.request` response path, and let the MV3 background worker persist returned host-policy responses into extension storage.
- Add dashboard local API coverage for the same Chrome host-policy state: `GET /api/chrome-host-policy` shows the normalized state, and `POST /api/chrome-host-policy` can set one host or reset the file. The dashboard smoke now launches the compiled `dist/skfiy dashboard` with an isolated HOME and proves show -> set -> show -> reset through that endpoint without touching the operator's real policy file.
- Add dashboard runtime snapshot fixture coverage: `smoke:dashboard` seeds `~/Library/Application Support/skfiy/runtime-snapshot.json` inside its isolated HOME, then requires `/snapshot.json` to surface seeded `currentTurn` and `replay` fields from that file before evidence can pass.
- Add richer runtime snapshot summaries for dashboard evidence: Electron-derived snapshots now bound and redact current-turn approval/stop state, latest action, latest verification, latest screenshot, replay screenshots/actions/verifications, and timeline tail so operators can inspect active Computer Use state without opening full raw transcripts.
- Add CLI readiness summaries: `skfiy status --json`, `skfiy doctor --json`, and the plugin-facing status provider now expose a top-level `readiness` object across runtime, dashboard, extension, and `money-run`, plus a read-only `moneyRun` tmux probe with `mutatesSession: false`.
- Complete the `skfiy dashboard --json` launcher contract by returning `serverPid`, `auth`, `updates`, `eventStore`, and a matching token-free descriptor generated from the actual bound loopback port.
- Normalize the CLI smoke wrapper for long-horizon supervision: `skfiy smoke money-run --output <path>` now forwards `--json-output <path>` to the money-run smoke script while other targets keep `--output`.
- Add MV3 extension diagnostics: extension status responses and popup UI now expose version, core capabilities, Native Messaging policy-sync state, host-policy entry counts, and the latest native-host error for dashboard/smoke diagnosis.
- Promote MV3 `pageControl` readiness into the operator plane: `status`, `doctor`, `chrome status`, dashboard snapshots, dashboard smoke evidence, and plugin-facing MCP status now expose whether Chrome page control is ready, policy/permission blocked, content-script blocked, or not yet probed.
- Add MV3 host permission preflight after skfiy host policy allows a host: if Chrome optional host permission is missing, the extension returns `chrome_host_permission_missing` with the required origin instead of injecting scripts or silently requesting permission from a background flow.
- Add precise dashboard alert codes for `desktop-session-loginwindow`, `desktop-display-asleep`, missing Microphone/Speech Recognition grants, stale Chrome extension heartbeats, Native Messaging host issues, stale smoke evidence, and release drift while retaining older broad alert codes for compatibility.
- Group dashboard alert codes in the HTML shell into Desktop session, Permissions, Chrome bridge, Smoke evidence, Release drift, Runtime snapshot, and Other bands, sorted by severity so operator blockers are visible before opening JSON.

## Command Surface

The initial surface is mostly metadata and normalization. It does not run smokes, write release checks, or create alpha artifacts. Chrome Native Messaging host status/install/uninstall is the first real mutation-capable CLI slice and writes only the user-level Chrome manifest path. `skfiy dashboard` now starts the loopback dashboard server.

Commands represented:

- `skfiy status --json`
- `skfiy commands --json`
- `skfiy help --json`
- `skfiy doctor`
- `skfiy dashboard [--no-open] [--port <port>] [--json]`
- `skfiy permissions open <screen-recording|accessibility|microphone|speech-recognition|automation-finder>`
- `skfiy chrome status`
- `skfiy chrome policy show`
- `skfiy chrome policy set --host <host> --action <always-allow|allow-current-turn|block|ask>`
- `skfiy chrome policy reset`
- `skfiy chrome install-host`
- `skfiy chrome uninstall-host`
- `skfiy mcp serve --stdio`
- `skfiy smoke <ui|desktop-session|ghostty|chrome|dashboard|codex-plugin|finder|voice|money-run> --output <path>`
- `skfiy release check --json-output <path>`
- `skfiy alpha artifact`

Mutating-looking commands are explicit subcommands. `skfiy permissions open <target>` now reports `executesSystemMutation: true`, opens only fixed `x-apple.systempreferences:` Privacy & Security URLs, and returns the same concrete System Settings/action-plan JSON whether the opener succeeds or fails. `skfiy chrome install-host` and `skfiy chrome uninstall-host` now report `executesSystemMutation: true`. `skfiy chrome policy set` and `skfiy chrome policy reset` are the user-level Chrome host policy mutations; `skfiy chrome policy show` is read-only. `skfiy smoke <target>` now also reports `executesSystemMutation: true` because it launches product smoke scripts and may open apps, inspect the desktop, or create isolated test fixtures. Release and alpha artifact commands still return plan/skeleton output.

`skfiy smoke <target> --output <path> [--require-passed]` runs the repo-local smoke script directly with the current Node runtime rather than shelling through npm. The wrapper normalizes `--output` to an absolute artifact path, forwards other smoke-specific flags, captures the smoke JSON, and returns a stable dashboard-friendly JSON summary with `result`, `exitCode`, `scriptPath`, and `scriptArgs`. `money-run` is the one script-level exception: the CLI accepts the same user-facing `--output` flag but forwards it as `--json-output` to `scripts/smoke-money-run-supervision.mjs`.

`npm run smoke:cli` is the binary CLI gate for command stability. Its product path is `dist/skfiy -> skfiy CLI command matrix`; it runs `commands --json`, `status --json`, `doctor --json`, `chrome status`, `mcp serve --stdio --json`, `dashboard --no-open --port 0 --json`, `release check --json-output`, `alpha artifact`, and the CLI-wrapped `smoke dashboard --json`. Chrome status uses `.skfiy-cli-smoke/home` as an isolated HOME, requires both Native Messaging host evidence and extension-adapter readiness evidence, dashboard is terminated after JSON evidence is collected, and the nested dashboard smoke owns its own product smoke lock. `npm run smoke:cli:basic` uses `--profile basic` to run only the commands/status/doctor/Chrome/MCP/dashboard-launcher subset, giving operators a quick compiled-binary health gate that does not depend on release, alpha, or nested dashboard smoke evidence.

`skfiy mcp serve --stdio` is the first Codex plugin adapter command. The CLI command surface marks it as read-only and non-mutating, and `src/main/skfiy-mcp-server.ts` defines newline-delimited JSON-RPC stdio transport plus handlers for `initialize`, `tools/list`, `tools/call skfiy.status`, and `tools/call skfiy.doctor`. The repo-local Codex plugin scaffold now lives under `plugins/skfiy/`, with `.codex-plugin/plugin.json`, `.mcp.json`, `skills/control-skfiy/SKILL.md`, and SVG assets. The packaged-binary and staged marketplace install product gap is covered by `smoke:codex-plugin`: it reads the staged installed `.mcp.json`, uses `command: "skfiy"` instead of a hard-coded absolute binary command, resolves that command through a temporary `PATH` entry pointing at `dist/`, and records `resolvedCommandPath`, `configuredCommandUsed: true`, and `repoCheckoutUsedForMcp=false`. The packaged smoke now also runs `codex plugin marketplace add`, `codex plugin list --available --json`, and `codex plugin add skfiy@skfiy-local` inside an isolated `CODEX_HOME`, then reads `.mcp.json` from the real Codex cache path `plugins/cache/skfiy-local/skfiy/<version>/` and proves that cached copy can start packaged `dist/skfiy` MCP without using the source checkout. The remaining plugin distribution gap is proving a fresh Codex app thread loads that cached plugin and exposes its skill/tools in the app UI.

## Codex Plugin Install and Marketplace Notes

Codex plugin packaging stays an adapter layer. A repo-local scaffold is not enough for product proof: release validation must also cover a marketplace entry, installation into Codex's plugin cache, and a fresh Codex thread loading the skill and MCP server from the installed plugin.

- OpenAI Codex plugin build docs define `.codex-plugin/plugin.json` as the required entry point and allow `skills/`, `hooks/`, `.app.json`, `.mcp.json`, and `assets/` at the plugin root.
- Codex marketplace install docs state installed plugins are loaded from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, and local marketplace installs use `local` as the version. skfiy must therefore prove the installed cached copy can find the packaged binary without relying on the repo checkout.
- Codex CLI plugin commands expose `codex plugin add/list/remove/marketplace`, which gives us a future automation surface for installed-plugin smoke setup once we are ready to mutate the user's Codex marketplace.
- Codex app deep links can open plugin install/detail flows, including local marketplace detail links. They are useful for onboarding but are not a replacement for product smoke evidence.
- The repo plugin root remains `plugins/skfiy/`, with `.codex-plugin/plugin.json` pointing to `skills/` and `.mcp.json`.
- Marketplace entries must use lowercase `skfiy`, a local `source.path` relative to the marketplace root, and explicit installation/authentication policy fields.
- Iterating on an already installed local plugin should use the Codex plugin cachebuster/reinstall flow rather than hand-editing cached plugin files.
- Installing, disabling, or uninstalling the Codex plugin must not start desktop control, erase local replay evidence, or replace the standalone `skfiy.app` runtime.
- `smoke:codex-plugin` is the local product gate: it copies `plugins/skfiy/` into `.skfiy-plugin-install/codex-plugin/marketplace/plugins/skfiy`, writes both the staged compatibility `marketplace.json` and the Codex-ingestible `.agents/plugins/marketplace.json` with `source.path: ./plugins/skfiy`, reads `.mcp.json` from that staged marketplace install instead of the source checkout, executes the configured `command: "skfiy"` through a temporary `PATH` that resolves to the packaged `dist/skfiy`, starts `mcp serve --stdio`, sends `initialize`, `tools/list`, and `tools/call skfiy.status`, and requires JSON-RPC-only stdout plus structured status. It then repeats the proof through an isolated real Codex cache install: `codex plugin marketplace add <staged-marketplace-root>`, `codex plugin list --available --json`, `codex plugin add skfiy@skfiy-local`, cached `.mcp.json`, packaged `dist/skfiy` MCP, and cleanup of the temporary `CODEX_HOME`. With `--extension-id <id>`, the smoke passes `{ extensionIds: [...] }` through the MCP status call and additionally requires the packaged CLI status result to expose Chrome Native Messaging `nativeHost` state, derived `extension` adapter state, and structured `extension.pageControl` readiness for that browser bridge.
- The smoke evidence must include `repoCheckoutUsedForMcp=false`, `marketplaceManifest`, `marketplaceManifestPath`, `installedPluginRoot`, `configuredCommandUsed=true`, `command: ["skfiy", "mcp", "serve", "--stdio"]`, and `resolvedCommandPath` equal to the packaged `dist/skfiy` so dashboards can distinguish staged install proof from direct scaffold or absolute-path proof.
- MCP initialize response now includes short safety instructions for read-only status/doctor use, no desktop control without explicit user approval, app-policy/replay ownership inside skfiy, and the boundary between dashboard/plugin adapter and standalone app runtime.
- Codex plugin smoke now requires those initialize instructions, so a plugin-facing MCP server without the safety contract cannot be classified as `passed`.
- The installed-plugin cache proof now runs locally with an isolated `CODEX_HOME`; a later plugin cache install smoke from a fresh Codex thread should prove the Codex app UI loads the cached skill/MCP adapter from that install without using the source checkout.

## Chrome Native Messaging Host

`skfiy chrome status|install-host|uninstall-host` still owns the user-level Chrome manifest lifecycle. `skfiy chrome status` now returns both the raw `nativeHost` manifest status and a derived `extension` adapter state so dashboard, CLI, and future Codex plugin consumers can distinguish host installation from live extension connection. The packaged `dist/skfiy` shim can now also act as the Native Messaging host when Chrome launches it over stdin/stdout: it reads Chrome's length-prefixed JSON frames, validates schema version/request id/payload size, applies an injectable app-policy block before dispatch, and writes framed JSON responses. The Chrome extension background worker now waits for `port.onMessage` and returns native-host responses instead of fire-and-forget posting.

When the packaged native host receives a valid Chrome extension frame, it now records a local heartbeat at `~/Library/Application Support/skfiy/chrome-extension-connection.json`. CLI and dashboard probes classify extension status as liveConnection: `connected`, `stale`, or `unknown` from that heartbeat and expose the latest message type, request id, launch origin, observed time, and age. This is not yet a full end-to-end installed-Chrome smoke, but it removes the previous gap where a manifest could be installed while the dashboard had no local evidence of a live extension session.

Chrome product smoke now also treats that packaged host bridge as first-class evidence. A passing `smoke:chrome` artifact must include `nativeHostBridgeRun.result: passed`, `nativeHostBridgeRun.productPath: dist/skfiy -> Chrome Native Messaging heartbeat`, the `accepted` native-host response, and a fresh `chrome-extension-connection.json` heartbeat before the CDP/browser-control path can be classified as passed.

`smoke:chrome` also records `installedExtensionRun` as a separate browser-extension proof. The current machine runs branded `Google Chrome` 146, where Chrome's 2025 extension changes remove automated `--load-extension` support from Chrome 137+ branded builds. The smoke now detects this precisely: it enumerates extension service workers, reads each worker manifest, rejects built-in workers such as "Google Network Speech", and records `blockedReason: branded_chrome_load_extension_removed` with `recommendedBrowser: Chrome for Testing or Chromium` instead of treating the built-in extension id as skfiy. It now auto-prefers Google Chrome for Testing or Chromium for this installed-extension proof when either app is present, and exposes `--extension-chrome-app <name>` for an explicit browser override. The Chrome smoke artifact also includes top-level `pageControl` readiness: real extension reports are normalized when available, and branded-Chrome extension-loading blockers become explicit `state: "unavailable"` page-control evidence instead of a missing field. The dashboard should surface branded Chrome as a live-extension environment blocker while still accepting the packaged Native Messaging host bridge and CDP/browser-control evidence.

The Chrome host policy now has a local product state boundary. `src/main/chrome-host-policy.ts` owns the normalized policy shape and the `chrome-host-policy.json` path, `dist/skfiy` Native Messaging can answer `skfiy.host_policy.request` with that state, `skfiy chrome status` and dashboard snapshots include the policy state under `extension.hostPolicy`, and `skfiy chrome policy show|set|reset` lets the binary CLI inspect and mutate that same state file. `set` normalizes host inputs, supports `always-allow`, `allow-current-turn`, `block`, and `ask`, and `reset` removes the state file so the policy returns to default ask mode. The dashboard now exposes the same local state through `/api/chrome-host-policy`: GET is read-only, POST records an explicit dashboard-sourced set/reset mutation, and product smoke proves the path with an isolated HOME. The MV3 background worker persists native-host policy responses into `chrome.storage.local` before routing page observe/action/screenshot requests. The pet approval path now records approved HTTP(S) Chrome tasks as `allow_current_turn` host-policy entries before execution, preserves existing `always_allow` entries, and fails closed when the host is explicitly blocked, the policy file is invalid, or the policy file cannot be written. The next product gap is proving a real installed extension can sync and enforce that state against a live tab.

The extension diagnostic path now returns `diagnostics.extension`, `diagnostics.capabilities`, `diagnostics.nativeHost`, and `diagnostics.hostPolicy` from the background worker and popup. Chrome smoke requires those fields for installed-extension proof and records Native Messaging bridge diagnostics for the packaged-host path. After skfiy host policy allows an HTTP(S) host, the background worker also checks Chrome's optional host permission with `chrome.permissions.contains` before injecting the content script; missing permission returns a typed `chrome_host_permission_missing` blocker with the required origin, and the background/native-message path does not silently call `chrome.permissions.request`. The remaining blocker is still environmental on branded Chrome-only machines: a passing installed-extension proof needs Chrome for Testing, Chromium, or a real installed extension id that can run the MV3 background worker.

## Dashboard Roadmap

The dashboard should progress as an OpenClaw-style operator surface while staying subordinate to the pet and voice bot:

1. **Runtime and permission readiness:** app/helper/CLI presence, signing identity, desktop session, Screen Recording, Accessibility, Microphone, Speech Recognition, Finder Automation, Chrome native-host manifest, and Chrome extension heartbeat.
2. **Current turn and replay:** transcript state, target app, approval queue, risk level, stop state, screenshots, OCR/accessibility observations, planned actions, execution results, and verification decisions.
3. **Extension and browser health:** Native Messaging manifest state, `chrome-extension-connection.json` age, live/stale/unknown connection state, current tab observation source, host policy, and fallback path.
4. **Smoke and release evidence:** latest UI/Ghostty/Chrome/Finder/voice/dashboard/Codex-plugin/money-run artifacts, product paths, blockers, stale evidence warnings, alpha manifest/zip SHA256 identity, and dogfood cohort coverage.
5. **Long-horizon supervision:** read-only `money-run` tmux session status, active pane, recent blocker markers, last recommendation, and whether skfiy has field-proven sustained supervision after release gates pass.

Remote dashboard access is out of scope until a token/session story exists. Local `127.0.0.1` remains the default, token values must not print to stdout, and any future remote or Tailscale/SSH-tunnel mode must be explicit.

## Two-Week Dashboard Execution Plan

Week A should make the dashboard useful for local operation without turning it into a second app runtime:

1. Finish the runtime snapshot event store: Electron writes active turn, replay, approval, stop, screenshot, action, and verification summaries into `~/Library/Application Support/skfiy/runtime-snapshot.json`; `/snapshot.json` reads it as the current-turn and replay source. The bounded approval/stop/action/verification/screenshot/timeline summaries are now represented in the snapshot contract; the next gap is streaming this file from every live Electron turn, not only replay-derived writes and seeded smoke fixtures.
2. Add live-refresh transport with SSE first, WebSocket later only if bidirectional approval traffic needs it.
3. Render the dashboard panels from real snapshot fields, not placeholders: runtime health, permissions, current turn, replay, app policy, extension/browser health, smoke evidence, dogfood/release, long-horizon, and alerts.
4. Keep the desktop pet as the voice/control entry: dashboard actions can inspect, open settings, copy commands, or request approval, but stop/approval visibility must also stay in the pet.

Week B should make it product-grade enough for dogfood:

1. Make `smoke:dashboard` require runtime snapshot coverage for active-turn and replay panels when a recent app turn exists, while still passing cleanly on a fresh install with explicit empty-state reasons. The packaged gate now requires seeded current-turn command/target plus bounded approval/stop state, latest action, latest verification, latest screenshot, replay screenshots/actions/verifications, and timeline tail; it also launches a second isolated fresh HOME with no `runtime-snapshot.json` and requires `/snapshot.json` plus SSE to expose `freshInstall: true`, `emptyReasonCode: "runtime-snapshot-missing"`, `currentTurn.state: "idle"`, and `replay.state: "empty"` before classifying dashboard evidence as passed. The remaining refinement is detecting whether a real installed runtime had a recent app turn and escalating stale or missing turn streams differently from a clean first run.
2. Add dashboard stale-evidence and blocker banners for sleep/loginwindow, missing TCC grants, stale Chrome extension heartbeat, stale smoke evidence, and release drift. The machine-readable alert codes are present, and the HTML dashboard shell now groups them into higher-signal operator bands by failing domain and severity.
3. Add a local-only auth/session design note before any remote or Tailscale mode; OpenClaw's Control UI pattern is the reference, but skfiy must not print token values or imply public exposure is safe.
4. Add a post-release long-horizon supervision view for `money-run` that shows read-only probe state before the field task and replay-backed action evidence after skfiy performs the task.

## Dashboard Descriptor

The dashboard descriptor always binds to `127.0.0.1`, even if a caller provides a broader requested host. It exposes:

- local HTTP URL metadata
- optional-token auth policy with `tokenPrinted: false`
- SSE update transport metadata
- append-only event store metadata
- panel list for runtime health, permissions, current turn, replay, app policy, smoke evidence, long-horizon supervision, alerts, and dogfood/release

The dashboard remains optional for Computer Use execution. Future Electron wiring should consume this descriptor instead of inventing a second panel inventory.

`src/main/dashboard-server.ts` now exposes a response helper plus `startDashboardServer()`. It serves:

- `GET /descriptor.json`: descriptor JSON with no requested-host echo and no token output.
- `GET /snapshot.json`: read-only operator snapshot with runtime health, permissions, current turn, replay, smoke evidence, dogfoodRelease, long-horizon state, and alerts. When `skfiy dashboard` starts the server, the default snapshot reads the local workspace for package metadata, current git HEAD, `dist/skfiy.app`, `dist/skfiy`, `dist/skfiy.app` code-signature state, the dashboard server PID/uptime, packaged-helper permission status, packaged-helper desktop-session status, user-level Chrome Native Messaging host manifest status for the packaged CLI, the latest Chrome extension heartbeat file, `docs/release-evidence/latest-alpha.json`, `.skfiy-dogfood/internal-alpha-cohort.json`, read-only `tmux-read-only-probe` evidence for `money-run`, and the latest `.skfiy-smoke/*.json` artifact per smoke target, including artifact age/stale state for local operator warnings. Runtime snapshot current-turn and replay fields now include bounded approval/stop state, latest action, latest verification, latest screenshot, replay screenshots/actions/verifications, and timeline tail. A missing runtime snapshot is classified as an explicit fresh-install empty state, not as corrupted runtime evidence: `runtimeHealth.runtimeSnapshot`, `currentTurn`, and `replay` carry `freshInstall: true`, `emptyReasonCode: "runtime-snapshot-missing"`, and the stable missing-snapshot reason. Chrome smoke summaries now retain `nativeHostBridge.result`, `dist/skfiy -> Chrome Native Messaging heartbeat`, native-host response result, and heartbeat details so the dashboard evidence panel can show packaged extension-bridge proof without opening the raw JSON artifact. The Chrome extension field now distinguishes native-host installed/missing/mismatched/invalid evidence from live connected/stale/unknown extension connection evidence. The dogfood/release panel now surfaces latest alpha, manifest checksum, accepted reports, cohort coverage, `currentHead`, and `releaseDrift` without mutating GitHub or local cohort files. The long-horizon field now exposes `state`, `summary`, `activePane`, `signals`, `recommendation`, `mutatesSession: false`, and the exact read-only tmux probe commands used to gather the snapshot.
- `GET /api/chrome-host-policy`: read-only normalized Chrome host-policy state for the same file reported in snapshots.
- `POST /api/chrome-host-policy`: local-only dashboard mutation endpoint for `always-allow`, `allow-current-turn`, `block`, `ask`, and `reset`. Responses include `source: "dashboard"`, `plannedMutation`, `executesSystemMutation`, the normalized host, and the resulting `hostPolicy`.
- `GET /` and `GET /index.html`: a snapshot-backed operator HTML shell using the same panel inventory. It fetches `/snapshot.json` with `cache: "no-store"` and fills runtime, permission, current-turn, replay, app-policy, smoke, long-horizon, alert, and dogfood/release panels without printing tokens. The current-turn and replay panels render approval state, stop state, latest action, latest verification, latest screenshot, and timeline tail from the bounded runtime snapshot; they also show live snapshot freshness, source, age, stale/empty state, and formatted action/verification/screenshot summaries so operators do not have to inspect raw JSON to tell whether the runtime stream is fresh, stale, or a clean fresh-install empty state. The app-policy panel now shows Chrome host-policy source, update time, normalized entries, and local-only controls to refresh, set the current host to always/current-turn/block/ask, or reset the policy through `/api/chrome-host-policy`. The alert panel groups blocker codes into Desktop session, Permissions, Chrome bridge, Smoke evidence, Release drift, Runtime snapshot, and Other bands so operators can triage by failing domain.
- unsupported methods/routes: `405` or `404`.

The CLI wraps this helper through `skfiy dashboard`. It binds only `127.0.0.1`, opens the clean local URL by default, and skips opening when `--no-open` is present.

## Product Smoke

`npm run smoke:cli -- --output .skfiy-smoke/cli.json --require-passed` is the repeatable compiled CLI matrix gate. It requires `runnerHasTmux=false`, rejects source-tree CLI shims, writes an isolated HOME under `.skfiy-cli-smoke/home`, checks every command returns JSON with `schemaVersion: 1`, rejects token leakage, requires `commands --json` to expose the packaged command surface, requires `status --json` readiness plus read-only `moneyRun` evidence, proves the dashboard command can start and be terminated cleanly, accepts Chrome extension adapter evidence with liveConnection: `connected`, `stale`, or `unknown`, and proves `skfiy smoke dashboard --json` can drive the existing dashboard product smoke through the packaged CLI. `npm run smoke:cli:basic -- --output .skfiy-smoke/cli-basic.json --require-passed` is the fast compiled-binary subset for routine checks; it keeps the same product path, isolated HOME, token-leak checks, command-surface discovery, Chrome bridge evidence, MCP stdio JSON, and dashboard cleanup proof while skipping release/alpha/nested dashboard smoke commands.

`npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed` is the repeatable dashboard gate. It uses the same product smoke lock as other packaged smokes, proves the built CLI path instead of a source-tree shim, requires `runnerHasTmux=false`, launches the compiled dashboard with an isolated HOME for dashboard-owned policy mutations and runtime snapshot fixture evidence, requires `skfiy dashboard --json` to return `serverPid`, auth/update/event-store metadata, and a matching token-free descriptor for the actual loopback bind, confirms the loopback bind and descriptor match the CLI output, fetches `/snapshot.json`, checks required snapshot panels plus workspace-backed runtime/smoke/dogfoodRelease evidence, requires seeded `currentTurn` and `replay` runtime snapshot fields to be visible, requires bounded approval/stop/action/verification/screenshot/timeline summaries to reach the HTML current-turn and replay panels, then launches a second dashboard in an isolated fresh HOME and requires a missing runtime snapshot to classify as explicit fresh install idle/empty evidence instead of as a failed recent-turn stream. It also requires app signing to be valid, dashboard PID/uptime evidence, helper permission and desktop-session evidence, Chrome Native Messaging host evidence in the snapshot even when the host is missing, the latest Chrome smoke summary to expose packaged Native Messaging bridge evidence from `nativeHostBridgeRun`, the latest Chrome smoke summary to expose `installedExtensionRun` result/blocker/recommended-browser evidence, dogfoodRelease to expose latest alpha, manifest checksum, accepted reports, cohort coverage, current git HEAD, and `releaseDrift`, long-horizon `money-run` evidence from `tmux-read-only-probe` with `mutatesSession: false`, summary fields, recommendation, and probe commands, `/api/chrome-host-policy` through show -> set -> show -> reset, fresh or stale `chrome-extension-connection.json` heartbeat evidence when present, descriptor/snapshot/policy endpoint references plus alert-group rendering hooks in the static shell, and no token leakage in stdout, descriptor JSON, snapshot JSON, policy API JSON, fresh-install evidence, or shell HTML.

The dashboard snapshot now exposes the latest Chrome `installedExtensionRun` known-blocker summary alongside `nativeHostBridgeRun`, so the operator can see whether browser control is using extension structured control, CDP, or a screenshot fallback and whether the extension blocker is environmental (`Google Chrome` 137+ branded build) or implementation-specific.
The dashboard smoke requires the latest Chrome smoke summary to expose packaged Native Messaging bridge evidence from `nativeHostBridgeRun`.

`npm run smoke:codex-plugin -- --output .skfiy-smoke/codex-plugin.json --require-passed` is the repeatable Codex plugin adapter gate. It proves the plugin scaffold can be copied into a staged marketplace install whose `.mcp.json` points to the installed `skfiy` command, executes that configured command through a temporary `PATH` that resolves to the packaged `dist/skfiy`, then installs the staged marketplace through the real Codex CLI inside an isolated `CODEX_HOME` and proves the cached plugin copy can start the same packaged MCP server. The smoke records `cacheInstall.productPath: "codex plugin marketplace add -> isolated CODEX_HOME cache -> installed skfiy plugin -> packaged skfiy CLI -> MCP stdio"` before CI or local dogfood touches the user's global Codex marketplace. `npm run smoke:codex-plugin -- --extension-id <id> --output .skfiy-smoke/codex-plugin-extension.json --require-passed` extends both MCP status paths into Chrome Native Messaging and extension-adapter status without starting desktop control.

## Status Probe

`skfiy status --json` now runs read-only probes instead of returning only placeholders. It reports whether `dist/skfiy.app`, `dist/skfiy`, and the packaged helper exist, reads helper permission states, reads desktop-session controllability, checks the Chrome Native Messaging host when `--extension-id <id>` is provided, derives extension-adapter readiness from that host status, checks a running dashboard descriptor when `--dashboard-url <url>` is provided, and reads `money-run` through non-mutating tmux probes. Missing helpers, missing tmux sessions, or failed probes degrade to structured `unknown`, `not-running`, or `blocked` fields so dashboards can render the output without treating status collection itself as a hard failure. The top-level `readiness` object summarizes runtime, dashboard, extension, and money-run checks with blocker codes.

## Doctor Probe

`skfiy doctor --json` now turns the same read-only probes into operator-facing diagnostics. It reports a machine-readable `result`, `diagnostics[]`, and de-duplicated `nextActions[]` for helper placement, Screen Recording, Accessibility, desktop lock/sleep/loginwindow blockers, Chrome Native Messaging host setup, dashboard availability, app signature identity, and Finder Automation proof. It also emits a `preflight` block for real test setup: packaged `dist/skfiy.app`, helper, and `dist/skfiy` paths, signing state, dashboard descriptor/API reachability for `/api/chrome-host-policy`, Chrome extension/native-host configuration state, and the user-level `chrome-host-policy.json` path. The command stays non-mutating; it tells the operator exactly which command or System Settings panel to open next.

## Integration Notes

- Build output will place the modules under `dist/main/` through the existing Electron TypeScript config.
- `scripts/skfiy-cli.mjs` is intentionally not registered in `package.json`; run it directly only after built artifacts exist.
- `bin/skfiy.mjs` is the packaged CLI entry copied to `dist/skfiy`; `scripts/skfiy-cli.mjs` remains a source-tree debug shim only.
- Future implementation should replace remaining skeleton states with live app/helper/permission/dashboard/extension-session probes without changing the top-level JSON keys.
- Future dashboard server work should keep tokens out of logs and stdout by default.
