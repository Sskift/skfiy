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
  -- --smoke-artifact .skfiy-smoke/ghostty-matrix-9260.json \
  --voice-smoke-artifact .skfiy-smoke/voice-native.json
```

This writes a versioned zip and manifest to `.skfiy-alpha/`, for example:

```text
.skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.zip
.skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json
```

The manifest records the exact commit SHA, bundle identifier, unsigned/notarized state, zip byte size, SHA256 checksum, the Ghostty smoke artifact path, and the native voice smoke artifact path used for dogfood evidence.

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

Left-clicking the pet also opens a permission onboarding panel before dictation when Screen Recording, Accessibility, or Microphone is denied or not determined.

The native macOS speech provider is a one-shot local Speech framework prototype. It uses `speech-status` for readiness checks and `transcribe-speech` for a bounded recording turn with silence timeout. Before Speech Recognition is granted, status is expected to report `speechRecognition: notDetermined` or `denied` and native transcription must fail closed.

## Smoke Test

After `npm run build`, run:

```bash
npm run smoke:ghostty -- --output .skfiy-smoke/ghostty-smoke.json
```

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

The smoke output is JSON and records launch identity, task events, permissions, runtime status, replay records, screenshot file checks, and cleanup process checks. `--output <path>` persists the same evidence to a local artifact file so dogfood reports do not depend on terminal scrollback. A passing smoke run must include a completed event plus non-empty before/after screenshots from the packaged app product path.

For a low-level native speech readiness check after building the helper:

```bash
./dist/skfiy-helper speech-status --locale zh-CN
```

This command does not record audio. It reports Speech Recognition permission, Microphone permission, and recognizer availability for the locale.

For product-path native speech evidence through the packaged app:

```bash
npm run smoke:voice -- --output .skfiy-smoke/voice-native.json
```

This launches `dist/skfiy.app` via LaunchServices, switches the renderer settings to the native macOS provider through the preload API, calls `prepareDictation`, records provider/transcript/task events, calls `stopDictation`, and writes JSON evidence. Before Microphone and Speech Recognition are granted, the expected result is `blocked` or `no-transcript`; `--require-passed` should only be used after those permissions are granted and a final transcript can be produced.

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

This build is unsigned and unnotarized. For local dogfood, share the zip and manifest generated by `npm run alpha:artifact`, or share the repository with the matching commit SHA and ask testers to run the smoke command locally after granting permissions. Ask testers to attach the `--output` JSON artifact and any before/after screenshot paths listed in that artifact.

Dogfood reports should use the GitHub issue form at `.github/ISSUE_TEMPLATE/skfiy-dogfood.yml`. The form requires the alpha manifest, alpha zip, commit SHA, Ghostty smoke artifact, voice smoke artifact, `runnerHasTmux`, permission states, ASR provider, Computer Use result, screenshot paths, and panic stop notes.

Before any broader internal release, add:

- Developer ID signing.
- Notarization.
- A permission onboarding screen that links directly to macOS settings.
