# skfiy Voice Computer Control Research and Long Plan

Date: 2026-06-16

## Positioning

skfiy should not be "a chat input floating on the desktop". The product shape is a voice-first desktop companion that can become the primary entry point for complex computer work after the user grants explicit control permissions.

The durable wedge is not the pet itself, nor dictation alone. The wedge is: voice intent -> grounded desktop observation -> safe action loop -> visible status/recovery. This is the gap between AIME-style assistant/chat workflows and Codex-style Computer Use.

## Research Summary

### External

- OpenAI Computer Use frames the core loop as model-operated software through screenshots plus interface actions executed by the host harness. Codex Computer Use also makes the permission model explicit: Screen Recording for seeing, Accessibility for clicking/typing, app-level approvals for what can be controlled.
- Codex Chrome extension is the closest browser-control reference for skfiy. Public docs describe it as a plugin-installed Chrome extension for tasks requiring the user's signed-in Chrome state; it uses host/domain approvals, allowlist/blocklist controls, tab grouping, Chrome extension permissions including debugger/page access, browsing history, downloads/bookmarks/tab groups, and native-app communication. The current local Codex Chrome surface also exposes a controllable-tab model with explicit user-tab claiming and session cleanup. The private implementation is not public, so skfiy should not copy it; instead, build a Chrome extension adapter with the same product properties: structured DOM actions, per-host approvals, native messaging to the skfiy app, and screenshot fallback.
- Codex plugin architecture is broader than a Chrome extension: public docs define plugins as bundles of skills, app integrations, MCP servers, and lifecycle hooks, with marketplace distribution and manifest paths rooted under `.codex-plugin/plugin.json`. Local inspection on 2026-06-20 confirmed the same implementation shape: installed plugins live under `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, `plugin.json` points at `skills/`, `.app.json`, `.mcp.json`, hooks, and assets, and the bundled Chrome plugin is a Codex plugin that then sets up a Chrome extension plus native host. skfiy's Chrome extension should be a product adapter first; a later Codex plugin can expose skfiy to Codex as an MCP/app integration after skfiy's own runtime is stable.
- OpenClaw-style dashboards show the right operator surface: a local gateway/control UI, safe dashboard URL opening through CLI, WebSocket/auth gating, live health, active sessions, task/sub-agent activity, cost/context trends, alert banners, auto-refresh, and local-only defaults. skfiy should treat dashboard as an ops/audit plane, not as the primary pet UI.
- Anthropic's computer use announcement confirms the same shape: looking at screen, moving cursor, clicking, typing. It also explicitly labels the capability experimental and error-prone, so reliability and recovery are not optional add-ons.
- Microsoft Copilot Studio Computer Use and Power Automate Desktop show the enterprise automation angle: natural language is useful, but users still need repeatable desktop flows, connectors, and auditable runs.
- Apple Voice Control shows a mature UI-control pattern for voice: numbered item overlays and grid drill-down. This is important because pure coordinate clicking is brittle; users need inspectable grounding when the agent is uncertain.
- Raycast AI shows the command-center model: OS-integrated AI, extensions, quick floating UI, and hotkey access. This is a strong pattern for deterministic app integrations but not enough for arbitrary native GUI control.
- Wispr Flow and Superwhisper show that "works in every app" dictation is now table stakes. Talon shows that command-oriented voice control needs scriptability and mode separation, not only transcription.
- Electron supports frameless/transparent windows, but transparent windows have known click-through and focus limitations. A pet overlay must be treated as a native windowing product, not a normal web app.

### Internal

- AIME desktop already covers local file/coding workflows, cross-end context, and browser control through a Chrome extension. Internal search also shows AIME Buddy as a desktop pet for task notification and multi-agent companionship.
- AIME does not appear to cover broad system-level GUI automation across arbitrary native macOS apps. That remains skfiy's defensible gap.
- Internal Computer-Using Agent material converges on the same architecture: perception -> reasoning -> execution, with screenshot, accessibility/DOM trees, OCR, and structured interactive elements as complementary observation channels.
- Internal AIME/Computer Use research points to Ghostty as a reasonable first native app target, but only if we isolate the terminal state. Blindly typing into the current Ghostty window is not acceptable because it may be a Codex TUI, shell, editor, or anything else.
- Doubao Input Method is valuable for first voice entry because it already has production ASR and custom shortcuts. But it is not a stable API. Internal search confirms voice shortcut customization and Hammerspoon-style bridging, so skfiy should treat Doubao as one ASR/input provider, not as the whole voice architecture.
- Internal feishu_asr experience reinforces the right decomposition: hotkey/trigger, audio capture, ASR call, text injection, floating panel. skfiy needs the same separation plus a Computer Use loop.

## Current Defects

1. **Launch and permission model is wrong for product use.**
   Development launch through tmux caused macOS Accessibility prompts to be attributed to tw-dashboard. Product launch must be a real app bundle with stable identity, signing, and permission onboarding.
   2026-06-19 update: direct `skfiy-helper` probes can report authorized through the Codex/terminal parent chain while the product-launched `skfiy.app -> helper` path still reports denied. Permission-sensitive helper calls must be validated only through `skfiy.app`, and the helper must be embedded beside the app executable so TCC can associate the call chain with the app bundle instead of a loose helper binary.

2. **Voice is not a fully proven voice stack yet.**
   Current implementation has Doubao shortcut bridging, Chromium Web Speech fallback, and a native macOS Speech framework one-shot prototype with silence timeout. Native stop/cancel now aborts the in-flight helper recording process, but the stack still needs native provider dogfood after Speech Recognition permission is granted, long-running VAD polish, and broader real-audio failure-state testing.

3. **Ghostty control is not context-aware.**
   The helper can activate Ghostty, screenshot, type, and press keys, but it typed `pwd` into a Codex TUI during real testing. The agent needs a clean shell/session strategy and state detection before any command execution.

4. **Computer Use core is still short of a full agent loop.**
   We have actions, screenshots, risk classification, OCR grounding, action verification, replay logs, an initial app policy, and Ghostty sensitive-screen pauses, but still need broader app adapters, cross-app sensitive-screen handling, credential rules, richer recovery, and real dogfood passes after permissions are granted.

5. **The pet UI is not yet a trustworthy control surface.**
   It has improved from a window to a pet, but it still lacks strong affordances for listening/thinking/acting/needs-approval, durable drag behavior across spaces/screens, and a permission/status center that users can understand.

6. **No complete binary and CLI distribution path.**
   The app bundle and embedded helper exist, but the project still needs a first-class user binary story: signed/notarized app, a simple `skfiy` CLI shim, dashboard open/status commands, Chrome native-messaging host registration, release artifact checks, and a clear "developer mode vs installed app" split.

7. **Safety is too shallow.**
   Risk classification exists for terminal commands, but system-wide control needs app allowlists, sensitive-screen detection, credential handling, clipboard rules, approval policies, and kill switch behavior.

## Target Architecture

### 1. Desktop Shell

- Signed macOS app bundle.
- Pixel pet overlay plus compact status bubble.
- No tmux/dev-shell launch in user testing.
- Stable permission identity for Screen Recording, Accessibility, Microphone.
- Pet interactions:
  - Left click / global push-to-talk: start voice turn.
  - Drag: move pet only.
  - Right click: settings, permissions, logs, provider selection.
  - Long press / panic hotkey: stop current agent turn.

### 2. Voice Layer

- Trigger manager: pet click, global hotkey, optional Doubao shortcut.
- ASR provider interface:
  - Doubao input method bridge.
  - Local ASR prototype with whisper.cpp or platform Speech framework.
  - Cloud ASR provider for high-quality internal testing if approved.
- VAD and recording lifecycle independent from UI.
- Transcript stream becomes an intent candidate, not immediate execution unless confidence and policy allow.

### 3. Intent and Policy Router

- Classify voice text into:
  - Direct command to app adapter.
  - General Computer Use task.
  - Chat/question.
  - Unsafe/needs clarification.
- Risk model:
  - Read-only.
  - Local state mutation.
  - External side effect.
  - Credential/payment/security sensitive.
  - Current MVP terminal policy covers local mutation, destructive/security commands, external publish/write commands, package installs, external read/sync commands, clipboard read/write commands, and common credential/key reads.
- Approval model integrated into pet bubble.

### 4. Computer Use Core

- Observation:
  - Fullscreen screenshot.
  - Target app/window screenshot.
  - macOS accessibility tree where available.
  - OCR/element parser for labels and coordinates.
- Action schema:
  - activate app/window
  - click element or coordinate
  - type text
  - press key/hotkey
  - scroll
  - drag
  - wait/observe
- Agent loop:
  - observe -> plan next action -> execute -> verify -> recover/ask.
- Replay log:
  - screenshots before/after
  - action timeline
  - planner rationale summary
  - approval decisions

### 5. App Adapters

- Ghostty first:
  - Detect whether current window is shell, Codex TUI, editor, or unknown.
  - Prefer opening a dedicated skfiy shell tab/window/session.
  - Read terminal state via screenshots plus optional shell markers.
  - Never type into unknown foreground terminal without confirmation.
- Chrome second:
  - Prefer Codex/AIME-style structured browser control when available.
  - Build a skfiy Chrome extension adapter instead of relying only on CDP:
    - Manifest V3 extension with content script, background service worker, and restricted host permissions.
    - Native Messaging host that connects the extension to the signed skfiy app/CLI, not to a tmux process.
    - Per-host app policy mirroring Codex's website allow/ask/deny model.
    - DOM snapshot, visible text extraction, ARIA/role tree, element bounding boxes, form metadata, downloads/uploads status, tab URL/title, and page screenshot hooks.
    - Structured actions: navigate, click selector/role/text, fill fields, submit forms, scroll, focus, keyboard shortcuts, upload file after explicit approval, and read current page without navigation.
    - Sensitive-content guard before fills/clicks for password, payment, auth, account deletion, security settings, and external side-effect flows.
    - Fallback switching: extension -> CDP -> macOS screenshot/OCR/Accessibility.
    - Evidence parity with existing smoke output: product path, host approval, before/after page state, action verification, sensitive pause, fallback reason, cleanup.
    - A fresh Native Messaging heartbeat file at `~/Library/Application Support/skfiy/chrome-extension-connection.json` whenever the packaged host handles an extension frame, so CLI, dashboard, and future Codex plugin consumers can distinguish an installed host from a live or stale extension session.
  - Fall back to screenshot Computer Use.
- Finder/Lark third:
  - Finder for file organization.
  - Lark/Feishu for office workflows only after policy/permissions are ready.

### 6. Dashboard and Operator Plane

- Dashboard is a local control and audit plane, separate from the desktop pet.
- Default bind should be loopback-only, for example `http://127.0.0.1:<port>/`, with optional token auth and no token printed into logs.
- Open via CLI:
  - `skfiy dashboard`
  - `skfiy dashboard --no-open`
  - `skfiy dashboard --json`
- Initial panels:
  - Runtime health: app/helper/dashboard/extension status, PID, uptime, version, bundle id, signing state.
  - Permission health: Screen Recording, Accessibility, Microphone, Speech Recognition, Finder Automation, Chrome extension connection.
  - Current turn: voice provider, transcript, target app, policy decision, risk, current status, stop button.
  - Replay timeline: screenshots, OCR labels, accessibility coverage, actions, verification decisions, approval decisions.
  - App policy: allow/ask/deny per app and per Chrome host.
  - Smoke evidence: latest UI/Ghostty/Chrome/dashboard/Codex plugin/Finder/voice/money-run artifacts and pass/block reasons.
  - Long-horizon supervision: tmux `money-run` status, active pane summary, recent risk markers, read-only probe evidence.
  - Alerts: permission missing, desktop locked/asleep, helper not signed, extension disconnected, smoke evidence stale, release artifact older than HEAD.
  - Dogfood/release: current alpha, manifest, zip checksum, accepted reports, cohort coverage.
- Data path:
  - main process writes a local append-only event store for turns and smokes.
  - dashboard reads via local HTTP plus WebSocket/SSE updates.
  - dashboard never becomes required for Computer Use execution; it observes and approves but does not hide the pet's stop/approval surface.

### 7. Binary, CLI, and Native Host

- Binary distribution must have a single compiled product entry: the installed user-facing product is `skfiy.app` plus the packaged `skfiy` CLI, not a tmux session, source-tree dev server, or loose helper launched from Terminal.
- Release artifacts must always include `skfiy.app`, embedded `skfiy-helper`, and `skfiy` CLI as one coherent product bundle.
- Ship one product, not a tmux backend:
  - `skfiy.app` as the signed desktop app.
  - `skfiy-helper` embedded in `Contents/MacOS`.
  - `skfiy` CLI shim installed by the app or release package.
  - Chrome Native Messaging host manifest installed by `skfiy chrome install-host`.
- CLI command surface:
  - `skfiy status --json`: app/helper/permissions/desktop-session/extension/dashboard status.
  - `skfiy doctor`: actionable permission and packaging diagnostics.
  - `skfiy permissions open <screen-recording|accessibility|microphone|speech-recognition|automation-finder>`.
  - `skfiy dashboard [--no-open] [--port <port>]`.
  - `skfiy chrome status`, `skfiy chrome install-host`, `skfiy chrome uninstall-host`.
  - `skfiy mcp serve --stdio`: Codex plugin-facing MCP entry point for read-only status/doctor tools.
  - `skfiy smoke <ui|desktop-session|ghostty|chrome|dashboard|codex-plugin|finder|voice|money-run> --output <path>`.
  - `skfiy release check --json-output <path>` and `skfiy alpha artifact`.
- CLI safety rules:
  - No command should require a tmux session.
  - No token should be printed by default.
  - Mutating commands require explicit subcommands and clear output.
  - `--json` output must be stable enough for dashboard and future agents.

### 8. Codex Plugin Adapter

- Treat Codex plugin packaging as a distribution adapter, not skfiy's runtime foundation.
- Codex loads installed plugins from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`, so a skfiy plugin release must be versioned, cache-safe, and reinstallable without depending on the source checkout path.
- Build a `skfiy` Codex plugin scaffold only after the binary runtime is stable:
  - `.codex-plugin/plugin.json` with lowercase `skfiy`, version, metadata, icons, and starter prompts.
  - `skills/control-skfiy/SKILL.md` for Codex-facing workflows such as "use skfiy to inspect the desktop and run a permissioned Computer Use turn".
  - `.mcp.json` pointing to `skfiy mcp serve --stdio` or an equivalent installed binary command.
  - Optional `.app.json` only if Codex app integration needs a first-class connector surface.
  - No plugin hook should auto-run desktop control without explicit user trust and approval.
- Plugin-facing commands must call the installed binary:
  - `skfiy status --json`
  - `skfiy doctor --json`
  - `skfiy chrome status --json`
  - `skfiy mcp serve --stdio`
  - `skfiy smoke <target> --output <path> --json`
- Validation before a plugin alpha:
  - plugin manifest validates with the Codex plugin schema;
  - plugin-installed skill can find the installed `skfiy` binary without a repo checkout;
  - plugin-installed MCP smoke can start the packaged `skfiy` binary, send `initialize`, `tools/list`, and `tools/call skfiy.status`, then verify JSON-RPC-only stdout and structured status;
  - MCP/app adapter reports the same permission and replay state as `skfiy dashboard`;
  - disabling/uninstalling the plugin does not stop the standalone skfiy app or erase local replay evidence.

### 9. Evaluation Harness

- Deterministic task scripts:
  - open Ghostty clean shell
  - run read-only command
  - take before/after screenshots
  - reject unsafe command
  - ask approval for mutation
  - recover when target app is not in expected state
- Golden screenshots and event logs.
- Manual beta checklist for permission, voice, drag, and stop behavior.

## Four-Week Plan

### Week 1: Product Shell and Voice Foundation

Goal: remove permission confusion, make voice lifecycle explicit, make app identity stable.

- [x] Package a local macOS app bundle with fixed bundle ID and embedded Swift helper.
- [x] Move the Swift helper into `skfiy.app/Contents/MacOS/skfiy-helper` so product-path permission checks use the app bundle execution identity instead of a loose `Resources` helper.
- [x] Add a startup guard that warns when running under tmux/dev shell for user testing.
- [x] Build a permissions center:
  - [x] Screen Recording status.
  - [x] Accessibility status.
  - [x] Microphone status.
  - [x] "Open System Settings" actions.
  - [x] Computer Use preflight blocks before opening Ghostty when Screen Recording or Accessibility is not granted, while keeping approval-first behavior for medium/high risk commands.
  - [x] Left-click voice entry opens a permission onboarding panel before dictation when required permissions are denied or not determined.
  - [x] UI smoke and dogfood verifier require direct permission setting targets for Screen Recording, Accessibility, Microphone, and Speech Recognition.
  - [x] UI smoke and dogfood verifier require `petDrag` evidence with renderer pointer events, real `beforeBounds`/`afterBounds`, upward movement, and suppressed click-after-drag behavior.
- [x] Refactor dictation into a provider interface.
- [x] Keep Doubao as a provider, but add provider state events:
  - [x] unavailable
  - [x] waiting for shortcut configuration
  - [x] listening
  - [x] stopped
  - [x] failed
- [x] Add a native macOS speech provider prototype:
  - [x] helper command `speech-status --locale zh-CN` reports Speech Recognition, Microphone, and recognizer availability
  - [x] helper command `transcribe-speech --locale zh-CN --max-duration-ms <n> --silence-timeout-ms <n>` performs a bounded one-shot Speech framework recognition turn
  - [x] native provider streams the final transcript event back through main -> preload -> renderer without starting Chromium Web Speech
  - [x] native provider fails closed when Speech Recognition or Microphone is not granted
  - [x] native provider emits `no_transcript` and does not submit an empty transcript when Speech returns no recognized text
  - [x] native provider aborts the in-flight helper transcription process on stop or cancel
  - [ ] product-path native speech turn after Speech Recognition permission is granted
- [x] Add a main-process voice turn session model:
  - [x] `prepare-dictation` creates a session id for Doubao or browser speech turns
  - [x] browser ASR result events stream partial/final transcript candidates back to the main-process session
  - [x] browser ASR interim or low-confidence candidates stay visible but do not auto-submit into Computer Use
  - [x] `submit-dictation` finalizes the session before entering the Computer Use task path
  - [x] `submit-dictation` now passes through a main-process voice intent admission gate before Computer Use: streamed ASR providers require a final transcript, submitted text must match the final candidate, low-confidence candidates ask for clarification, chat prompts route away from desktop control, and Doubao remains a text-bridge provider when candidate confidence is unavailable
  - [x] `stop-dictation` cancels the active session on manual stop or panic stop
  - [x] partial/final transcript, confidence, timeout, cancellation, and provider failure states are represented in a testable backend store
- [x] Add a stop-turn hotkey and make pet click not start a new turn while dragging.
- [x] Ship a settings panel for ASR provider and Doubao shortcut instructions.
- Verification:
  - app launched via `open` has no tw-dashboard permission prompt
  - left-click starts listening or gives actionable provider error
  - current packaged UI check on 2026-06-16: CDP-clicking the pet in `dist/skfiy.app` opened `权限引导` with Screen Recording, Accessibility, Microphone, and Speech Recognition rows when permissions were denied/not-determined
  - repeatable packaged UI smoke now exists: `npm run smoke:ui -- --output .skfiy-smoke/ui-permission-onboarding.json`; it launches `dist/skfiy.app`, drags the real renderer pet upward through DOM pointer events, records `petDrag.beforeBounds`/`petDrag.afterBounds`, clicks the pet, records onboarding visibility and permission rows, and shares the product smoke lock with Ghostty/voice runs
  - voice submit path now flows through renderer -> preload -> main `submit-dictation`, finalizes a voice session, then enters the existing Computer Use command path
  - browser ASR transcript updates now flow through renderer -> preload -> main `update-dictation-transcript` before submit
  - browser ASR auto-submit requires a final candidate and does not run low-confidence candidates
  - native macOS speech status check on 2026-06-16: `./dist/skfiy-helper speech-status --locale zh-CN` returned Microphone `authorized`, Speech Recognition `notDetermined`, and recognizerAvailable `true`
  - product-path native voice smoke harness now exists: `npm run smoke:voice -- --provider native-macos --output .skfiy-smoke/voice-native.json`; it launches `dist/skfiy.app`, selects the native provider through preload, records provider/transcript/task events, stops dictation, and fails closed until Microphone/Speech Recognition permission plus a final transcript are available
  - passed product-path native voice evidence now requires a final non-empty `transcriptEvents` entry, downstream `taskEvents`, and `turnReplay` from `window.skfiy.getTurnReplay()` with a completed Ghostty transcript, `com.mitchellh.ghostty`, verified `type_text`/`press_key` actions, and non-empty before/after screenshot bytes, so voice dogfood proves transcript-to-Computer-Use execution rather than transcription alone
  - product-path native voice smoke now records structured `speechStatus` through the configured smoke/settings locale, so Speech Recognition and Microphone readiness are machine-checkable in dogfood evidence without hard-coding `zh-CN`
  - native macOS no-transcript handling now keeps an explicit `no_transcript` provider event visible in the renderer and prevents empty transcript submission
  - native macOS stop/cancel now passes an `AbortSignal` to the helper process, emits `cancelled`, and dogfood verification requires `listening` plus `no_transcript` or `cancelled` lifecycle evidence for no-transcript artifacts
  - renderer permissions summary and settings now treat Speech Recognition as a first-class permission row, including a direct System Settings jump to `Privacy_SpeechRecognition`
  - current product-path native voice smoke on 2026-06-16: `npm run smoke:voice -- --provider native-macos --output .skfiy-smoke/voice-native.json --listen-ms 1200` launched `dist/skfiy.app` via `open`, used `runnerHasTmux=false`, selected `native-macos` through preload, emitted provider `unavailable`, emitted task `failed`, and persisted result `blocked` because Speech Recognition was `not-determined` and Microphone was `not-determined`
  - UI, Ghostty, and voice product smoke scripts now share `.skfiy-smoke/product-smoke.lock` so dogfood evidence is not contaminated by concurrent packaged-app runs
  - stop always returns to idle
  - screenshots/click/key helper commands still pass

### Week 2: Real Ghostty Adapter and Minimal Computer Use Loop

Goal: make the first native app scenario reliable enough to demo without embarrassing blind typing.

- [x] Create a dedicated Ghostty session strategy:
  - [x] open new Ghostty window/tab/process for skfiy
  - [x] label skfiy Ghostty context with marker title/status/prompt state
    - implemented by initializing the owned Ghostty process with `SKFIY_SESSION=1`, `[skfiy]` prompt state, and `skfiy-shell` OSC title before the user command is typed
  - [x] scope activate/observe to the opened Ghostty process id
  - [x] refuse to type into Codex TUI/editor/unknown state
- [x] Add product-path `observe_app` replay records with screenshot paths and accessibility trust.
  - renderer stores before/after records, clears them at the start of a new task, and displays screenshot path plus Accessibility trust state in the task bubble
- [x] Implement action verification:
  - [x] after activate, confirm frontmost bundle
  - [x] after type/enter, capture after screenshot
  - [x] after submit, require a per-command completion marker in Ghostty OCR output before emitting `completed`
  - [x] if verification fails, ask user instead of continuing
- [x] Add a primitive planner loop for terminal tasks:
  - [x] parse command intent
  - [x] classify risk
  - [x] prepare session
  - [x] execute
  - [x] verify
  - [x] summarize
- [x] Add tests and real task scripts:
  - [x] `pwd`
  - [x] `date`
  - [x] `mkdir skfiy-demo` requires approval
  - [x] `pbpaste` and `pbcopy` clipboard read/write commands require approval
  - [x] `rm -rf` requires approval and defaults to deny
  - [x] packaged product-path smoke script: `npm run smoke:ghostty`
  - [x] packaged product-path smoke matrix: `npm run smoke:ghostty -- --matrix`
  - [x] persistent product-path smoke artifact: `npm run smoke:ghostty -- --output .skfiy-smoke/ghostty-smoke.json`
  - [x] activation diagnostics distinguish granted permissions from an unavailable macOS desktop session (`frontmostBundleId: com.apple.loginwindow`)
  - [x] activation verification is pid-aware and reports the observed `frontmostProcessIdentifier`, so skfiy-owned Ghostty sessions are not confused with another Ghostty process
  - [ ] passing product-path task scripts after Accessibility is granted
- Week-2 acceptance evidence:
  - launch command: `open -na /Users/bytedance/Desktop/test/skfiy/dist/skfiy.app`
  - trigger path: packaged app product path, not direct helper
  - product path: renderer -> preload -> main -> helper -> Ghostty
  - Ghostty context: skfiy-owned window/tab/process plus marker title/status/prompt state
  - task: "打开 Ghostty 执行 pwd 并截图"
  - cohort workflow ids: `coding-terminal` and `screenshot-inspection`
  - replay: `observe_app` record path with accessibility trust state
  - screenshots: before and after absolute paths
  - events: observing -> executing -> submitted -> completed
  - result: passed, blocked, or needs-user-confirmation
  - current local run on 2026-06-16: blocked before opening Ghostty because `dist/skfiy.app` permission state is Screen Recording `denied`, Accessibility `denied`, Microphone `not-determined`; observed events were `executing(replayReset)` -> `observing` -> `failed`, no Ghostty command was typed, and no before/after replay screenshots were produced yet
  - current matrix run on 2026-06-16: `npm run smoke:ghostty -- --matrix --port 9260 --output .skfiy-smoke/ghostty-matrix-9260.json` used the packaged app path with `runnerHasTmux=false`; `pwd-readonly` and `date-readonly` were blocked by Computer Use permission preflight before opening Ghostty, `mkdir-approval` reached `approval_required`, and `rm-rf-deny` reached `approval_required` then `Task denied.` The persisted artifact was `/Users/bytedance/Desktop/test/skfiy/.skfiy-smoke/ghostty-matrix-9260.json` at 5377 bytes.
  - current matrix run on 2026-06-19 after TCC grants and pid-aware activation diagnostics: `npm run smoke:ghostty -- --matrix --settle-ms 1500 --timeout-ms 15000 --output .skfiy-smoke/ghostty-matrix-pid-aware-loginwindow-blocked.json` launched `dist/skfiy.app` through LaunchServices with `runnerHasTmux=false`; Screen Recording and Accessibility were granted, approval/deny guard runs behaved correctly, but read-only Ghostty execution was blocked because the helper observed `frontmostBundleId: com.apple.loginwindow` and black screenshots, so the artifact result is `blocked` until the Mac is unlocked and awake.
  - `passed` smoke classification now requires LaunchServices app launch, `runnerHasTmux=false`, the product path, a completed event, and non-empty before/after screenshot files
  - repeat command: `npm run smoke:ghostty`
  - repeat matrix command: `npm run smoke:ghostty -- --matrix`
  - repeat persisted-evidence command: `npm run smoke:ghostty -- --matrix --output .skfiy-smoke/ghostty-matrix.json`
  - passed Ghostty smoke classification and dogfood verification now require non-empty before/after screenshot evidence plus `Verified type_text` and `Verified press_key` action verification events in addition to LaunchServices/product-path evidence
- Week-2 demo criteria:
  - user says "打开 Ghostty 执行 pwd 并截图"
  - skfiy opens/uses its own Ghostty context
  - captures before/after screenshots
  - shows status on pet
  - does not type into unrelated terminal UI

### Week 3: Grounding, Recovery, and Browser/App Expansion

Goal: move from scripted Ghostty automation toward Computer Use behavior.

- [x] Add OCR/element parser research spike:
  - [x] evaluate macOS accessibility tree coverage
    - `grounding-evaluation` records whether trusted Accessibility/window elements are covered, partial, missing, or blocked
  - [x] evaluate OCR labels on screenshots
    - screenshot OCR label observations are modeled as a fallback signal and reflected in per-screenshot grounding recommendations
    - `skfiy-helper ocr-image --input <path>` now uses macOS Vision OCR, Ghostty observations ingest labels after screenshots, and replay rows surface OCR label counts for debugging
  - [x] define `ObservedElement` schema with id, label, role, bounds, source for window-level observations
    - OCR screenshot labels now become `ObservedElement` records with role `text` and source `ocr`; click planning can target a unique label and returns `needs_user_confirmation` when the label is ambiguous
- Implement element-targeted actions:
  - [x] resolve click target by observed element id for window-level elements
  - [x] click by coordinate only as fallback
    - planner requires explicit `allowCoordinateFallback` before producing a raw coordinate click action
- Expand generic desktop action schema:
  - [x] hotkey via `press-shortcut`
  - [x] scroll wheel event
  - [x] mouse drag event with bounded duration
    - helper commands `scroll`, `drag`, and `press-shortcut` return structured JSON and route through Accessibility-gated HID events
  - [x] post-action verification hook
    - generic action plans can now run a verifier after each executable desktop action, record passed verification decisions, and fail closed before later actions when the verifier reports `failed` or `needs_user_confirmation`
    - Ghostty typing and submit helper actions now emit structured `action_verified` events, so local replay/transcript evidence shows which actions were accepted before later observation checks continue
- Add recovery policies:
  - [x] if app hidden, activate
    - Ghostty before-observe now performs one-shot activate recovery before typing
  - [x] if window missing, open
    - Ghostty before-observe now performs one-shot open recovery by creating a fresh `skfiy-shell`, reinitializing the marker, and reobserving before typing
  - [x] if duplicate target, ask user
  - [x] if sensitive UI appears, pause
    - Ghostty recovery now checks both sensitive window titles and OCR text such as passwords, API tokens, access tokens, private keys, secrets, credentials, and recovery keys before typing; it repeats the sensitive check after a one-shot activate/open recovery before any user command is entered
    - common Computer Use recovery now pauses by default on sensitive window titles and OCR labels across app targets, including password/passkey/keychain/security prompts, token/key/credential text, verification codes, payment/card/CVV, and recovery/seed phrases
- Add Chrome proof of concept:
  - [x] prefer CDP/extension-like structured control
    - CDP mode selection plus navigate, click-selector, and extract-text command builders exist
  - [x] use screenshot fallback for non-structured pages
    - fallback mode is explicit when no CDP endpoint is available, and Chrome commands without a usable structured control channel now produce packaged-app screenshot fallback evidence instead of silently failing
  - [x] product-path browser-control evidence
    - `npm run smoke:chrome -- --require-passed --output .skfiy-smoke/chrome-page.json` launches an isolated Chrome profile, routes the command through renderer -> preload -> main -> CDP -> Chrome, records Chrome app policy approval, verifies `navigate` / `extract_text`, and checks extracted page text
  - [x] product-path current-page observation evidence
    - the Chrome smoke now runs `观察 Chrome 当前页面并提取正文` against the already-open test page, records `currentPageRun.result: passed`, `currentPageRun.pageSnapshot`, `Verified current_page_snapshot`, and `Chrome current page extracted`, and fails dogfood verification if the current-page run contains a fresh `Verified navigate` event
  - [x] product-path sensitive-page pause evidence
    - the Chrome smoke now runs a second sensitive-page fixture, expects `sensitiveRun.result: sensitive-paused`, and verifies `Verification failed (sensitive): Sensitive UI text is visible.` instead of completing with sensitive text
  - [x] product-path form action evidence
    - the Chrome smoke now runs a multi-field form fixture through `填写 Chrome 测试表单 <url> 字段 #name=skfiy; #email=agent@skfiy.test; #role=operator 点击 #submit 并提取正文`, verifies `fill_selector` for every field plus `click_selector`, and checks `formRun.extractedText: skfiy agent@skfiy.test operator form submitted`
    - the Chrome runtime now rejects sensitive form fields/values such as `#password` before navigation or `fill_selector`, and the Chrome smoke records `sensitiveFormRun.result: sensitive-paused` as prefill safety evidence
  - [x] product-path screenshot fallback evidence
    - the Chrome smoke now relaunches `dist/skfiy.app` without `--skfiy-chrome-cdp-endpoint`, routes the same page command through renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback, and records either `fallbackRun.result: fallback-observed` with screenshot replay evidence or `fallbackRun.result: fallback-blocked` with a concrete permission reason
  - [x] product-path fallback switching evidence
    - the Chrome smoke now relaunches `dist/skfiy.app` with a deliberately broken `--skfiy-chrome-cdp-endpoint`, records `fallbackSwitchRun.result: fallback-switched-observed` or `fallback-switched-blocked`, and verifies a `Switching Chrome control from CDP to screenshot_fallback` event before the helper observe_app fallback
  - [x] bring-your-own Chrome current-page dogfood mode
    - `npm run smoke:chrome -- --current-page-endpoint http://127.0.0.1:9222 --output .skfiy-smoke/chrome-real-page.json` attaches `dist/skfiy.app` to a user-provided Chrome CDP endpoint, does not launch a temporary Chrome profile, runs `观察 Chrome 当前页面并提取正文`, records `targetMode: bring-your-own-current-page`, `chromeLaunchViaOpen=false`, `realCurrentPageRun`, and rejects any `Verified navigate` event
  - remaining product evidence gap: Chrome now counts as dogfood coverage for isolated safe-page CDP extraction, current-page DOM observation, sensitive-page pause, selector-based multi-field form fill/click, no-CDP screenshot fallback, configured-CDP failure switching, and BYO current-page observation wiring; the next gap is collecting passed `browser-fallback` cohort evidence from real logged-in pages with consenting dogfood users
- Add Chrome extension adapter plan:
  - [x] Research spike: document Codex Chrome extension public behavior and current local extension surface before coding
    - required notes: plugin install flow, Connected state, native app communication, website host approvals, allowlist/blocklist, tab grouping, debugger/page access, history/download/bookmark/tab-group permissions, and user-tab claiming/finalization behavior
    - output: a short architecture note under `docs/research/` comparing skfiy extension responsibilities with Codex's public behavior, explicitly marking private Codex implementation details as unknown
    - landed in `docs/research/2026-06-20-chrome-extension-architecture.md`
  - [x] Create `chrome-extension/` Manifest V3 skeleton
    - service worker owns connection lifecycle and tab routing
    - content script collects DOM/visible text/ARIA/role/bounds/form metadata
    - extension popup shows connection and current host policy only; it is not the main UI
    - landed as a static, lowercase `skfiy` MV3 skeleton under `chrome-extension/`, covered by `src/main/chrome-extension-manifest.test.ts`
  - [ ] Create native messaging bridge
    - `skfiy chrome install-host` writes the native messaging host manifest for the signed app/CLI path
    - host messages use request ids, schema versions, and bounded payload sizes
    - bridge refuses messages when app policy blocks the host/app/session
    - partial: `src/main/chrome-native-host.ts` now creates, installs, reads, and uninstalls the user-level Chrome Native Messaging manifest for the packaged `skfiy` CLI; `skfiy chrome status|install-host|uninstall-host --extension-id <id>` is wired through the CLI with injectable filesystem tests; `skfiy chrome status` now returns both raw `nativeHost` manifest status and derived `extension` adapter state; the packaged `dist/skfiy` shim can also run as a Chrome Native Messaging host, reading/writing Chrome length-prefixed JSON frames, enforcing schema version/request id/payload-size validation, returning framed responses, and honoring an injectable app-policy block before dispatch; `chrome-extension/background.js` now unwraps `skfiy.native.message`, waits for `port.onMessage`, and returns native-host responses to callers; `/snapshot.json` now reports user-level Native Messaging host manifest status for the packaged CLI and separates that install evidence from pending live extension connection evidence; persistent app-policy storage, live app-runtime routing, and full extension smoke evidence remain pending
  - [ ] Add browser action schema
    - observe current page
    - navigate
    - click element by selector/role/text
    - fill field
    - submit/click button
    - scroll
    - screenshot page
    - read downloads status
    - partial: `src/main/chrome-browser-action-schema.ts` now normalizes `skfiy.page.observe`, validates `skfiy.page.action`, and accepts bounded `skfiy.page.screenshot` plus `skfiy.downloads.status` messages before Native Messaging dispatch; safe actions currently cover navigate, click by selector/text/role, fill, scroll, confirmed submit, page screenshot format normalization, and downloads-status reads with local filename exposure blocked unless explicitly confirmed; `chrome-extension/content-script.js` now resolves action targets by selector, accessible text, or role/name and can execute confirmed form submit; `chrome-extension/background.js` can route page screenshots through `chrome.tabs.captureVisibleTab` and read recent download status through `chrome.downloads.search`; live extension smoke evidence remains pending
  - [ ] Add host policy
    - ask per host by default
    - allow current turn
    - always allow host
    - block host
    - never read browsing history unless explicitly requested for that turn
  - [ ] Add safety checks
    - pause on password/payment/OTP/security/account-deletion/content-exfiltration cues
    - confirm before submitting forms with external side effects
    - confirm before file upload/download path exposure
    - partial: Native bridge action validation blocks sensitive fill fields/values and unconfirmed submit actions before dispatch; content-script still keeps page-local sensitive pause behavior for fill/click targets; payment/OTP/account-deletion page-level cues, file upload/download path exposure, and replay evidence remain pending
  - [ ] Add smoke tests
    - extension connection status
    - current signed-in tab observation without navigation
    - safe form fill/click
    - sensitive form pause
    - blocked host
    - extension unavailable -> CDP fallback
    - CDP unavailable -> screenshot fallback
  - [ ] Dogfood gate
    - at least one consenting real logged-in page task passes through extension structured control
    - artifacts include host policy decision, tab title/url, observed elements count, action verification, and fallback not used unless explicitly testing fallback
- Add Finder proof of concept:
  - [x] organize a test folder
    - safe planner groups files into Images/Documents/Code/Archives/Other folders
  - [x] no destructive delete without approval
    - planner emits only create-folder and move-file operations, and local mutation requires approval
  - [x] product-path test-folder organization evidence
    - `npm run smoke:finder -- --require-passed --output .skfiy-smoke/finder-organize.json` launches `dist/skfiy.app`, routes the command through renderer -> preload -> main -> helper observe_app -> fs -> Finder, records Finder app policy approval, captures `finderObservation` for Finder focus/screenshot evidence, captures `finderSemanticObservation` for Finder current selection/front-window context through Apple Events, verifies `create_folder` / `move_file`, and checks before/after trees
  - [x] product-path Finder drag-probe evidence
    - `npm run smoke:finder -- --drag-probe --require-passed --output .skfiy-smoke/finder-drag-probe.json` opens the fixture in Finder, routes `探测 Finder 拖拽测试文件夹 <tmpdir>` through the packaged app, records product path `renderer -> preload -> main -> helper observe_app -> helper drag -> fs -> Finder`, captures `finderDragProbe`, verifies `Verified drag`, and still checks create-folder/move-file organization evidence
  - [x] product-path Finder item drag/drop evidence
    - `npm run smoke:finder -- --item-drag-drop --require-passed --output .skfiy-smoke/finder-item-drag-drop.json` opens the fixture in Finder, routes `拖放 Finder 测试文件夹 <tmpdir>` through the packaged app, records product path `renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder`, captures `finderItemDragDrop`, verifies `Verified item_drag_drop`, and still checks create-folder/move-file organization evidence
  - [x] main-process Finder item layout adapter wiring
    - the packaged app Finder desktop client now exposes `getFinderItemLayout` through `DesktopHelperClient`, so product-path item drag/drop can request fixture icon coordinates from the helper instead of only being covered by task-level tests
  - [x] current Finder folder smoke mode
    - `npm run smoke:finder -- --current-folder --require-passed --output .skfiy-smoke/finder-current-folder.json` opens the fixture folder in Finder, routes `整理 Finder 当前文件夹` through the packaged app, and only classifies `passed` when `finderSemanticObservation.targetPath` resolves to the same path as `fixtureRoot`
  - [x] selected Finder folder smoke mode
    - `npm run smoke:finder -- --selected-folder --require-passed --output .skfiy-smoke/finder-selected-folder.json` reveals and selects the fixture folder in Finder, routes `整理 Finder 选中文件夹` through the packaged app, and only classifies `passed` when `finderSemanticObservation.selectedItems` contains the fixture directory
  - [x] real parent directory Finder smoke mode
    - `npm run smoke:finder -- --target-dir ~/Desktop/skfiy-finder-dogfood --item-drag-drop --require-passed --output .skfiy-smoke/finder-target-dir.json` creates the isolated fixture under a real user-controlled parent directory and records `targetDirSafety` so the smoke cannot accidentally operate outside the generated fixture
  - [x] pre-execution Finder plan preview evidence
    - `npm run smoke:finder -- --item-drag-drop --output .skfiy-smoke/finder-plan-preview.json` records `finderPlanPreview.result: passed`, `destructiveOperationCount: 0`, the planned `photo.png` / `notes.pdf` / `script.ts` moves, and the task event `Finder plan preview: 3 folders, 3 moves, 0 destructive operations.` before filesystem mutation
  - [x] second-stage confirmation for broad Finder targets
    - `整理 Finder 当前文件夹` and `整理 Finder 选中文件夹` now stop after `finderPlanPreview`, show an expanded plan preview in the approval panel, and require a second approval before filesystem operations; product smoke records `finderPlanConfirmation.confirmedAfterPreview: true` for passed current/selected folder runs
  - remaining product evidence gap: Finder now counts as dogfood coverage for the safe test-folder organization path, current Finder window grounding path, selected Finder folder grounding path, native HID drag-probe, fixture-level file-icon drag/drop, packaged-app item-layout wiring, real-parent-directory fixture placement, pre-execution plan preview, and second-stage confirmation when observe_app, semantic selection, layout, and drag either pass or report concrete permission blocks; the next gap is collecting passed `finder-file` cohort evidence against real user directory contents after Screen Recording/Accessibility are granted, with multiple users and non-fixture directory shapes
- Start evaluation scorecard:
  - [x] task success rate
  - [x] number of manual interventions
  - [x] average steps
  - [x] unsafe-action blocks
  - [x] permission failures
  - scorecard aggregation exists for product-path event logs and permission summaries; Computer Use permission failures count Screen Recording and Accessibility denial, while microphone and Speech Recognition remain voice-provider-specific evidence
  - `dogfood:tester` summaries now surface the scorecard directly from packaged smoke event logs, so tester handoffs expose task success rate, manual interventions, average steps, unsafe-action blocks, and permission failures without treating the scorecard as cohort evidence

### Week 4: Beta Quality, Safety, and Internal Alignment

Goal: make it suitable for a small internal dogfood, and decide whether to integrate with AIME or stay separate.

- [x] Build signed/notarized alpha package or documented unsigned internal build.
  - documented current unsigned internal build path in `docs/internal-alpha-build.md`; `npm run release:mac:check` now reports Developer ID and Apple notary readiness, while actual signing/notarization still requires valid credentials before broader release
  - release readiness can now be persisted with `npm run release:mac:check -- --json-output .skfiy-release/mac-release-check.json`, producing machine-readable JSON for the default full signing/notarization dry-run plan without mutating the app bundle
  - release scripts now expose `npm run release:mac:sign` and `npm run release:mac:notarize`, both gated behind explicit `--execute` and fail-closed when credentials or the packaged app are missing
  - release signing now uses the committed hardened-runtime entitlements file `release/skfiy.entitlements.plist` in the planned `codesign --entitlements` command
  - local packaging now ad-hoc re-signs `dist/skfiy.app` after rewriting Info.plist, so `codesign -dv` reports `Identifier=com.sskift.skfiy` instead of the copied Electron identity and local TCC prompts attach to the intended lowercase app bundle
  - current packaged build check on 2026-06-17: `codesign -dv --verbose=4 dist/skfiy.app` reported `Identifier=com.sskift.skfiy`, `codesign --verify --deep --strict --verbose=2 dist/skfiy.app` passed, `smoke:ui` passed, Chrome structured CDP smoke passed, and Ghostty/Finder/default voice product smokes remained blocked until the new app identity receives Screen Recording and Accessibility grants. Optional native voice provider evidence still additionally needs Microphone and Speech Recognition.
  - current packaged permission/session check on 2026-06-19: `npm run smoke:ui -- --output .skfiy-smoke/ui-display-state-current.json` launched `dist/skfiy.app` through LaunchServices with `runnerHasTmux=false`, recorded Screen Recording/Accessibility/Microphone as granted in the renderer permission summary, and now includes `desktopSessionDiagnostics.state=blocked` with `frontmostBundleId=com.apple.loginwindow` plus `mainDisplayAsleep=true`; `npm run smoke:desktop-session -- --output .skfiy-smoke/desktop-session-display-state-current.json` independently confirms the same display-asleep/loginwindow/black-screen blocker. The next real Ghostty/Finder/voice product smokes require the display to be awake and the desktop to be unlocked, not another TCC grant.
  - current voice design update on 2026-06-17: Speech Recognition permission is not a default-product blocker. The default product path uses Doubao Input Method externally as the text bridge, while `native-macos` remains an optional provider that requires Microphone and Speech Recognition.
  - post-release long-horizon target: after all required product-path tests pass and a releasable app build is produced, use skfiy itself to supervise the agent running in the existing `tmux` session `money-run` through a real multi-step task, recording screenshots, action verification, stop/approval events, and failure recovery as a field test of sustained Computer Use supervision. skfiy must still be launched as the compiled app bundle, not from tmux.
  - unsigned local dogfood artifacts now use `npm run alpha:artifact`, producing a versioned `.zip` plus manifest with commit SHA, bundle id, signing/notarization state, SHA256 checksum, UI smoke artifact path, Ghostty smoke artifact path, Chrome smoke artifact path, Finder smoke artifact path, voice smoke artifact path, long-horizon money-run supervision artifact path, and accepted GitHub dogfood issue source evidence
  - GitHub alpha release publishing now uses `npm run alpha:github-release -- --manifest <path> --require-current-head`, defaulting to dry-run and requiring explicit `--execute` before uploading the unsigned zip and manifest as a pre-release for remote testers
  - dogfood evidence verifier now runs as `npm run dogfood:verify -- --manifest <alpha-manifest>` and checks the manifest, zip byte count, zip SHA256, UI smoke artifact, Ghostty smoke artifact, Chrome smoke artifact, Finder smoke artifact, voice smoke artifact, LaunchServices launch markers, `runnerHasTmux=false`, product paths, permission setting direct links, panic stop runtime hotkey evidence from `runtimeStatus.stopTurnHotkey`, UI smoke `stopTurnBehavior` (`behaviorResult`, `behaviorSource`, `behaviorBeforeStatus: approval_required`, `behaviorAfterStatus: idle`, and `behaviorAfterMessage: Task stopped.`), external Doubao voice transcript-to-task and Ghostty turn replay evidence for passed voice runs, external Doubao voice no-transcript/cancellation lifecycle evidence for no-transcript runs, accepted GitHub dogfood issue source evidence, app policy settings, passed Ghostty before/after screenshot evidence, Chrome extracted text, Chrome current-page observation evidence, Chrome sensitive-page pause evidence, Chrome form action evidence, Chrome screenshot fallback evidence, Chrome fallback switching evidence, Finder observe_app evidence, Finder semantic selection evidence, Finder plan preview evidence, Finder plan confirmation evidence for current/selected folder runs, Finder item drag/drop evidence, Finder before/after tree, clipboard read/write approval runs, and cleanup state
  - GitHub alpha release publishing now verifies the local zip SHA256 against the selected manifest before even a dry-run release plan can be reported
  - current GitHub prerelease on 2026-06-20 CST (2026-06-19 UTC): `skfiy-alpha-2e292e9` was published at https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-2e292e9 with unsigned zip SHA256 `e270f75cecb34d54050914f58ece1f85fea88574e6f574d8754f18718f1af6dc`; `dogfood:status` confirms the tracking issue Current Alpha identity and one current assignment packet comment, while real accepted report count remains `0/3`
  - cohort evidence verifier now runs as `npm run dogfood:cohort -- --cohort <path>` and checks 3-5 distinct real testers, shared alpha manifest, `appLaunchViaOpen=true`, `runnerHasTmux=false`, UI/Ghostty/Chrome/Finder/voice artifact paths, `uiPetDragEvidence.verifiedBy=dogfood:report`, `stopTurnEvidence.verifiedBy=dogfood:report`, macOS permission states, accepted GitHub issue source metadata with issue alpha manifest/zip/commit identity, and coverage for `coding-terminal`, `screenshot-inspection`, `finder-file`, and `browser-fallback`; workflow coverage counts only reports that satisfy the report-level source/artifact/UI-pet-drag/stop-turn/permission/identity gates
  - GitHub dogfood issue form now requires alpha manifest, alpha zip, commit SHA, UI smoke artifact, UI pet drag evidence, panic stop evidence from `runtimeStatus.stopTurnHotkey` and `stopTurnBehavior`, Ghostty smoke artifact, Chrome smoke artifact, Finder smoke artifact, voice smoke artifact, `runnerHasTmux`, app bundle preflight (`appPath`, LaunchServices launch command, `appLaunchViaOpen`, `runnerHasTmux`, and product path), permission states, ASR provider, external Doubao voice transcript-to-task evidence, external Doubao voice Ghostty turn replay evidence, external Doubao voice no-transcript/cancellation evidence, Computer Use result, screenshot paths, action verification events, app policy settings, Chrome extracted text, Chrome current-page observation evidence, Chrome sensitive-page pause evidence, Chrome form action evidence, Chrome screenshot fallback evidence, Chrome fallback switching evidence, Finder observe_app evidence, Finder semantic selection evidence, Finder plan preview evidence, Finder plan confirmation evidence, Finder item drag/drop evidence, Finder before/after tree, clipboard approval runs, and generated cohort source identity (`artifactSource=github-issue-smoke-artifacts`, issue alpha manifest/zip/commit identity, source commit matching report `commitSha`)
  - `dogfood:report` now rejects accepted issue bodies whose `app bundle preflight` is missing or does not match the UI smoke artifact `appPath`, LaunchServices launch command, `appLaunchViaOpen`, `runnerHasTmux`, and product path; rejects missing or mismatched `UI pet drag evidence` whose result/source/window bounds/deltas/upward movement/click suppression do not match the UI smoke artifact `petDrag`; and rejects missing or mismatched `panic stop` evidence whose accelerator/label/registered/source do not match smoke artifact `runtimeStatus.stopTurnHotkey` or whose behavior fields do not match `stopTurnBehavior`
- [ ] Add first-class binary and CLI distribution
  - [x] build a release package that contains `skfiy.app`, embedded `skfiy-helper`, and a `skfiy` CLI shim
    - packaging now copies `bin/skfiy.mjs` to `dist/skfiy`, alpha artifacts zip both `dist/skfiy.app` and `dist/skfiy`, and manifests record `cliShimPath`
  - [ ] make the release artifact the only supported user-test runtime, with one compiled app/binary path and no tmux/dev-server dependency
    - acceptance: `dist/skfiy.app`, `dist/skfiy`, embedded `Contents/MacOS/skfiy-helper`, Chrome Native Messaging manifest path, and every smoke command report the same release commit, bundle id, and product path
  - [ ] implement `skfiy status --json` for app/helper/permissions/desktop-session/extension/dashboard state
    - partial: `src/main/cli-command-surface.ts` now runs read-only status probes for `dist/skfiy.app`, the packaged helper, helper-reported permissions, desktop-session controllability, Chrome Native Messaging host status when `--extension-id` is provided, derived extension-adapter state from that host status, and dashboard descriptor health when `--dashboard-url` is provided; live Chrome extension connection, Finder Automation permission, and dashboard auto-discovery remain pending
  - [ ] implement `skfiy doctor` with concrete remediation for TCC, signing, helper location, Finder Automation, Chrome extension, and desktop sleep/lock blockers
    - partial: `skfiy doctor --json` now runs the same read-only status probes as `status`, verifies the app code signature identity, emits structured diagnostics plus concrete `nextActions` for helper location, Screen Recording, Accessibility, desktop lock/sleep/loginwindow blockers, Chrome Native Messaging host setup, dashboard availability, signing readiness, and Finder Automation proof; live Chrome extension connection and authoritative Finder Automation state remain pending
  - [ ] implement `skfiy dashboard [--no-open] [--port <port>]`, following OpenClaw's pattern of printing/opening a clean local URL without leaking tokens
    - partial: command normalization, loopback-only HTTP server, `/descriptor.json`, static HTML shell, default macOS URL open, `--no-open`, and product smoke coverage are wired; full dashboard data panels and app/Electron lifecycle integration remain pending
  - [ ] implement `skfiy chrome status|install-host|uninstall-host` for Chrome Native Messaging setup
    - partial: command surface, status, install, and uninstall now mutate/read the user-level Chrome Native Messaging manifest for an explicit `--extension-id`; `chrome status` now reports `extension.state=native-host-*` alongside the raw manifest state so operators can distinguish adapter install readiness from the still-pending live extension session; broader Chrome extension connection health remains pending
  - [ ] wrap product smokes behind `skfiy smoke <target>` while keeping npm scripts for development
    - partial: command normalization and script execution wrappers exist for all smoke targets, now including `dashboard`; the current wrapper runs the repo-local smoke scripts directly with Node instead of npm, so installed-app packaging of smoke runners remains pending
  - [ ] add tests that every CLI command can run outside tmux and that `--json` output is stable for the dashboard
    - partial: pure CLI surface tests cover JSON-safe output shapes and no system mutations; `smoke:cli` now runs the compiled `dist/skfiy` through the CLI command matrix smoke (`status --json`, `doctor --json`, `chrome status`, `mcp serve --stdio --json`, `dashboard --no-open --port 0 --json`, `release check --json-output`, `alpha artifact`, and CLI-wrapped `smoke dashboard --json`) with `runnerHasTmux=false`, an isolated `.skfiy-cli-smoke/home`, Chrome Native Messaging plus extension-adapter evidence checks, token-leak checks, and dashboard cleanup evidence; heavier app-control smokes remain separate product gates
- [ ] Add Codex plugin adapter after the standalone binary runtime is stable
  - [x] Research Codex plugin implementation before planning the adapter
    - findings: Codex plugins bundle skills, app integrations, MCP servers, lifecycle hooks, and assets; `.codex-plugin/plugin.json` is the entry point; marketplace entries govern install/auth policy; installed copies are loaded from `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`; the local Chrome plugin's Codex package is separate from the browser extension and native host it installs
  - [x] build a `skfiy` Codex plugin scaffold only after the binary runtime is stable
    - scaffold lives under `plugins/skfiy/` with `.codex-plugin/plugin.json`, `skills/control-skfiy/SKILL.md`, `.mcp.json`, SVG icon assets, and no automatic desktop-control hook; `plugin-creator` validation passes and the MCP config points at the installed `skfiy mcp serve --stdio` command
  - [ ] expose a plugin-safe MCP/app command surface backed by the installed `skfiy` binary
    - required commands: `skfiy status --json`, `skfiy doctor --json`, `skfiy mcp serve --stdio`, `skfiy dashboard --no-open --json`, `skfiy smoke <target> --output <path> --json`
    - partial: `skfiy mcp serve --stdio` is now part of the CLI command surface, with JSON-safe smoke output, newline-delimited JSON-RPC stdio transport, and MCP handlers for `initialize`, `tools/list`, `tools/call skfiy.status`, and `tools/call skfiy.doctor`; binary smoke now sends real stdio JSON-RPC to `dist/skfiy` and receives MCP responses; `smoke:codex-plugin` now copies the scaffold into a staged marketplace install, reads MCP config from that staged plugin with `repoCheckoutUsedForMcp=false`, and verifies initialize safety instructions plus structured `skfiy.status`; the remaining gap is fresh Codex app cache/install smoke evidence
  - [ ] add plugin validation and smoke evidence
    - acceptance: plugin manifest validates, Codex can discover the skill, plugin-scoped MCP can read status, and a disabled plugin does not break the standalone desktop app
- [ ] Add local dashboard/control UI
  - [ ] serve loopback-only dashboard from the app or CLI
    - partial: `src/main/dashboard-status.ts` defines the loopback-only dashboard descriptor and panel inventory; `src/main/dashboard-data.ts` now composes a read-only snapshot for runtime health, permissions, current turn, replay, smoke evidence, long-horizon state, and alerts from injected evidence or from the local workspace (`package.json`, `dist/skfiy.app`, `dist/skfiy`, app signing state, dashboard PID/uptime, packaged-helper permission status, packaged-helper desktop-session status, user-level Chrome Native Messaging host manifest status, and latest `.skfiy-smoke/*.json` artifacts); `src/main/dashboard-server.ts` now serves `/descriptor.json`, `/snapshot.json`, `/`, and `/index.html` through a real `127.0.0.1` HTTP server; `skfiy dashboard` passes its root directory into the server, starts the clean local URL by default, and `--no-open` starts it without opening a browser; live Electron turn/replay memory and live extension connection health are still pending
  - [ ] follow the OpenClaw-style dashboard pattern while keeping skfiy-specific Computer Use evidence first
    - OpenClaw reference shape: clean local URL opened by CLI, no token in logs, admin/control surface, WebSocket/SSE updates, gateway health, sessions, sub-agent runs, costs, cron/automation state, alerts, and local-only defaults
    - skfiy adaptation: runtime health, permissions, active turn, replay screenshots/actions, app/host policy, extension state, smoke evidence, dogfood/release state, and long-horizon `money-run` supervision
  - [ ] add token/session auth for non-local or explicit remote modes; do not print secrets into terminal output
  - [ ] implement runtime health panel: app/helper/dashboard/extension PIDs, version, uptime, signing state
    - partial: panel metadata exists in `createDashboardPanels()` and `/snapshot.json` now reports package version, app/helper/CLI installation state, app code-signature state, dashboard server PID, dashboard uptime, packaged-helper desktop-session state, and Chrome Native Messaging host manifest state from the product runtime; helper/extension PID, full app uptime, and live extension connection remain pending
  - [ ] implement permissions panel: Screen Recording, Accessibility, Microphone, Speech Recognition, Finder Automation, Chrome extension
    - partial: panel metadata exists in `createDashboardPanels()` and `/snapshot.json` now reads Screen Recording, Accessibility, Microphone, and Speech Recognition state through the packaged helper and reports Chrome extension adapter install state through the Native Messaging host manifest; Finder Automation and live Chrome extension connection remain pending
  - [ ] implement active-turn panel: transcript, voice provider, target app, risk, approvals, stop
    - partial: panel metadata exists in `createDashboardPanels()`
  - [ ] implement replay panel: screenshots, OCR labels, accessibility coverage, actions, verification decisions
    - partial: panel metadata exists in `createDashboardPanels()`
  - [ ] implement evidence panel: latest smoke artifacts, result, product path, blocker reason, stale evidence warning
    - partial: panel metadata exists in `createDashboardPanels()` and `/snapshot.json` now summarizes the latest `.skfiy-smoke/*.json` artifact per smoke target with result, path, product path, mtime, age, stale flag, and blocker when present; dashboard alerts now emit `smoke-evidence-stale` when any latest target artifact is older than 24 hours; HEAD/release identity matching remains pending
  - [ ] implement dogfood/release panel: current alpha, manifest checksum, accepted reports, cohort coverage
    - partial: panel metadata exists in `createDashboardPanels()`
  - [ ] implement long-horizon panel: `money-run` session status, active pane, current recommendation, recent blocker markers
    - partial: panel metadata exists in `createDashboardPanels()`
  - [x] add smoke for `skfiy dashboard --no-open --json` and browser dashboard load
    - `npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed` launches the built `dist/skfiy` CLI, runs `dashboard --no-open --port 0 --json`, fetches `/descriptor.json`, `/snapshot.json`, plus `/`, verifies loopback bind, snapshot panel fields, app signing, dashboard PID/uptime, helper permission evidence, helper desktop-session evidence, Chrome Native Messaging host evidence, token-free output, and shuts the server down after evidence collection
- [x] Add app allowlist/denylist UI.
  - settings panel now exposes allow/ask/deny policies for Ghostty, Chrome, and Finder; Ghostty defaults to allow for the current product smoke path, while ask/deny can gate Computer Use before touching the app
- [x] Add per-turn approval transcript:
  - [x] what app
  - [x] what screenshots
  - [x] what actions
  - [x] what risk level
  - [x] action verification decisions
  - transcript aggregation exists for Computer Use turn events; UI/replay viewer can consume the model next
- [x] Add local replay viewer for debugging.
  - main process stores the latest Computer Use turn transcript plus renderer-visible timeline; right-click settings exposes command, risk, action list, screenshot paths, and event timeline for local debugging
  - external planner turns now preserve provider, planned command, and rationale in the per-turn transcript before execution actions
- [x] Add model/provider config:
  - [x] local deterministic adapter mode
  - [x] external CUA model mode
  - [x] disabled/offline mode
  - planner provider settings now flow through main IPC, preload, and the right-click settings panel
  - runtime gate runs local deterministic mode, fails closed when disabled, verifies external CUA endpoint/key configuration, and can call an external terminal planner before entering the Ghostty safety/execution chain
  - external CUA planner rationale is recorded in the local replay transcript so model decisions remain inspectable during product smoke runs
  - current external CUA product smoke on 2026-06-16: `npm run smoke:ghostty -- --planner-mode external-cua --port 9248` failed closed before helper/Ghostty because `SKFIY_EXTERNAL_CUA_ENDPOINT` was unset, with `runnerHasTmux=false` and no residual processes after cleanup
  - provider path decision recorded in `docs/decisions/2026-06-16-skfiy-cua-provider.md`: keep `local-deterministic` as default, keep `external-cua` as opt-in evaluation, and require `dogfood:verify --require-passed` evidence before any external CUA provider can become a candidate default
- Compare against AIME:
  - AIME Buddy overlap: pet/status/notification
  - AIME Chrome Extension overlap: browser control
  - skfiy gap: native app system-level Computer Use
- Decide integration path:
  - [x] Decision recorded in `docs/decisions/2026-06-16-skfiy-aime-integration.md`.
  - Current path: Option A now, Option B later.
  - Option A: skfiy as standalone experimental shell.
  - Option B: skfiy as AIME native Computer Use plugin.
  - Option C: skfiy only provides helper/runtime, AIME owns UX.
  - Refreshed internal search on 2026-06-16: AIME Desktop overlaps assistant/workflow/local file tasks, AIME Chrome Extension overlaps browser control, AIME Buddy overlaps desktop companion/task notification/status, and native macOS app Computer Use remains the skfiy validation gap unless AIME/AIOS exposes a stable native control plugin/runtime.
- [ ] Internal dogfood with 3-5 real users:
  - [x] cohort verifier/report schema and issue-template fields
  - [x] tester-side GitHub issue body draft generator via `npm run dogfood:issue -- --manifest <path> --tester-id <id> --workflows <ids> --check-report --output <path>`, copying alpha identity, smoke artifact paths, app bundle preflight, UI pet drag evidence, panic stop evidence, permission states, and core evidence from local JSON artifacts before round-tripping the draft through `dogfood:report` and printing `reportPreviewEligibility` from `dogfood:cohort` report-level checks
  - [x] manifest-backed single-report generator and cohort updater via `npm run dogfood:report -- --manifest <path> --issue-url <accepted-issue-url> --report <path> --cohort <path>`
  - [x] report source metadata gate requiring accepted GitHub issue URL and collection timestamp for cohort verification
  - [x] cohort readiness Markdown and JSON summaries via `npm run dogfood:cohort -- --cohort <path> --summary <path> --json-output <path>`
  - [x] GitHub tracking issue for real internal alpha cohort collection: https://github.com/Sskift/skfiy/issues/1
  - [x] GitHub dogfood labels for accepted reports and workflow coverage (`dogfood:accepted`, `workflow:coding-terminal`, `workflow:screenshot-inspection`, `workflow:finder-file`, `workflow:browser-fallback`)
  - [x] `dogfood:report` requires a readable accepted issue body and labels with `gh issue view` by default, deriving tester/workflow metadata, requiring issue alpha manifest/zip/commit identity to match the selected manifest, requiring all five tester smoke artifact paths from the report issue, requiring each smoke JSON `artifactPath` to match its issue-listed path, and persisting `uiPetDragEvidence.verifiedBy=dogfood:report` plus `stopTurnEvidence.verifiedBy=dogfood:report`, while explicit overrides cannot replace issue artifact or alpha identity evidence and `dogfood:cohort` requires accepted issue label metadata, `artifactSource=github-issue-smoke-artifacts`, issue alpha manifest/zip/commit identity, UI pet drag evidence, and stop-turn evidence that matches each report
  - [x] `dogfood:report` readiness now exposes `sourceEligibleReports` and only marks `summary.cohortReady=true` when every report already has final source/artifact identity, 3-5 testers, and full workflow coverage
  - [x] `dogfood:cohort` workflow coverage now counts only source/artifact/UI-pet-drag/stop-turn/permission/identity-eligible real tester reports
  - [x] `dogfood:cohort` and `dogfood:status` now exclude reserved local synthetic tester ids such as `local-*`, `prepare-*`, `preflight-*`, and `synthetic-*` from the 3-5 real tester gate, workflow coverage, and passed workflow coverage
  - [x] `dogfood:cohort --summary` now separates source-eligible workflow coverage from passed workflow coverage, so permission-blocked evidence cannot be described as a passed product workflow
  - [x] `dogfood:cohort --json-output <path>` now persists the final cohort gate result, checks, blocking errors, workflow coverage, and passed workflow coverage as machine-readable JSON without relying on stdout capture
  - [x] `dogfood:cohort --require-passed` now fails the cohort unless each required workflow has at least one accepted real tester report whose `Computer Use result` is `passed`
  - [x] maintainer-side tracking issue collector via `npm run dogfood:collect -- --manifest <path> --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --reports-dir .skfiy-dogfood/reports --cohort .skfiy-dogfood/internal-alpha-cohort.json --summary .skfiy-dogfood/internal-alpha-summary.md`, which discovers accepted report issue URLs from the tracking issue's `Required Real Tester Count` slots, converts each issue through the existing `dogfood:report` gates, writes deterministic per-tester report JSON, and immediately runs `dogfood:cohort`
  - [x] non-mutating dogfood readiness status via `npm run dogfood:status -- --manifest <path> --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --summary .skfiy-dogfood/status.md`, summarizing local smoke results, permission blockers, accepted report URL count, and per-issue current-alpha/accepted-label validation without creating evidence or claiming cohort readiness; `--require-current-head` is reserved for validating a freshly built local alpha before publication, not for published-release coordination from later commits
  - [x] `dogfood:status` now compares the selected alpha manifest commit with current git HEAD when available, warning maintainers to publish a fresh alpha before assigning new dogfood testers or intentionally continue with the older selected alpha; `--require-current-head` keeps this as a strict pre-publication gate
  - [x] `dogfood:status` now distinguishes docs/evidence-only commits from app-build input changes, so publishing release evidence after an alpha does not incorrectly ask maintainers to cut a fresh app artifact
  - [x] dogfood status now reports workflow coverage from verified accepted real tester report issues for `coding-terminal`, `screenshot-inspection`, `finder-file`, and `browser-fallback`, so maintainers can steer the next real tester before running `dogfood:collect` without treating tracking checklist boxes or local synthetic evidence as real coverage
  - [x] dogfood status now reports passed workflow coverage separately from verified accepted workflow coverage, using linked real tester report issue `Computer Use result: passed` as the source of passed product-path evidence
  - [x] dogfood status recommended review commands now pass through the same GitHub `--tracking-issue-url`, so maintainer review emits tracking-slot update commands for the intended cohort issue rather than falling back to the default
  - [x] dogfood status recommended tester ids now skip tester ids already parsed from linked report issues, avoiding artifact directory and cohort replacement collisions when existing real reports use non-contiguous ids
  - [x] dogfood status recommended tester/review commands now use a prepared-alpha manifest placeholder instead of maintainer-local absolute manifest paths, so the copied command is portable to a tester machine after `dogfood:prepare-alpha`
  - [x] dogfood tracking issue and handoff generated commands now carry the same `--tracking-issue-url` through prepare/review flows, keeping workflow inference and accepted-report slot updates attached to the intended cohort issue
  - [x] dogfood tracking issue generated tester/review commands now use the prepared-alpha manifest placeholder instead of the maintainer-local `.skfiy-alpha` manifest path, so testers can run `dogfood:prepare-alpha` first and copy the resulting manifest path into their evidence run
  - [x] dogfood tracking issue body now includes `Desktop Session Preflight`, instructing testers to run `smoke:desktop-session` before `--require-passed` and to treat locked console, `com.apple.loginwindow`, display sleep, or black-screen evidence as desktop-session blockers
  - [x] tester handoff generator via `npm run dogfood:handoff -- --manifest <path> --tester-id <id> --release-url <url> --output <path>`, which writes alpha zip identity, SHA256, optional GitHub release URL, no-tmux rules, permission setup, exact tester command, filing instructions, and maintainer review commands without creating reports or accepting evidence
  - [x] tester-side one-command evidence runner via `npm run dogfood:tester -- --manifest <path> --tester-id <id> --workflows <ids> --artifacts-dir <dir> --issue-output <path> --summary <path>`, which refuses tmux, runs packaged-app UI/Ghostty/Chrome/Finder/voice smokes sequentially, then generates a checked issue body from the exact artifacts it wrote without accepting GitHub reports
  - [x] `dogfood:tester --file-issue` can explicitly create the generated GitHub dogfood report issue after local report validation, while still refusing to add `dogfood:accepted`, workflow labels, tracking issue links, or cohort entries
  - [x] `dogfood:prepare-alpha`, `dogfood:tracking-issue`, `dogfood:status`, and `dogfood:handoff` now recommend tester commands with `--file-issue`, so real testers can create the report issue directly after evidence collection while maintainer acceptance remains gated
  - [x] `dogfood:tester` now defaults missing `--app` to `dist/skfiy.app` and validates the selected app bundle before running product smokes, rejecting non-`skfiy.app` paths or `Info.plist` identities that are not lowercase `skfiy` with bundle id `com.sskift.skfiy`
  - [x] `dogfood:tester app bundle preflight` now runs `codesign --verify --deep --strict` and rejects bundles whose designated requirement does not include `designated => identifier "com.sskift.skfiy"` before any product smoke runs
  - [x] release dogfood handoff and runner now support `--app <path-to-unzipped-skfiy.app>`, so remote testers can explicitly run the app bundle extracted from the GitHub alpha zip instead of accidentally collecting evidence against a locally rebuilt `dist/skfiy.app`
  - [x] strict tester runs now fail fast after the first UI permission preflight when `--require-passed` is set and provider-relevant permissions are missing, instead of continuing into expected-failing Ghostty/Chrome/Finder/voice smokes. They also run a strict desktop-session preflight from that UI smoke: locked console, `com.apple.loginwindow`, display sleep, or black-screen evidence stops before Ghostty/Chrome/Finder/voice and writes a failed `Desktop Session Preflight` section in the summary instead of collecting misleading product smoke failures. Current design note: default external Doubao voice requires Screen Recording and Accessibility for Computer Use; Microphone and Speech Recognition are blockers only for optional browser/native speech provider evidence.
  - [x] tester-side alpha preparation via `npm run dogfood:prepare-alpha -- --release-url <url> --tester-id <id> --execute`, which downloads the GitHub alpha zip and manifest, verifies the zip SHA256 against the manifest, rejects extracted app bundles whose `Info.plist` identity is not lowercase `skfiy` with bundle id `com.sskift.skfiy`, extracts `skfiy.app`, and generates a handoff pointing `dogfood:tester` at that extracted app without creating or accepting reports
  - [x] `dogfood:prepare-alpha` now emits copyable `nextCommands.tester` and, for real tester preparations, `nextCommands.review` with the prepared manifest path, app path, assigned workflows, and tracking issue review argument filled in, so testers do not need to reconstruct portable command placeholders by hand
  - [x] `dogfood:prepare-alpha`, `dogfood:handoff`, `dogfood:status`, `dogfood:tracking-issue`, and `dogfood:tester --file-issue` now propagate `--tracking-issue-url` into tester commands and filed-run summaries, so the maintainer review command created after a real tester files a report is already linked back to the intended cohort issue
  - [x] `dogfood:tracking-issue` and `dogfood:status` now instruct real testers to copy `nextCommands.tester` and `nextCommands.review` from `dogfood:prepare-alpha` after download, and the generic tracking issue runner no longer suggests a guessed `/Applications/skfiy.app` path
  - [x] `dogfood:status` and `dogfood:tracking-issue` now generate `dogfood:prepare-alpha` commands with `--tracking-issue-url`, letting `dogfood:prepare-alpha` infer each tester's assigned workflows from the tracking issue body or current alpha assignment packet comments instead of duplicating workflow arguments in the prepare step
  - [x] `dogfood:prepare-alpha` default GitHub issue reads now request both `body` and `comments`, so workflow inference from posted assignment packet comments works in the real CLI path, not only in injected tests
  - [x] `dogfood:status` now exposes `readiness.canRunPassedCohort` and a `Passed cohort gate ready` summary line, keeping non-strict report collection readiness separate from the final `dogfood:cohort --require-passed` gate, and rejects accepted issue links whose body lacks UI pet drag evidence
  - [x] when accepted report coverage is complete but passed workflow coverage is missing, `dogfood:status` now emits `passed-workflow-evidence` assignments whose prepare/tester commands include `--require-passed`, and `dogfood:prepare-alpha --require-passed` propagates strict mode into the handoff and `nextCommands.tester`
  - [x] maintainer-side non-mutating report review via `npm run dogfood:review -- --manifest <path> --issue-url <filed-report-issue-url> --summary <path>`, which reads the filed issue body, validates alpha/artifact identity through the manifest-backed `dogfood:report` parser with synthetic suggested labels, and reports suggested labels plus copy-safe acceptance and real-tester tracking issue commands before maintainers apply `dogfood:accepted`
  - [x] `dogfood:review --execute` now keeps the same validation gate but lets maintainers add the missing `dogfood:accepted` / `workflow:*` labels and refresh the tracking issue in one explicit post-review step
  - [x] `dogfood:review` now writes a structured `Result: rejected` summary with the blocking validation error when alpha/artifact checks fail, while still exiting failed and withholding acceptance/tracking commands
  - [x] `dogfood:tracking-issue` accepts repeatable `--accepted-report-url` arguments, deduplicates them with existing report links, and fills the next real tester slots in a dry-run body before maintainers edit GitHub
  - [x] non-mutating tester assignment packet, packaging the current `dogfood:status` recommended prepare/tester/review commands into copy-safe Markdown without creating reports, adding labels, updating cohort JSON, or marking evidence accepted:
    ```bash
    npm run dogfood:assignments -- \
      --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
      --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
      --output .skfiy-dogfood/assignments/skfiy-alpha-<commit>.md \
      --json-output .skfiy-dogfood/assignments/skfiy-alpha-<commit>.json
    ```
    - assignment packet now includes `App Bundle Preflight`, telling testers that `dogfood:tester` verifies the selected `skfiy.app` identity, runs `codesign --verify --deep --strict`, and requires `designated => identifier "com.sskift.skfiy"` before product smokes
    - assignment packet now includes `Desktop Session Preflight`, surfacing locked console, `com.apple.loginwindow`, and display-sleep blockers and instructing testers not to add `--require-passed` until `smoke:desktop-session` passes on their machine
    - assignment packet now includes `Permission Preflight`, listing Screen Recording, Accessibility, Microphone, and Speech Recognition states and instructing testers to add `--require-passed` only after provider-relevant permissions are granted to the extracted `skfiy.app` and desktop session preflight is clear; for the default external Doubao path, that means Screen Recording and Accessibility
    - assignment packet now includes `Evidence Preview Gate`, instructing testers to confirm `reportPreviewEligibility.eligible=true` before filing and preserving UI pet drag evidence plus panic stop evidence from `runtimeStatus.stopTurnHotkey` and `stopTurnBehavior` when the preview is blocked
    - assignment packet can now write `--json-output <path>` with the tester split, app bundle preflight, desktop session preflight, permission preflight, evidence preview gate, next actions, and GitHub issue comment command for dashboards and follow-up agents without scraping Markdown
    - assignment packet dry-run now exposes a GitHub issue comment command, while `--execute` posts the packet to the tracking issue as a GitHub issue comment without accepting evidence
    - assignment packet now includes `Packet schema: dogfood-assignments-v2`, and `dogfood:status` marks current-alpha assignment comments without that schema as stale so changed tester handoffs are reposted before the next dogfood run
  - [x] `dogfood:status` now reads GitHub tracking issue comments and reports whether the current `skfiy-alpha-<commit>` tester assignment packet with `App Bundle Preflight`, `Desktop Session Preflight`, `Permission Preflight`, and `Evidence Preview Gate` is already posted, adding a next action when assignments exist but the current packet comment is missing or stale
  - [x] dogfood status now validates tracking issue body `Desktop Session Preflight` and emits a `dogfood:tracking-issue --execute` refresh command when that tester guidance is missing
  - [x] stale `docs/release-evidence/latest-alpha.json` now blocks `dogfood:status` collect readiness so maintainers cannot collect a cohort against an older published alpha by accident
  - [x] `dogfood:status` now treats missing smoke artifact JSON as explicit `missing` local smoke evidence with a next action, instead of aborting the readiness report before maintainers can see what needs to be regenerated
  - [x] `dogfood:status --json-output <path>` now persists the same machine-readable status object as clean JSON, so dashboards, follow-up agents, and assignment automation can consume tester assignments, next actions, alpha identity, and coverage without scraping npm stdout
  - [x] `dogfood:status` now turns locked/loginwindow/black-screen desktop-session blockers into executable next actions, including the `smoke:desktop-session` rerun command and the reminder to rerun Ghostty, Finder, and voice product smokes with `--require-passed` only after desktop preflight passes
  - [x] `dogfood:status` now treats authoritative `smoke:desktop-session` direct-helper Screen Recording, Accessibility, and Microphone `status` fields as permission evidence while keeping non-authoritative Speech Recognition readings diagnostic-only, so a locked desktop is not mistaken for missing Computer Use permissions
  - [x] `dogfood:status` now suppresses tester assignment commands when the selected alpha is behind current HEAD app-code changes, forcing maintainers to publish a fresh alpha before collecting new dogfood evidence against stale binaries
  - [ ] `coding-terminal` workflow reports from actual testers
  - [ ] `screenshot-inspection` workflow reports from actual testers
  - [ ] `finder-file` workflow reports from actual testers
  - [ ] `browser-fallback` workflow reports from actual testers
  - [ ] `npm run dogfood:cohort -- --cohort <path>` passing on the collected cohort JSON
  - [ ] `npm run dogfood:cohort -- --cohort <path> --require-passed` passing on the collected cohort JSON

## Staffing and Workload Estimate

Minimum meaningful effort: 4 weeks, 2-3 engineers.

- Engineer A: macOS shell, permissions, packaging, pet UI.
- Engineer B: voice stack, ASR providers, transcript lifecycle.
- Engineer C: app-agnostic Computer Use core, target adapters, eval harness.

With one engineer, the same scope is closer to 6-8 weeks because packaging, ASR, app control, and safety all block each other.

## Technical Decisions

1. Use Electron for the current prototype only if we can package and stabilize permissions quickly. If overlay/focus remains fragile, migrate shell to SwiftUI and keep React only for internal panels.
2. Treat Doubao Input Method as an input provider, not a core dependency.
3. Prefer structured control where available, visual Computer Use where necessary.
4. Every Computer Use turn must create a replay log. Without replay, debugging and trust will not scale.
5. Ghostty is the first isolated terminal fixture; the durable product boundary is the app-agnostic observe-plan-act-verify runtime for arbitrary local apps.

## Open Questions

1. Are we allowed to use internal/cloud ASR for dogfood audio, or must the alpha be local-only?
2. Do we target macOS only for the next month, or design Windows abstractions now?
3. Which arbitrary-app scenarios should define the next fixtures after the current Ghostty/Chrome/Finder/tmux set: browser research, Lark office work, Finder organization, design tools, or coding assistant orchestration?

## Recommended Next Move

Do not add more random UI features. The native desktop-control foundation now exists: stable app identity, permission onboarding, packaged helper attribution, dedicated Ghostty session isolation, replay logs, and fail-closed desktop-session preflight are implemented. The next implementation milestone is field proof:

1. Write the Chrome extension architecture note first, based on Codex Chrome extension public behavior and current local extension surface; then implement the skfiy Manifest V3 extension plus native messaging host.
2. Field-prove the packaged CLI, dashboard, and Codex plugin install path before adding more UI controls: `skfiy status`, `skfiy doctor`, `skfiy dashboard`, `skfiy chrome status/install-host`, `skfiy mcp serve --stdio`, and `skfiy smoke codex-plugin` are now the operator entry points to harden.
3. Keep expanding the dashboard/control UI as a local audit surface for permissions, current turn, replay, smoke evidence, extension state, dogfood/release state, and `money-run` supervision.
4. Complete the product-path native speech turn after Speech Recognition permission is granted.
5. Unlock and keep the tester Mac awake, rerun `smoke:desktop-session`, then rerun Ghostty, Finder, Chrome extension, dashboard, Codex plugin, and voice product smokes with `--require-passed` after `smoke:desktop-session` passes.
6. Collect 3-5 accepted real tester reports covering `coding-terminal`, `screenshot-inspection`, `finder-file`, `browser-fallback`, and one extension-backed logged-in Chrome workflow.
7. Run `dogfood:collect`, `dogfood:cohort`, and the strict `dogfood:cohort --require-passed` gate on those accepted reports.
8. Run the long-horizon `money-run` supervision field task after release gates pass, preserving product-path launch, approval, screenshot/action verification, stop behavior, dashboard visibility, and `tmuxSupervisionReport` evidence.

This moves skfiy from a locally demonstrated Computer Use foundation to the evidence AIME does not yet cover: native desktop control with voice-first, pet-visible, permissioned execution that survives real tester machines and long-horizon supervision.

## Sources Checked

External:

- OpenAI API Computer Use guide: https://developers.openai.com/api/docs/guides/tools-computer-use
- OpenAI Codex app Computer Use guide: https://developers.openai.com/codex/app/computer-use
- OpenAI Codex Chrome extension guide: https://developers.openai.com/codex/app/chrome-extension
- OpenAI Codex plugins guide: https://developers.openai.com/codex/plugins
- OpenAI Codex build plugins guide: https://developers.openai.com/codex/plugins/build
- Model Context Protocol stdio transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Local Codex manual refresh on 2026-06-20: `/var/folders/3s/779dy7bj14g6nkh43dcw_jj40000gn/T/openai-docs-cache/codex-manual.md`
- OpenClaw dashboard docs: https://docs.openclaw.ai/web/dashboard
- OpenClaw dashboard CLI docs: https://docs.openclaw.ai/cli/dashboard
- OpenClaw Dashboard reference implementation: https://github.com/mudrii/openclaw-dashboard
- Mission Control / Autensa OpenClaw dashboard article: https://pub.towardsai.net/mission-control-an-orchestration-dashboard-for-openclaw-c3454f959b15
- Anthropic computer use announcement: https://www.anthropic.com/news/3-5-models-and-computer-use
- Microsoft Copilot Studio Computer Use: https://learn.microsoft.com/en-us/microsoft-copilot-studio/computer-use
- Microsoft Power Automate Desktop flows: https://learn.microsoft.com/en-us/power-automate/desktop-flows/introduction
- Apple macOS Voice Control commands: https://support.apple.com/guide/mac-help/use-voice-control-commands-mh40719/mac
- Raycast AI: https://www.raycast.com/core-features/ai
- Wispr Flow: https://wisprflow.ai/
- Superwhisper: https://superwhisper.com/
- Talon Voice: https://talonvoice.com/
- Electron custom window styles: https://www.electronjs.org/docs/latest/tutorial/custom-window-styles
- Electron BaseWindow options: https://www.electronjs.org/docs/latest/api/base-window

Internal search:

- `bytedcli insearch query "AIME 桌面 助手 computer use"` across Ask, BitsAI, ByteTech.
- `bytedcli insearch query "豆包输入法 语音 快捷键 ASR Mac"` across Ask, BitsAI, ByteTech.
- `bytedcli insearch query "电脑控制 agent screenshot click type desktop"` across Ask, BitsAI, ByteTech.

Key internal references surfaced:

- Aime 个人助理使用说明.
- Aime Chrome Extension说明文档.
- 在 Aime 工作的时候陪伴你: Aime Buddy.
- 豆包输入法Mac版使用说明文档.
- feishu_asr: 一个 macOS 菜单栏全局语音输入工具.
- Computer Use Agent 主流方案调研分析报告.
- 提示工程的操控密码: Computer-Using Agent.
- BrowserUseAgent 热点项目深度对比调研.
