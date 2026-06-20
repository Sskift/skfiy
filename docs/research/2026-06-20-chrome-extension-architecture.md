# Chrome Extension Adapter Architecture

Date: 2026-06-20

## Scope

This note covers the first skfiy Chrome extension adapter groundwork from the
2026-06-16 voice computer control long plan. It is not a Codex plugin design
and it does not describe private OpenAI implementation internals.

The first checked-in extension is a static Manifest V3 skeleton under
`chrome-extension/`. It has no build tooling, no bundled app integration, and no
native host installer yet. Its job is to pin the adapter boundary before the
signed app, CLI, dashboard, and smoke tests wire it into product execution.

## Public Codex Behavior Used As Reference

The current public Codex manual describes the Chrome extension as a plugin-set-up
extension for tasks that need a user's signed-in Chrome state. It says the setup
flow is initiated from Codex Plugins, installs the Codex Chrome extension, asks
the user to approve Chrome permission prompts, and expects the extension popup
to show a Connected state.

Public docs also describe these product behaviors:

- Codex should prefer the in-app browser for local development servers,
  file-backed previews, and public pages that do not need the user's Chrome
  profile.
- Codex can use Chrome when the task needs logged-in browser context, and can
  group thread browser work into Chrome tab groups.
- Website access is host-based and ask-by-default. The user can allow a website
  for the current chat, always allow the host, or decline the website.
- Allowlist and blocklist settings are user-managed. Removing an allowlist entry
  makes Codex ask again; removing a blocklist entry lets Codex ask again.
- Browser history is treated separately: Codex asks when it wants history, scopes
  the access to the request, and does not offer an always-allow option.
- Chrome's install prompt may include broad extension capabilities, including
  debugger/page access, read/change website data, browsing history, notifications,
  bookmarks, downloads, native application communication, and tab groups.
- The extension may need file URL access when a task uploads a local file.

Private Codex implementation details are unknown. Unknowns include the native
host name, message schemas, content script layout, service worker state machine,
tab claiming/finalization protocol, screenshot transport, host policy storage,
history filtering, debugger usage, cleanup behavior, and sensitive-action
classifiers. skfiy should not copy or infer those details.

The local long plan also records that the current Codex Chrome surface exposes a
controllable-tab model with explicit user-tab claiming and session cleanup. Treat
that as a product-level reference point only: skfiy should support clear session
ownership and cleanup, but the private Codex claiming/finalization protocol is
unknown.

Sources:

- OpenAI Codex manual, `Codex Chrome extension`, fetched 2026-06-20 from
  `https://developers.openai.com/codex/app/chrome-extension`.
- Local long plan:
  `docs/research/2026-06-16-voice-computer-control-long-plan.md`.

## Skfiy Responsibilities

skfiy's extension is a product adapter for the skfiy desktop runtime, not the
first step in a Codex plugin. A later Codex plugin can expose skfiy through MCP
or app integrations after the local runtime is stable.

The extension owns browser-local observation and action routing:

- Service worker: connection lifecycle, active-tab routing, native messaging
  bridge boundary, host policy checks, and dynamic content-script injection.
- Content script: DOM snapshot, visible text, form metadata, ARIA/role-style
  labels, element bounds, and page-local structured actions.
- Popup: connection and current-host policy status only. It is not the main
  dashboard and it must not become the approval surface for long-running turns.

The native messaging host name is `com.sskift.skfiy`. `skfiy chrome
install-host` installs the user-level Chrome manifest for the packaged
`dist/skfiy` CLI path. The packaged shim can also run as the Chrome Native
Messaging host when Chrome starts it over stdin/stdout, rather than depending on
tmux or a development shell.

When that packaged host handles a valid extension frame, it records a heartbeat
at `~/Library/Application Support/skfiy/chrome-extension-connection.json`.
`skfiy chrome status` and the dashboard snapshot classify that file as a
connected, stale, or unknown live extension connection and include the latest
launch origin, message type, request id, observed time, and age. The remaining
product gap is a real installed-Chrome smoke that proves the extension can load,
connect, send a frame through the packaged binary, and leave the heartbeat behind
without using a source checkout.

## Host Policy

The default host policy is ask. The skeleton keeps `host_permissions` empty and
declares HTTP/HTTPS in `optional_host_permissions` so future product code can
request host access only after skfiy's app policy allows the host for the turn.

The policy shape is:

```json
{
  "defaultMode": "ask",
  "allowedHosts": [],
  "currentTurnAllowedHosts": [],
  "blockedHosts": []
}
```

Initial behavior:

- blocked hosts fail closed;
- always-allowed and current-turn hosts can receive observe/action messages;
- all other hosts return a host-policy response asking the app to prompt the
  user.

Browser history is not part of this skeleton. Future history access must stay
turn-scoped and explicit, with no always-allow option.

## Message Contracts

The first structured message names are stable strings, not a complete schema:

- `skfiy.page.observe`
- `skfiy.page.observe_result`
- `skfiy.page.action`
- `skfiy.page.action_result`
- `skfiy.page.sensitive_pause`
- `skfiy.host_policy.request`
- `skfiy.host_policy.response`
- `skfiy.native.message`

Every native-bound message carries a request id, schema version, and bounded
payload. `src/main/chrome-native-host.ts` now encodes/decodes Chrome's
little-endian length-prefixed JSON frames, rejects malformed or oversized
messages, honors an injectable app-policy block, and runs browser-action schema
validation before dispatch. `src/main/chrome-browser-action-schema.ts`
normalizes observe messages and validates safe navigate, click selector/text/role,
fill, scroll, confirmed submit, page screenshot, and downloads-status actions.
Unsafe navigation URLs, sensitive form fills, incomplete targets, unconfirmed
submits, and unconfirmed local download-path exposure are blocked before the
extension sees them. The background service worker unwraps
`skfiy.native.message`, waits for `port.onMessage`, returns the native-host
response to the caller, captures visible page screenshots with
`chrome.tabs.captureVisibleTab`, and reads recent download status with
`chrome.downloads.search`. Persistent app-policy storage, richer app-runtime
routing, and end-to-end installed-extension smoke evidence remain future work.

## Sensitive Content Pause

The content script has a deliberately small sensitive-field affordance. It marks
the document with `data-skfiy-sensitive-paused`, sends
`skfiy.page.sensitive_pause`, and returns `sensitive-paused` when a fill/click
targets password, two-factor, payment, token, secret, or key-like fields.

This is only a page-local guardrail for the first adapter skeleton. The product
runtime still needs the long-plan safety model: host approvals, action risk
classification, screenshot/OCR sensitive-page checks, user-visible pause state,
and replay evidence.

## Fallback Order

The target adapter order remains:

1. Chrome extension structured observe/action.
2. Existing CDP structured control.
3. macOS screenshot/OCR/Accessibility fallback.

The checked-in skeleton implements only the first layer's static files and
contracts. It does not yet replace CDP smoke coverage or alter existing Chrome
runtime behavior.

## Integration Notes

- The extension is not yet packaged or installed by the app bundle.
- `skfiy chrome status|install-host|uninstall-host` covers manifest setup and
  local heartbeat-based live connection health, but not full installed-extension
  product smoke yet.
- `smoke:chrome` now records `installedExtensionRun` separately from the direct
  packaged Native Messaging host bridge. On the current machine, `Google Chrome`
  146 reports `blockedReason: branded_chrome_load_extension_removed`; the smoke
  confirms `--load-extension` only exposes built-in Chrome extensions such as
  "Google Network Speech", not the unpacked skfiy adapter. This matches Chrome's
  2025 change removing `--load-extension` from branded Chrome 137+ builds.
- The next installed-extension proof must therefore run against Chrome for
  Testing/Chromium, or against a user-installed skfiy extension id in the user's
  real Chrome profile. Until then, the product gate relies on the packaged
  `dist/skfiy -> Chrome Native Messaging heartbeat` bridge plus CDP/browser
  control evidence and keeps the live extension path as an explicit blocker.
- The popup says "Waiting for skfiy app" until native-host health is wired.
- A focused Vitest test validates the manifest and skeleton strings without
  launching Chrome.

Relevant Chrome references:

- Chrome Extensions blog, June 2025: `--load-extension` was removed in Chrome
  137 branded builds, with testing alternatives recommended.
- Chrome Native Messaging docs: extensions communicate with registered native
  messaging hosts over stdin/stdout, using host manifests and `allowed_origins`.
