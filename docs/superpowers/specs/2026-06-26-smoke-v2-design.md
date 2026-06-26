# Smoke V2 Design

## Goal

Replace the current ad hoc smoke surface with a layered smoke v2 runner that keeps product-path evidence but makes release gates, live field checks, artifacts, and blockers explicit.

## Problem

The existing `smoke:*` scripts grew independently. They use different artifact shapes, classify environment blockers differently, and mix fast build-contract checks with live macOS/Chrome/Finder/Ghostty work. A single stale or racy field artifact can look like a product failure, while real product defects can be hidden behind script-specific readers.

The Ghostty and Finder field runs exposed two concrete problems:

- Ghostty denial evidence can be overwritten by a later idle event.
- Finder current/selected-folder evidence can bind confirmation to one folder and execution evidence to another unless the approved plan is rechecked.

## Design

Smoke v2 is an orchestration layer over the existing product smoke scripts, not a rewrite of every adapter smoke in one pass.

It introduces:

- `scripts/smoke-v2-plan.mjs`: pure scenario catalog, argument parsing, artifact normalization, typed blocker extraction, and aggregate classification.
- `scripts/smoke-v2-product.mjs`: serial runner that executes selected scenarios, writes per-scenario artifacts, and emits one schema-versioned aggregate artifact.
- `npm run smoke:v2`: the stable entry point.

Layers:

- `contract`: fast build/CLI/provider prompt contracts, no live desktop app control.
- `packaged`: packaged app or Dashboard checks that should be valid for release gating.
- `field`: live macOS/Chrome/Finder/Ghostty/money-run checks that prove real local behavior and may legitimately return typed blockers.

Profiles:

- `silent`: no frontmost app control; runs CLI contracts and hidden Dashboard checks only. This is the default profile and should not steal mouse or keyboard focus.
- `release`: `contract + packaged`, intended for regular pre-handoff validation.
- `field`: live field tasks only; does not hide blockers behind generic failed status.
- `all`: runs every defined scenario.

## Artifact Contract

The aggregate artifact is JSON:

```json
{
  "schemaVersion": 2,
  "kind": "skfiy-smoke-v2",
  "profile": "release",
  "result": "passed",
  "scenarios": [
    {
      "id": "cli-basic",
      "layer": "contract",
      "result": "passed",
      "artifactPath": ".skfiy-smoke/v2/cli-v2-basic.json",
      "command": ["npm", "run", "smoke:cli:basic", "--", "--output", ".skfiy-smoke/v2/cli-v2-basic.json"]
    }
  ],
  "blockers": []
}
```

Per-scenario artifacts default to `.skfiy-smoke/v2/` so the legacy Dashboard smoke-evidence scanner does not treat v2 scratch artifacts as unsupported top-level product evidence. Their filenames still begin with the legacy target name, such as `ui-v2-product.json`, so an explicit custom top-level artifact directory remains readable by older evidence inference.

Typed blocker examples:

- `desktop-session-blocked`
- `needs-user-confirmation`
- `finder-target-mismatch`
- `ghostty-denied`
- `money-run-needs-attention`
- `stale-dashboard-build-mismatch`
- `browser-context-host-policy-blocked`
- `chrome-host-permission-missing`

## Release Semantics

`smoke:v2 --profile release --require-passed` fails only when a release-gate scenario fails. Field checks are intentionally outside the default release profile because they depend on local machine state.

`smoke:v2 --profile field` records real field state. A field blocker is useful evidence, not automatically a release gate failure unless `--require-passed` is explicitly set.

`smoke:v2` without a profile uses `silent`. It avoids `smoke:ui`, `smoke:ghostty`, `smoke:finder`, `smoke:chrome`, and `smoke:money-run` because those product-path checks intentionally activate frontmost apps and can steal input focus.

## Backward Compatibility

Existing `smoke:ui`, `smoke:dashboard`, `smoke:cli`, `smoke:ghostty`, `smoke:finder`, `smoke:chrome`, `smoke:desktop-session`, `smoke:automation-monitor`, and `smoke:money-run` remain available. Smoke v2 calls them and normalizes their outputs.

## Fixes Included

The smoke v2 work includes the pending Ghostty/Finder field hardening:

- Preserve denial classification when a later idle event is emitted.
- Read Finder smoke evidence by matching the isolated fixture root and preferring the latest matching event.
- Bind Finder plan confirmation to the approved preview and fail closed when the target changes before execution.
