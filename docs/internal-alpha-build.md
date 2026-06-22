# skfiy internal alpha build

This document is the current internal-alpha workflow for the agent-first skfiy app.

## Product Contract

- The artifact must be a packaged macOS app and CLI binary: `dist/skfiy.app` and `dist/skfiy`.
- Do not collect alpha evidence from tmux, Vite-only renderer runs, direct Electron dev runs, or detached backend shells.
- Computer Use is an agent tool capability. It is not a separate user mode and does not compete with the agent provider.
- skfiy does not ship in-app audio input, input-method provider, or transcript-entry product paths.

## Required Permissions

Grant these to the packaged app identity before expecting passed Computer Use evidence:

- Screen Recording
- Accessibility

Finder Automation and the Chrome native host/extension are separate app-control integrations and should be reported through their own smoke evidence.

## Build

```bash
npm run build
npm run package:mac
```

Before sharing an alpha, confirm:

- `dist/skfiy.app` exists.
- `dist/skfiy` exists and is executable.
- The app bundle identifier is `com.sskift.skfiy`.
- `codesign --verify --deep --strict dist/skfiy.app` succeeds for the local unsigned/internal build expectations.

## Smoke Evidence

Run product smokes from an unlocked desktop session:

```bash
npm run smoke:ui -- --output .skfiy-smoke/ui-current.json
npm run smoke:desktop-session -- --output .skfiy-smoke/desktop-session-current.json
npm run smoke:ghostty -- --matrix --output .skfiy-smoke/ghostty-current.json
npm run smoke:chrome -- --output .skfiy-smoke/chrome-current.json
npm run smoke:finder -- --item-drag-drop --output .skfiy-smoke/finder-current.json
```

The long-horizon supervision smoke remains optional but important before broader dogfood:

```bash
npm run smoke:money-run -- --json-output .skfiy-smoke/money-run-current.json
```

Use `--require-passed` only after `smoke:desktop-session` passes and Screen Recording plus Accessibility are granted to the same packaged app identity.

## Alpha Artifact

Create the unsigned alpha zip and manifest:

```bash
npm run alpha:artifact -- \
  --ui-smoke-artifact .skfiy-smoke/ui-current.json \
  --smoke-artifact .skfiy-smoke/ghostty-current.json \
  --chrome-smoke-artifact .skfiy-smoke/chrome-current.json \
  --finder-smoke-artifact .skfiy-smoke/finder-current.json \
  --money-run-smoke-artifact .skfiy-smoke/money-run-current.json
```

The manifest records commit SHA, bundle identity, zip checksum, UI/Ghostty/Chrome/Finder smoke artifact paths, optional money-run supervision evidence, CLI/dashboard evidence, permission setting direct links, panic stop evidence, Chrome bridge evidence, Finder evidence, and Computer Use screenshots/actions when available.

Verify it:

```bash
npm run dogfood:verify -- --manifest <alpha-manifest>
```

Before publishing a signed or notarized candidate, run the release readiness
check and preserve the machine-readable JSON:

```bash
npm run release:mac:check -- --json-output .skfiy-release/mac-release-check.json
```

## Tester Runner

`dogfood:tester` runs packaged-app smokes sequentially and writes a checked issue draft:

```bash
npm run dogfood:tester -- \
  --manifest <alpha-manifest> \
  --tester-id <stable-real-tester-id> \
  --workflows coding-terminal,screenshot-inspection \
  --artifacts-dir .skfiy-smoke/dogfood/<stable-real-tester-id> \
  --issue-output .skfiy-dogfood/issues/<stable-real-tester-id>.md \
  --summary .skfiy-dogfood/<stable-real-tester-id>-summary.md
```

The runner refuses tmux, checks app bundle identity, runs UI/Ghostty/Chrome/Finder smokes, and then creates `dogfood:issue -- --check-report` evidence. It does not accept reports, add labels, edit tracking issues, or count anything toward cohort readiness.

## Report Requirements

Dogfood issue drafts and reports must include:

- Alpha manifest, zip, and commit SHA.
- UI, Ghostty, Chrome, and Finder smoke artifact paths.
- App bundle preflight and LaunchServices launch evidence.
- UI pet drag evidence.
- Panic stop evidence from `runtimeStatus.stopTurnHotkey` and product-path stop behavior.
- Computer Use result, screenshots, action verification events, app policy settings, and cleanup evidence.
- Chrome extension/native-host evidence and Finder observe/plan/drag evidence.
- Accepted GitHub issue metadata with `dogfood:accepted` and matching `workflow:*` labels.

Do not ask testers for audio-input artifacts, input-method provider state, or transcript evidence.
