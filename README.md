# skfiy

skfiy is a voice-first macOS desktop pet for local Computer Use experiments.
It is designed as an app-agnostic desktop control runtime: observe any visible
macOS app, decide the next action, execute clicks/typing/dragging/hotkeys, then
verify the result from screenshots, OCR, accessibility metadata, and replay
events. Ghostty, Chrome, Finder, screenshots, and tmux supervision are the first
real regression fixtures, not the product boundary.

The first version keeps the public surface narrow while the control loop is
hardened: voice enters through the desktop pet, app policy gates the target,
Computer Use performs observe-plan-act-verify, and task state remains visible in
the floating companion.

## Current Local Evidence

Use the short git commit in local artifact file names. For the current machine,
the Finder path may remain blocked until macOS grants Automation control of
Finder to the compiled `skfiy.app`.

- UI permission and pet drag smoke: passed,
  `.skfiy-smoke/ui-<commit>.json`.
- Ghostty terminal-adapter smoke: passed,
  `.skfiy-smoke/ghostty-<commit>.json`.
- Chrome Computer Use smoke: passed,
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
- Finder item drag/drop smoke: blocked by Finder Automation permission,
  `.skfiy-smoke/finder-<commit>.json`.

The Finder blocker is separate from Screen Recording and Accessibility. The
current blocked evidence says macOS Automation permission is required to read
Finder item layout and semantic selection. Grant the compiled `skfiy.app`
permission to control Finder, then rerun:

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

## MVP Scope

- Floating desktop companion with active and quiet modes.
- App-agnostic macOS helper primitives for app listing, app activation,
  screenshots/OCR, clicks, drags, scrolls, text input, hotkeys, and key presses.
- Target-specific adapters for early fixtures: Ghostty terminal turns, Chrome
  page observation/actions, Finder file operations, and tmux supervision.
- App policy and action risk gates before execution.
- Explicit approval for risky actions or actions that can modify local state.
- Local-only execution. The helper does not send screenshots or command output
  to a remote service by itself.

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
same Chrome host policy used by the CLI and MV3 native-host bridge. The Chrome smoke now also
records `installedExtensionRun`; on this machine it is a known blocker because
branded `Google Chrome` 146 no longer honors automated `--load-extension`
unpacked extension loading, so `smoke:chrome` now auto-prefers Google Chrome for
Testing or Chromium for the installed-extension proof when either app is
available. Use `--extension-chrome-app <name>` to force that browser; otherwise
the live extension path remains a clear environment blocker on machines with
only branded Chrome.
`smoke:chrome` now also requires `nativeHostBridgeRun.result: passed` from the
packaged `dist/skfiy -> Chrome Native Messaging heartbeat` path before Chrome
browser-control evidence can count as passed.

```bash
./dist/skfiy status --json
./dist/skfiy doctor --json
./dist/skfiy dashboard --no-open --port 0 --json
./dist/skfiy mcp serve --stdio
```

Use `./dist/skfiy doctor --json --dashboard-url <url> --extension-id <id>`
before real desktop tests. The doctor output includes a `preflight` block with
the packaged app/helper/CLI paths, code-signature state, dashboard descriptor
and Chrome host-policy API reachability, Chrome extension/native-host state, and
the user-level Chrome host policy file path.

`plugins/skfiy/.mcp.json` points Codex at the installed `skfiy mcp serve
--stdio` command. The Codex plugin is an adapter to the installed product, not a
runtime replacement; desktop control still goes through skfiy's app policy,
permission preflight, approval prompts, and replay evidence. `smoke:codex-plugin`
copies the scaffold into `.skfiy-plugin-install/` for staged marketplace proof
without mutating the user's global Codex marketplace.

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
./dist/skfiy status --json
./dist/skfiy doctor --json
npm run smoke:desktop-session -- --output .skfiy-smoke/desktop-session.json
npm run smoke:ui -- --output .skfiy-smoke/ui-permission-onboarding.json
npm run smoke:ghostty -- --matrix --output .skfiy-smoke/ghostty-matrix.json
npm run smoke:chrome -- --output .skfiy-smoke/chrome-page.json
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
