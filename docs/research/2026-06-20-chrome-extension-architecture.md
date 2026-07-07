# Chrome Extension Adapter Architecture

Date: 2026-06-20

## Scope

This note covers the first skfiy Chrome extension adapter groundwork from the
current agent and Computer Use long plan. It is not a Codex plugin design
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

The active plan keeps the current skfiy cleanup direction, while this research
note records that the Codex Chrome surface exposes a controllable-tab model with
explicit user-tab claiming and session cleanup. Treat that as a product-level
reference point only: skfiy should support clear session
ownership and cleanup, but the private Codex claiming/finalization protocol is
unknown.

Sources:

- OpenAI Codex manual, `Codex Chrome extension`, fetched 2026-06-20 from
  `https://developers.openai.com/codex/app/chrome-extension`.
- Current active implementation plan:
  `docs/superpowers/plans/2026-07-07-code-health-cleanup.md`.

## skfiy Responsibilities

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
- `~/Library/Application Support/skfiy/chrome-host-policy.json` is the
  user-level product state file for the policy.
- The Native Messaging host answers `skfiy.host_policy.request` with the
  normalized policy state, and the MV3 background worker persists returned
  `hostPolicy.policy` into `chrome.storage.local` before enforcing page
  observe/action/screenshot routing.

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
`chrome.tabs.captureVisibleTab`, reads recent download status with
`chrome.downloads.search`, and persists native-host host-policy responses into
extension storage. Richer app-runtime approval routing and end-to-end
installed-extension smoke evidence remain future work.

## Sensitive Content Pause

The content script has a deliberately small sensitive-field affordance. It marks
the document with `data-skfiy-sensitive-paused`, sends
`skfiy.page.sensitive_pause`, and returns `sensitive-paused` when a fill/click
targets password, two-factor, payment, token, secret, or key-like fields.

This is only a page-local guardrail for the first adapter skeleton. The product
runtime still needs the long-plan safety model: host approvals, action risk
classification, screenshot/OCR sensitive-page checks, user-visible pause state,
and replay evidence.

The content script also answers a read-only `skfiy.page.diagnostics` request
with page-session metadata: loaded state, URL/host/title, sensitive-pause state,
and observation time. It does not include page text or form data. The background
worker only queries that session path when skfiy host policy allows the current
host and Chrome has granted the matching optional host permission.

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
  local heartbeat-based live connection health. It also reports the current
  normalized Chrome host-policy state under `extension.hostPolicy`, but not full
  installed-extension product smoke yet.
- `src/main/chrome-readiness.ts` now emits an offline readiness JSON for product
  smoke evidence. It combines the planned extension/native-host manifest,
  installed Native Messaging host status, normalized ask-by-default host policy,
  approval policy host extraction, and heartbeat-based live extension state.
  `smoke:chrome` records this as `readinessDiagnostics` before launching real
  Chrome paths, so CI can prove the extension/host contract is inspectable even
  when branded Chrome blocks unpacked extension loading.
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
- The popup now shows the latest host-policy sync state from extension storage
  (`source`, `updatedAt`, host-policy entry count, and last error text) and can
  manually refresh policy through the native host. It also exposes the extension
  manifest version, capabilities, derived native-host connection state, current
  tab host-policy decision/reason, optional Chrome host-permission state, and
  content-script page-session state. Missing HTTP/HTTPS optional host permission
  is reported as a read-only blocked diagnostic with the origin pattern that
  must be granted before page diagnostics or actions can run. Automated
  unpacked-extension loading remains blocked by branded Chrome's
  `--load-extension` removal, but a manually installed Chromium extension id
  `plcpkkhlcacihjfohlojdknnkademlno` has now proven `pageControl.ready` on
  an authorized localhost HTTP tab. The next architecture gap is turning that
  readiness into packaged CLI/dashboard page actions and a repeatable
  installed-extension smoke, not just popup diagnostics.
- 2026-06-21 implementation update: `skfiy chrome observe`, `screenshot`,
  `click`, `fill`, `submit`, and `scroll` are now packaged CLI page-control
  commands. The CLI opens extension wake URLs with explicit action parameters,
  the background service worker owns screenshot/action execution for the target
  tab, popup wake handling is limited to extension-context `dev-reload`, and the
  Native Messaging host persists bounded `pageObservation`, `pageActionResult`,
  `pageScreenshot`, and `latestCommand` evidence in
  `chrome-extension-connection.json`. Architecture-wise this validates the
  wake-url/native-heartbeat path and avoids duplicate click/submit/capture
  execution from popup plus background. Product-wise real compiled-binary runs
  passed for extension-context reload, observe, fill, click, submit, and scroll
  on an authorized localhost HTTP page. Screenshot is implemented but currently
  blocked by Chrome capture permission (`Either the '<all_urls>' or 'activeTab'
  permission is required.`) until the extension permission path or desktop
  fallback is proven. Next architecture gaps are tab discovery, repeatable
  installed-extension smoke, dashboard launchers, and sensitive/logged-in
  workflow recovery.
- 2026-06-22 dashboard dogfood update: `smoke:dashboard` now has an explicit
  `--extension-chrome-app` selector so `/api/chrome-control-action` dogfood can
  run with `SKFIY_CHROME_APP_NAME=Chromium` instead of the user's primary
  branded Chrome profile. The fixed Chromium dogfood extension id is
  `plcpkkhlcacihjfohlojdknnkademlno`; the preflight is a read-only check that
  `~/Library/Application Support/Chromium/NativeMessagingHosts/com.sskift.skfiy.json`
  allows `chrome-extension://plcpkkhlcacihjfohlojdknnkademlno/`, followed by
  `npm run smoke:dashboard -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --extension-chrome-app "Chromium" --output .skfiy-smoke/dashboard-chromium-web-control.json`
  against a disposable authorized HTTP(S) tab.
- A focused Vitest test validates the manifest and skeleton strings without
  launching Chrome.

Relevant Chrome references:

- Chrome Extensions blog, June 2025: `--load-extension` was removed in Chrome
  137 branded builds, with testing alternatives recommended.
- Chrome Native Messaging docs: extensions communicate with registered native
  messaging hosts over stdin/stdout, using host manifests and `allowed_origins`.
