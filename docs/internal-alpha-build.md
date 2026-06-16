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

The manifest records the exact commit SHA, bundle identifier, unsigned/notarized state, zip byte size, SHA256 checksum, the UI smoke artifact path, the Ghostty smoke artifact path, the Chrome smoke artifact path, the Finder smoke artifact path, the native voice smoke artifact path, permission setting direct-link evidence, native voice transcript-to-task evidence, native voice no-transcript/cancellation evidence, accepted GitHub dogfood issue source evidence, and required app policy, observe, semantic Finder, Finder plan preview, and Finder plan confirmation evidence used for dogfood.

Verify the evidence chain before sharing an alpha:

```bash
npm run dogfood:verify -- --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json
```

This gate checks the manifest, zip byte count, UI smoke artifact, Ghostty smoke artifact, Chrome smoke artifact, Finder smoke artifact, native voice smoke artifact, LaunchServices launch markers, `runnerHasTmux=false`, product paths, permission setting direct-link targets, native voice transcript-to-task evidence for passed voice runs, native voice no-transcript/cancellation lifecycle evidence for no-transcript runs, accepted GitHub dogfood issue source evidence, Chrome safe-page extraction, Chrome current-page observation evidence, Chrome sensitive-page pause evidence, Chrome form action evidence, Chrome screenshot fallback evidence, Chrome fallback switching evidence, Finder observe_app evidence, Finder semantic selection evidence, Finder plan preview evidence, Finder plan confirmation evidence for current/selected folder runs, Finder item drag/drop evidence, Finder organization evidence, and process cleanup. Add `--require-current-head` before sharing a local alpha so stale manifests from older commits fail. Add `--require-passed` only after the machine has granted the required Screen Recording, Accessibility, Microphone, and Speech Recognition permissions and the product smokes are expected to pass.

For a read-only status snapshot of the same alpha plus the current GitHub tracking issue:

```bash
npm run dogfood:status -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --summary .skfiy-dogfood/status.md
```

`dogfood:status` summarizes the alpha manifest, local smoke artifact results, current permission blockers, accepted report issue URLs already filled into the tracking issue, current git HEAD comparison when available, current-alpha tester assignment packet comment presence when GitHub comments are readable, per-issue validation for current-alpha identity plus exact accepted/workflow labels, and separate passed workflow coverage based on linked issues whose `Computer Use result` is `passed`. A manifest older than HEAD is reported as a next action to publish a fresh alpha or intentionally keep testing the older selected alpha; it is a warning by default and a strict readiness gate only with `--require-current-head`. Its recommended review commands carry the same GitHub `--tracking-issue-url` used for status so maintainer review links eligible accepted reports back to the intended cohort issue, and its suggested `tester-N` ids avoid tester ids already parsed from linked report issues. If the current `skfiy-alpha-<commit>` assignment packet comment is missing while assignments exist, status tells maintainers to post it before asking more testers to run the alpha. It is intentionally non-mutating: it does not create reports, update the tracking issue, or claim cohort readiness. Readiness is based on verified accepted report issue URLs and workflow coverage from those verified issues, not merely the number of links or checked boxes present in the tracking issue. `readiness.canRunPassedCohort` and the Markdown `Passed cohort gate ready` line turn true only when the accepted real tester issues also cover every required workflow with passed product-path evidence. When the cohort has enough accepted real reports but still lacks passed workflow coverage, `dogfood:status` assigns the missing workflows with purpose `passed-workflow-evidence` and includes `--require-passed` in the generated prepare/tester commands.

To make the unsigned alpha downloadable by remote testers, publish it as a GitHub pre-release after a dry-run:

```bash
npm run alpha:github-release -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --require-current-head
```

Add `--execute` only after checking the generated release notes and confirming the manifest belongs to the current HEAD. The release uploads the alpha zip and manifest; it does not sign, notarize, or claim cohort readiness.
When `--execute` succeeds, it also refreshes `docs/release-evidence/latest-alpha.json` from the same manifest and release URL so plan evidence stays attached to the published alpha. Dry-runs do not modify that evidence file.

After the GitHub release is published, generate and optionally update the tracking issue from the same manifest:

```bash
npm run dogfood:tracking-issue -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --output .skfiy-dogfood/tracking-issue-<commit>.md
```

This is a dry-run by default. Add `--execute` only after reviewing the generated body; it runs `gh issue edit` and replaces the tracking issue with a body whose Current Alpha identity matches the selected manifest while preserving existing accepted report issue URLs from the real-tester slots. Follow it with `dogfood:status` so stale release/hash links are caught before asking testers to run the alpha. Use `--require-current-head` only before sharing a freshly built local alpha, not for published-release coordination from later documentation commits.

For a tester machine, prepare the downloadable alpha before collecting evidence:

```bash
npm run dogfood:prepare-alpha -- \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tester-id tester-a \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --execute
```

`dogfood:prepare-alpha` defaults to dry-run. With `--execute`, it downloads the GitHub release zip and manifest, verifies the zip SHA256 against the manifest, extracts `skfiy.app`, checks the extracted `Info.plist` identity (`CFBundleIdentifier=com.sskift.skfiy`, `CFBundleName=skfiy`, `CFBundleDisplayName=skfiy`, `CFBundleExecutable=skfiy`), installs the app under `.skfiy-dogfood/apps/<tag>/`, and generates a handoff whose `dogfood:tester` command uses that extracted app bundle. Passing `--tracking-issue-url` lets it infer the tester's assigned workflows from the tracking issue and keeps the handoff's maintainer review command linked to the same cohort issue. Pass `--app /Applications/skfiy.app --replace-existing` only when the tester intentionally wants to install over an existing Applications copy. The JSON result includes `nextCommands.tester` and `nextCommands.review` with the downloaded manifest path and installed app path filled in; `dogfood:tracking-issue` and `dogfood:status` tell testers to copy those commands after preparation instead of guessing an install path. The recommended tester command includes `--file-issue`, which creates only the dogfood report issue after local validation; maintainers still review and accept it separately. Pass `--require-passed` to `dogfood:prepare-alpha` only when the tester machine already has Screen Recording, Accessibility, Microphone, and Speech Recognition ready; it propagates strict mode into the handoff and `nextCommands.tester`.

Before asking a tester to run the alpha, generate a handoff note with the exact package identity and commands:

```bash
npm run dogfood:handoff -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --app <path-to-unzipped-skfiy.app> \
  --tester-id tester-a \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --output .skfiy-dogfood/handoffs/tester-a.md
```

`dogfood:handoff` writes a copyable tester packet with the alpha zip path, SHA256, release URL, explicit app bundle path, no-tmux warning, permission checklist, `dogfood:tester --file-issue` command, issue filing instructions, and maintainer review commands. The maintainer review command carries the configured tracking issue URL so eligible accepted reports produce the right tracking-slot update command. The handoff generator itself does not create or accept GitHub reports.
Use a stable real tester id such as `tester-a` or an anonymized handle. Reserved synthetic prefixes (`local-*`, `prepare-*`, `preflight-*`, and `synthetic-*`) are rejected by `dogfood:handoff` and by default in `dogfood:tester` because they can never satisfy the real-user cohort gate. Maintainer-only local/preflight runs may pass `--allow-synthetic-tester-id`, but those artifacts remain synthetic evidence and must not be counted as real tester reports.

For a single tester, prefer the one-command runner so all packaged-app smokes run sequentially and the checked GitHub issue body is generated from the exact artifacts it just wrote:

```bash
npm run dogfood:tester -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --app <path-to-unzipped-skfiy.app> \
  --tester-id tester-a \
  --workflows coding-terminal,screenshot-inspection \
  --artifacts-dir .skfiy-smoke/dogfood/tester-a \
  --issue-output .skfiy-dogfood/issues/tester-a.md \
  --summary .skfiy-dogfood/tester-a-summary.md \
  --file-issue
```

`dogfood:tester` refuses to run from tmux, defaults `--app` to `dist/skfiy.app` when omitted, validates the selected app path as lowercase `skfiy.app` with bundle id `com.sskift.skfiy` before running product smokes, passes that app path through every packaged-app smoke, runs `smoke:ui`, `smoke:ghostty -- --matrix`, `smoke:chrome`, `smoke:finder -- --item-drag-drop`, and `smoke:voice`, then runs `dogfood:issue -- --check-report` with those five artifact paths. It does not accept GitHub reports, add labels, edit the tracking issue, or count anything toward the cohort. A maintainer must still review the generated/filed issue and add `dogfood:accepted` plus workflow labels before the report can count toward the cohort. Use `--finder-target-dir ~/Desktop/skfiy-finder-dogfood` to place Finder fixtures under a real tester-owned parent directory, `--chrome-current-page-endpoint http://127.0.0.1:9222` for consenting logged-in current-page Chrome evidence, and `--require-passed` only when the tester machine has granted the permissions needed for passed Ghostty, Chrome, Finder, and voice smokes. In `--require-passed` mode, the runner now parses the first UI smoke permission snapshot and stops before the long Computer Use smokes if Screen Recording, Accessibility, Microphone, or Speech Recognition is not already granted.
The generated run summary includes a `Smoke Results` table that parses each packaged smoke's JSON stdout into result, product path, and permission states before listing the exact commands. It also includes a copy-safe `gh issue create --body-file ...` command. Passing `--file-issue` runs that command after the checked issue body is generated. That command intentionally creates only the dogfood report issue; testers should not apply `dogfood:accepted` or `workflow:*` labels themselves.

After a tester runs the packaged-app smokes manually, generate a GitHub dogfood issue body draft from the same manifest and smoke artifact paths instead of copying fields by hand:

```bash
npm run dogfood:issue -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tester-id tester-a \
  --workflows coding-terminal,screenshot-inspection \
  --check-report \
  --output .skfiy-dogfood/issues/tester-a.md
```

The draft writes the alpha manifest basename, alpha zip basename, commit SHA, checked cohort workflows, all five absolute smoke artifact paths, `app bundle preflight` evidence (`appPath`, LaunchServices launch command, `appLaunchViaOpen`, `runnerHasTmux`, and product path), permission states, ASR provider, Computer Use result, screenshots, action verification messages, app policy settings, and core Chrome/Finder/voice evidence into the same `###` sections parsed by `dogfood:report`. `--check-report` round-trips the draft through the same report parser with synthetic accepted labels, then prints `reportPreviewEligibility` from `dogfood:cohort` report-level checks. Incompatible headings, alpha identity, app bundle identity, or artifact paths fail before the tester files the issue; `reportPreviewEligibility.eligible=false` means the report would not count toward cohort coverage until the listed blocking checks are fixed. Testers should paste the draft into a `skfiy dogfood report` issue and attach or otherwise preserve the referenced local smoke JSON files for maintainer review.

Before applying accepted labels, maintainers should run a non-mutating review against the filed GitHub issue:

```bash
npm run dogfood:review -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --issue-url https://github.com/Sskift/skfiy/issues/<filed-dogfood-issue> \
  --summary .skfiy-dogfood/reviews/<stable-tester-id>.md
```

`dogfood:review` reads the real issue body, synthesizes the labels that would be required for acceptance, reuses the same manifest-backed `dogfood:report` parser against the issue's smoke artifact paths, and writes a maintainer summary with suggested labels, a copy-safe `gh issue edit ... --add-label ...` acceptance command, and a `dogfood:tracking-issue --accepted-report-url ...` command for eligible real tester reports. If alpha identity or artifact validation fails, it still exits failed but writes a `Result: rejected` summary with the blocking reason and no acceptance/tracking commands. It does not add labels, edit the tracking issue, or count the report toward the cohort. Synthetic tester ids can still be reviewed as local evidence, but they do not get a real tracking-slot command.

After reviewing the summary, rerun the same command with `--execute` to add the missing `dogfood:accepted` and `workflow:*` labels and refresh the tracking issue in one validated maintainer step:

```bash
npm run dogfood:review -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --issue-url https://github.com/Sskift/skfiy/issues/<filed-dogfood-issue> \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --summary .skfiy-dogfood/reviews/<stable-tester-id>.md \
  --execute
```

After each single-user dogfood report is accepted, generate a report JSON from the alpha manifest and the tester smoke artifact paths in the accepted issue body, then add or replace it in the local cohort file:

Track the current internal alpha cohort in https://github.com/Sskift/skfiy/issues/1. Each accepted single-user dogfood issue should be linked there before being converted into local `.skfiy-dogfood/` JSON. The tracking issue lists required workflow coverage as requirements only; real coverage is computed from verified accepted report issue labels by `dogfood:status` and `dogfood:cohort`. Accepted report issues should carry `dogfood:accepted` plus the covered workflow labels (`workflow:coding-terminal`, `workflow:screenshot-inspection`, `workflow:finder-file`, `workflow:browser-fallback`) before maintainers run `dogfood:report`.

```bash
npm run dogfood:report -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --issue-url https://github.com/Sskift/skfiy/issues/<accepted-dogfood-issue> \
  --report .skfiy-dogfood/reports/tester-a.json \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json
```

`dogfood:report` reads the alpha identity from the manifest, requires a readable accepted issue body from `gh issue view`, derives `testerId` from the issue `tester id` field, derives `workflows` from checked `cohort workflows`, requires the issue `alpha manifest`, `alpha zip`, and `commit sha` fields to match the manifest passed with `--manifest`, requires all five UI/Ghostty/Chrome/Finder/voice smoke artifact paths from the issue body, requires each smoke JSON `artifactPath` to match the issue-listed path it was read from, requires `app bundle preflight` to match the UI smoke artifact `appPath`, LaunchServices launch command, `appLaunchViaOpen`, `runnerHasTmux`, and product path, validates `dogfood:accepted` plus workflow labels matching the derived workflows, derives one report object with `testerId`, `result`, `manifestPath`, `appLaunchViaOpen=true`, `runnerHasTmux=false`, `workflows`, `permissionStates`, accepted GitHub issue source metadata, matching `source.issueLabels`, and absolute UI/Ghostty/Chrome/Finder/voice artifact paths, preserves one report per tester, rejects reports from a different alpha manifest, and prints readiness without treating an incomplete cohort as complete. `summary.cohortReady` requires 3-5 testers, full workflow coverage, and `sourceEligibleReports=totalReports`; the JSON verifier remains the final gate. Use `--tester-id`, `--workflows`, or `--issue-labels dogfood:accepted,workflow:coding-terminal,...` only as explicit overrides for tester/workflow/label fields; they cannot replace issue artifact, app preflight, or alpha identity evidence. Keep `.skfiy-dogfood/` local; it can contain tester-specific evidence and is ignored by git.

Maintainers can skip manual one-by-one URL copying once accepted report issue links are filled into the tracking issue:

```bash
npm run dogfood:collect -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --reports-dir .skfiy-dogfood/reports \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary.md
```

`dogfood:collect` fetches the tracking issue with `gh issue view`, discovers linked accepted report issue URLs from the `Required Real Tester Count` section, converts each issue through the same `dogfood:report` gates, writes deterministic per-tester report JSON files under `.skfiy-dogfood/reports/`, writes the cohort JSON, and immediately runs `dogfood:cohort`. It is a collection helper only: real completion still requires 3-5 actual tester report issues and a passing cohort verifier. Local synthetic tester ids such as `local-*`, `prepare-*`, `preflight-*`, and `synthetic-*` may be collected for debugging evidence, but they do not satisfy the real-user count or required workflow coverage.

After 3-5 single-user dogfood reports are collected, verify cross-user coverage:

```bash
npm run dogfood:cohort -- \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary.md
```

The cohort file is separate from the alpha manifest. It should list one report per tester with `testerId`, `result`, `manifestPath`, `commitSha`, `appLaunchViaOpen=true`, `runnerHasTmux=false`, `workflows`, `permissionStates`, accepted GitHub issue source metadata, matching accepted/workflow issue labels, `artifactSource=github-issue-smoke-artifacts`, issue alpha manifest/zip/commit identity, and absolute UI/Ghostty/Chrome/Finder/voice artifact paths. The verifier requires 3-5 distinct real testers, real-tester coverage for `coding-terminal`, `screenshot-inspection`, `finder-file`, and `browser-fallback`, and source issue identity that matches the report manifest and commit. Workflow coverage is counted only from real tester reports that satisfy the report-level source, artifact, permission, LaunchServices, and identity gates. The optional summary Markdown is local coordination output that shows missing workflows, blocking checks, per-tester status, issue links, distinct real tester count, synthetic report count, and separate passed workflow coverage without replacing the JSON verifier. A permission-blocked real tester report may cover a workflow for cohort source-quality purposes, but it does not count as passed product-path evidence.

When judging whether the cohort proves product-path execution rather than only source quality, run the strict passed gate:

```bash
npm run dogfood:cohort -- \
  --cohort .skfiy-dogfood/internal-alpha-cohort.json \
  --summary .skfiy-dogfood/internal-alpha-summary.md \
  --require-passed
```

`--require-passed` fails unless every required workflow is covered by at least one accepted real tester report whose `Computer Use result` is `passed`.

Check Developer ID signing and notarization readiness:

```bash
npm run release:mac:check
```

This command is read-only. It reports the packaged app path, the notary zip path, the hardened-runtime entitlements path (`release/skfiy.entitlements.plist`), planned `codesign`, `ditto`, `notarytool`, and `stapler` steps when requested, and any missing credentials. A real signed release requires `SKFIY_DEVELOPER_ID_APPLICATION` plus either `APPLE_KEYCHAIN_PROFILE` or all of `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD`.

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

The native macOS speech provider is a one-shot local Speech framework prototype. It uses `speech-status` for readiness checks and `transcribe-speech` for a bounded recording turn with silence timeout. Tune the packaged app's native speech run with `SKFIY_NATIVE_SPEECH_MAX_DURATION_MS` and `SKFIY_NATIVE_SPEECH_SILENCE_TIMEOUT_MS` when a dogfood machine needs a longer listening window; defaults are `7000` and `900`. Before Speech Recognition is granted, status is expected to report `speechRecognition: notDetermined` or `denied` and native transcription must fail closed.

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

This launches `dist/skfiy.app` via LaunchServices, switches the renderer settings to the native macOS provider through the preload API, records structured `speechStatus` for Speech Recognition and Microphone readiness using the smoke/settings locale, calls `prepareDictation`, records provider/transcript/task events, calls `stopDictation`, and writes JSON evidence. Use `--locale <id>` or `SKFIY_NATIVE_SPEECH_LOCALE` when testing a locale other than the default `zh-CN`. Before Microphone and Speech Recognition are granted, the expected result is `blocked`. If the native provider listens but Speech returns no text or the turn is stopped before text is recognized, the expected result is `no-transcript` with `listening` plus `no_transcript` or `cancelled` provider events, no final transcript, and no downstream task submission. `--require-passed` should only be used after those permissions are granted, a final transcript can be produced, and `taskEvents` prove that transcript entered the Computer Use path.

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

Dogfood reports should use the GitHub issue form at `.github/ISSUE_TEMPLATE/skfiy-dogfood.yml`; testers can prepare and self-check its body with `npm run dogfood:issue -- --check-report`, then confirm `reportPreviewEligibility.eligible=true` before filing. The form requires the alpha manifest, alpha zip, commit SHA, UI smoke artifact, Ghostty smoke artifact, Chrome smoke artifact, Finder smoke artifact, voice smoke artifact, `runnerHasTmux`, app bundle preflight (`appPath`, LaunchServices launch command, `appLaunchViaOpen`, `runnerHasTmux`, and product path), permission states, ASR provider, native voice transcript-to-task evidence, native voice no-transcript/cancellation evidence, Computer Use result, screenshot paths, action verification events, app policy settings, Chrome extracted text, Chrome current-page observation evidence, Chrome sensitive-page pause evidence, Chrome form action evidence, Chrome screenshot fallback evidence, Chrome fallback switching evidence, Finder observe_app evidence, Finder semantic selection evidence, Finder plan preview evidence, Finder plan confirmation evidence, Finder item drag/drop evidence, Finder before/after tree, clipboard approval runs, and panic stop notes.

Before any broader internal release:

- Run `npm run release:mac:check` and resolve missing Developer ID or Apple notary credentials.
- Keep `release/skfiy.entitlements.plist` in the planned `codesign --entitlements` command for the Electron runtime, native helper, and microphone-capable speech flow.
- Run `npm run release:mac:notarize` successfully on the final artifact.
- Keep `npm run smoke:ui -- --output <path>` and `npm run dogfood:verify -- --manifest <path>` passing with permission setting direct-link evidence.
- Keep `npm run dogfood:cohort -- --cohort <path>` passing with 3-5 distinct real testers and all four required workflow ids covered by source/artifact/permission-eligible reports.
- Keep `npm run dogfood:cohort -- --cohort <path> --require-passed` passing before claiming the cohort proves product-path execution for all four workflows.
