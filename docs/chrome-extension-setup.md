# Chrome Extension Setup And Diagnostics

This guide is for a local skfiy operator who wants to install the unpacked
Chrome adapter, register the Native Messaging host, and confirm that the current
tab is ready for skfiy browser control.

## What Gets Installed

- Extension source: `chrome-extension/`
- Extension manifest: `chrome-extension/manifest.json`
- Native host name: `com.sskift.skfiy`
- Packaged native host executable: `dist/skfiy`
- Chrome Native Messaging manifest:
  `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.sskift.skfiy.json`
- Extension heartbeat:
  `~/Library/Application Support/skfiy/chrome-extension-connection.json`
- Host policy:
  `~/Library/Application Support/skfiy/chrome-host-policy.json`

The extension uses Manifest V3, `nativeMessaging`, `activeTab`, `scripting`,
`storage`, `tabs`, and `downloads`. It keeps `host_permissions` empty and uses
optional `http://*/*` and `https://*/*` permissions, so skfiy can ask for a host
before page observation or actions run.

## Install The Extension

1. Build the packaged app and CLI:

```bash
npm run build
```

2. Open Chrome, Chrome for Testing, or Chromium.

3. Go to `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
   and select the repository's `chrome-extension/` folder.

4. Copy the 32-character extension id from the extension card. Use that exact id
   in all native-host commands. If you reload the unpacked extension from a
   different path and Chrome assigns a new id, reinstall the native host.

Automated smoke loading with `--load-extension` should use Chrome for Testing or
Chromium. Branded Google Chrome 137+ can block that flag, and
`smoke:chrome` reports this as `branded_chrome_load_extension_removed` with the
recommended browser.

## Install The Native Messaging Host

Register the packaged `dist/skfiy` binary for the extension id:

```bash
./dist/skfiy chrome install-host --extension-id <extension-id>
```

Check the installed manifest:

```bash
./dist/skfiy chrome status --extension-id <extension-id>
```

A healthy manifest reports:

```json
{
  "nativeHost": {
    "state": "installed",
    "hostName": "com.sskift.skfiy",
    "manifestPath": ".../NativeMessagingHosts/com.sskift.skfiy.json",
    "allowedOrigins": ["chrome-extension://<extension-id>/"]
  }
}
```

If `nativeHost.state` is `missing`, run `chrome install-host`. If it is
`mismatched`, `invalid`, or `cli-missing`, rebuild and reinstall:

```bash
npm run build
./dist/skfiy chrome install-host --extension-id <extension-id>
```

The manifest must point at an absolute `dist/skfiy` path and include the loaded
extension origin in `allowed_origins`.

## Confirm The Bridge

Open the extension popup and click **Refresh host policy**. The useful fields
are:

- `Connection`: should move to `Synced with skfiy app`.
- `Bridge`: should be `Connected`.
- `Launch origin`: should be `chrome-extension://<extension-id>/`.
- `Native policy`: should be `Default`, `Configured`, or `Invalid`.
- `Policy sync`: should be `Synced`.
- `Last error`: should stay hidden.

The same native-message exchange writes the heartbeat file:

```bash
cat "$HOME/Library/Application Support/skfiy/chrome-extension-connection.json"
```

Expected heartbeat shape:

```json
{
  "schemaVersion": 1,
  "hostName": "com.sskift.skfiy",
  "observedAt": "2026-06-20T00:00:00.000Z",
  "launchOrigin": "chrome-extension://<extension-id>/",
  "messageType": "skfiy.host_policy.request",
  "requestId": "..."
}
```

`./dist/skfiy chrome status --extension-id <extension-id>` classifies this as
`extension.liveConnection: connected`, `stale`, `unknown`, or `invalid`.
Heartbeat evidence is fresh for five minutes. A stale or unknown heartbeat means
the native host may be installed but the extension has not talked to it recently.

## Check Current Tab Readiness

For a normal `http:` or `https:` page, the popup's current-tab fields should
look like this before page observation or actions are considered ready:

- `Current host`: the host you expect skfiy to control.
- `Host policy`: `Always allowed` or `Allowed this turn`, or `Ask by default`
  while waiting for a skfiy approval prompt.
- `Policy reason`: `Host allowed` after approval.
- `Host permission`: `Granted for http(s)://host/*`.
- `Page session`: `Loaded`.

The background worker only queries the content-script session when the skfiy
host policy allows the host and Chrome has granted the optional host permission.
If `Page session` is `Blocked by host policy`, approve the host in skfiy or add a
temporary policy entry:

```bash
./dist/skfiy chrome policy set --host example.com --action allow-current-turn
```

If `Host permission` says `Missing optional Chrome host permission`, open the
extension details page, grant site access for the current site, return to the
tab, and click **Refresh host policy**. On `chrome://`, `file://`, extension
pages, or other non-HTTP pages, host permission can be `Not required for this
page`, but structured page actions may still be unavailable.

## Readiness Snapshots

Use `doctor` before a real desktop test:

```bash
./dist/skfiy doctor --json --extension-id <extension-id>
```

The Chrome section combines:

- native host manifest status,
- extension adapter state and live heartbeat,
- host-policy file status,
- dashboard Chrome host-policy API reachability when `--dashboard-url` is also
  provided.

`readiness.checks.extension.ready` is true only when the native host is
installed and the extension heartbeat is connected.

For product evidence, run:

```bash
npm run smoke:chrome -- --extension-chrome-app "Google Chrome for Testing" --output .skfiy-smoke/chrome-extension.json
```

The smoke records `readinessDiagnostics`, `nativeHostBridgeRun`, and
`installedExtensionRun`. A complete installed-extension pass proves the MV3
extension sent a Native Messaging frame to `dist/skfiy`, the host responded, and
the heartbeat file matches the loaded `chrome-extension://.../` origin.

## Common Blockers

- Extension id not provided: pass `--extension-id <id>` to `chrome status`,
  `doctor`, and plugin smoke commands.
- Native host missing: run `./dist/skfiy chrome install-host --extension-id <id>`.
- Native host mismatched: rebuild and reinstall after the extension id or CLI
  path changes.
- No live heartbeat: open the popup and click **Refresh host policy**; check
  that the Native Messaging manifest `allowed_origins` contains the current
  extension id.
- Host policy blocked: approve the host for the current turn or set/reset the
  local Chrome host policy.
- Missing Chrome host permission: grant site access for the current site in the
  extension details page.
- Login or sensitive form visible: skfiy should pause rather than fill
  passwords, one-time codes, tokens, API keys, or payment fields.
- Screen locked, display asleep, or `loginwindow` active: unlock the Mac and
  keep the display awake before running Chrome smoke or desktop fallback tests.
- Screen Recording or Accessibility denied: grant the compiled `dist/skfiy.app`
  when CDP is unavailable and the Chrome path falls back to screenshot or
  pointer control.
- Branded Chrome blocks automated unpacked loading: use Chrome for Testing or
  Chromium for `smoke:chrome --extension-chrome-app`.

## Reset

Uninstall only the Native Messaging manifest:

```bash
./dist/skfiy chrome uninstall-host --extension-id <extension-id>
```

Reset skfiy's host policy to ask by default:

```bash
./dist/skfiy chrome policy reset
```

Then reload the extension from `chrome://extensions` and reinstall the native
host if the extension id changed.
