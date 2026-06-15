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

Computer Use tasks cannot be reported as passing until Screen Recording and Accessibility are granted to `com.sskift.skfiy`.

When either required Computer Use permission is missing, skfiy preflights the turn and stops before opening Ghostty or sending helper actions. The smoke event should name the missing Screen Recording and/or Accessibility grant.

Left-clicking the pet also opens a permission onboarding panel before dictation when Screen Recording, Accessibility, or Microphone is denied or not determined.

## Smoke Test

After `npm run build`, run:

```bash
npm run smoke:ghostty
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
npm run smoke:ghostty -- --require-passed
```

The smoke output is JSON and records launch identity, task events, permissions, runtime status, replay records, screenshot file checks, and cleanup process checks. A passing smoke run must include a completed event plus non-empty before/after screenshots from the packaged app product path.

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

This build is unsigned and unnotarized. For local dogfood, share the repository or a zipped `dist/skfiy.app` with the matching commit SHA and ask testers to run the smoke command locally after granting permissions.

Before any broader internal release, add:

- Developer ID signing.
- Notarization.
- Versioned release artifacts.
- A permission onboarding screen that links directly to macOS settings.
- A dogfood issue template that includes the `npm run smoke:ghostty` JSON output.
