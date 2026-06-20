# skfiy dashboard evidence summary

## Scope

The local dashboard now exposes `GET /api/evidence-summary` as a compact,
token-free operator evidence API. It is intended for dashboard cards, Codex
plugin adapters, and supervision agents that need to answer: can skfiy currently
prove Computer Use/operator state, Codex plugin wiring, and Chrome extension
bridge health?

## Lanes

- `computer-use-operator`: operator readiness, current-turn stream, replay
  evidence, `money-run` supervision, and blocking dashboard alert counts.
- `codex-plugin`: latest `codex-plugin` smoke artifact, packaged MCP product
  path, freshness, and next action when missing or stale.
- `chrome-extension`: runtime extension heartbeat, Native Messaging host state,
  latest Chrome smoke, packaged host bridge proof, and installed-extension proof.

## Safety Boundary

The endpoint summarizes allowlisted fields only. It does not return raw
transcripts, raw screenshot paths, raw alert messages, or arbitrary smoke JSON.
Known token-like query strings and key/value secrets are redacted before output.

The existing `/snapshot.json` remains the detailed dashboard state source.
`/api/evidence-summary` is the small supervision contract for quick health
checks and status cards.
