# skfiy Internal Alpha Build

This document describes the current unsigned internal macOS build path. It is not a notarized release process.

## Build

From the repository root:

```bash
npm run build
```

The output app bundle is:

```text
/Users/bytedance/Desktop/test/skfiy/dist/skfiy.app
```

The bundle identifier is:

```text
com.sskift.skfiy
```

The app embeds the Swift helper at:

```text
dist/skfiy.app/Contents/Resources/skfiy-helper
```

Create a local unsigned dogfood artifact after `npm run build`:

```bash
npm run alpha:artifact \
  -- --ui-smoke-artifact .skfiy-smoke/ui-permission-onboarding.json \
  --smoke-artifact .skfiy-smoke/ghostty-matrix-9260.json \
  --chrome-smoke-artifact .skfiy-smoke/chrome-page.json \
  --finder-smoke-artifact .skfiy-smoke/finder-item-drag-drop.json \
  --voice-smoke-artifact .skfiy-smoke/voice-native.json
```

This writes a versioned zip and manifest to `.skfiy-alpha/`, for example:

```text
.skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.zip
.skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json
```

The manifest records the exact commit SHA, bundle identifier, unsigned/notarized state, zip byte size, SHA256 checksum, the UI smoke artifact path, the Ghostty smoke artifact path, the Chrome smoke artifact path, the Finder smoke artifact path, the native voice smoke artifact path, permission setting direct-link evidence, native voice transcript-to-task evidence, native voice no-transcript/cancellation evidence, and required app policy, observe, semantic Finder, Finder plan preview, and Finder plan confirmation evidence used for dogfood.

Verify the evidence chain before sharing an alpha:

```bash
npm run dogfood:verify -- --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json
```

This gate checks the manifest, zip byte count, UI smoke artifact, Ghostty smoke artifact, Chrome smoke artifact, Finder smoke artifact, native voice smoke artifact, LaunchServices launch markers, `runnerHasTmux=false`, product paths, permission setting direct-link targets, native voice transcript-to-task evidence for passed voice runs, native voice no-transcript/cancellation lifecycle evidence for no-transcript runs, Chrome safe-page extraction, Chrome current-page observation evidence, Chrome sensitive-page pause evidence, Chrome form action evidence, Chrome screenshot fallback evidence, Chrome fallback switching evidence, Finder observe_app evidence, Finder semantic selection evidence, Finder plan preview evidence, Finder plan confirmation evidence for current/selected folder runs, Finder item drag/drop evidence, Finder organization evidence, and process cleanup. Add `--require-current-head` before sharing a local alpha so stale manifests from older commits fail. Add `--require-passed` only after the machine has granted the required Screen Recording, Accessibility, Microphone, and Speech Recognition permissions and the product smokes are expected to pass.

After each single-user dogfood report is accepted, convert it to JSON and add or replace it in the local cohort file:

```bash
npm run dogfood:report -- --report .skfiy-dogfood/reports/tester-a.json --cohort .skfiy-dogfood/internal-alpha-cohort.json
```

The report JSON should contain one report object with `testerId`, `result`, `manifestPath`, `appLaunchViaOpen=true`, `runnerHasTmux=false`, `workflows`, `permissionStates`, and absolute UI/Ghostty/Chrome/Finder/voice artifact paths. `dogfood:report` preserves one report per tester, rejects reports from a different alpha manifest, and prints readiness without treating an incomplete cohort as complete. Keep `.skfiy-dogfood/` local; it can contain tester-specific evidence and is ignored by git.

After 3-5 single-user dogfood reports are collected, verify cross-user coverage:

```bash
npm run dogfood:cohort -- --cohort .skfiy-dogfood/internal-alpha-cohort.json
```

The cohort file is separate from the alpha manifest. It should list one report per tester with `testerId`, `result`, `manifestPath`, `appLaunchViaOpen=true`, `runnerHasTmux=false`, `workflows`, `permissionStates`, and absolute UI/Ghostty/Chrome/Finder/voice artifact paths. The verifier requires 3-5 distinct testers and coverage for `coding-terminal`, `screenshot-inspection`, `finder-file`, and `browser-fallback`.

Check Developer ID signing and notarization readiness:

```bash
npm run release:mac:check
```

This command is read-only. It reports the packaged app path, the notary zip path, planned `codesign`, `ditto`, `notarytool`, and `stapler` steps when requested, and any missing credentials. A real signed release requires `SKFIY_DEVELOPER_ID_APPLICATION` plus either `APPLE_KEYCHAIN_PROFILE` or all of `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`.

Execute signing only after credentials are configured:

```bash
npm run release:mac:sign
```

Execute signing, notarization, and stapling only after signing plus notary credentials are configured:

```bash
npm run release:mac:notarize
```

## Launch

Use LaunchServices so macOS attributes permissions to the app bundle:

```bash
open -na /Users/bytedance/Desktop/test/skfiy/dist/skfiy.app
```

Do not validate user-facing behavior from `npm start`, `npm run dev:electron`, tmux, detached shell launchers, or Electron's unbundled app path.

## Required Permissions

Grant these permissions to `skfiy.app`:

- Screen Recording
- Accessibility
- Microphone
- Speech Recognition

Computer Use tasks cannot be reported as passing until Screen Recording and Accessibility are granted to `com.sskift.skfiy`.

When either required Computer Use permission is missing, skfiy preflights the turn and stops before opening Ghostty or sending helper actions. The smoke event should name the missing Screen Recording and/or Accessibility grant.

Left-clicking the pet also opens a permission onboarding panel before dictation when Screen Recording, Accessibility, Microphone, or Speech Recognition is denied or not determined. The UI smoke artifact must include direct setting targets for Screen Recording, Accessibility, Microphone, and Speech Recognition.

The native macOS speech provider is a one-shot local Speech framework prototype. It uses `speech-status` for readiness checks and `transcribe-speech` for a bounded recording turn with silence timeout. Before Speech Recognition is granted, status is expected to report `speechRecognition: notDetermined` or `denied` and native transcription must fail closed.

## Smoke Test

After `npm run build`, run:

```bash
npm run smoke:ghostty -- --output .skfiy-smoke/ghostty-smoke.json
```

Run Ghostty, Chrome, Finder, and voice product smoke commands sequentially. The scripts share `.skfiy-smoke/product-smoke.lock` and fail fast if another packaged-app smoke is already active, because concurrent runs can contaminate `processesAfterCleanup` evidence.

Expected output before permissions are granted:

```text
result: blocked
```

Expected output after Screen Recording and Accessibility are granted:

```text
result: passed
```

For a strict passing gate, use:

```bash
npm run smoke:ghostty -- --require-passed --output .skfiy-smoke/ghostty-smoke-passed.json
```

The smoke output is JSON and records launch identity, task events, permissions, runtime status, app policy settings, replay records, screenshot file checks, matrix run results, and cleanup process checks. `--matrix --output <path>` persists the same evidence to a local artifact file so dogfood reports do not depend on terminal scrollback. A dogfood Ghostty artifact must include `clipboard-read-approval` and `clipboard-write-approval` runs that stop at high-risk approval. A passing smoke run must include visible Ghostty app policy settings, a completed event, `Verified type_text` and `Verified press_key` action verification events, plus non-empty before/after screenshots from the packaged app product path.

For Chrome structured browser-control evidence through the packaged app:

```bash
npm run smoke:chrome -- --require-passed --output .skfiy-smoke/chrome-page.json
```

This launches an isolated Chrome profile with a temporary CDP port, launches `dist/skfiy.app` via LaunchServices with `--skfiy-chrome-cdp-endpoint=<endpoint>`, sends `打开 Chrome 测试页面 <file-url> 并提取正文` through `window.skfiy.runCommand`, approves Chrome app policy plus medium-risk browser state mutation, and verifies the extracted test-page text. It then sends `观察 Chrome 当前页面并提取正文` against the already-open page to record current-page DOM observation without a new navigation. It also runs a sensitive-page fixture and requires skfiy to pause before completing when page text contains password or one-time-code language. Next, it runs a multi-field form fixture with `填写 Chrome 测试表单 <file-url> 字段 #name=skfiy; #email=agent@skfiy.test; #role=operator 点击 #submit 并提取正文` and verifies each selector fill, selector click, and post-click extraction. Finally, it relaunches `dist/skfiy.app` once without `--skfiy-chrome-cdp-endpoint` and once with a deliberately broken endpoint to record screenshot fallback and fallback switching paths. A passing Chrome smoke artifact must include `runnerHasTmux=false`, product path `renderer -> preload -> main -> CDP -> Chrome`, Chrome app policy settings, `extractedText: skfiy chrome smoke ready`, `Verified navigate`, `Verified extract_text`, `currentPageRun.result: passed`, `currentPageRun.command: 观察 Chrome 当前页面并提取正文`, `currentPageRun.pageSnapshot.text: skfiy chrome smoke ready`, `Verified current_page_snapshot`, `Chrome current page extracted`, no `Verified navigate` in `currentPageRun.events`, `sensitiveRun.result: sensitive-paused`, `Verification failed (sensitive): Sensitive UI text is visible.`, `formRun.result: passed`, `formRun.fields` with `#name`, `#email`, and `#role`, `Verified fill_selector: Filled #name.`, `Verified fill_selector: Filled #email.`, `Verified fill_selector: Filled #role.`, `Verified click_selector`, `formRun.extractedText: skfiy agent@skfiy.test operator form submitted`, `fallbackRun.productPath: renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback`, `fallbackRun.result: fallback-observed` with a Chrome replay screenshot or `fallbackRun.result: fallback-blocked` with a Screen Recording/Accessibility permission reason, `fallbackSwitchRun.productPath: renderer -> preload -> main -> CDP failure -> helper observe_app -> Chrome screenshot fallback`, `fallbackSwitchRun.result: fallback-switched-observed` or `fallback-switched-blocked`, `Switching Chrome control from CDP to screenshot_fallback`, and empty skfiy/Chrome cleanup process lists.

For Finder item drag/drop and test-folder organization evidence through the packaged app:

```bash
npm run smoke:finder -- --item-drag-drop --require-passed --output .skfiy-smoke/finder-item-drag-drop.json
```

This launches `dist/skfiy.app` via LaunchServices, opens the fixture in Finder, sends `拖放 Finder 测试文件夹 <tmpdir>` through `window.skfiy.runCommand`, approves the Finder app policy and medium-risk local mutation, activates Finder through `skfiy-helper`, captures a before observation with `observe_app`, reads Finder semantic selection through Apple Events, previews the organization plan before file operations, reads fixture icon layout through Apple Events, runs a bounded HID drag from `photo.png` to `Images`, verifies the file actually moved, and then organizes the remaining files. A passing Finder smoke artifact must include `runnerHasTmux=false`, product path `renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder`, Finder app policy settings, `finderObservation.result: passed`, `finderObservation.frontmostBundleId: com.apple.finder`, a Finder screenshot path, `finderSemanticObservation.result: passed`, `finderSemanticObservation.source: finder-applescript`, `finderSemanticObservation.frontmostBundleId: com.apple.finder`, `finderPlanPreview.result: passed`, `finderPlanPreview.destructiveOperationCount: 0`, `finderPlanPreview.moveFiles` for `photo.png`, `notes.pdf`, and `script.ts`, `Finder plan preview: 3 folders, 3 moves, 0 destructive operations.`, `finderItemDragDrop.result: passed`, `finderItemDragDrop.source: finder-applescript-layout+hid-drag`, `finderItemDragDrop.movedItem: photo.png`, `finderItemDragDrop.targetItem: Images`, a before tree with `notes.pdf`, `photo.png`, and `script.ts`, an after tree with `Documents/notes.pdf`, `Images/photo.png`, and `Code/script.ts`, plus `Verified item_drag_drop`, `Verified create_folder`, and `Verified move_file` events. If Screen Recording, Accessibility, or Automation blocks the observe/semantic/layout/drag step, the artifact should be `blocked` and include the matching `finderObservation`, `finderSemanticObservation`, or `finderItemDragDrop` permission reason.

To prove the user-grounded Finder path instead of an explicit command path, run the same smoke with a Finder window target:

```bash
npm run smoke:finder -- --current-folder --require-passed --output .skfiy-smoke/finder-current-folder.json
```

This opens the temporary fixture folder in Finder, sends `整理 Finder 当前文件夹`, and requires `finderSemanticObservation.targetPath` to match `fixtureRoot` before the result can be classified as `passed`. Without Screen Recording, Accessibility, or Automation permission, the expected evidence remains `blocked`.

To prove a selected Finder folder target, run:

```bash
npm run smoke:finder -- --selected-folder --require-passed --output .skfiy-smoke/finder-selected-folder.json
```

This reveals and selects the temporary fixture folder in Finder, sends `整理 Finder 选中文件夹`, and requires `finderSemanticObservation.selectedItems` to include the fixture directory before the result can be classified as `passed`.

Current-folder and selected-folder Finder smoke runs also require a second approval after `finderPlanPreview` and before filesystem operations. Their passed artifacts must include `finderPlanConfirmation.result: passed` and `finderPlanConfirmation.confirmedAfterPreview: true`.

To place the isolated fixture under a real user-controlled directory instead of the system temp directory, add `--target-dir`:

```bash
mkdir -p ~/Desktop/skfiy-finder-dogfood
npm run smoke:finder -- --target-dir ~/Desktop/skfiy-finder-dogfood --item-drag-drop --require-passed --output .skfiy-smoke/finder-target-dir.json
```

The smoke script resolves the target directory, creates a new `skfiy-finder-smoke-*` fixture as a strict child of that directory, records `targetDirSafety`, and only removes the fixture root during cleanup. It must not operate on files outside the isolated fixture.

For a low-level native speech readiness check after building the helper:

```bash
./dist/skfiy-helper speech-status --locale zh-CN
```

This command does not record audio. It reports Speech Recognition permission, Microphone permission, and recognizer availability for the locale.

For product-path native speech evidence through the packaged app:

```bash
npm run smoke:voice -- --output .skfiy-smoke/voice-native.json
```

This launches `dist/skfiy.app` via LaunchServices, switches the renderer settings to the native macOS provider through the preload API, records structured `speechStatus` for Speech Recognition and Microphone readiness, calls `prepareDictation`, records provider/transcript/task events, calls `stopDictation`, and writes JSON evidence. Before Microphone and Speech Recognition are granted, the expected result is `blocked`. If the native provider listens but Speech returns no text or the turn is stopped before text is recognized, the expected result is `no-transcript` with `listening` plus `no_transcript` or `cancelled` provider events, no final transcript, and no downstream task submission. `--require-passed` should only be used after those permissions are granted, a final transcript can be produced, and `taskEvents` prove that transcript entered the Computer Use path.

## External CUA Planner

The default planner is local deterministic. To test the external CUA terminal planner bridge, launch the packaged app with:

```bash
SKFIY_PLANNER_MODE=external-cua \
SKFIY_EXTERNAL_CUA_ENDPOINT=https://example.internal/plan \
SKFIY_EXTERNAL_CUA_API_KEY=... \
open -na /Users/bytedance/Desktop/test/skfiy/dist/skfiy.app
```

The external endpoint receives a JSON task request for the Ghostty terminal-command capability and must return a single-line terminal command, for example `{ "command": "pwd" }`. skfiy redacts the API key in renderer settings, records the planner provider/command/rationale in the local replay transcript, and still routes the planned command through the local risk, approval, Ghostty isolation, screenshot, and replay path.

## Distribution Notes

This build is unsigned and unnotarized unless `npm run release:mac:sign` or `npm run release:mac:notarize` has been executed with valid credentials. For local dogfood, share the zip and manifest generated by `npm run alpha:artifact`, or share the repository with the matching commit SHA and ask testers to run the smoke commands locally after granting permissions. Ask testers to attach the `--matrix --output` Ghostty JSON artifact, the Chrome extraction JSON artifact including `currentPageRun`, the Finder item-drag/drop organization JSON artifact with `finderObservation`, `finderSemanticObservation`, `finderPlanPreview`, optional `finderPlanConfirmation` for current/selected folder runs, and `finderItemDragDrop`, the native voice artifact with final `transcriptEvents` and downstream `taskEvents` when voice passes or no-transcript/cancellation lifecycle evidence when it does not, the clipboard read/write approval run entries, any before/after screenshot paths listed in Ghostty or Finder evidence, and the `Verified type_text` / `Verified press_key` / `Verified navigate` / `Verified extract_text` / `Verified current_page_snapshot` / `Verified item_drag_drop` / `Verified create_folder` / `Verified move_file` event messages when Computer Use passes. Maintainers should convert 3-5 accepted issue reports into `.skfiy-dogfood/internal-alpha-cohort.json` before treating the alpha as internally dogfooded.

For real logged-in browser coverage, testers can additionally start their own Chrome with a remote debugging port and run `npm run smoke:chrome -- --current-page-endpoint http://127.0.0.1:9222 --output .skfiy-smoke/chrome-real-page.json`. That mode must report `targetMode: bring-your-own-current-page`, `chromeLaunchViaOpen=false`, `realCurrentPageRun`, no `Verified navigate` event, and either a passed current-page snapshot or a concrete blocked reason.

Dogfood reports should use the GitHub issue form at `.github/ISSUE_TEMPLATE/skfiy-dogfood.yml`. The form requires the alpha manifest, alpha zip, commit SHA, UI smoke artifact, Ghostty smoke artifact, Chrome smoke artifact, Finder smoke artifact, voice smoke artifact, `runnerHasTmux`, permission states, ASR provider, native voice transcript-to-task evidence, native voice no-transcript/cancellation evidence, Computer Use result, screenshot paths, action verification events, app policy settings, Chrome extracted text, Chrome current-page observation evidence, Chrome sensitive-page pause evidence, Chrome form action evidence, Chrome screenshot fallback evidence, Chrome fallback switching evidence, Finder observe_app evidence, Finder semantic selection evidence, Finder plan preview evidence, Finder plan confirmation evidence, Finder item drag/drop evidence, Finder before/after tree, clipboard approval runs, and panic stop notes.

Before any broader internal release:

- Run `npm run release:mac:check` and resolve missing Developer ID or Apple notary credentials.
- Run `npm run release:mac:notarize` successfully on the final artifact.
- Keep `npm run smoke:ui -- --output <path>` and `npm run dogfood:verify -- --manifest <path>` passing with permission setting direct-link evidence.
- Keep `npm run dogfood:cohort -- --cohort <path>` passing with 3-5 distinct testers and all four required workflow ids covered.
