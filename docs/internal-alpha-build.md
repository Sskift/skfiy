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

The smoke output is JSON and records launch identity, task events, permissions, runtime status, replay records, screenshot file checks, and cleanup process checks.

## Distribution Notes

This build is unsigned and unnotarized. For local dogfood, share the repository or a zipped `dist/skfiy.app` with the matching commit SHA and ask testers to run the smoke command locally after granting permissions.

Before any broader internal release, add:

- Developer ID signing.
- Notarization.
- Versioned release artifacts.
- A permission onboarding screen that links directly to macOS settings.
- A dogfood issue template that includes the `npm run smoke:ghostty` JSON output.
