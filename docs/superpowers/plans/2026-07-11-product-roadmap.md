# skfiy Long-Term Product Feature Roadmap

> This is the repository's single active implementation plan. It defines the
> product capabilities skfiy should deliver over the long term. Engineering
> cleanup, test slimming, and internal refactors are supporting work only: they
> belong in a feature cut when they reduce delivery risk, but they are not the
> roadmap itself.

## Product Promise

skfiy should feel like a small local companion that can talk with the user,
understand what is happening in supported apps, ask for permission before it
acts, complete useful work, and show exactly what it did.

The product is local-first and agent-first:

- The desktop pet is the primary user entry point.
- The Background Agent answers, clarifies, refuses, or requests a Computer Use
  tool call.
- Computer Use is owned by skfiy and remains permissioned, observable,
  stoppable, and verifiable.
- Browser Context is a bounded enhancement from the Chrome extension bridge.
- The Dashboard is an operator and history surface, not a replacement for the
  pet.
- The packaged CLI and MCP server expose the same product capabilities to local
  supervisors and integrations.

The long-term goal is not arbitrary autonomous desktop control. It is reliable
assistance across explicit app adapters and user-approved workflows.

## Target Users and Jobs

### Individual Mac User

- Ask a question without opening a separate chat application.
- Use current browser context without pasting the page manually.
- Ask for a bounded file, browser, or terminal task and approve the proposed
  mutation before it runs.
- Stop work immediately and inspect the result afterward.
- Keep preferences and useful context locally across sessions.

### Developer and Power User

- Switch among supported Background Agent providers.
- Delegate a terminal, browser, Finder, or tmux-supervision workflow.
- Inspect route choice, tool calls, blockers, replay, and verification.
- Start or monitor long-running local work without making skfiy depend on tmux.
- Use the packaged CLI or MCP tools from another local agent.

### Operator and Tester

- See whether the app, permissions, provider, browser bridge, and supported
  adapters are ready.
- Diagnose an exact typed blocker and take the next action.
- Review current turn, replay, memory, automation, smoke, dogfood, and release
  state without exposing secrets.
- Validate the same packaged product path that users receive.

## Current Product Baseline

The roadmap starts from these working foundations:

- A floating macOS pet with click, drag, task state, settings, approval, stop,
  and manifest-driven skins.
- Background Agent modes for bounded local fallback, Codex, Claude Code, and
  Hermes-style provider execution.
- Separate Background Agent and Computer Use Planner settings.
- Local conversation memory, post-turn review, session recall, personal skills,
  and working-profile prompt layers.
- Computer Use permission checks for Screen Recording and Accessibility, with
  separate Finder Automation and Chrome permission states.
- Explicit route support for Ghostty, Finder, Chromium/Chrome, screenshots, and
  tmux supervision.
- App-policy and action-risk gates, approval state, global stop, task events,
  current-turn snapshots, and replay.
- Chrome extension pageControl for tab discovery, bounded page observation,
  Browser Context, DOM actions, screenshots, host policy, and native-host
  health.
- A loopback Dashboard with runtime readiness, provider state, Browser Context,
  current turn, replay, memory, sessions, prompt stack, automation monitors,
  dogfood, and release state.
- A packaged operator CLI and local MCP server with typed JSON results.
- Product smoke, dogfood, alpha, and release workflows built around the packaged
  app and CLI.

The current baseline proves the architecture. The next milestones should turn
those foundations into coherent user workflows rather than adding more
diagnostic surfaces.

## Product Principles

### Pet First

The common path starts and ends at the pet. Setup, readiness, approvals, task
progress, failures, and completion should be understandable without requiring
the Dashboard or terminal.

### Progressive Autonomy

Read-only observation can be lightweight. Local mutations require a clear plan
and approval according to risk. Destructive, privileged, credential, payment,
external-message, and installer workflows remain strongly gated or refused.

### Visible Control

The user must always be able to tell:

- what skfiy understood,
- which app and object it intends to affect,
- whether it is observing, waiting, executing, verifying, or blocked,
- what requires approval,
- how to stop,
- what changed,
- whether verification passed.

### Explicit Adapters

App support is a product contract. A new app becomes supported only when it has
a route, capabilities, safety policy, status model, verification strategy, and
packaged product smoke.

### Local Data Ownership

Settings, memory, sessions, replay, automation definitions, and operator state
remain local by default. Secrets and unbounded page or screen content must not
leak into logs, Dashboard responses, smoke summaries, or provider prompts.

### Provider Neutrality

Provider selection changes the Background Agent or Computer Use Planner, not
skfiy's permission model. Provider CLIs never gain direct desktop mutation
authority through pet chat.

## Roadmap Overview

| Milestone | Status | User outcome |
| --- | --- | --- |
| 1. Daily Companion | In progress | The pet is understandable and useful every day |
| 2. Browser and File Coworker | In progress | Chrome and Finder workflows complete safely end to end |
| 3. Personal Agent | In progress | Sessions, providers, memory, and preferences are user-controlled |
| 4. Long-Running Work and Automations | Foundations available | Local work can run, pause, resume, and report over time |
| 5. Adapter Platform | Later | New apps can be added through a stable capability contract |
| 6. Trusted Distribution | Ongoing | Users can install, update, diagnose, and recover the product |

Milestones describe product outcomes, not rigid release dates. A feature can
move earlier when it unlocks a complete user journey, but safety foundations
must not be deferred behind UI polish.

## Milestone 1: Daily Companion

Status: in progress and the highest product priority.

### 1.1 First-Run Readiness

Build a pet-first setup path that answers four questions:

1. Is a Background Agent available?
2. Can skfiy observe and control the desktop?
3. Is Browser Context connected and permitted?
4. Which supported workflows are ready now?

Features:

- A compact first-run checklist in the pet settings surface.
- Provider discovery and a safe test turn.
- Direct links to Screen Recording and Accessibility settings.
- Finder Automation status with a clear test action.
- Chrome extension/native-host setup status and the current blocker.
- A visible distinction between optional enhancements and blockers for normal
  chat.
- Resume setup from the last incomplete step without resetting working state.

Acceptance:

- A user can reach a normal chat reply without granting Computer Use
  permissions.
- Every blocked Computer Use step presents one exact reason and next action.
- Setup never claims an OS or browser permission is granted when it is unknown.
- The Dashboard and CLI expose the same readiness semantics.

### 1.2 Conversation Continuity

Features:

- Local conversation history with stable session titles and timestamps.
- Start, switch, rename, archive, and delete sessions.
- Restore the last active session after app restart.
- Distinguish user text, agent replies, Computer Use requests, approvals,
  results, and stopped turns.
- Retry a failed provider turn without replaying an already executed Computer
  Use mutation.
- Show provider identity and provider readiness without turning provider choice
  into the main conversation UI.

Acceptance:

- Session operations persist locally and are reversible where practical.
- Archived or deleted sessions do not remain in prompt recall.
- A retry cannot silently repeat an external side effect.
- History remains usable when the selected provider is offline.

### 1.3 Clear Task Control

Features:

- One compact plan preview before a mutating Computer Use workflow.
- Current app, target, risk, approval requirement, and expected verification.
- Persistent stop affordance while a task is active.
- Distinct waiting, approval, executing, verifying, completed, failed,
  cancelled, and blocked states.
- A concise completion summary with an entry into replay.
- Recovery actions such as retry observation, retry verification, revise plan,
  or open readiness details.

Acceptance:

- `app_policy_denied`, `user_denied`, `blocked`, `confirmation_required`,
  `failed`, `cancelled`, and `completed` remain distinct.
- `stopTurnBehavior` produces visible `Task stopped` state and replay evidence.
- Stop never claims to undo an external side effect that already occurred.
- No approval control appears for a route that cannot execute.

### 1.4 Pet Experience

Features:

- Stable click, right-click, drag, and multi-display positioning.
- State-driven animation that reflects real task state rather than decorative
  activity.
- Skin selection, local import, validation, preview, and reset.
- Compact notification behavior for approval requests, completion, failure, and
  long-running task attention.
- Accessibility labels and keyboard paths for core controls.

Acceptance:

- The pet remains usable on small and multi-display layouts.
- Interaction does not depend on invisible hit areas or stale screen bounds.
- Local-only licensed skins never enter public release assets.
- Notifications do not expose page text, commands, filenames, or secrets by
  default.

## Milestone 2: Browser and File Coworker

Status: in progress after the daily-companion control path.

### 2.1 Browser Context Source Control

Features:

- Show the selected Chrome tab, title, host, freshness, and context state.
- Let the user choose among eligible tabs rather than relying only on the
  current active tab.
- Refresh, pause, disconnect, and clear Browser Context for the current turn.
- Explain internal-page, file-page, host-policy, site-access, content-script,
  and screenshot blockers separately.
- Preview the bounded text and metadata categories that may reach the
  Background Agent without exposing the entire page in logs.

Acceptance:

- Context is attached only to the selected turn and eligible host.
- Stale or disconnected context is visibly marked and not described as ready.
- Sensitive and unsupported pages remain blocked.
- Host policy and Chrome optional permissions remain separate decisions.

### 2.2 Browser Workflows

Features:

- Multi-step observe, click, fill, submit, scroll, and verify plans.
- A review step before sensitive form submission or externally visible action.
- Selector and target recovery when the page changes between observation and
  action.
- DOM-first verification with screenshot fallback where permitted.
- Clear handling for navigation, new tabs, authentication walls, downloads,
  and page reloads.
- Reusable local workflow templates for bounded tasks such as collecting page
  information or filling a known internal form.

Acceptance:

- Each action is tied to one selected tab and current request ID.
- Fill values are not echoed into replay, logs, or native-host summaries.
- Submit and external communication require the appropriate approval level.
- A changed page causes re-observation or a typed blocker rather than a blind
  click.

### 2.3 Finder Workflows

Features:

- Observe current Finder location and selection.
- Preview file operations before execution.
- Create folders, rename, move, copy, group, and drag/drop within an explicit
  bounded selection.
- Collision handling with skip, rename, replace, or cancel choices.
- Verification of destination, resulting names, counts, and failed items.
- Safe handling for Trash, protected locations, aliases, packages, and external
  volumes.

Acceptance:

- Every mutating file workflow presents source, destination, item count, and
  collision policy before approval.
- Finder Automation remains a separate typed permission gate.
- Partial success reports completed and failed items without losing either.
- Destructive deletion and irreversible replacement remain strongly gated.

### 2.4 Ghostty and Terminal Workflows

Features:

- Observe the active terminal context without treating arbitrary terminal text
  as trusted instructions.
- Preview command, working directory, risk classification, and expected result.
- Execute supported command turns through skfiy's approval and action path.
- Capture bounded exit status and verification without storing secret output.
- Provide a safe retry path for observation or verification failures.

Acceptance:

- Read-only and mutating commands remain distinct.
- Privileged, destructive, installer-pipe, credential, and hidden automation
  patterns require stronger approval or refusal.
- Background Agent providers cannot bypass the terminal adapter by running their
  own local tools.

## Milestone 3: Personal Agent

Status: in progress on top of existing local memory foundations.

### 3.1 Provider Management

Features:

- Discover installed providers and show readiness without exposing credentials.
- Select Background Agent and Computer Use Planner independently.
- Provider-specific timeout and working-directory controls with safe defaults.
- A bounded test request that validates identity, sandbox, and response parsing.
- Graceful fallback or explicit offline state when the selected provider is
  unavailable.

Acceptance:

- Provider settings persist locally and remain token-free in Dashboard and CLI.
- A provider test cannot execute Computer Use or mutate the workspace.
- Provider identity does not replace skfiy's own product identity in replies.

### 3.2 Memory Control Center

Features:

- Inspect durable user preferences, local agent facts, and pending memory
  proposals.
- Add, edit, approve, reject, and forget memory entries.
- Show why an entry was learned and which session or turn produced it.
- Separate durable profile memory from session recall and temporary working
  context.
- Export and reset memory locally.

Acceptance:

- Secret-like text and unsafe prompt instructions are blocked from durable
  memory.
- Forget and reset remove the entry from future prompt construction.
- Memory changes are journaled locally without retaining hidden raw prompts.
- The user can disable post-turn learning while keeping ordinary chat.

### 3.3 Workspace and Preference Profiles

Features:

- Optional profiles for different working directories or activity contexts.
- Per-profile provider, planner, memory scope, app policy, and workflow defaults.
- Explicit profile switching from pet settings and Dashboard.
- No implicit profile switch based only on untrusted page content.

Acceptance:

- The active profile is always visible when it changes behavior.
- Profile data remains local and exportable.
- App and host policies cannot silently broaden during a profile switch.

## Milestone 4: Long-Running Work and Automations

Status: foundations available through automation monitors and tmux supervision.

### 4.1 Automation Definitions

Features:

- Create a named local automation from a proven supported workflow.
- Define manual, scheduled, or local-state triggers.
- Preview target apps, permissions, read/write behavior, approval mode, timeout,
  and verification before enabling.
- Pause, resume, duplicate, edit, run now, and delete.
- Keep disabled automations inert after app restart or provider failure.

Acceptance:

- Only supported adapter workflows can become automations.
- Enabling an automation never broadens macOS, Chrome, app, or host policy.
- Mutating automations retain an explicit approval and risk policy.
- Trigger payloads cannot inject new unreviewed actions.

### 4.2 Monitor and Run Lifecycle

Features:

- Queued, running, waiting, attention, completed, failed, cancelled, and expired
  run states.
- Concurrency, retry, timeout, and backoff controls.
- Per-run timeline, current step, latest verification, and next action.
- Pause or stop from pet, Dashboard, CLI, or MCP with one shared outcome model.
- Compact local notifications for approval, attention, completion, and failure.

Acceptance:

- Runs survive renderer restarts without becoming invisible.
- Duplicate triggers do not execute the same mutation concurrently unless
  explicitly configured.
- A stopped or expired run cannot silently resume.
- Notifications contain bounded metadata only.

### 4.3 Long-Horizon Supervision

Features:

- Read-only health and progress probes for supported tmux sessions or other
  explicitly integrated workers.
- Attention detection for stalled, waiting, failed, or completed work.
- User-approved recovery actions such as send input, restart a known step, or
  collect a bounded summary.
- Cost, duration, and retry budgets where the underlying provider exposes them.

Acceptance:

- skfiy does not depend on tmux for its own product runtime.
- Read-only monitoring and mutating recovery remain distinct.
- Supervision never grants the Background Agent direct terminal authority.

## Milestone 5: Adapter Platform

Status: later, after Chrome, Finder, and Ghostty workflows are dependable.

### 5.1 Adapter Contract

Define one product contract for supported apps:

- route selection and target identity,
- observable capabilities,
- required permissions,
- risk and approval policy,
- plan schema,
- execution hooks,
- verification strategy,
- stop behavior,
- replay events,
- typed blockers,
- packaged smoke acceptance.

Acceptance:

- Shared primitive availability does not make an app a supported route.
- An adapter can be disabled without destabilizing chat or other adapters.
- Capability and blocker semantics are consistent across pet, Dashboard, CLI,
  and MCP.

### 5.2 Candidate App Expansion

Prioritize new adapters by complete user job rather than application popularity.
Candidate categories include:

- a notes or knowledge application,
- a code editor workflow,
- a calendar or task workflow,
- an additional browser only when it can meet the same context and permission
  contract.

Each candidate requires a narrow first workflow, safety review, verification,
and real packaged smoke before broader actions are added.

### 5.3 Local Integration Surface

Features:

- Versioned CLI JSON contracts.
- Stable local MCP tools for status, observation, approved action, stop, and
  replay.
- Adapter capability discovery without exposing implementation internals.
- Local workflow import/export with schema validation and preview.

Acceptance:

- External local agents receive the same permission boundaries as the pet.
- No local integration can call hidden mutation primitives directly.
- Incompatible schema versions fail with a typed, actionable result.

## Milestone 6: Trusted Distribution

Status: ongoing across all milestones.

### 6.1 Install and Update

Features:

- Signed and notarized macOS application releases.
- Clear first launch, permission identity, and upgrade behavior.
- Update availability, release notes, download, verification, and restart flow.
- Safe rollback or recovery instructions when an update fails.
- Chrome native-host and extension compatibility checks during upgrades.

Acceptance:

- Updating does not silently reset settings, memory, policies, or automations.
- Permission identity remains stable across releases.
- Stale app, CLI, helper, native host, and extension builds are diagnosed
  separately.

### 6.2 Local Data and Recovery

Features:

- Export and restore settings, profiles, memory, sessions, and automation
  definitions without provider secrets.
- Per-domain reset controls instead of one destructive global reset.
- Storage health, schema migration, and corrupted-file recovery.
- Retention controls for replay, screenshots, and run history.

Acceptance:

- Export is inspectable, bounded, and token-free.
- Restore previews affected domains before writing.
- Failed migrations preserve the previous local data for recovery.

### 6.3 Diagnostics and Support

Features:

- One local diagnostic report with explicit redaction and preview.
- Copyable typed blockers and next actions.
- Component versions for app, CLI, helper, provider, Chrome extension, and
  native host.
- Optional debug artifacts only after explicit user action.

Acceptance:

- Default status and smoke remain artifact-free.
- Diagnostic preview shows exactly what will be exported.
- Tokens, raw Browser Context, command output, private paths, and screenshots
  are excluded unless individually and explicitly included.

## Cross-Cutting Functional Requirements

### Safety

- No Computer Use without the required OS and adapter permissions.
- No hidden approval bypass in release behavior.
- No silent host-policy or app-policy expansion.
- No direct local mutation by Background Agent provider CLIs.
- Every mutation has target, plan, risk, outcome, and verification state.

### Privacy

- Local-first persistence.
- Bounded provider prompts.
- Redaction before serialization, not only before rendering.
- User controls for memory, replay, screenshots, and diagnostics retention.

### Reliability

- Renderer, Dashboard, extension, provider, and helper failures must not leave a
  task falsely marked as running or completed.
- Retries must be idempotent where possible and must not duplicate external
  side effects.
- Stale snapshots and stale build identities must be visible.

### Accessibility and Interaction

- Core pet and approval workflows support keyboard interaction.
- Status is communicated by text and semantics, not animation or color alone.
- Compact surfaces remain readable without overlapping at supported sizes.

### Observability

- One canonical route and outcome vocabulary across pet, replay, Dashboard,
  CLI, MCP, smoke, and release status.
- Operator state is bounded and token-free.
- Default product operation does not create evidence directories.

## Immediate Feature Order

Unless a product blocker changes priority, execute feature cuts in this order:

1. Pet-first first-run readiness using existing provider, permission, Finder,
   and Chrome status APIs.
2. Local conversation session navigation and safe retry semantics.
3. Browser Context source, freshness, pause, and explicit tab targeting.
4. Compact Computer Use plan preview with unified approval, stop, completion,
   and replay states.
5. Finder preview, collision policy, partial-result reporting, and verification.
6. Browser multi-step action recovery and sensitive-submit confirmation.
7. Memory control center for inspect, approve, edit, forget, export, and reset.
8. Automation definition and monitor lifecycle controls in pet and Dashboard.
9. Provider discovery and independent planner management polish.
10. Adapter contract extraction after the first three adapters meet their
    end-to-end acceptance criteria.

Do not start a broad new adapter while first-run readiness, task control, or the
existing Chrome/Finder workflow is still incomplete.

## Feature Cut Requirements

Every feature cut must include:

- the user job and visible outcome,
- the owning product surface,
- permission and risk behavior,
- failure and recovery behavior,
- typed status and replay behavior where Computer Use is involved,
- focused tests for the owned contract,
- a packaged product smoke for user-visible macOS, Dashboard, or adapter work,
- no default evidence or artifact output.

Engineering cleanup may accompany the cut only when it is necessary to create
the owned feature boundary. Test-only slimming remains useful maintenance, but
it must not displace the Immediate Feature Order for multiple consecutive cuts.

## Verification

Before each implementation cut:

```bash
npx vitest run src/main/plan-doc-status.test.ts --reporter=dot
```

After each focused commit:

```bash
git diff --check
npm run typecheck -- --pretty false
env -u TMUX npx vitest run --reporter=dot
npm run build
env -u TMUX npm run smoke:cli:basic -- --require-passed
```

Product-facing work also runs the matching packaged smoke:

```bash
npm run smoke:ui
npm run smoke:dashboard
npm run smoke:chrome
npm run smoke:finder
npm run smoke:ghostty
```

Run only the smokes relevant to the changed feature. Default smoke commands
remain output-free. Use `--output` only for explicit release, dogfood, or
debugging evidence capture.

Build verification must produce:

- `dist/skfiy.app`
- `dist/skfiy`
- `dist/skfiy-helper`

## Product Success Criteria

The roadmap succeeds when:

- A new user can get a normal agent reply before configuring Computer Use.
- The pet explains every missing readiness dependency without requiring CLI
  knowledge.
- Supported Chrome, Finder, and Ghostty workflows can plan, approve, execute,
  stop, verify, and replay through the packaged app.
- Browser Context is explicit, fresh, bounded, and user-controlled.
- Sessions and memory persist locally with inspect, forget, export, and reset
  controls.
- Long-running work can be monitored and stopped without hidden mutation.
- A new app is never called supported before it meets the adapter contract.
- Installation, upgrade, diagnostics, and local-data recovery are dependable.

## Explicit Non-Goals

- Generic control of every visible macOS application.
- Hidden autonomous mutation without user-visible policy and outcome state.
- Cloud-first accounts, cloud memory, or mandatory remote telemetry.
- A remotely accessible Dashboard.
- Provider CLIs directly controlling the desktop from pet chat.
- Replacing macOS Accessibility or Screen Recording with the Chrome bridge.
- Owned audio capture, dictation, speech recognition, or input-method wrapping
  in the current roadmap.
- A plugin marketplace before the adapter contract and distribution trust model
  are stable.
- Treating line count, test count, or internal refactoring as a product
  milestone.

## Plan Maintenance

- Keep exactly one active plan in `docs/superpowers/plans/`.
- Update milestone status and Immediate Feature Order when product priorities
  change.
- Keep completed implementation detail in git history and canonical docs.
- Do not create parallel roadmaps, handoff notes, cleanup plans, or archived
  plan directories.
- Replace this plan with exactly one newer active plan only when the product
  direction materially changes.
