# ADR: skfiy CUA Provider Path

Date: 2026-06-16

## Decision

Decision: local deterministic baseline, external CUA evaluation, no default cloud autonomy.

skfiy should keep `local-deterministic` as the default planner for internal dogfood. `external-cua` remains an opt-in evaluation mode behind explicit endpoint and API key settings. `disabled` remains a first-class fail closed mode for users, dogfooders, and reviewers who need to turn Computer Use planning off without changing the rest of the app.

This is a product safety decision, not a claim that the local planner is smarter. The local baseline is reproducible, inspectable, and already wired through skfiy's permission preflight, app allowlist, Ghostty isolation, approval flow, screenshots, and replay logs. External CUA providers can improve planning quality, but they must prove they can preserve those same guardrails before they become default.

## Current provider modes

- `local-deterministic`: default. The user's text is treated as the terminal command candidate and still goes through skfiy's local risk, approval, Ghostty ownership, screenshot, and replay path.
- `external-cua`: evaluation mode. The configured provider receives a Ghostty task request and the `terminal-command capability`; it must return a single-line command and optional rationale. skfiy still owns execution, risk checks, permission checks, screenshots, and replay.
- `disabled`: fail closed. No model/provider may plan a Computer Use action.

## Provider candidates

OpenAI Computer Use is a strong external CUA candidate because the Responses API `computer` tool follows the harness pattern skfiy needs: the model inspects screenshots, returns UI actions, and the host app executes those actions and returns fresh observations. The older `computer-use-preview` path should be treated as legacy or compatibility evidence rather than the default integration target.

AIOS Computer Use is a strong internal execution-substrate candidate if it exposes stable native macOS screenshot, accessibility tree, click, type, scroll, drag, app activation, and action-verification APIs. Current internal search surfaces AIOS, OpenClaw, and Computer Use research, but this repo does not yet have verified evidence of a stable native macOS plugin contract that can replace skfiy's helper and replay path.

AIME remains the likely distribution and assistant workflow home after skfiy proves the native desktop control gap. It should not decide the CUA model default until packaged-app evidence shows the underlying control loop is trustworthy.

## Internal research summary

- AIME Buddy: current evidence describes a macOS companion for task notification, approval, and multi-agent status. It overlaps skfiy's pet/status surface, not the native Computer Use runtime.
- AIME Browser: strong browser-agent evidence, including DOM plus screenshot/VLM loops and WebVoyager-style evaluation. It overlaps browser control, not Ghostty/Finder/native app control.
- AIME platform: useful as a cloud/background agent and later distribution/workflow surface. It does not currently appear to own the native macOS screenshot/accessibility/action loop skfiy is validating.
- AgentBuddy skill sync: relevant for publishing skills into AIME spaces, not for desktop control.
- AIOS/OSNative: promising execution-layer direction, but current searchable evidence does not show a verified Electron/macOS provider API skfiy can depend on.
- OpenClaw/UI-TARS: useful reference architecture for screenshot/VLM/action loops and virtual Mac isolation. It is a spike candidate, not yet a supported embeddable provider contract for skfiy.

## Promotion gates

Trigger to promote external CUA from evaluation mode to candidate default only when all of these are true:

- Each internal dogfood report first passes `npm run dogfood:verify -- --manifest <alpha-manifest> --require-passed` on its own machine, then the aggregated `.skfiy-dogfood/internal-alpha-cohort.json` passes `npm run dogfood:cohort -- --cohort <path> --require-passed` with 3-5 distinct testers and all required workflow ids covered by passed product-path reports.
- Ghostty and native voice product smokes both pass through `dist/skfiy.app`, LaunchServices `open`, and `runnerHasTmux=false`.
- The provider returns an inspectable rationale plus a bounded action or command schema that skfiy can validate before execution.
- External provider failures, timeouts, policy denials, malformed actions, and prompt-injection detections fail closed with replay evidence.
- The provider never bypasses skfiy's app allowlist, risk approval, panic stop, permission preflight, screenshot evidence, or replay transcript.
- The provider improves a real task scorecard beyond the local baseline: command success, recovery quality, latency, user trust, and rollback clarity.

## Consequences

- Do not bind skfiy's default planner to any cloud model or single provider yet.
- Keep the current `external-cua` API intentionally narrow around the `terminal-command capability` until the packaged product path passes reliably.
- Keep model/provider settings visible in the right-click settings panel, but treat external CUA as an advanced dogfood setting.
- Continue designing the local runtime so it can host either OpenAI Computer Use, AIOS Computer Use, or an AIME-owned planner later.
- Record provider label, command/action, rationale, permission state, and replay artifacts on every external CUA turn.

## Sources and evidence

- OpenAI API Computer Use guide: https://developers.openai.com/api/docs/guides/tools-computer-use
- Internal search on 2026-06-16: `bytedcli insearch query "AIME desktop computer use native macOS app control"`
- Internal search on 2026-06-16: `bytedcli insearch query "Aime Buddy 桌面宠物 native app control"`
- Internal search on 2026-06-16: `bytedcli insearch query "Aime Chrome Extension browser control Computer Use"`
- Internal search on 2026-06-16: `bytedcli insearch query "AIOS Computer Use native macOS runtime screenshot accessibility click type"`
- Internal AIME Buddy sources: `topic_id=7651761162953968604`, `id=7633610626392214481`, `id=7642167791243545814`.
- Internal AIME Browser source: https://bytetech.info/articles/7527571268003741705?from=skill
- Internal AIOS/OSNative source: `topic_id=7651761166716242924`, `id=7641453941858929614`.
- Internal OpenClaw/UI-TARS sources: https://bytetech.info/articles/7462432482143502351?from=skill and https://bytetech.info/articles/7612929796696932388?from=skill
- Internal OpenClaw VM source: https://bytetech.info/articles/7611067042372059162?from=skill
- Local implementation evidence: `src/main/planner-provider-settings.ts`, `src/main/planner-provider-runtime.ts`, `src/main/external-cua-planner.ts`, `scripts/verify-dogfood-artifacts.mjs`, and `scripts/verify-dogfood-cohort.mjs`.
