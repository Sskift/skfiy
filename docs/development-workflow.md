# skfiy Development Workflow Contract

This document is mandatory for all skfiy work. It exists because desktop agents can look correct in a dev shell while failing in the real macOS permission, focus, and app-control environment.

## Non-Negotiable Rules

1. **User-visible testing must run from a compiled app bundle.**
   A feature is not demo-ready until it runs from a packaged macOS app with a stable bundle identity. Running `npm start`, Vite, Electron from `node_modules`, or a shell wrapper is allowed only for local engineering debug.

2. **Do not run skfiy for user testing through tmux.**
   `tmux`, tw-dashboard-attached shells, detached terminal sessions, and background shell launchers can change macOS Accessibility attribution. They must not be used to validate permissions, voice, click, type, screenshot, or drag behavior.

3. **Every "works" claim needs real desktop evidence.**
   Before saying a feature works, run a real task against the local desktop and record:
   - launch method
   - app process identity
   - command or interaction used
   - task event log
   - before/after screenshot paths when Computer Use is involved
   - `Verified type_text` and `Verified press_key` events when Computer Use reaches action execution
   - observed failure or success state

4. **The app must stay usable in the real scene while development continues.**
   Do not leave the user with a dead dialog, a hidden window, a stuck listening state, or a process that requires a terminal backend. If a dev process is started for debugging, stop it or replace it with the approved launch path before handoff.

5. **Computer Use must be tested through the product path, not only the helper path.**
   Direct helper tests prove low-level capability. They do not prove skfiy works. A valid Computer Use test must go through renderer -> preload -> main -> helper -> target app.

6. **Global hotkey automation must verify registration separately from behavior.**
   Electron can report a global shortcut as registered while macOS ignores synthetic keyboard events from helper tools or System Events. For stop-turn work, query `window.skfiy.getRuntimeStatus()` from the packaged app to verify registration, then verify stop behavior through a focused product state such as approval_required -> Escape -> idle.

7. **Ghostty tests must use an isolated target context.**
   Never validate terminal automation by typing into whichever Ghostty window is frontmost. The target must be known to be a skfiy-owned shell/session, or the task must pause and ask for confirmation.

8. **Voice tests must separate microphone, ASR, and action execution.**
   A voice result is not valid unless the report states which ASR provider was used, whether microphone permission was granted, how transcription entered skfiy, and which downstream command/action was executed.

## Launch Policy

### Valid for User-Facing Demo

Use a compiled app bundle:

```bash
open -na /Applications/skfiy.app
```

or, during local packaging work:

```bash
open -na /absolute/path/to/skfiy.app
```

The app must have a stable bundle identifier and embed the Swift helper. Screen Recording, Accessibility, and Microphone permissions must be granted to that app identity.

### Temporary Engineering Debug Only

These commands may be used to inspect or debug code, but they are not valid acceptance evidence:

```bash
npm start
npm run dev:renderer
npm run dev:electron
./node_modules/.bin/electron .
./node_modules/.bin/electron --remote-debugging-port=9233 .
```

If Electron must be launched before packaging exists, prefer LaunchServices over tmux or shell detachment:

```bash
open -na /absolute/path/to/Electron.app --args /absolute/path/to/skfiy
```

This is still a development workaround, not a release-quality launch path.

### Prohibited for User-Facing Demo

Do not use:

```bash
tmux new-session ...
tmux attach-session ...
nohup npm start &
nohup ./node_modules/.bin/electron ... &
```

These launch paths can misattribute macOS permissions and leave unmanaged background state.

## Required Pre-Handoff Checklist

Before handing work to the user, complete this checklist and include the evidence in the final response.

- [ ] `git status --short` is clean or all remaining changes are explicitly explained.
- [ ] Unit tests relevant to the change passed.
- [ ] `npm run typecheck` passed for TypeScript changes.
- [ ] `npm run build` passed when production app/main/helper code changed.
- [ ] No skfiy process is running from tmux.
- [ ] User-facing skfiy is launched through the approved app-bundle path, or the response clearly says packaging is not ready and no user-facing demo is valid yet.
- [ ] For Computer Use changes, a real product-path task was run.
- [ ] For UI changes, the real overlay was inspected on desktop.
- [ ] For voice changes, ASR provider, permission state, start/stop behavior, and failure state were tested.
- [ ] Any screenshots or logs used as evidence are listed.

## Real-Scene Test Matrix

### Permission Smoke

Run from the compiled app bundle and verify:

- Screen Recording: screenshot returns a non-empty PNG.
- Accessibility: activate app, click, type, and press key succeed.
- Microphone: permission state is available and provider-specific listening starts.

### Pet UI Smoke

- Pet appears as a desktop companion, not a normal dialog.
- Transparent background is visually transparent.
- Left click starts voice turn.
- Right click opens settings.
- Drag moves the pet across screen bounds.
- Stop returns the pet to idle.

Use the packaged app path and click the real desktop pet through the renderer DOM:

```bash
npm run smoke:ui -- --output .skfiy-smoke/ui-permission-onboarding.json
```

This launches `dist/skfiy.app` via LaunchServices, clicks the pet, waits for the React permission onboarding state, and records the visible permission rows. A `passed` result requires `runnerHasTmux=false`, the product path `LaunchServices -> renderer DOM -> React permission onboarding`, `petClicked=true`, `onboardingVisible=true`, and Screen Recording, Accessibility, Microphone, and Speech Recognition rows in the overlay. If all permissions are already granted, the expected result is `no-onboarding`.

When onboarding is visible, the UI smoke artifact must also include `permissionSettingTargets` for Screen Recording, Accessibility, Microphone, and Speech Recognition. These targets prove the overlay exposes direct macOS System Settings entries rather than a generic help message.

### Ghostty Computer Use Smoke

Use only a skfiy-owned Ghostty context.

- Run a read-only command such as `pwd`.
- Capture before and after screenshots.
- Verify task event sequence includes observing, executing, submitted, completed.
- Verify action execution includes `Verified type_text` and `Verified press_key` event messages.
- Verify `completed` is emitted only after the after screenshot/OCR observes the per-command `SKFIY_DONE_*` completion marker.
- Verify the command was not typed into Codex TUI, an editor, or an unrelated terminal.

Preferred local command after `npm run build`:

```bash
npm run smoke:ghostty -- --matrix --output .skfiy-smoke/ghostty-matrix.json
```

Run product smoke commands sequentially. `smoke:ui`, `smoke:ghostty`, `smoke:chrome`, `smoke:finder`, and `smoke:voice` share a `.skfiy-smoke/product-smoke.lock` guard so concurrent packaged-app runs fail instead of producing contaminated cleanup evidence.

Use `npm run smoke:ghostty -- --require-passed` only when Screen Recording and Accessibility are already granted to `dist/skfiy.app`; otherwise the expected result is `blocked` with fail-closed evidence.
The smoke output is JSON and includes launch identity, task events, permissions, startup warnings, runtime hotkey status, app policy settings, replay records, screenshot file sizes, matrix run results, and cleanup process checks. Use `--matrix --output <path>` to persist the exact JSON evidence for dogfood reports. Dogfood Ghostty evidence must include `clipboard-read-approval` and `clipboard-write-approval` runs with `needs-user-confirmation` and the high-risk clipboard approval message. A `passed` result requires LaunchServices app launch, `runnerHasTmux=false`, the product path `renderer -> preload -> main -> helper -> Ghostty`, visible Ghostty app policy settings, a completed task event, `Verified type_text` and `Verified press_key` action verification events, and non-empty before/after screenshot files.

### Safety Smoke

- Read-only command runs without extra approval.
- Local mutation asks for approval.
- Clipboard read/write commands ask for approval.
- Destructive command asks for approval and defaults to deny.
- Stop/panic cancels the active turn.

### Chrome Computer Use Smoke

Use the packaged app path and an isolated Chrome CDP profile:

```bash
npm run smoke:chrome -- --require-passed --output .skfiy-smoke/chrome-page.json
```

The Chrome smoke script launches a temporary Chrome profile through LaunchServices, passes its CDP endpoint into `dist/skfiy.app`, sends `打开 Chrome 测试页面 <file-url> 并提取正文` through the preload API, approves Chrome app policy plus the medium-risk browser action, and verifies extracted page text. It then runs `观察 Chrome 当前页面并提取正文` against the already-open page to prove current-page DOM observation without navigation. Next it runs a sensitive-page fixture and requires skfiy to pause instead of completing when page text contains password or one-time-code language. It also runs a multi-field form fixture using `填写 Chrome 测试表单 <file-url> 字段 #name=skfiy; #email=agent@skfiy.test; #role=operator 点击 #submit 并提取正文`, which proves selector fills, selector click, and post-click extraction. Finally, it relaunches `dist/skfiy.app` once without a Chrome CDP endpoint and once with a deliberately broken CDP endpoint, verifying both no-CDP screenshot fallback and structured-control failure switching. A `passed` result requires `runnerHasTmux=false`, product path `renderer -> preload -> main -> CDP -> Chrome`, Chrome app policy settings, `extractedText: skfiy chrome smoke ready`, `Verified navigate` and `Verified extract_text` events for the safe page, `currentPageRun.result: passed`, `currentPageRun.command: 观察 Chrome 当前页面并提取正文`, `currentPageRun.pageSnapshot.text: skfiy chrome smoke ready`, `Verified current_page_snapshot`, `Chrome current page extracted`, no `Verified navigate` event inside `currentPageRun.events`, a `sensitiveRun.result: sensitive-paused` record with `Verification failed (sensitive): Sensitive UI text is visible.`, a `formRun.result: passed` record with `formRun.fields` for `#name`, `#email`, and `#role`, `Verified fill_selector` events for each field, `Verified click_selector`, `formRun.extractedText: skfiy agent@skfiy.test operator form submitted`, `fallbackRun.result: fallback-observed` or `fallback-blocked`, `fallbackRun.productPath: renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback`, `fallbackSwitchRun.result: fallback-switched-observed` or `fallback-switched-blocked`, `fallbackSwitchRun.productPath: renderer -> preload -> main -> CDP failure -> helper observe_app -> Chrome screenshot fallback`, a `Switching Chrome control from CDP to screenshot_fallback` event, and empty skfiy/Chrome cleanup process lists.

To collect real logged-in current-page evidence without navigating or launching a temporary Chrome profile, start Chrome with a user-approved remote debugging port and run:

```bash
npm run smoke:chrome -- --current-page-endpoint http://127.0.0.1:9222 --output .skfiy-smoke/chrome-real-page.json
```

This mode launches only `dist/skfiy.app`, attaches to the provided Chrome CDP endpoint, runs `观察 Chrome 当前页面并提取正文`, records `targetMode: bring-your-own-current-page`, and writes `realCurrentPageRun`. A `passed` BYO run requires `chromeLaunchViaOpen=false`, `runnerHasTmux=false`, product path `renderer -> preload -> main -> CDP -> Chrome`, a non-empty `realCurrentPageRun.pageSnapshot`, `Verified current_page_snapshot`, `Chrome current page extracted`, and no `Verified navigate` event. A broken endpoint or missing Screen Recording fallback should record `blocked` evidence rather than being counted as a real-page pass.

### Finder Computer Use Smoke

Use the packaged app path and a throwaway test folder:

```bash
npm run smoke:finder -- --item-drag-drop --require-passed --output .skfiy-smoke/finder-item-drag-drop.json
```

The Finder smoke script launches `dist/skfiy.app` through LaunchServices, opens a throwaway fixture in Finder, sends `拖放 Finder 测试文件夹 <tmpdir>` through the preload API, approves Finder app policy plus the medium-risk local mutation, activates Finder through `skfiy-helper`, captures a before `observe_app` record, reads Finder semantic selection through Apple Events, previews the organization plan before file operations, reads fixture icon layout through Apple Events, runs a bounded HID drag from `photo.png` to `Images`, verifies the file actually moved, and organizes the remaining files. A `passed` result requires `runnerHasTmux=false`, product path `renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder`, Finder app policy settings, `finderObservation.result: passed`, `finderObservation.frontmostBundleId: com.apple.finder`, a Finder screenshot path, `finderSemanticObservation.result: passed`, `finderSemanticObservation.source: finder-applescript`, `finderSemanticObservation.frontmostBundleId: com.apple.finder`, `finderPlanPreview.result: passed`, `finderPlanPreview.destructiveOperationCount: 0`, `finderPlanPreview.moveFiles` for `photo.png`, `notes.pdf`, and `script.ts`, the task event `Finder plan preview: 3 folders, 3 moves, 0 destructive operations.`, `finderItemDragDrop.result: passed`, `finderItemDragDrop.source: finder-applescript-layout+hid-drag`, `finderItemDragDrop.movedItem: photo.png`, `finderItemDragDrop.targetItem: Images`, beforeTree entries `notes.pdf`, `photo.png`, and `script.ts`, afterTree entries `Documents/notes.pdf`, `Images/photo.png`, and `Code/script.ts`, `Verified item_drag_drop`, `Verified create_folder`, and `Verified move_file` events, and empty `processesAfterCleanup`. A permission-blocked observe, semantic, layout, or drag step must produce the matching blocked evidence and keep the smoke result blocked until permissions are granted.

For `--current-folder` and `--selected-folder` Finder runs, skfiy must stop after `finderPlanPreview` and require a second approval before file operations. A passed current/selected Finder artifact must include `finderPlanConfirmation.result: passed`, `finderPlanConfirmation.confirmedAfterPreview: true`, and a reason ending in `confirmation after plan preview`.

To verify current Finder window grounding, run:

```bash
npm run smoke:finder -- --current-folder --require-passed --output .skfiy-smoke/finder-current-folder.json
```

This mode opens the fixture folder in Finder, sends `整理 Finder 当前文件夹`, and only passes when `finderSemanticObservation.targetPath` resolves to the same path as `fixtureRoot`. Permission-blocked runs should remain blocked with the concrete Screen Recording, Accessibility, or Automation reason.

To verify selected Finder folder grounding, run:

```bash
npm run smoke:finder -- --selected-folder --require-passed --output .skfiy-smoke/finder-selected-folder.json
```

This mode reveals and selects the fixture folder in Finder, sends `整理 Finder 选中文件夹`, and only passes when `finderSemanticObservation.selectedItems` contains the fixture directory. Permission-blocked runs should remain blocked with the concrete Screen Recording, Accessibility, or Automation reason.

To exercise Finder under a real dogfood parent directory while keeping operations isolated:

```bash
mkdir -p ~/Desktop/skfiy-finder-dogfood
npm run smoke:finder -- --target-dir ~/Desktop/skfiy-finder-dogfood --item-drag-drop --require-passed --output .skfiy-smoke/finder-target-dir.json
```

The smoke creates and cleans up only a generated `skfiy-finder-smoke-*` child directory under `--target-dir`, records `targetDirSafety`, and fails closed if the fixture is not a strict child of the requested directory.

### Native Voice Smoke

Use the packaged app path and record provider, permission, transcript, and stop evidence:

```bash
npm run smoke:voice -- --output .skfiy-smoke/voice-native.json
```

Use `npm run smoke:voice -- --require-passed` only after Microphone and Speech Recognition are granted to `dist/skfiy.app`; otherwise the expected result is `blocked` or `no-transcript` with fail-closed evidence. The voice artifact must include structured `speechStatus` from the packaged app product path, including Speech Recognition and Microphone states. A `no-transcript` result should include native provider `listening` plus `no_transcript` or `cancelled` events, no final transcript, and no downstream task submission. A `passed` result requires LaunchServices app launch, `runnerHasTmux=false`, the product path `renderer -> preload -> main -> helper -> native macOS Speech`, provider events showing listening and stopped, a final non-empty transcript event, and downstream `taskEvents` proving the transcript entered the Computer Use path.

### Dogfood Evidence Gate

After creating an alpha manifest, verify that the manifest, zip, UI smoke artifact, Ghostty smoke artifact, Chrome smoke artifact, Finder smoke artifact, and native voice smoke artifact form one coherent evidence chain:

```bash
npm run dogfood:verify -- --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json
```

Use `--require-current-head` when validating a local alpha before sharing it; this fails if the manifest was created from an older commit than the current worktree HEAD. Use `--require-passed` only for a release gate after Ghostty, Chrome, Finder, and native voice smoke runs are expected to pass. Without `--require-passed`, permission-blocked runs are acceptable evidence only when they still prove the packaged app path, `runnerHasTmux=false`, product path, cleanup, app policy settings, native voice transcript-to-task evidence for passed voice runs, native voice no-transcript/cancellation lifecycle evidence for no-transcript runs, accepted GitHub dogfood issue source evidence, Chrome extraction evidence, Chrome current-page observation evidence, Chrome sensitive-page pause evidence, Chrome form action evidence, Chrome screenshot fallback evidence, Chrome fallback switching evidence, Finder observe_app evidence, Finder semantic selection evidence, Finder plan preview evidence, Finder plan confirmation evidence for current/selected folder runs, Finder item drag/drop evidence, Finder organization evidence, clipboard read/write approval runs, and required manifest links.

To prepare a GitHub pre-release that remote testers can download, first dry-run the release plan:

```bash
npm run alpha:github-release -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --require-current-head
```

The dry-run validates the alpha zip and manifest, writes release notes beside the manifest, and prints the `gh release create` command without uploading. Use `--execute` only when the manifest is current and the unsigned internal build is ready to share.

After publishing or replacing a GitHub alpha release, generate the tracking issue body from the same manifest instead of editing the Current Alpha fields by hand:

```bash
npm run dogfood:tracking-issue -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --output .skfiy-dogfood/tracking-issue-<commit>.md
```

The default mode is a dry-run that writes the issue body locally. Review it, then add `--execute` to run `gh issue edit` for the tracking issue. The generated body preserves existing accepted report issue URLs in the required real-tester slots while refreshing current alpha release/manifest/zip/SHA/commit identity, synthetic local preflight evidence, and the exact status, prepare, tester, review, and cohort commands for that alpha.
The generated workflow coverage section is intentionally neutral: it lists required workflows but does not check them off. `dogfood:status` and `dogfood:cohort` compute real coverage from verified accepted report issue labels.

To get a non-mutating readiness snapshot before filing or collecting dogfood reports:

```bash
npm run dogfood:status -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --summary .skfiy-dogfood/status.md
```

`dogfood:status` reports local smoke results, permission blockers, accepted report URLs already filled into the tracking issue, the tracking issue `Current Alpha` identity, and a non-mutating validation of each linked report issue. The tracking issue identity check requires its release tag, manifest, zip, zip SHA256, commit, bundle id, and app name to match the selected manifest before `ready-to-collect` can be reported. The linked issue validation checks `dogfood:accepted`, matching alpha manifest/zip/commit identity, at least one checked cohort workflow, and exact `workflow:*` labels before it counts the issue as a verified accepted report. Real tester readiness excludes reserved local synthetic tester ids such as `local-*`, `prepare-*`, `preflight-*`, and `synthetic-*`; those reports remain useful local evidence but do not count toward the 3-5 real-user gate. It also writes a `Recommended Tester Assignments` section with copyable `dogfood:prepare-alpha`, `dogfood:tester`, and `dogfood:review` commands for the next real tester slots and missing workflow coverage. It does not create reports, edit GitHub, or mark the cohort ready; use it to decide whether the next step is updating stale alpha links, granting permissions, replacing stale issue links, collecting tester reports, or running `dogfood:collect`. Add `--require-current-head` only when validating a local alpha before publication; published-release status checks must keep working after later documentation-only commits.
Workflow coverage in `dogfood:status` comes only from verified accepted report issues, not from the tracking issue checklist. Passed Workflow Coverage is separate and only counts linked report issues whose `Computer Use result` is `passed`, so blocked permission evidence cannot be mistaken for passed product-path evidence.

Generate a copyable handoff for each real tester before asking them to run the packaged app:

```bash
npm run dogfood:prepare-alpha -- \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tester-id tester-b \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --execute
```

`dogfood:prepare-alpha` downloads the release zip and manifest, verifies the zip SHA256 against the manifest, extracts `skfiy.app` under `.skfiy-dogfood/apps/<tag>/`, and creates a handoff whose `dogfood:tester` command points at that extracted app bundle. It defaults to dry-run; `--execute` is required before it downloads or writes local files. If `--workflows` is omitted but `--tracking-issue-url` or `--tracking-issue-file` is provided, it reads `Recommended Tester Assignments` and passes the tester's workflows into the generated handoff.

Maintainers can still generate a handoff manually when the tester has already unpacked the app:

```bash
npm run dogfood:handoff -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --app <path-to-unzipped-skfiy.app> \
  --tester-id tester-b \
  --output .skfiy-dogfood/handoffs/tester-b.md
```

`dogfood:handoff` writes alpha identity, zip SHA256, no-tmux rules, permission setup, the explicit app bundle path that `dogfood:tester` should launch, filing instructions, and maintainer review commands. It is intentionally non-mutating: it does not create GitHub issues, accept reports, or update the cohort.

For one real tester machine, collect the five packaged-app smoke artifacts and a checked issue body with:

```bash
npm run dogfood:tester -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --app <path-to-unzipped-skfiy.app> \
  --tester-id tester-a \
  --workflows coding-terminal,screenshot-inspection \
  --artifacts-dir .skfiy-smoke/dogfood/tester-a \
  --issue-output .skfiy-dogfood/issues/tester-a.md \
  --summary .skfiy-dogfood/tester-a-summary.md
```

This runner is only a local evidence collector. It refuses tmux, runs product smokes sequentially, generates the `dogfood:issue -- --check-report` draft from the artifacts it just wrote, and leaves GitHub filing plus `dogfood:accepted` label review to maintainers. When `--require-passed` is used, the runner treats the first UI smoke as a strict permission preflight and stops before Ghostty/Chrome/Finder/voice if Screen Recording, Accessibility, Microphone, or Speech Recognition is still missing.
The runner summary prints a copy-safe `gh issue create --body-file ...` command that files only the report body. It does not add labels; testers must leave `dogfood:accepted` and `workflow:*` labels to maintainers after `dogfood:review`. Reserved synthetic tester ids (`local-*`, `prepare-*`, `preflight-*`, and `synthetic-*`) are rejected for normal tester runs; use `--allow-synthetic-tester-id` only for maintainer local/preflight evidence that will not count toward the real-user cohort gate.

Before adding `dogfood:accepted` to a filed tester issue, run:

```bash
npm run dogfood:review -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --issue-url https://github.com/Sskift/skfiy/issues/<filed-dogfood-issue> \
  --summary .skfiy-dogfood/reviews/<stable-tester-id>.md
```

This preflight is non-mutating. It checks the filed issue body and artifact paths through the same manifest-backed parser used by `dogfood:report`, then prints suggested labels plus a copy-safe `gh issue edit ... --add-label ...` acceptance command when the report is eligible. Maintainers still apply labels manually after review.

After accepting the filed report issue, add its URL to the next tracking issue slot with:

```bash
npm run dogfood:tracking-issue -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --accepted-report-url https://github.com/Sskift/skfiy/issues/<accepted-dogfood-issue> \
  --output .skfiy-dogfood/tracking-issue-<commit>.md
```

Review the generated body, then add `--execute` to edit the tracking issue.

For internal dogfood, each tester should generate a GitHub dogfood issue body draft from the same alpha manifest and smoke artifacts used for local verification:

```bash
npm run dogfood:issue -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tester-id tester-a \
  --workflows coding-terminal,screenshot-inspection \
  --check-report \
  --output .skfiy-dogfood/issues/tester-a.md
```

The draft fills the `###` sections parsed by `dogfood:report`, including alpha identity, all five smoke artifact paths, permission states, ASR provider, Computer Use result, screenshots, action verification messages, and core Chrome/Finder/voice evidence. `--check-report` round-trips the generated draft through the `dogfood:report` parser with synthetic accepted labels, then prints `reportPreviewEligibility` from the `dogfood:cohort` report-level checks. Tester-side artifacts fail locally if a heading, manifest identity, or artifact path is incompatible; `reportPreviewEligibility.eligible=false` means the filed issue would not count toward cohort coverage until the listed blocking checks are fixed. After the drafted single-user report is reviewed and accepted, generate its cohort JSON from the accepted issue body:

Track the current internal alpha cohort in https://github.com/Sskift/skfiy/issues/1. Each accepted single-user dogfood issue should be linked there before being converted into local `.skfiy-dogfood/` JSON. Accepted report issues should carry `dogfood:accepted` plus the covered workflow labels (`workflow:coding-terminal`, `workflow:screenshot-inspection`, `workflow:finder-file`, `workflow:browser-fallback`) before maintainers run `dogfood:report`.

```bash
npm run dogfood:report -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --issue-url https://github.com/Sskift/skfiy/issues/<accepted-dogfood-issue> \
  --report .skfiy-dogfood/reports/tester-a.json \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json
```

The report helper is incremental. It reads the alpha identity from the manifest, requires a readable accepted issue body from `gh issue view`, derives `testerId` from the issue `tester id` field, derives `workflows` from checked `cohort workflows`, requires the issue `alpha manifest`, `alpha zip`, and `commit sha` fields to match the manifest passed with `--manifest`, requires all five UI/Ghostty/Chrome/Finder/voice smoke artifact paths from the issue body, requires each smoke JSON `artifactPath` to match the issue-listed path it was read from, validates `dogfood:accepted` plus workflow labels matching the derived workflows, derives `result`, `appLaunchViaOpen`, `runnerHasTmux`, permission states, artifact paths, `source.issueUrl`, and `source.issueLabels` into a single report JSON, writes `.skfiy-dogfood/internal-alpha-cohort.json`, replaces an existing report with the same `testerId`, rejects mixed alpha manifest paths, and reports whether the cohort is ready; `summary.cohortReady` requires 3-5 testers, full workflow coverage, and `sourceEligibleReports=totalReports`, but it does not claim dogfood completion before the verifier passes. Use `--tester-id`, `--workflows`, or `--issue-labels dogfood:accepted,workflow:coding-terminal,...` only as explicit overrides for tester/workflow/label fields; they cannot replace issue artifact or alpha identity evidence. Keep `.skfiy-dogfood/` local because it can contain tester-specific evidence.

Maintainers can also collect all accepted report URLs linked in the tracking issue into local report JSON and a cohort in one pass:

```bash
npm run dogfood:collect -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --reports-dir .skfiy-dogfood/reports \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary.md
```

`dogfood:collect` only discovers accepted report issue URLs from the tracking issue's `Required Real Tester Count` slots and then reuses the same manifest-backed `dogfood:report` parser for each issue. It still requires `dogfood:accepted`, matching `workflow:*` labels, issue alpha manifest/zip/commit identity, all five smoke artifact paths, and smoke JSON `artifactPath` identity. It immediately runs `dogfood:cohort`; a failed cohort verification keeps the command from being release evidence.

After aggregating 3-5 single-user reports, run:

```bash
npm run dogfood:cohort -- \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary.md
```

The cohort gate checks distinct real testers, required workflow coverage (`coding-terminal`, `screenshot-inspection`, `finder-file`, and `browser-fallback`), `appLaunchViaOpen=true`, `runnerHasTmux=false`, absolute alpha manifest and smoke artifact paths, Screen Recording, Accessibility, Microphone, and Speech Recognition states, and accepted GitHub issue source metadata for every report. Each source must include `dogfood:accepted` plus matching `workflow:*` labels, `artifactSource=github-issue-smoke-artifacts`, issue alpha manifest/zip/commit identity, and a source commit that matches the report `commitSha`. Workflow coverage is counted only from reports that already satisfy the report-level gates, so a source-ineligible or artifact-ineligible report cannot cover a required workflow. Reserved local synthetic tester ids such as `local-*`, `prepare-*`, `preflight-*`, and `synthetic-*` can preserve local packaged-app evidence, but they fail the real tester gate. `--summary` writes a short local Markdown readiness report showing missing workflows, blocking checks, per-tester status, issue links, distinct real tester count, synthetic report count, and a separate Passed Workflow Coverage section. This gate proves report quality and coverage; it does not mark the real dogfood complete until the cohort file contains reports from actual testers. A blocked report can prove the packaged app/reporting chain for a workflow, but it is not passed product-path evidence; passed workflow coverage remains separate until the tester machine grants the required macOS permissions and the smoke result is `passed`.

For the final product-path release gate, add `--require-passed`:

```bash
npm run dogfood:cohort -- \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary.md \
  --require-passed
```

This strict mode keeps all source/artifact checks and also fails unless each required workflow has at least one accepted report whose `Computer Use result` is `passed`. Use the default mode while collecting permission-blocked source evidence; use `--require-passed` only when deciding whether the dogfood cohort proves the product path works.

### macOS Release Signing

Use the read-only release check before any broader internal package:

```bash
npm run release:mac:check
```

The check reports missing Developer ID or Apple notary credentials and prints the planned release commands without mutating the app bundle. The signing plan uses the hardened-runtime entitlements file at `release/skfiy.entitlements.plist`. Actual signing and notarization require a packaged app from `npm run build` plus `SKFIY_DEVELOPER_ID_APPLICATION` and either `APPLE_KEYCHAIN_PROFILE` or all of `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`.

Run the mutating release steps only after the check is clean:

```bash
npm run release:mac:sign
npm run release:mac:notarize
```

## Reporting Template

Use this format when reporting a tested change:

```markdown
Launch: /Applications/skfiy.app via open
Process: skfiy.app, not tmux
Permissions: Screen Recording ok, Accessibility ok, Microphone ok
Task: "open Ghostty, run pwd, screenshot"
Events: observing -> executing -> submitted -> completed
Action verification: Verified type_text, Verified press_key
Clipboard approvals: clipboard-read-approval needs-user-confirmation, clipboard-write-approval needs-user-confirmation
Chrome: extractedText skfiy chrome smoke ready
Chrome action verification: Verified navigate, Verified extract_text
Chrome current-page observation: currentPageRun.result passed, Verified current_page_snapshot, Chrome current page extracted
Chrome sensitive pause: sensitiveRun.result sensitive-paused
Chrome form action: formRun.result passed, formRun.fields #name/#email/#role, Verified fill_selector for #name/#email/#role, Verified click_selector
Chrome fallback: fallbackRun.result fallback-observed or fallback-blocked, fallbackRun.productPath renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback
Chrome fallback switch: fallbackSwitchRun.result fallback-switched-observed or fallback-switched-blocked, Switching Chrome control from CDP to screenshot_fallback
Finder: beforeTree notes.pdf/photo.png/script.ts -> afterTree Documents/notes.pdf/Images/photo.png/Code/script.ts
Finder observe_app: finderObservation.result passed, frontmostBundleId com.apple.finder, screenshotPath /tmp/skfiy/finder-before-...
Finder semantic selection: finderSemanticObservation.result passed, source finder-applescript, selectedCount 1
Finder plan preview: finderPlanPreview.result passed, destructiveOperationCount 0, moveFiles photo.png/notes.pdf/script.ts
Finder plan confirmation: finderPlanConfirmation.result passed, confirmedAfterPreview true
Finder item drag/drop: finderItemDragDrop.result passed, source finder-applescript-layout+hid-drag, movedItem photo.png, targetItem Images
Finder action verification: Verified item_drag_drop, Verified create_folder, Verified move_file
Dogfood cohort: testerId tester-a, workflows coding-terminal/screenshot-inspection, manifestPath .skfiy-alpha/..., runnerHasTmux false, permissionStates screenRecording/accessibility/microphone/speechRecognition, artifacts ui/ghostty/chrome/finder/voice
Screenshots:
- before: /path/to/before.png
- after: /path/to/after.png
Result: passed
Known gaps: ...
```

## Immediate Project Implication

`npm run build` now produces a local packaged app at `dist/skfiy.app` with bundle id `com.sskift.skfiy` and an embedded Swift helper. Future user-facing validation should launch that app bundle through `open -na /Users/bytedance/Desktop/test/skfiy/dist/skfiy.app`.

Current permission state still matters: screenshots, clicks, typing, and voice cannot be claimed as working until Screen Recording, Accessibility, and Microphone permission checks pass for this bundle identity.
