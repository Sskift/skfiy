# skfiy

skfiy is a voice-first macOS Computer Use runtime with a pixel desktop pet,
packaged CLI, local dashboard, and app adapters for local experiments. It is
designed as an app-agnostic desktop control runtime: observe any visible macOS
app, decide the next action, execute clicks/typing/dragging/hotkeys, then verify
the result from screenshots, OCR, accessibility metadata, and replay events.
Ghostty, Chromium/Chrome, Finder, screenshots, and tmux supervision are the
first real regression fixtures, not the product boundary.

The first version keeps the public surface narrow while the control loop is
hardened: voice enters through the desktop pet, app policy gates the target,
Computer Use performs observe-plan-act-verify, and task state remains visible in
the floating companion. The pet art is now manifest-driven and separate from
the backend: skfiy first looks for a local `luoxiaohei-local` skin pack under
the user's Application Support directory, then falls back to bundled original
skins when no local origin art has been imported.

## Current Local Evidence

Use the short git commit in local artifact file names. For the current machine,
the latest Finder smoke is currently blocked before Finder launch because the
desktop session is at `com.apple.loginwindow`; older Finder evidence also shows
that Finder item drag/drop still needs an unlocked, awake desktop to prove the
compiled `skfiy.app` Automation path.

- UI permission and pet drag smoke: passed,
  `.skfiy-smoke/ui-<commit>.json`.
- Ghostty terminal-adapter smoke: passed,
  `.skfiy-smoke/ghostty-<commit>.json`.
- Chromium/Chrome Computer Use smoke: passed,
  `.skfiy-smoke/chrome-<commit>.json`.
- Binary CLI command matrix smoke: repeatable product gate,
  `.skfiy-smoke/cli-<commit>.json`.
- Dashboard CLI smoke: repeatable product gate,
  `.skfiy-smoke/dashboard-<commit>.json`.
- Codex plugin MCP smoke: packaged CLI product gate,
  `.skfiy-smoke/codex-plugin-<commit>.json`.
- Doubao text-bridge voice smoke: passed,
  `.skfiy-smoke/voice-<commit>.json`.
- Long-horizon `money-run` tmux supervision smoke: passed,
  `.skfiy-smoke/money-run-<commit>.json`.
- Finder item drag/drop smoke: blocked by desktop preflight on the latest run,
  `.skfiy-smoke/finder-<commit>.json`.

The latest Finder blocker is separate from Screen Recording, Accessibility, and
Finder Automation. If the artifact reports `com.apple.loginwindow`, unlock the
Mac and keep the display awake first; if it then reports an Automation blocker,
grant the compiled `skfiy.app` permission to control Finder and rerun:

```bash
npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed --output .skfiy-smoke/finder-<commit>.json
```

Alpha artifact generation is intentionally separate from local smoke evidence.
After the required smokes pass for a commit, generate release/dogfood artifacts
with the alpha script instead of keeping stale zips around:

```bash
npm run alpha:artifact
```

Generated evidence directories are ignored by git. Keep only the current commit
artifacts needed for active debugging and dogfood status; old alpha zips,
historic smoke output, stale dogfood downloads, `.DS_Store`, and helper build
caches can be deleted locally.

## Documentation Map

- [docs/README.md](docs/README.md): repository documentation index, archive
  policy, and local artifact cleanup rules.
- [docs/development-workflow.md](docs/development-workflow.md): mandatory
  product-path testing contract for user-visible work.
- [docs/internal-alpha-build.md](docs/internal-alpha-build.md): unsigned alpha
  artifact, GitHub pre-release, dogfood, and cohort workflow.
- [docs/chrome-extension-setup.md](docs/chrome-extension-setup.md): manual
  unpacked extension install, native host setup, and bridge diagnostics.
- [docs/research/](docs/research/): historical research and implementation
  notes. Fold durable operational instructions back into the README or workflow
  docs instead of treating old plans as live checklists.

## MVP Scope

- Floating desktop companion with active and quiet modes.
- Manifest-driven pixel pet skins, with a local `luoxiaohei-local` origin skin
  preferred when installed, bundled black-cat fallback, and previous cloudbot
  kept as a legacy built-in.
- App-agnostic macOS helper primitives for app listing, app activation,
  screenshots/OCR, clicks, drags, scrolls, text input, hotkeys, and key presses.
- Target-specific adapters for early fixtures: Ghostty terminal turns, Chrome
  page observation/actions, Finder file operations, and tmux supervision.
- App policy and action risk gates before execution.
- Explicit approval for risky actions or actions that can modify local state.
- Local-only execution. The helper does not send screenshots or command output
  to a remote service by itself.

## Desktop Pet Skins

The desktop pet renderer is intentionally independent from the backend. The
main process emits task status such as `idle`, `executing`, `waiting`, or
`failed`; the renderer maps those states to the selected skin manifest and atlas.
At startup, the packaged app asks the main process for the local
`luoxiaohei-local` skin. If present, that user-owned skin wins. If it is missing
or invalid, the renderer falls back to the bundled original `skfiy-black-cat`
skin, while the older `skfiy-cloudbot` skin remains a legacy built-in.

Import a local origin image exported from an authorized source:

```bash
./dist/skfiy skin import \
  --source ~/Downloads/luoxiaohei-origin.png \
  --slug luoxiaohei-local \
  --display-name "Luo Xiaohei local" \
  --license-source canva-local \
  --json
```

This copies the image into:

```text
~/Library/Application Support/skfiy/skins/luoxiaohei-local/
```

and writes `skin.pet.json` with `redistribution: "local-only"` metadata. The
importer supports PNG, GIF, WebP, SVG, and JPEG. A single image becomes a
one-frame skin immediately; a later importer pass should pack multiple official
sticker/GIF frames into an 8-by-9 atlas.

A skin is a `.pet.json` manifest plus an atlas image:

```json
{
  "displayName": "licensed local cat",
  "slug": "licensed-local-cat",
  "asset": "file:///Users/me/Library/Application%20Support/skfiy/skins/cat/atlas.png",
  "frameWidth": 192,
  "frameHeight": 208,
  "columns": 8,
  "rows": 9,
  "states": {
    "idle": { "row": 0, "frames": 6, "frameMs": 170 }
  }
}
```

Every skin must define all renderer states: `idle`, `running-right`,
`running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, and
`review`. During local prototype work, a custom manifest can also be stored in
`localStorage` under `skfiy.petSkin.customManifest`, with
`skfiy.petSkin.selectedId` set to the same slug. The packaged-product path is
the `skin import` command above, because it keeps user-provided art outside git
and outside public release assets.

For the Luo Xiaohei direction, use only official or otherwise licensed images in
private/local skin packs; do not commit those assets to this public repository
or include them in release artifacts without permission. The best crop target is
the cat-form, avatar/sticker-like pose: full ears visible, tail included when it
does not make the figure too wide, alpha/flat background preferred, bottom
center aligned, and padded by roughly 12-16% after trimming transparent or flat
background bounds. Export a consistent 8-by-9 atlas at 192x208 per frame so the
existing animation mapping can drive idle, run, wave, jump, failed, waiting,
running, and review states.

## macOS Permissions

The app needs two system permissions before it can execute Computer Use actions:

- **Screen Recording**: allows screenshots of the desktop or target window.
- **Accessibility**: allows synthetic clicks, typing, key presses, and window
  focus changes.

Voice input is provider-specific. The default path uses Doubao Input Method as
an external text bridge, so skfiy does not embed Doubao and does not need
macOS Speech Recognition permission for that default path. **Microphone** is
needed only for browser or local native speech providers. **Speech Recognition**
is needed only when intentionally selecting the optional `native-macos`
provider.

Open **System Settings > Privacy & Security** and grant these permissions to the
compiled `skfiy.app` bundle used for local validation.

Right-click the pet to view the current Screen Recording, Accessibility,
Microphone, and Speech Recognition status, or to jump to the matching System
Settings pane. The permission onboarding blocks only the permissions required by
the selected voice provider.

## Doubao Dictation

Left-click the desktop pet to enter skfiy's dictation flow. Right-click the pet
for settings details and ASR provider switching. By default skfiy selects Doubao
Input Method as the text bridge and sends a skfiy-owned voice shortcut:
`Control+Option+Command+Shift+Space`. Configure Doubao Input Method's voice
shortcut to the same chord if you want Doubao's native speech recognition to
write into skfiy's transcript area.

Choose the browser provider in settings to skip Doubao triggering and use
Chromium Web Speech fallback for the next voice turn. Choose the macOS provider
to use skfiy's local one-shot Speech framework prototype; it listens until a
short silence timeout or a maximum duration, then streams the final transcript
back into the same Computer Use path.

Before a voice transcript can enter Computer Use, skfiy now applies a
main-process admission gate: streaming ASR providers must produce a final
transcript, submitted text must match that final candidate, low-confidence
candidates ask for clarification, and chat/unsupported requests are routed away
from desktop control. Doubao remains supported as a text bridge when it cannot
provide per-candidate confidence.

For native macOS speech dogfood, tune the bounded listening turn with
`SKFIY_NATIVE_SPEECH_LOCALE`, `SKFIY_NATIVE_SPEECH_MAX_DURATION_MS`, and
`SKFIY_NATIVE_SPEECH_SILENCE_TIMEOUT_MS`. The defaults are `zh-CN`, `7000`,
and `900`.

Press `Escape` while the pet has focus, or `Control+Option+Shift+Escape`
globally, to stop the current voice or task turn.

Set `SKFIY_DOUBAO_VOICE_TRIGGER=none` to disable native shortcut triggering and
fall back to Chromium Web Speech. That browser engine can fail with a `network`
error in restricted environments even when microphone permission is already
granted. For local compatibility experiments only, launch with
`SKFIY_DOUBAO_VOICE_TRIGGER=fn-double-tap` to restore the legacy Fn double-tap
trigger.

## Safety Model

skfiy treats each Computer Use turn as permissioned app control, with
target-specific risk on top. Terminal control is currently the strictest adapter
because shell commands can mutate the whole machine.

- Read-only commands such as `pwd`, `ls`, `date`, and `whoami` can run without
  an extra approval pause.
- Local state changes such as `mkdir demo` pause for approval and require the
  Approve button before execution.
- Destructive, privileged, piped installer, or automation commands such as
  `rm -rf`, `sudo`, `curl ... | sh`, and `osascript` require explicit approval
  and should be denied by default in the MVP.

## Operator CLI and Dashboard

The product runtime is the compiled app bundle plus packaged CLI:
`dist/skfiy.app` owns the macOS permission identity, and `dist/skfiy` is the
operator command shipped beside it. Source-tree launchers are development
helpers only.

The local dashboard is an audit plane, not the primary pet UI. It binds to
`127.0.0.1`, keeps tokens out of stdout by default, and exposes runtime health,
permissions, current turn, replay, smoke evidence, extension state, and
long-horizon supervision. The extension state currently includes packaged CLI
Native Messaging host manifest evidence plus the latest local extension
heartbeat from `chrome-extension-connection.json`. The dashboard also exposes
`/api/chrome-host-policy` so local operator flows can show, set, and reset the
same Chrome host policy used by the CLI and MV3 native-host bridge.
`smoke:dashboard` seeds an isolated `runtime-snapshot.json` fixture and requires
`/snapshot.json` to expose real `currentTurn` and `replay` fields from that
runtime snapshot before dashboard evidence can pass. Runtime snapshots include
bounded approval/stop state, latest action, latest verification, latest
screenshot, timeline tail, and replay summaries so the dashboard can inspect the
current Computer Use turn without reading full raw transcripts.

`skfiy status --json` includes a top-level `readiness` summary for runtime,
dashboard, extension, and `money-run`. It also performs a read-only tmux probe of
`money-run` and reports `mutatesSession: false`, so dashboards and plugin
adapters can show long-horizon readiness without controlling the session.
`skfiy dashboard --json` returns the loopback URL, server PID, auth/update
metadata, event-store contract, and matching descriptor in one token-free
launcher response. It also writes
`~/Library/Application Support/skfiy/dashboard-server.json`, so
`skfiy status --json` and `skfiy doctor --json` can auto-discover the current
dashboard, verify the recorded PID, and probe the descriptor plus
`/api/chrome-host-policy` without requiring `--dashboard-url`.
Dashboard alerts now use stable blocker codes for locked `loginwindow` sessions,
display sleep, missing TCC grants, stale Chrome extension heartbeats, stale smoke
evidence, and release drift. The dashboard also reads the latest Finder smoke
artifact so a desktop-preflight blocker such as `com.apple.loginwindow` is shown
as `finder-automation-unproven` instead of being misread as a Finder Automation
grant failure. The dashboard shell groups those alerts into Desktop session,
Permissions, Chrome bridge, Smoke evidence, Release drift, and Runtime snapshot
bands so operators see the failing domain before opening raw JSON.

The Chrome smoke now also records `installedExtensionRun`; on this machine it is
a known blocker because branded `Google Chrome` 146 no longer honors automated
`--load-extension` unpacked extension loading, so `smoke:chrome` now auto-prefers
Google Chrome for Testing or Chromium for the installed-extension proof when
either app is available. Use `--extension-chrome-app <name>` to force that
browser; otherwise the live extension path remains a clear environment blocker
on machines with only branded Chrome. The MV3 extension status response exposes
extension version, capabilities, Native Messaging policy sync state, host-policy
entry counts, native bridge state, native launch origin, message type, and the
latest native-host error for popup and smoke diagnostics. The native-host status
also reports expected vs installed `allowed_origins`, missing extension ids, and
manifest mismatch fields so a stale Chrome extension id is diagnosable without
opening the manifest by hand. When skfiy host policy allows a Chrome host, the
MV3 adapter still checks Chrome's optional host permission before injecting the
content script; missing permission returns a typed
`chrome_host_permission_missing` blocker instead of silently requesting
permission.
The extension diagnostics now include `pageControl` readiness from both the
content script and background service worker: active tab state, host policy,
Chrome host permission, content-script loaded state, screenshot availability,
DOM action availability, click/fill/submit/scroll capabilities, page safety, and
sensitive pause.
The MV3 worker also exposes a read-only `skfiy.page_control.health` protocol so
`smoke:chrome` can prove the extension's manifest permissions, content-script
file, optional host-permission model, and page-control readiness without
requesting broader site access.
`smoke:chrome` now also requires `nativeHostBridgeRun.result: passed` from the
packaged `dist/skfiy -> Chrome Native Messaging heartbeat` path before Chrome
browser-control evidence can count as passed, and installed-extension evidence
must prove that the native host responded for the same `chrome-extension://.../`
origin reported by the loaded adapter. It also records
`installedExtensionRun.pageControlHealth`, `readinessSnapshot`, `blockers`, and
`remediation`; when branded Chrome prevents automated unpacked loading, the
artifact stays typed as `branded_chrome_load_extension_removed` and recommends
Chrome for Testing or Chromium. The same artifact writes a top-level
`pageControl` readiness object, including unavailable/browser-blocker evidence
when the worker cannot be probed.
The extension path is an enhanced browser-control channel, not a replacement for
OS Accessibility or Screen Recording: Chrome can provide structured DOM,
current-tab, screenshot, download, and host-policy evidence, while arbitrary app
control still needs the desktop Computer Use layer for app activation, windows,
global screenshots, pointer/keyboard actions, and non-browser UI.
For manual extension install, Native Messaging manifest setup, heartbeat checks,
current-tab readiness, and blocker triage, see
[docs/chrome-extension-setup.md](docs/chrome-extension-setup.md).
`./dist/skfiy chrome extension-info --json` prints the local unpacked extension
path, manifest summary, Chrome Extension Manager handoff steps, and copyable
`chrome install-host` / `chrome status` commands for the extension id Chrome
shows after loading.
`./dist/skfiy chrome reload-extension --extension-id <id> --target-tab-id <tab>`
clicks the unpacked-extension reload control through desktop Computer Use, then
opens the extension wake page with `skfiyTargetTabId` so the popup heartbeat
observes that real Chrome tab instead of the popup itself. If Chrome reports
`chrome_host_permission_missing`, the extension popup shows **Grant site access**;
that Chrome permission prompt still requires an explicit user approval.

```bash
./dist/skfiy status --json
./dist/skfiy doctor --json
./dist/skfiy dashboard --no-open --port 0 --json
./dist/skfiy chrome extension-info --json
./dist/skfiy mcp serve --stdio
./dist/skfiy smoke money-run --output .skfiy-smoke/money-run.json --json
```

Use `./dist/skfiy doctor --json --extension-id <id>` before real desktop tests;
add `--dashboard-url <url>` only when you want to override the auto-discovered
local dashboard. The doctor output includes a `preflight` block with
the packaged app/helper/CLI paths, code-signature state, dashboard descriptor
and Chrome host-policy API reachability, Chrome extension/native-host state, and
the user-level Chrome host policy file path. It also includes
`preflight.finder.latestSmoke` and `preflight.finder.automation`, derived from
the newest `.skfiy-smoke/finder*.json` artifact, so locked/asleep desktop
preflight blockers are separated from real Automation permission blockers.
`status`, `doctor`, and `chrome status` also expose
`extension.capabilities.pageSafety` plus `extension.pageSafety` /
`preflight.chrome.pageSafety` evidence so automation can verify the Native
Messaging, ask-by-default host policy, and recent `skfiy.page.observe` heartbeat
needed for Chrome page-safety. They now also expose structured
`extension.pageControl` / `preflight.chrome.pageControl` readiness, including
whether page control is ready, policy/permission blocked, or not yet probed.
`skfiy status --json` also includes an `evidence` block for CLI-only operator
checks: packaged app/CLI/helper readiness, `extension.pageControl`, the current
runtime snapshot turn summary from `runtime-snapshot.json`, and the newest
dashboard smoke artifact summary from `.skfiy-smoke/dashboard*.json`. If the app
has written `runtime-turn-marker.json` but `runtime-snapshot.json` is missing or
older than the turn evidence, the CLI reports `missing-after-turn` or
`stale-after-turn` with marker age/path evidence instead of calling the machine a
clean `freshInstall`. Running `skfiy status` without `--json` prints the same
high-signal readiness fields as a stable short text summary.

`plugins/skfiy/.mcp.json` points Codex at the installed `skfiy mcp serve
--stdio` command. The Codex plugin is an adapter to the installed product, not a
runtime replacement; desktop control still goes through skfiy's app policy,
permission preflight, approval prompts, and replay evidence. `smoke:codex-plugin`
copies the scaffold into `.skfiy-plugin-install/` for staged marketplace proof,
reads the installed `.mcp.json`, resolves `command: "skfiy"` through a temporary
`PATH` to `dist/skfiy`, then runs the real Codex CLI in an isolated `CODEX_HOME`
to install `skfiy@skfiy-local` into `plugins/cache/skfiy-local/skfiy/<version>/`
and verifies MCP status from that cached copy. The smoke removes the temporary
Codex home and does not mutate the user's global Codex marketplace. Pass
`--extension-id <id>` to the smoke when you want the MCP `skfiy.status` call to
also prove the packaged CLI can read Chrome Native Messaging and
extension-adapter state for that browser bridge. That bridge proof now requires
structured `extension.pageControl` readiness, so Codex plugin consumers can
distinguish ready page control, policy/permission blockers, and a not-yet-probed
extension session.

## Development

skfiy has a mandatory workflow contract for user-facing tests:
[docs/development-workflow.md](docs/development-workflow.md).

Important: `npm start`, Vite, direct Electron launches, `tmux`, and shell
background processes are development-only. A user-visible demo must run from a
compiled macOS app bundle with a stable permission identity.

```bash
npm install
npm test -- --run
npm run typecheck
npm run build
./dist/skfiy commands --json
./dist/skfiy status --json
./dist/skfiy doctor --json
npm run smoke:desktop-session -- --output .skfiy-smoke/desktop-session.json
npm run smoke:ui -- --output .skfiy-smoke/ui-permission-onboarding.json
npm run smoke:ghostty -- --matrix --output .skfiy-smoke/ghostty-matrix.json
npm run smoke:chrome -- --output .skfiy-smoke/chrome-page.json
npm run smoke:cli:basic -- --output .skfiy-smoke/cli-basic.json
npm run smoke:cli -- --output .skfiy-smoke/cli-command-matrix.json
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json
npm run smoke:codex-plugin -- --output .skfiy-smoke/codex-plugin.json
npm run smoke:finder -- --item-drag-drop --output .skfiy-smoke/finder-item-drag-drop.json
npm run smoke:voice -- --output .skfiy-smoke/voice-doubao.json
npm run smoke:money-run -- --json-output .skfiy-smoke/money-run-supervision.json
npm run alpha:artifact -- \
  --ui-smoke-artifact .skfiy-smoke/ui-permission-onboarding.json \
  --smoke-artifact .skfiy-smoke/ghostty-matrix.json \
  --chrome-smoke-artifact .skfiy-smoke/chrome-page.json \
  --finder-smoke-artifact .skfiy-smoke/finder-item-drag-drop.json \
  --voice-smoke-artifact .skfiy-smoke/voice-doubao.json \
  --money-run-smoke-artifact .skfiy-smoke/money-run-supervision.json
npm run alpha:github-release -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --require-current-head
npm run dogfood:tracking-issue -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --output .skfiy-dogfood/tracking-issue-<commit>.md
npm run dogfood:status -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --summary .skfiy-dogfood/status-<commit>.md \
  --json-output .skfiy-dogfood/status-<commit>.json
npm run dogfood:assignments -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --output .skfiy-dogfood/assignments/skfiy-alpha-<commit>.md \
  --json-output .skfiy-dogfood/assignments/skfiy-alpha-<commit>.json
npm run dogfood:prepare-alpha -- \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tester-id tester-a \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --execute
npm run dogfood:handoff -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --app <path-to-unzipped-skfiy.app> \
  --tester-id tester-a \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --output .skfiy-dogfood/handoffs/tester-a.md
npm run dogfood:tester -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --app <path-to-unzipped-skfiy.app> \
  --tester-id tester-a \
  --workflows coding-terminal,screenshot-inspection \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --file-issue
npm run dogfood:review -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --issue-url https://github.com/Sskift/skfiy/issues/<filed-dogfood-issue> \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --summary .skfiy-dogfood/reviews/tester-a.md \
  --execute
npm run dogfood:collect -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --reports-dir .skfiy-dogfood/reports \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary.md
npm run dogfood:cohort -- \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary.md \
  --json-output .skfiy-dogfood/internal-alpha-summary.json
npm run dogfood:cohort -- \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary-strict.md \
  --json-output .skfiy-dogfood/internal-alpha-summary-strict.json \
  --require-passed
```

The UI smoke uses the compiled app bundle, drags the real desktop pet upward,
checks the native window bounds changed, verifies the post-drag click is
suppressed, and then clicks the pet to capture permission onboarding evidence.
The dashboard smoke launches the compiled CLI dashboard with an isolated HOME,
then runs the compiled CLI again as `skfiy status --json` without
`--dashboard-url`; passing evidence requires status to auto-discover the
dashboard from `dashboard-server.json` and match the dashboard URL, PID, state
path, readiness, and Chrome host-policy API probe.

Run `smoke:desktop-session` before Computer Use product smokes when the machine
has just been unlocked or permission state looks inconsistent. It records the
packaged helper's display sleep state, active app, and a screenshot black-screen
analysis; `blocked` with `mainDisplayAsleep=true`, `com.apple.loginwindow`, or
`isLikelyBlack=true` is an environment blocker, not a missing TCC grant.
For the default external Doubao path, read
`permissionInterpretation.defaultExternalDoubaoReady` from that artifact; its
direct-helper `permissions.speechRecognition` value is diagnostic only and can
differ from app-scoped `smoke:ui` speech evidence.

`dogfood:status` is non-mutating. Its summary includes a
`Recommended Tester Assignments` section with copyable prepare, tester, and
review commands for the next real tester slots and missing workflow coverage.
Its JSON `nextActions` list also repeats the current `dogfood:prepare-alpha`
commands when the assignment packet is current, so follow-up agents and
dashboards can dispatch tester preparation without scraping the Markdown
summary. When the downloaded manifest and prepared app already exist locally,
`dogfood:status` replaces tester placeholders with the prepared paths and
surfaces direct `dogfood:tester` next actions.
When local smoke evidence shows `loginwindow`, display sleep, or black-screen
desktop blockers, `dogfood:status` also prints the `smoke:desktop-session`
preflight command to rerun after unlocking plus the passed-smoke follow-up.
Use `--json-output` to persist the same status object as clean JSON for
automation, dashboards, and follow-up agents without scraping npm stdout.
After running `smoke:desktop-session`, pass
`--desktop-session-artifact .skfiy-smoke/desktop-session-current.json` so the
status report refreshes stale loginwindow/display-sleep blockers from the latest
preflight instead of relying only on older product smoke artifacts.
When a desktop blocker is present, `nextActions` includes the exact follow-up
`dogfood:status` command with that desktop-session artifact wired in.
When it can read GitHub comments, it also reports whether the current
`skfiy-alpha-<commit>` assignment packet has already been posted to the tracking
issue and adds a next action when that comment is missing.
`dogfood:assignments` is also non-mutating. It packages those assignments into a
copy-safe Markdown handoff for real testers without creating reports, adding
labels, updating cohort JSON, or marking evidence accepted.
Assignment packets include a schema marker, and `dogfood:status` treats current
alpha packet comments without that marker as stale so maintainers know to repost
the latest tester handoff before asking more testers to run it.
Use `--json-output` to persist the same tester split, app bundle preflight,
desktop session preflight, permission preflight, evidence preview gate, next
actions, and comment command as machine-readable JSON for dashboards and
follow-up agents.
By default it writes the local packet and prints the GitHub issue comment command
without running it; add `--execute` only when you want to publish that packet as
a GitHub issue comment on the tracking issue.
The generated assignment packet includes an `App Bundle Preflight` section, a
`Desktop Session Preflight` section, and a `Permission Preflight` section. The
app bundle section tells testers that `dogfood:tester` verifies the extracted
`skfiy.app` identity, runs `codesign --verify --deep --strict`, and requires
`designated => identifier "com.sskift.skfiy"` before product smokes, so
permission rows are checked against the same app identity that will run. The
desktop section surfaces locked console, `com.apple.loginwindow`, and
display-sleep blockers from the current smoke evidence; testers should not use
`--require-passed` until `smoke:desktop-session` passes on their machine. The
permission section lists Screen Recording, Accessibility, Microphone, and Speech
Recognition states and tells testers to use `--require-passed` only after the
provider-relevant permissions are granted to the extracted `skfiy.app` and the
desktop session preflight is clear. For the default external Doubao path, that
means Screen Recording and Accessibility; Microphone and Speech Recognition are
only required for browser or `native-macos` provider tests.
It also includes an `Evidence Preview Gate` section that tells testers to confirm
`reportPreviewEligibility.eligible=true` before filing and to preserve the
blocking checks when it is false. That gate calls out UI pet drag evidence
explicitly, including renderer pointer events, before/after bounds, upward
movement, and suppressed click-after-drag from the packaged app. It also calls
out panic stop evidence from `runtimeStatus.stopTurnHotkey` plus the UI smoke
`stopTurnBehavior`: `behaviorResult: passed`,
`behaviorSource: renderer-escape-key-product-path`,
`behaviorBeforeStatus: approval_required`, `behaviorAfterStatus: idle`, and
`behaviorAfterMessage: Task stopped.`.
The generated tester/review commands use
`<path-to-downloaded-alpha-manifest.json>` so testers replace it with the
manifest path produced by `dogfood:prepare-alpha` on their own machine, instead
of copying a maintainer-local `.skfiy-alpha` path.
It also compares the selected alpha manifest commit with the current git HEAD
when available; a mismatch is a warning by default and a strict gate only when
`--require-current-head` is used for pre-publication checks.
Suggested `tester-N` ids avoid tester ids already parsed from linked reports, so
new artifacts do not overwrite an existing tester's local evidence by accident.
The tracking issue body includes a `Recommended Tester Assignments` section too,
so the GitHub coordination page carries the same suggested split. Its copied
prepare, tester, and review commands keep the same tracking issue URL, so
workflow inference, filed-run review handoff, and accepted-report linking stay
attached to the intended cohort.
The tracking issue body includes a `Desktop Session Preflight` section too,
telling testers to run `smoke:desktop-session` before `--require-passed` and to
treat locked console, `com.apple.loginwindow`, display sleep, or black-screen
evidence as desktop-session blockers.
`dogfood:status` validates that the tracking issue body still includes `Desktop Session Preflight`
and adds a refresh command when that guidance is missing.
A stale `docs/release-evidence/latest-alpha.json` now blocks collect readiness, so
`dogfood:status` will keep returning waiting status until the release evidence
points at the selected alpha.
Those GitHub commands also use the prepared-alpha manifest placeholder for
tester/review steps, keeping the coordination issue portable across tester
machines.
The tracking issue and status summaries explicitly tell testers to copy
`nextCommands.tester` and `nextCommands.review` from `dogfood:prepare-alpha`
after the alpha is downloaded, so the app bundle path also comes from the
prepared alpha instead of a guessed `/Applications/skfiy.app` install.
`dogfood:prepare-alpha` can infer `--workflows` from the tracking issue body or
the current alpha assignment packet comments when a tester id appears there, so
copied prepare commands and generated handoffs stay aligned.
For maintainer-only release download and app identity preflight, use a reserved
id such as `preflight-<commit>` together with
`--allow-synthetic-tester-id`; that local command skips assignment lookup,
omits `--file-issue`, and cannot satisfy the real tester gate.
Its JSON result always includes `nextCommands.tester` with the prepared manifest
path and app bundle path filled in; real tester preparations also include
`nextCommands.review`. Synthetic preflights stay local-only and expose no review
command. The recommended tester command includes `--tracking-issue-url` and
`--file-issue`, which creates only the dogfood report issue after local
validation and writes a summary whose
maintainer review command is already linked to the same cohort issue; maintainer
acceptance still requires
`dogfood:review`, whose default dry-run can be promoted with `--execute` after
the report validates.
`dogfood:tester` summaries include a `Smoke Results` table with each packaged
smoke's result, product path, and permission states parsed from the smoke JSON
stdout, so testers and maintainers can audit passed/blocked/no-transcript runs
without opening every artifact by hand. When smoke artifacts include Computer
Use event logs, the same summary now adds a `Computer Use Scorecard` with total
runs, task success rate, manual interventions, average steps, unsafe-action
blocks, and permission failures.
The `dogfood:tester app bundle preflight` verifies the selected `skfiy.app` with
`codesign --verify --deep --strict` and confirms the designated requirement
contains `designated => identifier "com.sskift.skfiy"` before any product smoke
runs.
`dogfood:tester --require-passed` also runs a strict desktop-session preflight
from the first UI smoke. If that smoke reports locked console,
`com.apple.loginwindow`, display sleep, or black-screen evidence, the runner
stops before Ghostty/Chrome/Finder/voice and writes a failed `Desktop Session
Preflight` section in the summary instead of collecting misleading product smoke
failures.
Workflow and passed workflow coverage in `dogfood:status` and
`dogfood:cohort` count only verified accepted reports from real tester ids;
`local-*`, `prepare-*`, `preflight-*`, and `synthetic-*` remain local evidence
and cannot close required workflow coverage.
Use `dogfood:cohort --json-output` to persist the final cohort gate result,
blocking checks, workflow coverage, and passed workflow coverage as
machine-readable JSON alongside the Markdown maintainer summary.
`dogfood:status` also exposes `readiness.canRunPassedCohort` and a `Passed
cohort gate ready` summary line, so maintainers can distinguish "ready to
collect accepted reports" from "ready to run the final `--require-passed`
cohort verifier". When accepted report coverage is complete but passed workflow
coverage is still missing, its recommended tester assignment purpose becomes
`passed-workflow-evidence`, and the generated prepare/tester commands include
`--require-passed`.

`smoke:money-run` is the first long-horizon supervision smoke for the
post-release field task. By default it launches the compiled `dist/skfiy.app`
with LaunchServices, sends the money-run supervision command through the
renderer/preload/main IPC path, approves the read-only tmux probe, and records
the task events plus the final `tmuxSupervisionReport`. The probes remain
non-mutating: `tmux has-session`, `list-windows`, `list-panes`, and
`capture-pane -p`. Use `--direct-tmux` only for parser diagnostics when you
explicitly want to bypass the app product path.

For renderer iteration, run `npm run dev:renderer`, then launch the built main
process in another terminal with `npm run dev:electron`.

The Electron UI and TypeScript core are testable without granting macOS
permissions. The Swift helper requires macOS and may trigger permission prompts
when used against the real desktop.
