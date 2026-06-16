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

The Chrome smoke script launches a temporary Chrome profile through LaunchServices, passes its CDP endpoint into `dist/skfiy.app`, sends `打开 Chrome 测试页面 <file-url> 并提取正文` through the preload API, approves Chrome app policy plus the medium-risk browser action, and verifies extracted page text. It then runs a second sensitive-page fixture and requires skfiy to pause instead of completing when page text contains password or one-time-code language. It also runs a multi-field form fixture using `填写 Chrome 测试表单 <file-url> 字段 #name=skfiy; #email=agent@skfiy.test; #role=operator 点击 #submit 并提取正文`, which proves selector fills, selector click, and post-click extraction. Finally, it relaunches `dist/skfiy.app` without a Chrome CDP endpoint and verifies screenshot fallback evidence. A `passed` result requires `runnerHasTmux=false`, product path `renderer -> preload -> main -> CDP -> Chrome`, Chrome app policy settings, `extractedText: skfiy chrome smoke ready`, `Verified navigate` and `Verified extract_text` events for the safe page, a `sensitiveRun.result: sensitive-paused` record with `Verification failed (sensitive): Sensitive UI text is visible.`, a `formRun.result: passed` record with `formRun.fields` for `#name`, `#email`, and `#role`, `Verified fill_selector` events for each field, `Verified click_selector`, `formRun.extractedText: skfiy agent@skfiy.test operator form submitted`, `fallbackRun.result: fallback-observed` or `fallback-blocked`, `fallbackRun.productPath: renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback`, and empty skfiy/Chrome cleanup process lists.

### Finder Computer Use Smoke

Use the packaged app path and a throwaway test folder:

```bash
npm run smoke:finder -- --item-drag-drop --require-passed --output .skfiy-smoke/finder-item-drag-drop.json
```

The Finder smoke script launches `dist/skfiy.app` through LaunchServices, opens a throwaway fixture in Finder, sends `拖放 Finder 测试文件夹 <tmpdir>` through the preload API, approves Finder app policy plus the medium-risk local mutation, activates Finder through `skfiy-helper`, captures a before `observe_app` record, reads Finder semantic selection through Apple Events, reads fixture icon layout through Apple Events, runs a bounded HID drag from `photo.png` to `Images`, verifies the file actually moved, and organizes the remaining files. A `passed` result requires `runnerHasTmux=false`, product path `renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder`, Finder app policy settings, `finderObservation.result: passed`, `finderObservation.frontmostBundleId: com.apple.finder`, a Finder screenshot path, `finderSemanticObservation.result: passed`, `finderSemanticObservation.source: finder-applescript`, `finderSemanticObservation.frontmostBundleId: com.apple.finder`, `finderItemDragDrop.result: passed`, `finderItemDragDrop.source: finder-applescript-layout+hid-drag`, `finderItemDragDrop.movedItem: photo.png`, `finderItemDragDrop.targetItem: Images`, beforeTree entries `notes.pdf`, `photo.png`, and `script.ts`, afterTree entries `Documents/notes.pdf`, `Images/photo.png`, and `Code/script.ts`, `Verified item_drag_drop`, `Verified create_folder`, and `Verified move_file` events, and empty `processesAfterCleanup`. A permission-blocked observe, semantic, layout, or drag step must produce the matching blocked evidence and keep the smoke result blocked until permissions are granted.

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

Use `npm run smoke:voice -- --require-passed` only after Microphone and Speech Recognition are granted to `dist/skfiy.app`; otherwise the expected result is `blocked` or `no-transcript` with fail-closed evidence. The voice artifact must include structured `speechStatus` from the packaged app product path, including Speech Recognition and Microphone states. A `no-transcript` result should include a native provider `no_transcript` event and no empty transcript submission. A `passed` result requires LaunchServices app launch, `runnerHasTmux=false`, the product path `renderer -> preload -> main -> helper -> native macOS Speech`, provider events showing listening and stopped, and a final non-empty transcript event.

### Dogfood Evidence Gate

After creating an alpha manifest, verify that the manifest, zip, UI smoke artifact, Ghostty smoke artifact, Chrome smoke artifact, Finder smoke artifact, and native voice smoke artifact form one coherent evidence chain:

```bash
npm run dogfood:verify -- --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json
```

Use `--require-current-head` when validating a local alpha before sharing it; this fails if the manifest was created from an older commit than the current worktree HEAD. Use `--require-passed` only for a release gate after Ghostty, Chrome, Finder, and native voice smoke runs are expected to pass. Without `--require-passed`, permission-blocked runs are acceptable evidence only when they still prove the packaged app path, `runnerHasTmux=false`, product path, cleanup, app policy settings, Chrome extraction evidence, Chrome sensitive-page pause evidence, Chrome form action evidence, Chrome screenshot fallback evidence, Finder observe_app evidence, Finder semantic selection evidence, Finder item drag/drop evidence, Finder organization evidence, clipboard read/write approval runs, and required manifest links.

### macOS Release Signing

Use the read-only release check before any broader internal package:

```bash
npm run release:mac:check
```

The check reports missing Developer ID or Apple notary credentials and prints the planned release commands without mutating the app bundle. Actual signing and notarization require a packaged app from `npm run build` plus `SKFIY_DEVELOPER_ID_APPLICATION` and either `APPLE_KEYCHAIN_PROFILE` or all of `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`.

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
Chrome sensitive pause: sensitiveRun.result sensitive-paused
Chrome form action: formRun.result passed, formRun.fields #name/#email/#role, Verified fill_selector for #name/#email/#role, Verified click_selector
Chrome fallback: fallbackRun.result fallback-observed or fallback-blocked, fallbackRun.productPath renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback
Finder: beforeTree notes.pdf/photo.png/script.ts -> afterTree Documents/notes.pdf/Images/photo.png/Code/script.ts
Finder observe_app: finderObservation.result passed, frontmostBundleId com.apple.finder, screenshotPath /tmp/skfiy/finder-before-...
Finder semantic selection: finderSemanticObservation.result passed, source finder-applescript, selectedCount 1
Finder item drag/drop: finderItemDragDrop.result passed, source finder-applescript-layout+hid-drag, movedItem photo.png, targetItem Images
Finder action verification: Verified item_drag_drop, Verified create_folder, Verified move_file
Screenshots:
- before: /path/to/before.png
- after: /path/to/after.png
Result: passed
Known gaps: ...
```

## Immediate Project Implication

`npm run build` now produces a local packaged app at `dist/skfiy.app` with bundle id `com.sskift.skfiy` and an embedded Swift helper. Future user-facing validation should launch that app bundle through `open -na /Users/bytedance/Desktop/test/skfiy/dist/skfiy.app`.

Current permission state still matters: screenshots, clicks, typing, and voice cannot be claimed as working until Screen Recording, Accessibility, and Microphone permission checks pass for this bundle identity.
