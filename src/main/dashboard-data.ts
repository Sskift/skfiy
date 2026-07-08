import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { DashboardDescriptor } from "./dashboard-status.js";
import {
  createTmuxSupervisionReport,
  parseTmuxPaneList,
  type TmuxPaneSummary,
  type TmuxSupervisionReport
} from "./computer-use/tmux-supervisor.js";
import {
  CHROME_EXTENSION_CONNECTION_TTL_SECONDS,
  CHROME_NATIVE_HOST_NAME,
  createChromeExtensionConnectionStatePath
} from "./chrome-native-host.js";
import {
  createChromeHostPolicyStatePath,
  createDefaultChromeHostPolicy,
  normalizeChromeHostPolicy,
  type ChromeHostPolicy,
  type ChromeHostPolicyState
} from "./chrome-host-policy.js";
import {
  createRuntimeSnapshotFromReplay,
  createRuntimeSnapshotStatePath,
  createRuntimeTurnMarkerStatePath,
  RUNTIME_SNAPSHOT_SCHEMA_VERSION,
  RUNTIME_TURN_MARKER_SCHEMA_VERSION
} from "./runtime-snapshot.js";
import { readRecord } from "./record-utils.js";
import {
  readInitialAssistantAgentSettings,
  type AssistantAgentProviderId,
  type AssistantAgentSettings
} from "./assistant-agent.js";
import {
  createSkfiyApplicationSupportPath,
  readPersonalMemorySnapshot
} from "./personal-memory.js";
import {
  readPersonalMemoryJournalEntries,
  type PersonalMemoryJournalEntry
} from "./personal-memory-journal.js";
import {
  readPendingPersonalMemoryWrites,
  type PendingPersonalMemoryWrite
} from "./personal-memory-pending.js";
import {
  createPersonalSkillCards,
  readPersonalSkillSettings
} from "./personal-skills.js";
import { createWorkingProfile } from "./working-profile.js";
import {
  readSessionMemoryRecords,
  searchSessionMemory,
  type SessionMemoryRecord
} from "./session-memory.js";
import {
  createBrowserPageContextFromConnection,
  normalizeBrowserPageContext
} from "./browser-page-context.js";
import { decidePlannerProviderRuntime } from "./planner-provider-runtime.js";
import {
  readInitialPlannerProviderSettings,
  summarizePlannerProviderSettings,
  type PlannerProviderSettings
} from "./planner-provider-settings.js";
import {
  readRouteOutcome,
  type RouteOutcome
} from "../shared/route-outcome.js";

const STALE_SMOKE_EVIDENCE_SECONDS = 86_400;
const RECENT_RUNTIME_TURN_MARKER_SECONDS = 300;
const REQUIRED_DOGFOOD_WORKFLOWS = [
  "coding-terminal",
  "screenshot-inspection",
  "finder-file",
  "browser-fallback"
] as const;
const SUPPORTED_SMOKE_TARGETS = new Set([
  "chrome",
  "cli",
  "codex-plugin",
  "dashboard",
  "desktop-session",
  "finder",
  "ghostty",
  "money-run",
  "ui"
]);
const ACCEPTED_DOGFOOD_LABEL = "dogfood:accepted";
const DOGFOOD_WORKFLOW_LABEL_PREFIX = "workflow:";
const MONEY_RUN_SESSION_NAME = "money-run";
const TMUX_TAIL_LINES = 120;
const TMUX_WINDOW_FORMAT = "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}";
const TMUX_PANE_FORMAT = "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}";
const SYNTHETIC_TESTER_ID_PREFIXES = [
  "local-",
  "prepare-",
  "preflight-",
  "synthetic-"
];
const RUNTIME_SNAPSHOT_MISSING_REASON = "Runtime snapshot has not been recorded yet.";
const RUNTIME_SNAPSHOT_MISSING_EMPTY_REASON_CODE = "runtime-snapshot-missing";
const RUNTIME_SNAPSHOT_MISSING_AFTER_TURN_REASON =
  "Runtime snapshot is missing after a recent app turn was observed.";
const RUNTIME_SNAPSHOT_MISSING_AFTER_STALE_TURN_REASON =
  "Runtime snapshot is missing after an older app turn marker was observed.";
const RUNTIME_SNAPSHOT_STALE_AFTER_TURN_REASON =
  "Runtime snapshot is older than a recent app turn marker.";

type DashboardChromeHostPolicySource =
  | "default-policy"
  | "chrome-host-policy-file"
  | "invalid-chrome-host-policy-file";

type DashboardChromeHostPolicyState = ChromeHostPolicyState & {
  source: DashboardChromeHostPolicySource;
  updatedAt?: string;
  entries: Array<Record<string, unknown>>;
};

export interface DashboardSnapshotInput {
  generatedAt?: string;
  descriptor: DashboardDescriptor;
  status?: Record<string, unknown>;
  currentTurn?: Record<string, unknown>;
  routeOutcome?: Record<string, unknown>;
  replay?: Record<string, unknown>;
  smokeEvidence?: {
    artifacts: Array<Record<string, unknown>>;
  };
  dogfoodRelease?: Record<string, unknown>;
  longHorizon?: Record<string, unknown>;
  providerSettings?: DashboardProviderSettingsInput;
  personalMemory?: Record<string, unknown>;
}

export interface DashboardProviderSettingsInput {
  assistant?: AssistantAgentSettings;
  planner?: PlannerProviderSettings;
}

export interface DashboardProviderEnv {
  SKFIY_ASSISTANT_AGENT?: string;
  SKFIY_CODEX_BIN?: string;
  SKFIY_CLAUDE_CODE_BIN?: string;
  SKFIY_HERMES_BIN?: string;
  SKFIY_ASSISTANT_AGENT_CWD?: string;
  SKFIY_ASSISTANT_AGENT_TIMEOUT_MS?: string;
  SKFIY_PLANNER_MODE?: string;
  SKFIY_EXTERNAL_CUA_ENDPOINT?: string;
  SKFIY_EXTERNAL_CUA_API_KEY?: string;
}

export interface DashboardWorkspaceIo {
  exists: (targetPath: string) => boolean;
  readFile: (targetPath: string) => string;
  writeFile?: (targetPath: string, content: string) => void;
  rename?: (fromPath: string, toPath: string) => void;
  readdir: (targetPath: string) => string[];
  stat: (targetPath: string) => { mtimeMs: number };
  homeDir?: () => string | undefined;
  pid?: () => number;
  uptimeSeconds?: () => number;
  codeSignature?: (appPath: string) => Record<string, unknown>;
  permissions?: (helperPath: string) => Record<string, unknown>;
  desktopSession?: (helperPath: string) => Record<string, unknown>;
  gitHead?: (rootDir: string) => Record<string, unknown>;
  tmux?: (args: string[]) => DashboardTmuxResult;
}

export interface DashboardTmuxResult {
  status?: number | null;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface DashboardWorkspaceSnapshotInput {
  rootDir: string;
  descriptor: DashboardDescriptor;
  generatedAt?: string;
  io?: DashboardWorkspaceIo;
  env?: DashboardProviderEnv;
  providerSettings?: DashboardProviderSettingsInput;
}

export interface DashboardSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  descriptor: DashboardDescriptor;
  runtimeHealth: Record<string, unknown>;
  operatorReadiness: Record<string, unknown>;
  permissions: Record<string, unknown>;
  currentTurn: Record<string, unknown>;
  routeOutcome?: Record<string, unknown>;
  replay: Record<string, unknown>;
  smokeEvidence: {
    artifacts: Array<Record<string, unknown>>;
  };
  dogfoodRelease: Record<string, unknown>;
  longHorizon: Record<string, unknown>;
  personalMemory?: Record<string, unknown>;
  alerts: Array<Record<string, unknown>>;
  providers?: {
    assistant?: Record<string, unknown>;
    planner?: Record<string, unknown>;
  };
}

export function createDashboardSnapshot({
  generatedAt = new Date().toISOString(),
  descriptor,
  status = {},
  currentTurn = { state: "idle" },
  routeOutcome,
  replay = { state: "empty" },
  smokeEvidence = { artifacts: [] },
  dogfoodRelease = { state: "unknown" },
  longHorizon = { state: "unknown", session: "money-run" },
  providerSettings,
  personalMemory
}: DashboardSnapshotInput): DashboardSnapshot {
  const permissions = readRecord(status.permissions) ?? createUnknownPermissions();
  const runtimeSnapshot = readRecord(status.runtimeSnapshot);
  const runtimeHealth: Record<string, unknown> = {
    app: readRecord(status.app) ?? { state: "unknown" },
    helper: readRecord(status.helper) ?? { state: "unknown" },
    dashboard: readRecord(status.dashboard) ?? {
      state: "running",
      url: descriptor.url
    },
    extension: readRecord(status.extension) ?? {
      state: "unknown",
      reason: "Runtime Chrome extension connection is not probed yet."
    },
    nativeHost: readRecord(status.nativeHost) ?? { state: "unknown" },
    desktopSession: readRecord(status.desktopSession) ?? { state: "unknown" }
  };
  const packageInfo = readRecord(status.package);
  const cli = readRecord(status.cli);
  if (packageInfo) {
    runtimeHealth.package = packageInfo;
  }
  if (cli) {
    runtimeHealth.cli = cli;
  }
  if (runtimeSnapshot) {
    runtimeHealth.runtimeSnapshot = runtimeSnapshot;
  }
  const extensionEvidence = readRecord(runtimeHealth.extension) ?? {};
  runtimeHealth.extension = {
    ...sanitizeDashboardChromeExtensionStatus(extensionEvidence),
    pageControl: readDashboardPageControlEvidence(runtimeHealth, smokeEvidence.artifacts),
    browserContext: readDashboardBrowserContextEvidence(runtimeHealth, smokeEvidence.artifacts)
  };
  const snapshotRouteOutcome: Record<string, unknown> = routeOutcome
    ?? { ...createDashboardRouteOutcome(currentTurn, replay) };

  return {
    schemaVersion: 1,
    generatedAt,
    descriptor,
    runtimeHealth,
    operatorReadiness: createOperatorReadiness({
      runtimeHealth,
      permissions,
      smokeEvidence
    }),
    permissions,
    currentTurn: cloneRecord(currentTurn),
    routeOutcome: cloneRecord(snapshotRouteOutcome),
    replay: cloneRecord(replay),
    smokeEvidence: {
      artifacts: smokeEvidence.artifacts.map((artifact) => cloneRecord(artifact))
    },
    dogfoodRelease: cloneRecord(dogfoodRelease),
    longHorizon: cloneRecord(longHorizon),
    ...(personalMemory ? { personalMemory: cloneRecord(personalMemory) } : {}),
    ...(providerSettings ? { providers: createDashboardProviderSummaries(providerSettings, generatedAt) } : {}),
    alerts: createDashboardAlerts({
      permissions,
      runtimeHealth,
      smokeEvidence,
      dogfoodRelease
    })
  };
}

function createDashboardRouteOutcome(
  currentTurn: Record<string, unknown>,
  replay: Record<string, unknown>
): RouteOutcome {
  return readRouteOutcome({
    currentTurn,
    replay,
    defaultSource: "Current turn",
    includeCommandDetail: true
  });
}

export function createDashboardWorkspaceSnapshot({
  rootDir,
  descriptor,
  generatedAt,
  io = createDefaultDashboardWorkspaceIo(),
  env = process.env,
  providerSettings
}: DashboardWorkspaceSnapshotInput): DashboardSnapshot {
  const snapshotGeneratedAt = generatedAt ?? new Date().toISOString();
  const packageInfo = readPackageInfo(rootDir, io);
  const appPath = path.join(rootDir, "dist", "skfiy.app");
  const helperPath = path.join(appPath, "Contents", "MacOS", "skfiy-helper");
  const cliPath = path.join(rootDir, "dist", "skfiy");
  const appInstalled = io.exists(appPath);
  const helperInstalled = io.exists(helperPath);
  const cliInstalled = io.exists(cliPath);
  const nativeHost = readWorkspaceChromeNativeHost({
    cliPath,
    cliInstalled,
    io
  });
  const extensionConnection = readWorkspaceChromeExtensionConnection({
    generatedAt: snapshotGeneratedAt,
    io
  });
  const hostPolicy = readWorkspaceChromeHostPolicy(io);
  const runtimeSnapshot = readWorkspaceRuntimeSnapshot(io, snapshotGeneratedAt);

  const snapshot = createDashboardSnapshot({
    generatedAt: snapshotGeneratedAt,
    descriptor,
    status: {
      app: {
        state: appInstalled ? "installed" : "missing",
        path: appPath,
        bundleId: "com.sskift.skfiy",
        signing: readWorkspaceCodeSignature(appPath, appInstalled, io)
      },
      helper: {
        state: helperInstalled ? "installed" : "missing",
        path: helperPath
      },
      dashboard: {
        state: "running",
        url: descriptor.url,
        pid: readWorkspacePid(io),
        uptimeSeconds: readWorkspaceUptimeSeconds(io)
      },
      package: packageInfo,
      cli: {
        state: cliInstalled ? "installed" : "missing",
        path: cliPath
      },
      extension: createWorkspaceChromeExtensionStatus(nativeHost, extensionConnection, hostPolicy),
      nativeHost,
      desktopSession: readWorkspaceDesktopSession(helperPath, helperInstalled, io),
      permissions: readWorkspacePermissions(helperPath, helperInstalled, io),
      runtimeSnapshot: runtimeSnapshot.status
    },
    currentTurn: runtimeSnapshot.currentTurn,
    routeOutcome: runtimeSnapshot.routeOutcome,
    replay: runtimeSnapshot.replay,
    smokeEvidence: {
      artifacts: readLatestSmokeArtifacts(rootDir, snapshotGeneratedAt, io)
    },
    dogfoodRelease: readWorkspaceDogfoodRelease(rootDir, io),
    longHorizon: readWorkspaceLongHorizon(io),
    personalMemory: readWorkspacePersonalMemory(io),
    providerSettings: providerSettings ?? readWorkspaceProviderSettings(env, rootDir)
  });

  return snapshot;
}

function readWorkspacePersonalMemory(io: DashboardWorkspaceIo): Record<string, unknown> | undefined {
  const homeDir = io.homeDir?.();
  if (!homeDir) {
    return undefined;
  }

  const baseDir = createSkfiyApplicationSupportPath(homeDir);
  const personalMemory = readPersonalMemorySnapshot({
    baseDir,
    io
  });
  const pendingMemoryWrites = readPendingPersonalMemoryWrites({
    baseDir,
    io
  });
  const memoryJournal = readPersonalMemoryJournalEntries({
    baseDir,
    io
  });
  const sessions = readSessionMemoryRecords({
    baseDir,
    io
  });
  const personalSkillSettings = readPersonalSkillSettings({
    baseDir,
    io
  });
  const personalSkills = createPersonalSkillCards({
    memory: personalMemory,
    sessions,
    settings: personalSkillSettings
  });
  const workingProfile = createWorkingProfile({
    memory: personalMemory,
    sessions,
    personalSkills
  });
  const latestSession = sessions.at(-1);
  const recentSessions = createDashboardRecentSessionRecall({
    memory: personalMemory,
    personalSkills,
    sessions,
    workingProfile
  });

  return {
    userEntryCount: personalMemory.userEntries.length,
    agentEntryCount: personalMemory.agentEntries.length,
    sessionCount: sessions.length,
    ...(personalMemory.latestUpdatedAt ? { latestUpdatedAt: personalMemory.latestUpdatedAt } : {}),
    ...(personalMemory.usage ? { usage: personalMemory.usage } : {}),
    ...(personalSkillSettings.disabledSkillIds.length > 0
      ? { mutedPersonalSkillIds: personalSkillSettings.disabledSkillIds }
      : {}),
    recentUserEntries: personalMemory.userEntries.slice(-5).map(sanitizeDashboardMemoryEntry),
    recentAgentEntries: personalMemory.agentEntries.slice(-5).map(sanitizeDashboardMemoryEntry),
    ...(pendingMemoryWrites.length > 0
      ? {
        pendingWriteCount: pendingMemoryWrites.length,
        pendingWrites: pendingMemoryWrites.slice(-5).reverse().map(createDashboardPendingMemoryWriteSummary)
      }
      : {}),
    ...(personalSkills.length > 0
      ? { personalSkills: personalSkills.map(createDashboardPersonalSkillSummary) }
      : {}),
    ...(workingProfile ? { workingProfile: createDashboardWorkingProfileSummary(workingProfile) } : {}),
    ...(memoryJournal.length > 0
      ? { memoryJournal: memoryJournal.slice(-5).reverse().map(createDashboardMemoryJournalSummary) }
      : {}),
    ...(latestSession ? { latestSession: createDashboardSessionSummary(latestSession) } : {}),
    ...(recentSessions.length > 0
      ? { recentSessions: recentSessions.map(createDashboardSessionSummary) }
      : {})
  };
}

function readWorkspaceProviderSettings(
  env: DashboardProviderEnv,
  rootDir: string
): DashboardProviderSettingsInput {
  return {
    assistant: readInitialAssistantAgentSettings(env, { cwd: rootDir }),
    planner: readInitialPlannerProviderSettings(env)
  };
}

function createDashboardProviderSummaries(
  providerSettings: DashboardProviderSettingsInput,
  generatedAt: string
): {
  assistant?: Record<string, unknown>;
  planner?: Record<string, unknown>;
} {
  return {
    ...(providerSettings.assistant
      ? { assistant: summarizeDashboardAssistantProvider(providerSettings.assistant, generatedAt) }
      : {}),
    ...(providerSettings.planner
      ? { planner: summarizeDashboardPlannerProvider(providerSettings.planner) }
      : {})
  };
}

function summarizeDashboardAssistantProvider(
  settings: AssistantAgentSettings,
  generatedAt: string
): Record<string, unknown> {
  const label = readAssistantProviderLabel(settings.mode);
  const providers = createDashboardAssistantProviderStates(settings);
  const selectedProvider = providers.find((provider) => provider.selected);
  const configured = selectedProvider?.configured === true;
  const readiness = selectedProvider?.readiness ?? "unknown";

  return {
    provider: "assistant",
    mode: settings.mode,
    label,
    health: configured ? "available" : "unavailable",
    configured,
    readiness,
    selectedProvider: settings.mode,
    timeoutMs: settings.timeoutMs,
    lastHealthAt: generatedAt,
    detail: configured
      ? `${label} assistant is selected.`
      : `${label} assistant executable is not configured.`,
    providers,
    ...(selectedProvider?.lastError ? { lastError: selectedProvider.lastError } : {})
  };
}

function createDashboardAssistantProviderStates(
  settings: AssistantAgentSettings
): Array<Record<string, unknown>> {
  return [
    createDashboardAssistantCliProviderState({
      settings,
      id: "codex",
      label: "Codex",
      binaryPath: settings.codexBinary,
      binarySource: settings.codexBinarySource,
      envName: "SKFIY_CODEX_BIN"
    }),
    createDashboardAssistantCliProviderState({
      settings,
      id: "claude-code",
      label: "Claude Code",
      binaryPath: settings.claudeCodeBinary,
      binarySource: settings.claudeCodeBinarySource,
      envName: "SKFIY_CLAUDE_CODE_BIN"
    }),
    createDashboardAssistantCliProviderState({
      settings,
      id: "hermes",
      label: "Hermes",
      binaryPath: settings.hermesBinary,
      binarySource: settings.hermesBinarySource,
      envName: "SKFIY_HERMES_BIN"
    })
  ];
}

function createDashboardAssistantCliProviderState({
  binaryPath,
  binarySource,
  envName,
  id,
  label,
  settings
}: {
  settings: AssistantAgentSettings;
  id: AssistantAgentProviderId;
  label: string;
  binaryPath: string;
  binarySource: string;
  envName: string;
}): Record<string, unknown> {
  const configured = binaryPath.trim().length > 0;

  return {
    provider: "assistant",
    id,
    label,
    selected: settings.mode === id,
    configured,
    readiness: configured ? "ready" : "unconfigured",
    binaryPath: configured ? summarizeAssistantBinaryPath(binaryPath, binarySource, envName) : undefined,
    binarySource,
    ...(configured ? {} : { lastError: `${label} executable is not configured.` })
  };
}

function summarizeAssistantBinaryPath(
  binaryPath: string,
  binarySource: string,
  envName: string
): string {
  const trimmed = binaryPath.trim();
  if (binarySource === "env" && shouldRedactAssistantBinaryPath(trimmed)) {
    return `configured via ${envName}`;
  }

  return trimmed;
}

function shouldRedactAssistantBinaryPath(value: string): boolean {
  return /secret|token=|apikey|api_key|password/i.test(value);
}

function sanitizeDashboardMemoryEntry(value: string): string {
  if (/secret|token=|apikey|api_key|password|bearer\s+|sk-[a-z0-9]/iu.test(value)) {
    return "[redacted sensitive memory]";
  }

  return value;
}

function createDashboardSessionSummary(session: SessionMemoryRecord): Record<string, unknown> {
  return {
    turnId: sanitizeDashboardMemoryEntry(session.turnId),
    createdAt: session.createdAt,
    providerLabel: sanitizeDashboardMemoryEntry(session.providerLabel),
    userInput: sanitizeDashboardMemoryEntry(session.userInput),
    ...(session.recallReason
      ? { recallBasis: sanitizeDashboardMemoryEntry(session.recallReason) }
      : {}),
    ...(session.browserContext?.title
      ? { browserTitle: sanitizeDashboardMemoryEntry(session.browserContext.title) }
      : {}),
    ...(session.browserContext?.url
      ? { browserUrl: sanitizeDashboardMemoryEntry(session.browserContext.url) }
      : {})
  };
}

function createDashboardRecentSessionRecall({
  memory,
  personalSkills,
  sessions,
  workingProfile
}: {
  memory: ReturnType<typeof readPersonalMemorySnapshot>;
  personalSkills: ReturnType<typeof createPersonalSkillCards>;
  sessions: SessionMemoryRecord[];
  workingProfile: ReturnType<typeof createWorkingProfile>;
}): SessionMemoryRecord[] {
  const query = createDashboardSessionRecallQuery({
    memory,
    personalSkills,
    workingProfile
  });
  const recalledSessions = query
    ? searchSessionMemory(sessions, query, 3)
    : [];
  const selectedSessionIds = new Set(recalledSessions.map((session) => session.turnId));
  const recentFallbackSessions = sessions
    .slice(-3)
    .reverse()
    .filter((session) => !selectedSessionIds.has(session.turnId));

  return [
    ...recalledSessions,
    ...recentFallbackSessions
  ].slice(0, 3);
}

function createDashboardSessionRecallQuery({
  memory,
  personalSkills,
  workingProfile
}: {
  memory: ReturnType<typeof readPersonalMemorySnapshot>;
  personalSkills: ReturnType<typeof createPersonalSkillCards>;
  workingProfile: ReturnType<typeof createWorkingProfile>;
}): string {
  const parts = [
    ...memory.userEntries.slice(-5),
    ...memory.agentEntries.slice(-5),
    ...personalSkills.flatMap((skill) => [
      skill.label,
      skill.description,
      skill.promptHint
    ]),
    ...(workingProfile
      ? [
        workingProfile.summary,
        ...workingProfile.habits
      ]
      : [])
  ];

  return parts
    .map((part) => sanitizeDashboardMemoryEntry(part).replace(/[-_/]+/gu, " "))
    .filter((part) => part && part !== "[redacted sensitive memory]")
    .join(" ");
}

function createDashboardPendingMemoryWriteSummary(write: PendingPersonalMemoryWrite): Record<string, unknown> {
  return {
    id: write.id,
    createdAt: write.createdAt,
    source: sanitizeDashboardMemoryEntry(write.source),
    action: write.action,
    target: write.target,
    content: sanitizeDashboardMemoryEntry(write.content),
    ...(write.previousContent
      ? { previousContent: sanitizeDashboardMemoryEntry(write.previousContent) }
      : {})
  };
}

function createDashboardMemoryJournalSummary(entry: PersonalMemoryJournalEntry): Record<string, unknown> {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    source: sanitizeDashboardMemoryEntry(entry.source),
    stage: entry.stage,
    turnId: sanitizeDashboardMemoryEntry(entry.turnId),
    providerLabel: sanitizeDashboardMemoryEntry(entry.providerLabel),
    userInput: sanitizeDashboardMemoryEntry(entry.userInput),
    action: entry.action,
    target: entry.target,
    content: sanitizeDashboardMemoryEntry(entry.content),
    ...(entry.previousContent
      ? { previousContent: sanitizeDashboardMemoryEntry(entry.previousContent) }
      : {})
  };
}

function createDashboardPersonalSkillSummary(card: ReturnType<typeof createPersonalSkillCards>[number]): Record<string, unknown> {
  return {
    id: card.id,
    kind: card.kind,
    label: sanitizeDashboardMemoryEntry(card.label),
    description: sanitizeDashboardMemoryEntry(card.description),
    promptHint: sanitizeDashboardMemoryEntry(card.promptHint),
    evidenceCount: card.evidenceCount,
    evidence: card.evidence.map(sanitizeDashboardMemoryEntry)
  };
}

function createDashboardWorkingProfileSummary(profile: NonNullable<ReturnType<typeof createWorkingProfile>>): Record<string, unknown> {
  return {
    label: profile.label,
    source: profile.source,
    portability: profile.portability,
    summary: sanitizeDashboardMemoryEntry(profile.summary),
    habits: profile.habits.map(sanitizeDashboardMemoryEntry),
    evidence: profile.evidence.map(sanitizeDashboardMemoryEntry),
    memoryEntryCount: profile.memoryEntryCount,
    sessionCount: profile.sessionCount,
    skillCount: profile.skillCount
  };
}

function readAssistantProviderLabel(mode: AssistantAgentSettings["mode"]): string {
  if (mode === "codex") {
    return "Codex";
  }
  if (mode === "claude-code") {
    return "Claude Code";
  }
  if (mode === "hermes") {
    return "Hermes";
  }

  return "Codex";
}

function summarizeDashboardPlannerProvider(
  settings: PlannerProviderSettings
): Record<string, unknown> {
  const summary = summarizePlannerProviderSettings(settings);
  const runtime = decidePlannerProviderRuntime(settings);
  const available = runtime.decision !== "unavailable";

  return {
    provider: "planner",
    mode: summary.mode,
    label: readPlannerProviderLabel(summary.mode, summary.externalProviderLabel),
    health: available ? "available" : "unavailable",
    detail: readPlannerProviderDetail(runtime),
    endpointConfigured: Boolean(summary.externalEndpoint),
    externalApiKeyConfigured: summary.externalApiKeyConfigured
  };
}

function readPlannerProviderLabel(
  mode: PlannerProviderSettings["mode"],
  externalProviderLabel: string
): string {
  if (mode === "local-deterministic") {
    return "Local deterministic";
  }
  if (mode === "disabled") {
    return "Disabled";
  }

  return externalProviderLabel;
}

function readPlannerProviderDetail(
  runtime: ReturnType<typeof decidePlannerProviderRuntime>
): string {
  if (runtime.decision === "run-local-deterministic") {
    return "Local deterministic planner is selected.";
  }
  if (runtime.decision === "run-external-cua") {
    return "External CUA endpoint and API key are configured.";
  }

  return runtime.message;
}

function createOperatorReadiness({
  runtimeHealth,
  permissions,
  smokeEvidence
}: {
  runtimeHealth: Record<string, unknown>;
  permissions: Record<string, unknown>;
  smokeEvidence: {
    artifacts: Array<Record<string, unknown>>;
  };
}): Record<string, unknown> {
  const commandSurface = createCommandSurfaceReadiness(readRecord(runtimeHealth.cli));
  const extensionReadiness = createExtensionReadiness(
    readRecord(runtimeHealth.extension),
    readRecord(runtimeHealth.nativeHost)
  );
  const packagedBinary = createPackagedBinaryReadiness(runtimeHealth);
  const recentSmokeEvidence = createRecentSmokeEvidenceReadiness(smokeEvidence.artifacts);
  const appReadiness = createAppReadiness({
    runtimeHealth,
    permissions,
    artifacts: smokeEvidence.artifacts
  });
  const checks = [
    commandSurface,
    extensionReadiness,
    packagedBinary,
    recentSmokeEvidence
  ];
  const state = checks.every((check) => check.state === "ready")
    ? "ready"
    : checks.some((check) => check.state === "blocked")
      ? "blocked"
      : "needs-evidence";

  return {
    state,
    commandSurface,
    extensionReadiness,
    packagedBinary,
    recentSmokeEvidence,
    appReadiness
  };
}

function createCommandSurfaceReadiness(
  cli: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (cli?.state === "installed") {
    return {
      state: "ready",
      ...(typeof cli.path === "string" ? { path: cli.path } : {}),
      reason: "Packaged CLI command surface is available."
    };
  }

  return {
    state: "blocked",
    ...(typeof cli?.path === "string" ? { path: cli.path } : {}),
    reason: "Packaged CLI command surface is missing."
  };
}

function createExtensionReadiness(
  extension: Record<string, unknown> | undefined,
  nativeHost: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (extension?.state === "connected") {
    return {
      state: "ready",
      ...(typeof extension.bridge === "string" ? { bridge: extension.bridge } : {}),
      ...(typeof extension.liveConnection === "string" ? { liveConnection: extension.liveConnection } : {}),
      ...(typeof extension.nativeHostState === "string" ? { nativeHostState: extension.nativeHostState } : {})
    };
  }

  if (nativeHost?.state === "installed" || extension?.state === "native-host-installed") {
    return {
      state: "needs-evidence",
      ...(typeof extension?.bridge === "string" ? { bridge: extension.bridge } : {}),
      ...(typeof extension?.liveConnection === "string" ? { liveConnection: extension.liveConnection } : {}),
      ...(typeof nativeHost?.state === "string"
        ? { nativeHostState: nativeHost.state }
        : typeof extension?.nativeHostState === "string"
          ? { nativeHostState: extension.nativeHostState }
          : {}),
      reason: "Native host is installed, but a live extension heartbeat is not connected."
    };
  }

  return {
    state: "blocked",
    ...(typeof extension?.bridge === "string" ? { bridge: extension.bridge } : {}),
    ...(typeof extension?.liveConnection === "string" ? { liveConnection: extension.liveConnection } : {}),
    ...(typeof nativeHost?.state === "string"
      ? { nativeHostState: nativeHost.state }
      : typeof extension?.nativeHostState === "string"
        ? { nativeHostState: extension.nativeHostState }
        : {}),
    reason: "Chrome extension native messaging path is not ready."
  };
}

function createPackagedBinaryReadiness(
  runtimeHealth: Record<string, unknown>
): Record<string, unknown> {
  const app = readRecord(runtimeHealth.app);
  const helper = readRecord(runtimeHealth.helper);
  const cli = readRecord(runtimeHealth.cli);
  const signing = readRecord(app?.signing);
  const checks = {
    app: app?.state === "installed",
    helper: helper?.state === "installed",
    cli: cli?.state === "installed",
    signing: signing?.state === "valid"
  };
  const state = Object.values(checks).every(Boolean) ? "ready" : "blocked";

  return {
    state,
    checks,
    ...(typeof app?.path === "string" ? { appPath: app.path } : {}),
    ...(typeof helper?.path === "string" ? { helperPath: helper.path } : {}),
    ...(typeof cli?.path === "string" ? { cliPath: cli.path } : {}),
    ...(typeof signing?.state === "string" ? { signingState: signing.state } : {})
  };
}

function createRecentSmokeEvidenceReadiness(
  artifacts: Array<Record<string, unknown>>
): Record<string, unknown> {
  const requiredTargets = ["chrome", "cli"];
  const unsupportedTargets = collectUnsupportedSmokeTargets(artifacts);
  const unsupportedPassedTargets = collectUnsupportedSmokeTargets(
    artifacts.filter((artifact) => artifact.result === "passed")
  );
  const recentPassedTargets = artifacts
    .filter((artifact) =>
      artifact.result === "passed"
      && artifact.stale !== true
      && isSupportedSmokeTarget(artifact.target)
    )
    .map((artifact) => String(artifact.target));
  const missingTargets = requiredTargets.filter((target) => !recentPassedTargets.includes(target));

  return {
    state: missingTargets.length === 0 ? "ready" : "needs-evidence",
    requiredTargets,
    recentPassedTargets: [...new Set(recentPassedTargets)].sort(),
    missingTargets,
    ...(unsupportedTargets.length > 0 ? { unsupportedTargets } : {}),
    ...(unsupportedPassedTargets.length > 0 ? { unsupportedPassedTargets } : {})
  };
}

function createAppReadiness({
  artifacts,
  permissions,
  runtimeHealth
}: {
  artifacts: Array<Record<string, unknown>>;
  permissions: Record<string, unknown>;
  runtimeHealth: Record<string, unknown>;
}): Record<string, Record<string, unknown>> {
  return {
    chrome: createChromeAppReadiness(runtimeHealth, artifacts),
    finder: createFinderAppReadiness(permissions, artifacts),
    ghostty: createGhosttyAppReadiness(artifacts)
  };
}

function createChromeAppReadiness(
  runtimeHealth: Record<string, unknown>,
  artifacts: Array<Record<string, unknown>>
): Record<string, unknown> {
  const artifact = readLatestTargetArtifact(artifacts, "chrome");
  const extension = readRecord(runtimeHealth.extension);
  const nativeHost = readRecord(runtimeHealth.nativeHost);
  const pageControl = readRecord(extension?.pageControl);
  const state = readAppReadinessState({
    artifact,
    runtimeBlocked: nativeHost?.state === "missing"
      || extension?.state === "native-host-missing"
      || extension?.state === "unknown"
  });

  return {
    app: "Chrome",
    state,
    source: artifact ? "chrome-smoke" : "runtime",
    reason: readChromeAppReadinessReason({
      artifact,
      extension,
      nativeHost,
      pageControl,
      state
    })
  };
}

function createFinderAppReadiness(
  permissions: Record<string, unknown>,
  artifacts: Array<Record<string, unknown>>
): Record<string, unknown> {
  const artifact = readLatestTargetArtifact(artifacts, "finder");
  const finder = readRecord(artifact?.finder);
  const state = readAppReadinessState({
    artifact,
    runtimeBlocked: permissions.finderAutomation !== "granted"
  });

  return {
    app: "Finder",
    state,
    source: artifact ? "finder-smoke" : "permission",
    reason: readFinderAppReadinessReason(finder)
      ?? readSmokeArtifactReason(artifact)
      ?? (state === "ready"
        ? "Fresh Finder smoke evidence is available."
        : "Finder Automation has not been proven yet.")
  };
}

function createGhosttyAppReadiness(
  artifacts: Array<Record<string, unknown>>
): Record<string, unknown> {
  const artifact = readLatestTargetArtifact(artifacts, "ghostty");
  const state = readAppReadinessState({ artifact });

  return {
    app: "Ghostty",
    state,
    source: artifact ? "ghostty-smoke" : "smoke-missing",
    reason: readSmokeArtifactReason(artifact)
      ?? (state === "ready"
        ? "Fresh Ghostty smoke evidence is available."
        : "No fresh Ghostty smoke artifact has been recorded.")
  };
}

function readAppReadinessState({
  artifact,
  runtimeBlocked = false
}: {
  artifact?: Record<string, unknown>;
  runtimeBlocked?: boolean;
}): "ready" | "blocked" | "needs-evidence" {
  if (artifact?.result === "passed" && artifact.stale !== true) {
    return "ready";
  }
  if (artifact?.result === "blocked" || runtimeBlocked) {
    return "blocked";
  }

  return "needs-evidence";
}

function readLatestTargetArtifact(
  artifacts: Array<Record<string, unknown>>,
  target: string
): Record<string, unknown> | undefined {
  return artifacts.find((artifact) => artifact.target === target);
}

function readSmokeArtifactReason(
  artifact: Record<string, unknown> | undefined
): string | undefined {
  return readNonEmptyStringValue(artifact?.blocker)
    ?? readNonEmptyStringValue(artifact?.reason)
    ?? readNonEmptyStringValue(readRecord(artifact?.desktopPreflight)?.reason)
    ?? readNonEmptyStringValue(readRecord(artifact?.blocked)?.reason);
}

function readChromeAppReadinessReason({
  artifact,
  extension,
  nativeHost,
  pageControl,
  state
}: {
  artifact: Record<string, unknown> | undefined;
  extension: Record<string, unknown> | undefined;
  nativeHost: Record<string, unknown> | undefined;
  pageControl: Record<string, unknown> | undefined;
  state: "ready" | "blocked" | "needs-evidence";
}): string {
  if (state === "ready") {
    return "Fresh Chrome smoke evidence is available.";
  }

  return readSmokeArtifactReason(artifact)
    ?? readNonEmptyStringValue(pageControl?.reason)
    ?? readNonEmptyStringValue(extension?.reason)
    ?? readNonEmptyStringValue(nativeHost?.reason)
    ?? "Chrome Native Messaging and pageControl evidence is not ready.";
}

function readFinderAppReadinessReason(
  finder: Record<string, unknown> | undefined
): string | undefined {
  return readNonEmptyStringValue(readRecord(finder?.desktopPreflight)?.reason)
    ?? readNonEmptyStringValue(finder?.reason)
    ?? readNonEmptyStringValue(readRecord(finder?.finderObservation)?.reason)
    ?? readNonEmptyStringValue(readRecord(finder?.finderSemanticObservation)?.reason)
    ?? readNonEmptyStringValue(readRecord(finder?.finderItemDragDrop)?.reason);
}

function isSupportedSmokeTarget(target: unknown): boolean {
  return typeof target === "string" && SUPPORTED_SMOKE_TARGETS.has(target);
}

function collectUnsupportedSmokeTargets(
  artifacts: Array<Record<string, unknown>>
): string[] {
  return [...new Set(artifacts
    .map((artifact) => typeof artifact.target === "string" ? artifact.target : "unknown")
    .filter((target) => !SUPPORTED_SMOKE_TARGETS.has(target)))]
    .sort();
}

function readDashboardFinderSmokeSummary(
  artifacts: Array<Record<string, unknown>>
): Record<string, unknown> | undefined {
  const finderArtifact = artifacts.find((artifact) => artifact.target === "finder");

  return readRecord(finderArtifact?.finder);
}

function isDashboardFinderDesktopPreflightBlocked(
  finderSmoke: Record<string, unknown> | undefined
): boolean {
  const desktopPreflight = readRecord(finderSmoke?.desktopPreflight);
  const reason = typeof desktopPreflight?.reason === "string" ? desktopPreflight.reason : "";

  return desktopPreflight?.result === "blocked"
    && (
      desktopPreflight.controllable === false
      || desktopPreflight.frontmostBundleId === "com.apple.loginwindow"
      || desktopPreflight.mainDisplayAsleep === true
      || /desktop session|loginwindow|display.*asleep|unlock/i.test(reason)
    );
}

function hasDashboardFinderAutomationPermissionReason(
  finderSmoke: Record<string, unknown> | undefined
): boolean {
  return Boolean(readDashboardFinderAutomationReason(finderSmoke));
}

function readDashboardFinderAutomationReason(
  finderSmoke: Record<string, unknown> | undefined
): string | undefined {
  return [
    readRecord(finderSmoke?.finderObservation)?.reason,
    readRecord(finderSmoke?.finderSemanticObservation)?.reason,
    readRecord(finderSmoke?.finderItemDragDrop)?.reason,
    finderSmoke?.reason
  ].find((reason): reason is string =>
    typeof reason === "string"
    && /(finder automation|automation permission|apple events?|not authorized to send apple events|not permitted to control finder|tcc)/i.test(reason)
  );
}

function createDashboardAlerts({
  permissions,
  runtimeHealth,
  smokeEvidence,
  dogfoodRelease
}: {
  permissions: Record<string, unknown>;
  runtimeHealth: Record<string, unknown>;
  smokeEvidence: {
    artifacts: Array<Record<string, unknown>>;
  };
  dogfoodRelease: Record<string, unknown>;
}): Array<Record<string, unknown>> {
  const alerts: Array<Record<string, unknown>> = [];
  const desktopSession = readRecord(runtimeHealth.desktopSession);
  const extension = readRecord(runtimeHealth.extension);
  const nativeHost = readRecord(runtimeHealth.nativeHost);
  const runtimeSnapshot = readRecord(runtimeHealth.runtimeSnapshot);
  const releaseDrift = readRecord(dogfoodRelease.releaseDrift);
  const finderSmoke = readDashboardFinderSmokeSummary(smokeEvidence.artifacts);
  const pageControl = readDashboardPageControlEvidence(runtimeHealth, smokeEvidence.artifacts);

  if (permissions.screenRecording !== "granted") {
    alerts.push({
      code: "screen-recording-missing",
      severity: "error",
      message: "Screen Recording is not granted."
    });
  }

  if (permissions.accessibility !== "granted") {
    alerts.push({
      code: "accessibility-missing",
      severity: "error",
      message: "Accessibility is not granted."
    });
  }

  if (desktopSession?.state === "blocked" || desktopSession?.mainDisplayAsleep === true) {
    alerts.push({
      code: "desktop-session-blocked",
      severity: "error",
      message: "Desktop session is blocked or asleep."
    });
  }

  if (
    desktopSession?.frontmostBundleId === "com.apple.loginwindow"
    || desktopSession?.ioConsoleLocked === true
    || desktopSession?.cgSessionScreenIsLocked === true
  ) {
    alerts.push({
      code: "desktop-session-loginwindow",
      severity: "error",
      message: "Desktop session is locked or loginwindow is frontmost.",
      ...(typeof desktopSession.frontmostBundleId === "string"
        ? { frontmostBundleId: desktopSession.frontmostBundleId }
        : {}),
      ...(typeof desktopSession.frontmostLocalizedName === "string"
        ? { frontmostLocalizedName: desktopSession.frontmostLocalizedName }
        : {})
    });
  }

  if (desktopSession?.mainDisplayAsleep === true) {
    alerts.push({
      code: "desktop-display-asleep",
      severity: "error",
      message: "Main display is asleep.",
      mainDisplayAsleep: true
    });
  }

  if (permissions.finderAutomation !== "granted") {
    if (isDashboardFinderDesktopPreflightBlocked(finderSmoke)) {
      const desktopPreflight = readRecord(finderSmoke?.desktopPreflight);
      alerts.push({
        code: "finder-automation-unproven",
        severity: "info",
        message: "Finder Automation has not been proven because the latest Finder smoke was blocked by desktop preflight.",
        ...(typeof desktopPreflight?.reason === "string" ? { reason: desktopPreflight.reason } : {}),
        ...(typeof desktopPreflight?.frontmostBundleId === "string"
          ? { frontmostBundleId: desktopPreflight.frontmostBundleId }
          : {}),
        ...(typeof desktopPreflight?.mainDisplayAsleep === "boolean"
          ? { mainDisplayAsleep: desktopPreflight.mainDisplayAsleep }
          : {}),
        ...(typeof desktopPreflight?.controllable === "boolean"
          ? { controllable: desktopPreflight.controllable }
          : {})
      });
    } else if (hasDashboardFinderAutomationPermissionReason(finderSmoke)) {
      alerts.push({
        code: "finder-automation-permission",
        severity: "warning",
        message: "Finder Automation appears blocked by macOS Automation permission.",
        ...(readDashboardFinderAutomationReason(finderSmoke)
          ? { reason: readDashboardFinderAutomationReason(finderSmoke) }
          : {})
      });
    } else {
      alerts.push({
        code: "finder-automation-unknown",
        severity: "info",
        message: "Finder Automation has not been proven yet."
      });
    }
  }

  if (extension?.liveConnection === "stale" || readRecord(extension?.connection)?.state === "stale") {
    const connection = readRecord(extension?.connection);

    alerts.push({
      code: "chrome-extension-heartbeat-stale",
      severity: "warning",
      message: "Chrome extension native-message heartbeat is stale.",
      ...(Number.isFinite(connection?.ageSeconds) ? { ageSeconds: connection?.ageSeconds } : {}),
      ...(typeof connection?.path === "string" ? { path: connection.path } : {}),
      ...(typeof connection?.observedAt === "string" ? { observedAt: connection.observedAt } : {})
    });
  } else if (
    extension?.state === "native-host-installed"
    && extension?.liveConnection !== "connected"
  ) {
    alerts.push({
      code: "chrome-extension-heartbeat-missing",
      severity: "warning",
      message: "Chrome Native Messaging host is installed, but no live extension heartbeat has been observed.",
      ...(typeof extension.manifestPath === "string" ? { manifestPath: extension.manifestPath } : {})
    });
  }

  if (nativeHost?.state === "missing") {
    alerts.push({
      code: "chrome-native-host-missing",
      severity: "warning",
      message: "Chrome Native Messaging host manifest is not installed.",
      ...(typeof nativeHost.manifestPath === "string" ? { manifestPath: nativeHost.manifestPath } : {})
    });
  }

  if (nativeHost?.state === "mismatched" || nativeHost?.state === "invalid" || nativeHost?.state === "cli-missing") {
    alerts.push({
      code: `chrome-native-host-${nativeHost.state}`,
      severity: "warning",
      message: typeof nativeHost.reason === "string"
        ? nativeHost.reason
        : "Chrome Native Messaging host is not ready.",
      ...(typeof nativeHost.manifestPath === "string" ? { manifestPath: nativeHost.manifestPath } : {})
    });
  }

  if (extension?.state !== "connected") {
    alerts.push({
      code: "chrome-extension-not-connected",
      severity: "warning",
      message: "Chrome extension is not connected, so pageControl readiness cannot be trusted.",
      ...(typeof extension?.state === "string" ? { extensionState: extension.state } : {})
    });
  } else if (pageControl.state === "not-probed") {
    alerts.push({
      code: "page-control-missing",
      severity: "warning",
      message: "Chrome extension is connected, but pageControl readiness has not been probed."
    });
  } else if (isDashboardPageControlPolicyBlocked(pageControl)) {
    alerts.push({
      code: "page-control-policy-blocked",
      severity: "warning",
      message: "Chrome pageControl is blocked by host policy or Chrome host permission.",
      ...(typeof pageControl.state === "string" ? { state: pageControl.state } : {}),
      ...(typeof pageControl.reason === "string" ? { reason: pageControl.reason } : {}),
      ...(typeof pageControl.nextAction === "string" ? { nextAction: pageControl.nextAction } : {})
    });
  } else if (isDashboardPageControlUncontrollable(pageControl)) {
    alerts.push({
      code: "page-control-uncontrollable",
      severity: "warning",
      message: "Chrome pageControl has been probed but cannot control the active page.",
      ...(typeof pageControl.state === "string" ? { state: pageControl.state } : {}),
      ...(typeof pageControl.reason === "string" ? { reason: pageControl.reason } : {}),
      ...(typeof pageControl.nextAction === "string" ? { nextAction: pageControl.nextAction } : {})
    });
  }

  if (runtimeSnapshot?.state === "repaired" || runtimeSnapshot?.state === "isolated") {
    alerts.push({
      code: "runtime-snapshot-repaired",
      severity: "warning",
      message: runtimeSnapshot.state === "repaired"
        ? "Runtime snapshot was isolated and replaced with an empty snapshot."
        : "Runtime snapshot was isolated, but the empty replacement could not be written.",
      ...(typeof runtimeSnapshot.path === "string" ? { path: runtimeSnapshot.path } : {}),
      ...(typeof runtimeSnapshot.isolatedPath === "string"
        ? { isolatedPath: runtimeSnapshot.isolatedPath }
        : {})
    });
  }

  if (
    runtimeSnapshot?.state === "missing-after-turn"
    || runtimeSnapshot?.state === "stale-after-turn"
  ) {
    const runtimeSnapshotState = runtimeSnapshot.state;
    alerts.push({
      code: runtimeSnapshotState === "stale-after-turn"
        ? "runtime-snapshot-stale-after-turn"
        : "runtime-snapshot-missing-after-turn",
      severity: "warning",
      message: runtimeSnapshotState === "stale-after-turn"
        ? "Runtime snapshot is older than a recent runtime turn marker."
        : "Runtime snapshot is missing even though app turn evidence exists.",
      ...(typeof runtimeSnapshot.path === "string" ? { path: runtimeSnapshot.path } : {}),
      ...(typeof runtimeSnapshot.markerPath === "string" ? { markerPath: runtimeSnapshot.markerPath } : {}),
      ...(typeof runtimeSnapshot.markerObservedAt === "string"
        ? { markerObservedAt: runtimeSnapshot.markerObservedAt }
        : {}),
      ...(typeof runtimeSnapshot.markerState === "string" ? { markerState: runtimeSnapshot.markerState } : {}),
      ...(Number.isFinite(runtimeSnapshot.markerAgeSeconds)
        ? { markerAgeSeconds: runtimeSnapshot.markerAgeSeconds }
        : {}),
      ...(Number.isFinite(runtimeSnapshot.snapshotAgeSeconds)
        ? { snapshotAgeSeconds: runtimeSnapshot.snapshotAgeSeconds }
        : {})
    });
  }

  if (runtimeSnapshot?.state === "repair-failed") {
    alerts.push({
      code: "runtime-snapshot-repair-failed",
      severity: "error",
      message: "Runtime snapshot is invalid and could not be isolated.",
      ...(typeof runtimeSnapshot.path === "string" ? { path: runtimeSnapshot.path } : {}),
      ...(typeof runtimeSnapshot.reason === "string" ? { reason: runtimeSnapshot.reason } : {})
    });
  }

  const staleTargets = smokeEvidence.artifacts
    .filter((artifact) => artifact.stale === true && isSupportedSmokeTarget(artifact.target))
    .map((artifact) => String(artifact.target))
    .sort();
  const unsupportedTargets = collectUnsupportedSmokeTargets(smokeEvidence.artifacts);
  const unsupportedPassedTargets = collectUnsupportedSmokeTargets(
    smokeEvidence.artifacts.filter((artifact) => artifact.result === "passed")
  );

  if (staleTargets.length > 0) {
    alerts.push({
      code: "smoke-evidence-stale",
      severity: "warning",
      message: `Smoke evidence is stale for: ${staleTargets.join(", ")}.`
    });
  }

  if (unsupportedTargets.length > 0) {
    alerts.push({
      code: "smoke-evidence-unsupported",
      severity: "warning",
      message: `Unsupported smoke evidence is ignored for product readiness: ${unsupportedTargets.join(", ")}.`,
      unsupportedTargets,
      ...(unsupportedPassedTargets.length > 0 ? { unsupportedPassedTargets } : {})
    });
  }

  if (releaseDrift?.state === "behind-head") {
    alerts.push({
      code: "release-artifact-older-than-head",
      severity: "warning",
      message: "Latest alpha release is older than current git HEAD.",
      ...(typeof releaseDrift.releaseCommitSha === "string"
        ? { releaseCommitSha: releaseDrift.releaseCommitSha }
        : {}),
      ...(typeof releaseDrift.currentHeadCommitSha === "string"
        ? { currentHeadCommitSha: releaseDrift.currentHeadCommitSha }
        : {})
    });
  }

  return alerts;
}

function readPackageInfo(
  rootDir: string,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  const packagePath = path.join(rootDir, "package.json");

  if (!io.exists(packagePath)) {
    return { state: "missing", path: packagePath };
  }

  try {
    const packageJson = JSON.parse(io.readFile(packagePath)) as Record<string, unknown>;

    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description
    };
  } catch (error) {
    return {
      state: "invalid",
      path: packagePath,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readWorkspaceDogfoodRelease(
  rootDir: string,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  const latestAlpha = readWorkspaceLatestAlpha(rootDir, io);
  const manifest = readWorkspaceLatestAlphaManifest(rootDir, latestAlpha, io);
  const cohort = readWorkspaceDogfoodCohort(rootDir, io);
  const currentHead = readWorkspaceGitHead(rootDir, io);
  const releaseDrift = readWorkspaceReleaseDrift(latestAlpha, currentHead);

  return {
    state: readDogfoodReleaseState(latestAlpha, cohort),
    latestAlpha,
    currentHead,
    releaseDrift,
    manifest,
    cohort
  };
}

function readWorkspaceGitHead(
  rootDir: string,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  try {
    const injected = io.gitHead?.(rootDir);
    if (injected) {
      return normalizeGitHead(rootDir, injected);
    }
  } catch (error) {
    return {
      state: "unknown",
      rootDir,
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  const result = spawnSync("git", ["-C", rootDir, "rev-parse", "HEAD"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return {
      state: "unknown",
      rootDir,
      reason: readSpawnMessage(result, "current git HEAD could not be read.")
    };
  }

  return normalizeGitHead(rootDir, {
    state: "present",
    commitSha: `${result.stdout ?? ""}`.trim()
  });
}

function normalizeGitHead(rootDir: string, value: Record<string, unknown>): Record<string, unknown> {
  const commitSha = typeof value.commitSha === "string" ? value.commitSha.trim() : "";
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) {
    return {
      state: "unknown",
      rootDir,
      ...(typeof value.reason === "string" ? { reason: value.reason } : {
        reason: "current git HEAD is not a full commit SHA."
      })
    };
  }

  return {
    state: "present",
    rootDir,
    commitSha,
    shortCommit: commitSha.slice(0, 7)
  };
}

function readWorkspaceReleaseDrift(
  latestAlpha: Record<string, unknown>,
  currentHead: Record<string, unknown>
): Record<string, unknown> {
  const releaseCommitSha = typeof latestAlpha.commitSha === "string"
    ? latestAlpha.commitSha
    : undefined;
  const currentHeadCommitSha = typeof currentHead.commitSha === "string"
    ? currentHead.commitSha
    : undefined;

  if (!releaseCommitSha || !currentHeadCommitSha) {
    return {
      state: "unknown",
      ...(releaseCommitSha ? { releaseCommitSha } : {}),
      ...(currentHeadCommitSha ? { currentHeadCommitSha } : {}),
      reason: "release and current HEAD commits are both required to detect drift."
    };
  }

  if (releaseCommitSha === currentHeadCommitSha) {
    return {
      state: "current",
      releaseCommitSha,
      currentHeadCommitSha
    };
  }

  return {
    state: "behind-head",
    releaseCommitSha,
    currentHeadCommitSha
  };
}

function readWorkspaceRuntimeSnapshot(
  io: DashboardWorkspaceIo,
  observedAt: string
): {
  currentTurn: Record<string, unknown>;
  routeOutcome?: Record<string, unknown>;
  replay: Record<string, unknown>;
  status: Record<string, unknown>;
} {
  const homeDir = io.homeDir?.();
  if (!homeDir) {
    const reason = "Home directory is required to locate the runtime snapshot.";
    return {
      ...createMissingRuntimePanels(reason),
      status: {
        state: "unavailable",
        reason
      }
    };
  }

  const snapshotPath = createRuntimeSnapshotStatePath(homeDir);
  const markerPath = createRuntimeTurnMarkerStatePath(homeDir);
  const marker = readRuntimeTurnMarkerEvidence(io, markerPath, observedAt);
  if (!io.exists(snapshotPath)) {
    if (marker) {
      const markerState = marker.state === "stale" ? "stale-after-turn" : "missing-after-turn";
      const emptyReasonCode = markerState === "stale-after-turn"
        ? "runtime-snapshot-stale-after-turn"
        : "runtime-snapshot-missing-after-turn";
      const reason = markerState === "stale-after-turn"
        ? RUNTIME_SNAPSHOT_MISSING_AFTER_STALE_TURN_REASON
        : RUNTIME_SNAPSHOT_MISSING_AFTER_TURN_REASON;
      const markerMetadata = {
        emptyReasonCode,
        freshInstall: false,
        markerPath,
        markerObservedAt: marker.observedAt,
        markerState: marker.state,
        ...(typeof marker.ageSeconds === "number" ? { markerAgeSeconds: marker.ageSeconds } : {})
      };

      return {
        currentTurn: {
          state: typeof marker.currentTurn.state === "string" ? marker.currentTurn.state : "idle",
          ...marker.currentTurn,
          reason,
          ...markerMetadata,
          path: snapshotPath
        },
        replay: {
          state: "empty",
          source: "runtime-snapshot",
          reason,
          ...markerMetadata,
          path: snapshotPath
        },
        status: {
          state: markerState,
          path: snapshotPath,
          reason,
          ...markerMetadata
        }
      };
    }

    const reason = RUNTIME_SNAPSHOT_MISSING_REASON;
    const missingMetadata = {
      emptyReasonCode: RUNTIME_SNAPSHOT_MISSING_EMPTY_REASON_CODE,
      freshInstall: true
    };

    return {
      ...createMissingRuntimePanels(reason, snapshotPath, undefined, missingMetadata),
      status: {
        state: "missing",
        path: snapshotPath,
        reason,
        ...missingMetadata
      }
    };
  }

  let snapshotText: string;
  try {
    snapshotText = io.readFile(snapshotPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...createMissingRuntimePanels(reason, snapshotPath),
      status: {
        state: "unavailable",
        path: snapshotPath,
        reason
      }
    };
  }

  try {
    const parsed = JSON.parse(snapshotText) as unknown;
    const snapshot = readRecord(parsed);
    const currentTurn = readRecord(snapshot?.currentTurn);
    const routeOutcome = readRecord(snapshot?.routeOutcome);
    const replay = readRecord(snapshot?.replay);
    const snapshotObservedAt = typeof snapshot?.observedAt === "string"
      ? snapshot.observedAt
      : undefined;

    if (
      snapshot?.schemaVersion !== RUNTIME_SNAPSHOT_SCHEMA_VERSION
      || !snapshotObservedAt
      || !currentTurn
      || !replay
    ) {
      return repairRuntimeSnapshot({
        io,
        snapshotPath,
        snapshotText,
        observedAt,
        reason: "Runtime snapshot is not a valid skfiy snapshot."
      });
    }

    if (marker?.state === "recent" && isRuntimeSnapshotOlderThanMarker(snapshotObservedAt, marker.observedAt)) {
      const snapshotAgeSeconds = readObservedAgeSeconds(snapshotObservedAt, observedAt);
      const markerMetadata = {
        freshInstall: false,
        stale: true,
        markerPath,
        markerObservedAt: marker.observedAt,
        markerState: marker.state,
        ...(typeof marker.ageSeconds === "number" ? { markerAgeSeconds: marker.ageSeconds } : {}),
        ...(typeof snapshotAgeSeconds === "number" ? { snapshotAgeSeconds } : {})
      };

      return {
        currentTurn: {
          ...currentTurn,
          reason: typeof currentTurn.reason === "string"
            ? currentTurn.reason
            : RUNTIME_SNAPSHOT_STALE_AFTER_TURN_REASON,
          ...markerMetadata
        },
        ...(routeOutcome ? { routeOutcome: { ...routeOutcome } } : {}),
        replay: {
          ...replay,
          reason: typeof replay.reason === "string"
            ? replay.reason
            : RUNTIME_SNAPSHOT_STALE_AFTER_TURN_REASON,
          ...markerMetadata
        },
        status: {
          state: "stale-after-turn",
          path: snapshotPath,
          observedAt: snapshotObservedAt,
          reason: RUNTIME_SNAPSHOT_STALE_AFTER_TURN_REASON,
          ...markerMetadata
        }
      };
    }

    return {
      currentTurn: { ...currentTurn },
      ...(routeOutcome ? { routeOutcome: { ...routeOutcome } } : {}),
      replay: { ...replay },
      status: {
        state: "available",
        path: snapshotPath,
        observedAt: snapshotObservedAt
      }
    };
  } catch (error) {
    return repairRuntimeSnapshot({
      io,
      snapshotPath,
      snapshotText,
      observedAt,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

function readRuntimeTurnMarkerEvidence(
  io: DashboardWorkspaceIo,
  markerPath: string,
  generatedAt: string
): {
  state: "recent" | "stale";
  observedAt: string;
  ageSeconds?: number;
  currentTurn: Record<string, unknown>;
} | undefined {
  if (!io.exists(markerPath)) {
    return undefined;
  }

  try {
    const parsed = readRecord(JSON.parse(io.readFile(markerPath)));
    const currentTurn = readRecord(parsed?.currentTurn);
    const observedAt = typeof parsed?.observedAt === "string" ? parsed.observedAt : undefined;

    if (
      parsed?.schemaVersion !== RUNTIME_TURN_MARKER_SCHEMA_VERSION
      || !observedAt
      || !currentTurn
    ) {
      return undefined;
    }

    const ageSeconds = readObservedAgeSeconds(observedAt, generatedAt);
    return {
      state: ageSeconds !== undefined && ageSeconds <= RECENT_RUNTIME_TURN_MARKER_SECONDS
        ? "recent"
        : "stale",
      observedAt,
      ...(ageSeconds !== undefined ? { ageSeconds } : {}),
      currentTurn: summarizeRuntimeTurnMarkerCurrentTurn(currentTurn)
    };
  } catch {
    return undefined;
  }
}

function summarizeRuntimeTurnMarkerCurrentTurn(
  currentTurn: Record<string, unknown>
): Record<string, unknown> {
  const state = readSanitizedString(currentTurn.state)
    ?? readSanitizedString(currentTurn.status)
    ?? "unknown";
  const command = readSanitizedString(currentTurn.command);
  const targetApp = readSanitizedString(currentTurn.targetApp);
  const route = readSanitizedString(currentTurn.route);
  const reason = readSanitizedString(currentTurn.reason);
  const latestMessage = readSanitizedString(currentTurn.latestMessage)
    ?? readSanitizedString(currentTurn.message);

  return {
    state,
    source: "runtime-turn-marker",
    ...(command ? { command } : {}),
    ...(targetApp ? { targetApp } : {}),
    ...(route ? { route } : {}),
    ...(reason ? { reason, routeReason: reason } : {}),
    ...(typeof currentTurn.targetBundleId === "string"
      ? { targetBundleId: currentTurn.targetBundleId }
      : {}),
    ...(typeof currentTurn.risk === "string" ? { risk: currentTurn.risk } : {}),
    ...(typeof currentTurn.approvalRequired === "boolean"
      ? { approvalRequired: currentTurn.approvalRequired }
      : {}),
    ...(typeof currentTurn.approvalState === "string"
      ? { approvalState: currentTurn.approvalState }
      : {}),
    ...(typeof currentTurn.stopState === "string" ? { stopState: currentTurn.stopState } : {}),
    ...(typeof currentTurn.updateSource === "string"
      ? { updateSource: currentTurn.updateSource }
      : {}),
    ...(latestMessage ? { latestMessage } : {})
  };
}

function readSanitizedString(value: unknown): string | undefined {
  return typeof value === "string" ? sanitizeRuntimeEvidenceString(value) : undefined;
}

function sanitizeRuntimeEvidenceString(value: string): string {
  return value
    .replace(
      /\b(?:token|access_token|refresh_token|id_token|api_key|authorization|cookie)=([^&\s"']+)/gi,
      "redacted=[redacted]"
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

function isRuntimeSnapshotOlderThanMarker(snapshotObservedAt: string, markerObservedAt: string): boolean {
  const snapshotObservedAtMs = Date.parse(snapshotObservedAt);
  const markerObservedAtMs = Date.parse(markerObservedAt);

  return Number.isFinite(snapshotObservedAtMs)
    && Number.isFinite(markerObservedAtMs)
    && markerObservedAtMs > snapshotObservedAtMs;
}

function repairRuntimeSnapshot({
  io,
  snapshotPath,
  snapshotText,
  observedAt,
  reason
}: {
  io: DashboardWorkspaceIo;
  snapshotPath: string;
  snapshotText: string;
  observedAt: string;
  reason: string;
}): {
  currentTurn: Record<string, unknown>;
  replay: Record<string, unknown>;
  status: Record<string, unknown>;
} {
  const sha256 = createSha256(snapshotText);
  const isolatedPath = createCorruptRuntimeSnapshotPath(snapshotPath, observedAt, sha256);
  const replacement = createRuntimeSnapshotFromReplay({ replay: null, observedAt });
  const replacementText = `${JSON.stringify(replacement, null, 2)}\n`;
  let isolated = false;

  try {
    if (!io.rename || !io.writeFile) {
      throw new Error("Dashboard runtime snapshot IO does not support repair writes.");
    }

    io.rename(snapshotPath, isolatedPath);
    isolated = true;
    io.writeFile(snapshotPath, replacementText);

    const recovery = {
      state: "repaired",
      isolatedPath,
      replacementPath: snapshotPath,
      sha256,
      observedAt
    };

    return {
      ...createMissingRuntimePanels(reason, snapshotPath, recovery),
      status: {
        state: "repaired",
        path: snapshotPath,
        isolatedPath,
        replacementPath: snapshotPath,
        sha256,
        observedAt,
        reason
      }
    };
  } catch (error) {
    const repairError = error instanceof Error ? error.message : String(error);
    const state = isolated ? "isolated" : "repair-failed";
    const recovery = {
      state,
      isolatedPath,
      replacementPath: snapshotPath,
      sha256,
      observedAt,
      reason: repairError
    };

    return {
      ...createMissingRuntimePanels(reason, snapshotPath, recovery),
      status: {
        state,
        path: snapshotPath,
        isolatedPath,
        replacementPath: snapshotPath,
        sha256,
        observedAt,
        reason,
        repairError
      }
    };
  }
}

function createCorruptRuntimeSnapshotPath(
  snapshotPath: string,
  observedAt: string,
  sha256: string
): string {
  const timestamp = observedAt.replace(/[^0-9A-Za-z]/g, "");
  return `${snapshotPath}.corrupt-${timestamp}-${sha256.slice(0, 12)}.json`;
}

function createMissingRuntimePanels(
  reason: string,
  pathValue?: string,
  recovery?: Record<string, unknown>,
  metadata: Record<string, unknown> = {}
): {
  currentTurn: Record<string, unknown>;
  replay: Record<string, unknown>;
} {
  return {
    currentTurn: {
      state: "idle",
      source: "runtime-snapshot",
      reason,
      ...metadata,
      ...(pathValue ? { path: pathValue } : {}),
      ...(recovery ? { recovery } : {})
    },
    replay: {
      state: "empty",
      source: "runtime-snapshot",
      reason,
      ...metadata,
      ...(pathValue ? { path: pathValue } : {}),
      ...(recovery ? { recovery } : {})
    }
  };
}

function readObservedAgeSeconds(observedAt: string, generatedAt: string): number | undefined {
  const observedAtMs = Date.parse(observedAt);
  const generatedAtMs = Date.parse(generatedAt);

  return Number.isFinite(observedAtMs) && Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((generatedAtMs - observedAtMs) / 1000))
    : undefined;
}

function readWorkspaceLongHorizon(io: DashboardWorkspaceIo): Record<string, unknown> {
  const probeCommands: string[] = [];
  const runTmux = (args: string[]): DashboardTmuxResult => {
    probeCommands.push(formatTmuxCommand(args));
    return normalizeTmuxResult(
      io.tmux ? io.tmux(args) : readTmuxSync(args)
    );
  };

  try {
    const hasSession = runTmux(["has-session", "-t", MONEY_RUN_SESSION_NAME]);
    if (readTmuxExitStatus(hasSession) !== 0) {
      return createLongHorizonSnapshot(
        createTmuxSupervisionReport({
          sessionName: MONEY_RUN_SESSION_NAME,
          hasSession: false,
          commandError: readTmuxResultMessage(hasSession, "tmux session was not found.")
        }),
        probeCommands,
        {
          probeError: readTmuxResultMessage(hasSession, "tmux session was not found.")
        }
      );
    }

    const windows = runTmux([
      "list-windows",
      "-t",
      MONEY_RUN_SESSION_NAME,
      "-F",
      TMUX_WINDOW_FORMAT
    ]);
    const panes = runTmux([
      "list-panes",
      "-t",
      MONEY_RUN_SESSION_NAME,
      "-s",
      "-F",
      TMUX_PANE_FORMAT
    ]);

    const windowsStatus = readTmuxExitStatus(windows);
    const panesStatus = readTmuxExitStatus(panes);
    if (windowsStatus !== 0 || panesStatus !== 0) {
      return createLongHorizonProbeFailure(
        probeCommands,
        readTmuxResultMessage(
          windowsStatus !== 0 ? windows : panes,
          "tmux session state could not be listed."
        )
      );
    }

    const paneTails: Record<string, string> = {};
    for (const pane of parseTmuxPaneList(panes.stdout)) {
      const tail = runTmux([
        "capture-pane",
        "-p",
        "-t",
        pane.id,
        "-S",
        `-${TMUX_TAIL_LINES}`
      ]);
      paneTails[pane.id] = tail.stdout || tail.stderr || tail.error || "";
    }

    return createLongHorizonSnapshot(
      createTmuxSupervisionReport({
        sessionName: MONEY_RUN_SESSION_NAME,
        hasSession: true,
        windowsOutput: windows.stdout,
        panesOutput: panes.stdout,
        paneTails
      }),
      probeCommands
    );
  } catch (error) {
    return createLongHorizonProbeFailure(
      probeCommands,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function createLongHorizonProbeFailure(
  probeCommands: string[],
  reason: string
): Record<string, unknown> {
  return {
    state: "blocked",
    session: MONEY_RUN_SESSION_NAME,
    source: "tmux-read-only-probe",
    mutatesSession: false,
    summary: {
      windowCount: 0,
      paneCount: 0,
      activePaneIds: [],
      deadPaneIds: []
    },
    signals: [
      {
        type: "probe-error",
        severity: "blocked",
        message: reason
      }
    ],
    recommendation: {
      action: "inspect_state",
      reason,
      mutatesSession: false
    },
    probeCommands,
    probeError: reason
  };
}

function createLongHorizonSnapshot(
  report: TmuxSupervisionReport,
  probeCommands: string[],
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const activePane = report.panes.find((pane) => pane.active);

  return {
    state: report.status,
    session: report.sessionName,
    source: "tmux-read-only-probe",
    mutatesSession: false,
    summary: report.summary,
    ...(activePane ? { activePane: createActivePaneSummary(activePane) } : {}),
    signals: report.signals,
    recommendation: report.recommendation,
    probeCommands,
    ...extra
  };
}

function createActivePaneSummary(pane: TmuxPaneSummary): Record<string, unknown> {
  return {
    id: pane.id,
    windowName: pane.windowName,
    currentCommand: pane.currentCommand,
    title: pane.title,
    recentTailPreview: createTailPreview(pane.recentTail)
  };
}

function createTailPreview(value: string): string {
  const maxLength = 1_000;
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

function readWorkspaceLatestAlpha(
  rootDir: string,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  const latestAlphaPath = path.join(rootDir, "docs", "release-evidence", "latest-alpha.json");

  if (!io.exists(latestAlphaPath)) {
    return {
      state: "missing",
      path: latestAlphaPath,
      reason: "latest alpha release evidence is missing."
    };
  }

  try {
    const parsed = JSON.parse(io.readFile(latestAlphaPath)) as unknown;
    const record = readRecord(parsed);
    if (!record) {
      return {
        state: "invalid",
        path: latestAlphaPath,
        reason: "latest alpha release evidence is not an object."
      };
    }

    const commitSha = typeof record.commitSha === "string" ? record.commitSha : undefined;
    const manifestPath = typeof record.manifestPath === "string"
      ? resolveWorkspacePath(rootDir, record.manifestPath)
      : undefined;
    const zipPath = typeof record.zipPath === "string"
      ? resolveWorkspacePath(rootDir, record.zipPath)
      : undefined;

    return {
      state: typeof record.releaseUrl === "string" ? "published" : "present",
      path: latestAlphaPath,
      ...(typeof record.appName === "string" ? { appName: record.appName } : {}),
      ...(typeof record.tagName === "string" ? { tagName: record.tagName } : {}),
      ...(typeof record.releaseUrl === "string" ? { releaseUrl: record.releaseUrl } : {}),
      ...(commitSha ? { commitSha, shortCommit: commitSha.slice(0, 7) } : {}),
      ...(typeof record.artifactBaseName === "string" ? { artifactBaseName: record.artifactBaseName } : {}),
      ...(manifestPath ? { manifestPath } : {}),
      ...(zipPath ? { zipPath } : {}),
      ...(typeof record.zipSha256 === "string" ? { zipSha256: record.zipSha256 } : {}),
      ...(typeof record.dogfoodStatus === "string" ? { dogfoodStatus: record.dogfoodStatus } : {}),
      ...(typeof record.publishedAt === "string" ? { publishedAt: record.publishedAt } : {})
    };
  } catch (error) {
    return {
      state: "invalid",
      path: latestAlphaPath,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readWorkspaceLatestAlphaManifest(
  rootDir: string,
  latestAlpha: Record<string, unknown>,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  const manifestPath = typeof latestAlpha.manifestPath === "string"
    ? latestAlpha.manifestPath
    : undefined;

  if (!manifestPath) {
    return {
      state: "unknown",
      reason: "latest alpha manifest path is missing."
    };
  }

  if (!io.exists(manifestPath)) {
    return {
      state: "missing",
      path: manifestPath,
      reason: "latest alpha manifest is not present in this workspace."
    };
  }

  try {
    const manifestText = io.readFile(manifestPath);
    const parsed = JSON.parse(manifestText) as unknown;
    const manifest = readRecord(parsed);
    if (!manifest) {
      return {
        state: "invalid",
        path: manifestPath,
        reason: "latest alpha manifest is not an object."
      };
    }
    const zip = readRecord(manifest.zip);

    return {
      state: "present",
      path: manifestPath,
      sha256: createSha256(manifestText),
      ...(typeof manifest.appName === "string" ? { appName: manifest.appName } : {}),
      ...(typeof manifest.commitSha === "string" ? { commitSha: manifest.commitSha } : {}),
      ...(typeof manifest.bundleIdentifier === "string" ? { bundleIdentifier: manifest.bundleIdentifier } : {}),
      ...(typeof manifest.artifactBaseName === "string" ? { artifactBaseName: manifest.artifactBaseName } : {}),
      ...(typeof zip?.sha256 === "string" ? { zipSha256: zip.sha256 } : {})
    };
  } catch (error) {
    return {
      state: "invalid",
      path: manifestPath,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readWorkspaceDogfoodCohort(
  rootDir: string,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  const cohortPath = path.join(rootDir, ".skfiy-dogfood", "internal-alpha-cohort.json");
  const emptyCoverage = createWorkflowCoverage([]);

  if (!io.exists(cohortPath)) {
    return {
      state: "missing",
      path: cohortPath,
      totalReports: 0,
      acceptedReportCount: 0,
      distinctRealTesterCount: 0,
      ready: false,
      passedReady: false,
      workflowCoverage: emptyCoverage.workflowCoverage,
      passedWorkflowCoverage: emptyCoverage.passedWorkflowCoverage,
      acceptedReportIssueUrls: []
    };
  }

  try {
    const parsed = JSON.parse(io.readFile(cohortPath)) as unknown;
    const cohort = readRecord(parsed);
    if (!cohort) {
      return {
        state: "invalid",
        path: cohortPath,
        reason: "dogfood cohort is not an object."
      };
    }
    const reports = Array.isArray(cohort.reports)
      ? cohort.reports.map((report) => readRecord(report)).filter((report): report is Record<string, unknown> => Boolean(report))
      : [];
    const acceptedReports = reports.filter(isAcceptedDogfoodReport);
    const acceptedRealReports = acceptedReports.filter(isRealTesterReport);
    const workflowCoverage = createWorkflowCoverage(acceptedRealReports);
    const distinctRealTesterIds = collectDistinctRealTesterIds(acceptedReports);
    const ready = distinctRealTesterIds.length >= 3
      && distinctRealTesterIds.length <= 5
      && allWorkflowsCovered(workflowCoverage.workflowCoverage);
    const passedReady = ready && allWorkflowsCovered(workflowCoverage.passedWorkflowCoverage);

    return {
      state: "present",
      path: cohortPath,
      ...(typeof cohort.cohortName === "string" ? { cohortName: cohort.cohortName } : {}),
      ...(typeof cohort.manifestPath === "string" ? { manifestPath: resolveWorkspacePath(rootDir, cohort.manifestPath) } : {}),
      totalReports: reports.length,
      acceptedReportCount: acceptedReports.length,
      distinctRealTesterCount: distinctRealTesterIds.length,
      ready,
      passedReady,
      workflowCoverage: workflowCoverage.workflowCoverage,
      passedWorkflowCoverage: workflowCoverage.passedWorkflowCoverage,
      acceptedReportIssueUrls: acceptedReports
        .map((report) => readAcceptedIssueUrl(report))
        .filter((issueUrl): issueUrl is string => typeof issueUrl === "string")
    };
  } catch (error) {
    return {
      state: "invalid",
      path: cohortPath,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readDogfoodReleaseState(
  latestAlpha: Record<string, unknown>,
  cohort: Record<string, unknown>
): string {
  if (latestAlpha.state !== "published" && latestAlpha.state !== "present") {
    return `alpha-${String(latestAlpha.state ?? "unknown")}`;
  }

  if (cohort.passedReady === true) {
    return "passed-cohort-ready";
  }

  if (cohort.ready === true) {
    return "cohort-ready";
  }

  return typeof latestAlpha.dogfoodStatus === "string"
    ? latestAlpha.dogfoodStatus
    : "waiting-for-dogfood";
}

function createWorkflowCoverage(reports: Array<Record<string, unknown>>): {
  workflowCoverage: Record<string, boolean>;
  passedWorkflowCoverage: Record<string, boolean>;
} {
  return {
    workflowCoverage: Object.fromEntries(
      REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => [
        workflow,
        reports.some((report) => reportCoversWorkflow(report, workflow))
      ])
    ),
    passedWorkflowCoverage: Object.fromEntries(
      REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => [
        workflow,
        reports.some((report) =>
          report.result === "passed" && reportCoversWorkflow(report, workflow)
        )
      ])
    )
  };
}

function reportCoversWorkflow(report: Record<string, unknown>, workflow: string): boolean {
  return Array.isArray(report.workflows)
    && report.workflows.includes(workflow)
    && sourceHasWorkflowLabel(report, workflow);
}

function isAcceptedDogfoodReport(report: Record<string, unknown>): boolean {
  return readAcceptedIssueUrl(report) !== undefined
    && sourceHasLabel(report, ACCEPTED_DOGFOOD_LABEL);
}

function isRealTesterReport(report: Record<string, unknown>): boolean {
  const testerId = typeof report.testerId === "string" ? report.testerId.trim().toLowerCase() : "";
  return testerId.length > 0
    && !SYNTHETIC_TESTER_ID_PREFIXES.some((prefix) => testerId.startsWith(prefix));
}

function collectDistinctRealTesterIds(reports: Array<Record<string, unknown>>): string[] {
  return [...new Set(
    reports
      .filter(isRealTesterReport)
      .map((report) => String(report.testerId).trim())
      .filter(Boolean)
  )];
}

function allWorkflowsCovered(coverage: Record<string, boolean>): boolean {
  return REQUIRED_DOGFOOD_WORKFLOWS.every((workflow) => coverage[workflow] === true);
}

function sourceHasWorkflowLabel(report: Record<string, unknown>, workflow: string): boolean {
  return sourceHasLabel(report, `${DOGFOOD_WORKFLOW_LABEL_PREFIX}${workflow}`);
}

function sourceHasLabel(report: Record<string, unknown>, label: string): boolean {
  const source = readRecord(report.source);
  return Array.isArray(source?.issueLabels)
    && source.issueLabels.includes(label);
}

function readAcceptedIssueUrl(report: Record<string, unknown>): string | undefined {
  const source = readRecord(report.source);
  return source?.type === "github-issue" && typeof source.issueUrl === "string"
    ? source.issueUrl
    : undefined;
}

function resolveWorkspacePath(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

function createSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readLatestSmokeArtifacts(
  rootDir: string,
  generatedAt: string,
  io: DashboardWorkspaceIo
): Array<Record<string, unknown>> {
  const smokeDir = path.join(rootDir, ".skfiy-smoke");
  if (!io.exists(smokeDir)) {
    return [];
  }

  const latestByTarget = new Map<string, Record<string, unknown>>();

  for (const entry of io.readdir(smokeDir)) {
    if (!entry.endsWith(".json")) {
      continue;
    }

    const artifactPath = path.join(smokeDir, entry);
    let artifact: Record<string, unknown>;

    try {
      const parsed = JSON.parse(io.readFile(artifactPath)) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      artifact = parsed as Record<string, unknown>;
    } catch {
      continue;
    }

    const target = readSmokeTarget(entry, artifact);
    const mtimeMs = io.stat(artifactPath).mtimeMs;
    const ageSeconds = readSmokeArtifactAgeSeconds(generatedAt, mtimeMs);
    const supported = isSupportedSmokeTarget(target);
    const summary = {
      target,
      result: typeof artifact.result === "string" ? artifact.result : "unknown",
      path: artifactPath,
      ...(typeof artifact.productPath === "string" ? { productPath: artifact.productPath } : {}),
      ...(!supported ? {
        evidenceStatus: "unsupported",
        ignored: true,
        reason: "Unsupported smoke target is ignored for product readiness."
      } : {}),
      ...readSmokeArtifactSetupGuideSummary(target, artifact),
      ...readSmokeArtifactNativeHostBridgeSummary(target, artifact),
      ...readSmokeArtifactInstalledExtensionSummary(target, artifact),
      ...readSmokeArtifactPageControlSummary(target, artifact),
      ...readSmokeArtifactPageSafetySummary(target, artifact),
      ...readSmokeArtifactDesktopPreflightSummary(target, artifact),
      ...readSmokeArtifactFinderSummary(target, artifact),
      mtimeMs,
      ...(ageSeconds === undefined ? {} : {
        ageSeconds,
        stale: ageSeconds > STALE_SMOKE_EVIDENCE_SECONDS
      }),
      ...(typeof artifact.blocker === "string" ? { blocker: artifact.blocker } : {})
    };
    const current = latestByTarget.get(target);

    if (!current || (current.mtimeMs as number) < mtimeMs) {
      latestByTarget.set(target, summary);
    }
  }

  return [...latestByTarget.values()].sort((left, right) =>
    String(left.target).localeCompare(String(right.target))
  );
}

function readSmokeArtifactDesktopPreflightSummary(
  target: string,
  artifact: Record<string, unknown>
): Record<string, unknown> {
  if (target !== "ghostty") {
    return {};
  }

  const desktopPreflight = createFinderDesktopPreflightSummary(
    readRecord(artifact.desktopPreflight)
  );

  return desktopPreflight ? { desktopPreflight } : {};
}

function readSmokeArtifactSetupGuideSummary(
  target: string,
  artifact: Record<string, unknown>
): Record<string, unknown> {
  if (target !== "chrome") {
    return {};
  }

  const directGuide = readRecord(artifact.setupGuide);
  const readinessDiagnostics = readRecord(artifact.readinessDiagnostics);
  const diagnosticsGuide = readRecord(readinessDiagnostics?.setupGuide);
  const setupGuide = directGuide ?? diagnosticsGuide;

  return setupGuide ? { setupGuide: cloneRecord(setupGuide) } : {};
}

function readSmokeArtifactInstalledExtensionSummary(
  target: string,
  artifact: Record<string, unknown>
): Record<string, unknown> {
  if (target !== "chrome") {
    return {};
  }

  const run = readRecord(artifact.installedExtensionRun);
  if (!run) {
    return {};
  }

  const diagnosticExtensions = Array.isArray(run.diagnosticExtensions)
    ? run.diagnosticExtensions
      .map((entry) => readRecord(entry)?.manifestName)
      .filter((name): name is string => typeof name === "string")
    : [];
  const browserSelection = createChromeExtensionBrowserSelectionSummary(
    readRecord(run.browserSelection)
  );
  const installedExtension: Record<string, unknown> = {
    ...(typeof run.result === "string" ? { result: run.result } : {}),
    ...(typeof run.productPath === "string" ? { productPath: run.productPath } : {}),
    ...(browserSelection ? { browserSelection } : {}),
    ...(typeof run.chromeVersion === "string" ? { chromeVersion: run.chromeVersion } : {}),
    ...(typeof run.blockedReason === "string" ? { blockedReason: run.blockedReason } : {}),
    ...(typeof run.recommendedBrowser === "string" ? { recommendedBrowser: run.recommendedBrowser } : {}),
    ...(diagnosticExtensions.length > 0 ? { diagnosticExtensionNames: diagnosticExtensions } : {})
  };

  return Object.keys(installedExtension).length > 0 ? { installedExtension } : {};
}

function readSmokeArtifactPageControlSummary(
  target: string,
  artifact: Record<string, unknown>
): Record<string, unknown> {
  if (target !== "chrome") {
    return {};
  }

  const actionPageControl = createDashboardPageControlSummary(
    readSmokeArtifactInstalledActionPageControl(artifact),
    "chrome-smoke-action"
  );
  const pageControl = actionPageControl ?? readDashboardPageControlFromCandidates([
    readRecord(artifact.pageControl),
    readRecord(artifact.chromePageControl),
    readDashboardPageControlFromDiagnostics(readRecord(artifact.diagnostics)),
    readDashboardPageControlFromDiagnostics(readRecord(artifact.extensionDiagnostics)),
    readDashboardPageControlFromDiagnostics(readRecord(readRecord(artifact.installedExtensionRun)?.diagnostics)),
    readDashboardPageControlFromDiagnostics(readRecord(readRecord(artifact.readinessDiagnostics)?.extensionDiagnostics))
  ], "chrome-smoke");

  return pageControl ? { pageControl } : {};
}

function readSmokeArtifactInstalledActionPageControl(
  artifact: Record<string, unknown>
): Record<string, unknown> | undefined {
  const run = readRecord(artifact.installedExtensionActionRun);
  if (!run) {
    return undefined;
  }

  const pageControl = readInstalledActionObservedPageControl(readRecord(run.finalObserveRun))
    ?? readInstalledActionObservedPageControl(readRecord(run.observeRun));
  if (!pageControl) {
    return undefined;
  }

  const activeTab = readInstalledActionSelectedTargetActiveTab(readRecord(run.selectedTargetTab));
  return {
    ...pageControl,
    ...(activeTab ? {
      activeTab: {
        ...(readRecord(pageControl.activeTab) ?? {}),
        ...activeTab
      }
    } : {})
  };
}

function readInstalledActionObservedPageControl(
  commandRun: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (commandRun?.result !== "verified") {
    return undefined;
  }

  const extensionConnection = readRecord(commandRun.extensionConnection);
  const pageObservation = readRecord(extensionConnection?.pageObservation)
    ?? readRecord(readRecord(extensionConnection?.latestCommand)?.pageObservation);
  return readRecord(pageObservation?.pageControl);
}

function readInstalledActionSelectedTargetActiveTab(
  tab: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!tab) {
    return undefined;
  }

  const summary: Record<string, unknown> = {
    ...(typeof tab.state === "string" ? { state: tab.state } : {}),
    ...(Number.isInteger(tab.id) ? { tabId: tab.id } : {}),
    ...(Number.isInteger(tab.windowId) ? { windowId: tab.windowId } : {}),
    ...(typeof tab.host === "string" ? { host: tab.host } : {}),
    ...(typeof tab.scheme === "string" ? { scheme: tab.scheme } : {})
  };

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function readSmokeArtifactPageSafetySummary(
  target: string,
  artifact: Record<string, unknown>
): Record<string, unknown> {
  if (target !== "chrome") {
    return {};
  }

  const pageRun = createChromePageSafetyRunSummary(
    readRecord(artifact.sensitiveRun),
    "sensitive-page"
  );
  const formRun = createChromePageSafetyRunSummary(
    readRecord(artifact.sensitiveFormRun),
    "sensitive-form-prefill"
  );
  const runs = [pageRun, formRun].filter((run): run is Record<string, unknown> => Boolean(run));
  const currentPageSafety = createChromePageSafetyRecordSummary(
    readRecord(artifact.pageSafety) ?? readRecord(artifact.chromePageSafety)
  );
  const pauseCount = runs.filter((run) => run.sensitivePause === true).length
    + (currentPageSafety?.state === "needs_confirmation" ? 1 : 0);
  const pageSafety: Record<string, unknown> = {
    state: readChromePageSafetySummaryState({
      pauseCount,
      currentPageSafety,
      runs
    }),
    source: runs.length > 0 || currentPageSafety ? "chrome-smoke" : "chrome-smoke-empty",
    sensitivePause: pauseCount > 0,
    pauseCount,
    checkedRuns: runs.length,
    ...(currentPageSafety ? { currentPageSafety } : {}),
    ...(runs.length > 0 ? { runs } : {}),
    ...readChromePageSafetyFindingSummary(currentPageSafety, runs)
  };

  if (runs.length === 0 && !currentPageSafety) {
    pageSafety.reason = "Chrome smoke artifact has not reported page-level safety evidence yet.";
  }

  return { pageSafety };
}

function readSmokeArtifactFinderSummary(
  target: string,
  artifact: Record<string, unknown>
): Record<string, unknown> {
  if (target !== "finder") {
    return {};
  }

  const desktopPreflight = createFinderDesktopPreflightSummary(
    readRecord(artifact.desktopPreflight)
  );
  const finderObservation = createFinderSmokeProbeSummary(
    readRecord(artifact.finderObservation),
    ["result", "reason"],
    ["accessibilityTrusted"]
  );
  const finderSemanticObservation = createFinderSmokeProbeSummary(
    readRecord(artifact.finderSemanticObservation),
    ["result", "reason"],
    []
  );
  const finderItemDragDrop = createFinderSmokeProbeSummary(
    readRecord(artifact.finderItemDragDrop),
    ["result", "reason"],
    []
  );
  const finder: Record<string, unknown> = {
    result: typeof artifact.result === "string" ? artifact.result : "unknown",
    source: "finder-smoke",
    ...(desktopPreflight ? { desktopPreflight } : {}),
    ...(finderObservation ? { finderObservation } : {}),
    ...(finderSemanticObservation ? { finderSemanticObservation } : {}),
    ...(finderItemDragDrop ? { finderItemDragDrop } : {})
  };
  const reason = readFinderSmokeReason([
    desktopPreflight,
    finderObservation,
    finderSemanticObservation,
    finderItemDragDrop
  ]);

  if (desktopPreflight?.result === "blocked") {
    finder.blockedByDesktopPreflight = true;
  }

  if (reason) {
    finder.reason = reason;
  } else if (!desktopPreflight && !finderObservation && !finderSemanticObservation && !finderItemDragDrop) {
    finder.reason = "Finder smoke artifact has not reported desktop preflight or Finder observation evidence yet.";
  }

  return { finder };
}

function createFinderSmokeProbeSummary(
  probe: Record<string, unknown> | undefined,
  stringFields: string[],
  booleanFields: string[]
): Record<string, unknown> | undefined {
  if (!probe) {
    return undefined;
  }

  const summary: Record<string, unknown> = {};

  for (const field of stringFields) {
    const value = probe[field];
    if (typeof value === "string" && value.length > 0) {
      summary[field] = value;
    }
  }

  for (const field of booleanFields) {
    const value = probe[field];
    if (typeof value === "boolean") {
      summary[field] = value;
    }
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function createFinderDesktopPreflightSummary(
  desktopPreflight: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const summary = createFinderSmokeProbeSummary(
    desktopPreflight,
    ["result", "reason", "frontmostBundleId", "frontmostLocalizedName"],
    ["mainDisplayAsleep", "controllable"]
  );

  if (!desktopPreflight) {
    return summary;
  }

  const frontmost = readRecord(desktopPreflight.frontmost);
  const display = readRecord(desktopPreflight.display);
  const nestedSummary: Record<string, unknown> = {
    ...summary
  };

  if (typeof frontmost?.bundleId === "string" && !nestedSummary.frontmostBundleId) {
    nestedSummary.frontmostBundleId = frontmost.bundleId;
  }
  if (typeof frontmost?.localizedName === "string" && !nestedSummary.frontmostLocalizedName) {
    nestedSummary.frontmostLocalizedName = frontmost.localizedName;
  }
  if (typeof frontmost?.processIdentifier === "number") {
    nestedSummary.frontmostProcessIdentifier = frontmost.processIdentifier;
  }
  if (typeof display?.mainDisplayAsleep === "boolean" && !("mainDisplayAsleep" in nestedSummary)) {
    nestedSummary.mainDisplayAsleep = display.mainDisplayAsleep;
  }

  return Object.keys(nestedSummary).length > 0 ? nestedSummary : undefined;
}

function readFinderSmokeReason(
  probes: Array<Record<string, unknown> | undefined>
): string | undefined {
  return probes
    .map((probe) => probe?.reason)
    .find((reason): reason is string => typeof reason === "string" && reason.length > 0);
}

function createChromePageSafetyRunSummary(
  run: Record<string, unknown> | undefined,
  kind: "sensitive-page" | "sensitive-form-prefill"
): Record<string, unknown> | undefined {
  if (!run) {
    return undefined;
  }

  const safety = createChromePageSafetyRecordSummary(
    readRecord(run.pageSafety)
      ?? readRecord(run.safety)
      ?? readChromePageSafetyFromEvents(run)
  );
  const reason = readChromePageSafetyReason(run);
  const result = typeof run.result === "string" ? run.result : "unknown";
  const summary: Record<string, unknown> = {
    kind,
    result,
    sensitivePause: result === "sensitive-paused" || safety?.state === "needs_confirmation",
    ...(typeof run.pageUrl === "string" ? { pageUrl: run.pageUrl } : {}),
    ...(reason ? { reason } : {}),
    ...(safety ? { pageSafety: safety } : {}),
    ...(Array.isArray(run.fields) ? { fieldSelectors: readChromeFieldSelectors(run.fields) } : {})
  };

  return summary;
}

function readChromePageSafetySummaryState({
  pauseCount,
  currentPageSafety,
  runs
}: {
  pauseCount: number;
  currentPageSafety?: Record<string, unknown>;
  runs: Array<Record<string, unknown>>;
}): string {
  if (pauseCount > 0) {
    return "sensitive-paused";
  }

  if (currentPageSafety?.state === "clear") {
    return "clear";
  }

  if (runs.length > 0) {
    return "needs-evidence";
  }

  return "empty";
}

function createChromePageSafetyRecordSummary(
  safety: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!safety) {
    return undefined;
  }

  const findings = Array.isArray(safety.findings)
    ? safety.findings
      .map((finding) => createChromePageSafetyFindingSummary(readRecord(finding)))
      .filter((finding): finding is Record<string, unknown> => Boolean(finding))
    : [];
  const findingCount = typeof safety.findingCount === "number" && Number.isFinite(safety.findingCount)
    ? safety.findingCount
    : findings.length;
  const summary: Record<string, unknown> = {
    state: typeof safety.state === "string" ? safety.state : "unknown",
    findingCount,
    ...(findings.length > 0 ? { findings } : {})
  };

  return summary;
}

function createChromePageSafetyFindingSummary(
  finding: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!finding) {
    return undefined;
  }

  const summary = {
    ...(typeof finding.kind === "string" ? { kind: finding.kind } : {}),
    ...(typeof finding.severity === "string" ? { severity: finding.severity } : {}),
    ...(typeof finding.reason === "string" ? { reason: finding.reason } : {})
  };

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function readChromePageSafetyFindingSummary(
  currentPageSafety: Record<string, unknown> | undefined,
  runs: Array<Record<string, unknown>>
): Record<string, unknown> {
  const findings = [
    ...readChromePageSafetyFindings(currentPageSafety),
    ...runs.flatMap((run) => readChromePageSafetyFindings(readRecord(run.pageSafety)))
  ];
  const findingKinds = [...new Set(
    findings
      .map((finding) => finding.kind)
      .filter((kind): kind is string => typeof kind === "string")
  )].sort();
  const findingReasons = [...new Set(
    findings
      .map((finding) => finding.reason)
      .filter((reason): reason is string => typeof reason === "string")
  )].sort();

  return {
    ...(findingKinds.length > 0 ? { findingKinds } : {}),
    ...(findingReasons.length > 0 ? { findingReasons } : {})
  };
}

function readChromePageSafetyFindings(
  safety: Record<string, unknown> | undefined
): Array<Record<string, unknown>> {
  return Array.isArray(safety?.findings)
    ? safety.findings
      .map((finding) => readRecord(finding))
      .filter((finding): finding is Record<string, unknown> => Boolean(finding))
    : [];
}

function readChromePageSafetyFromEvents(
  run: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!Array.isArray(run.events)) {
    return undefined;
  }

  for (const event of run.events) {
    const record = readRecord(event);
    const safety = readRecord(record?.pageSafety) ?? readRecord(record?.safety);
    if (safety) {
      return safety;
    }
  }

  return undefined;
}

function readChromePageSafetyReason(
  run: Record<string, unknown>
): string | undefined {
  if (typeof run.reason === "string" && run.reason.trim()) {
    return run.reason.trim();
  }

  if (!Array.isArray(run.events)) {
    return undefined;
  }

  for (const event of [...run.events].reverse()) {
    const record = readRecord(event);
    const message = typeof record?.message === "string" ? record.message : undefined;
    if (!message) {
      continue;
    }

    const sensitivePrefix = "Verification failed (sensitive): ";
    if (message.startsWith(sensitivePrefix)) {
      return message.slice(sensitivePrefix.length).trim();
    }
  }

  return undefined;
}

function readChromeFieldSelectors(fields: unknown[]): string[] {
  return fields
    .map((field) => readRecord(field)?.selector)
    .filter((selector): selector is string => typeof selector === "string" && selector.length > 0);
}

function readDashboardPageControlEvidence(
  runtimeHealth: Record<string, unknown>,
  artifacts: Array<Record<string, unknown>>
): Record<string, unknown> {
  return readDashboardPageControlFromRuntime(runtimeHealth)
    ?? createDashboardPageControlSummary(
      readRecord(artifacts.find((artifact) => artifact.target === "chrome")?.pageControl),
      "chrome-smoke"
    )
    ?? createDashboardPageControlNotProbed();
}

function readDashboardBrowserContextEvidence(
  runtimeHealth: Record<string, unknown>,
  artifacts: Array<Record<string, unknown>>
): Record<string, unknown> {
  const runtimeContext = readDashboardBrowserContextFromRuntime(runtimeHealth);
  if (runtimeContext) {
    return runtimeContext;
  }

  const artifact = artifacts.find((candidate) => candidate.target === "chrome");
  const artifactContext = readDashboardBrowserContextFromChromeArtifact(readRecord(artifact));
  if (artifactContext) {
    return artifactContext;
  }

  return createDashboardBrowserContextSummary(normalizeBrowserPageContext(undefined), "dashboard-empty")
    ?? createDashboardBrowserContextMissingSummary("dashboard-empty");
}

function readDashboardBrowserContextFromRuntime(
  runtimeHealth: Record<string, unknown>
): Record<string, unknown> | undefined {
  const extension = readRecord(runtimeHealth.extension);
  const connection = readRecord(extension?.connection);
  const directContext = createDashboardBrowserContextSummary(
    readRecord(extension?.browserContext) ?? readRecord(connection?.browserContext),
    "runtime-health"
  );
  if (directContext) {
    return directContext;
  }

  if (!extension && !connection) {
    return undefined;
  }

  return createDashboardBrowserContextSummary(createBrowserPageContextFromConnection({
    state: readNonEmptyStringValue(connection?.state)
      ?? readNonEmptyStringValue(extension?.liveConnection)
      ?? readNonEmptyStringValue(extension?.state),
    observedAt: readNonEmptyStringValue(connection?.observedAt),
    reason: readNonEmptyStringValue(connection?.reason) ?? readNonEmptyStringValue(extension?.reason),
    pageControl: readRecord(extension?.pageControl) ?? readRecord(connection?.pageControl),
    pageObservation: readRecord(extension?.pageObservation) ?? readRecord(connection?.pageObservation),
    latestCommand: readRecord(extension?.latestCommand) ?? readRecord(connection?.latestCommand)
  }), "runtime-health");
}

function readDashboardBrowserContextFromChromeArtifact(
  artifact: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!artifact) {
    return undefined;
  }

  return [
    readRecord(artifact.browserContext),
    readRecord(readRecord(artifact.extension)?.browserContext),
    readRecord(readRecord(artifact.installedExtensionRun)?.browserContext),
    readDashboardBrowserContextFromInstalledActionRun(readRecord(artifact.installedExtensionActionRun))
  ].reduce<Record<string, unknown> | undefined>((summary, candidate) =>
    summary ?? createDashboardBrowserContextSummary(candidate, "chrome-smoke"),
  undefined);
}

function readDashboardBrowserContextFromInstalledActionRun(
  run: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const observeRun = readRecord(run?.finalObserveRun) ?? readRecord(run?.observeRun);
  const connection = readRecord(observeRun?.extensionConnection);
  if (!connection) {
    return undefined;
  }

  return createDashboardBrowserContextSummary(
    createBrowserPageContextFromConnection(connection),
    "chrome-smoke"
  );
}

function createDashboardBrowserContextSummary(
  raw: unknown,
  source: string
): Record<string, unknown> | undefined {
  if (!readRecord(raw)) {
    return undefined;
  }

  const context = normalizeBrowserPageContext(raw);
  return {
    schemaVersion: 1,
    state: context.state,
    source,
    ...(context.url ? { url: context.url } : {}),
    ...(context.title ? { title: context.title } : {}),
    ...(context.observedAt ? { observedAt: context.observedAt } : {}),
    ...(context.reason ? { reason: context.reason } : {}),
    ...(context.nextAction ? { nextAction: context.nextAction } : {})
  };
}

function createDashboardBrowserContextMissingSummary(source: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    state: "missing",
    source,
    reason: "Chrome page context has not been observed yet.",
    nextAction: "Open an http or https page in Chrome and refresh the skfiy extension."
  };
}

function readDashboardPageControlFromRuntime(
  runtimeHealth: Record<string, unknown>
): Record<string, unknown> | undefined {
  const extension = readRecord(runtimeHealth.extension);
  if (!extension) {
    return undefined;
  }

  return readDashboardPageControlFromCandidates([
    readRecord(extension.pageControl),
    readRecord(readRecord(extension.connection)?.pageControl),
    readDashboardPageControlFromDiagnostics(readRecord(extension.diagnostics)),
    readRecord(readRecord(extension.currentTab)?.pageControl),
    readRecord(readRecord(extension.session)?.pageControl)
  ], "runtime-health");
}

function readDashboardPageControlFromDiagnostics(
  diagnostics: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  return readRecord(diagnostics?.pageControl)
    ?? readRecord(readRecord(diagnostics?.currentTab)?.pageControl)
    ?? readRecord(readRecord(diagnostics?.session)?.pageControl);
}

function readDashboardPageControlFromCandidates(
  candidates: unknown[],
  source: string
): Record<string, unknown> | undefined {
  for (const candidate of candidates) {
    const pageControl = createDashboardPageControlSummary(readRecord(candidate), source);
    if (pageControl) {
      return pageControl;
    }
  }

  return undefined;
}

function createDashboardPageControlSummary(
  pageControl: Record<string, unknown> | undefined,
  source: string
): Record<string, unknown> | undefined {
  if (!pageControl) {
    return undefined;
  }

  const state = readNonEmptyStringValue(pageControl.state) ?? "not-probed";
  const capabilities = readDashboardPageControlCapabilities(readRecord(pageControl.capabilities));
  const activeTab = readDashboardPageControlActiveTab(readRecord(pageControl.activeTab));
  const contentScript = readDashboardPageControlContentScript(readRecord(pageControl.contentScript));
  const blockers = readDashboardPageControlBlockers(pageControl.blockers);
  const counts = readDashboardPageControlCounts(readRecord(pageControl.counts));
  const reason = readNonEmptyStringValue(pageControl.reason)
    ?? readNonEmptyStringValue(blockers[0]?.message)
    ?? readNonEmptyStringValue(blockers[0]?.reason)
    ?? (state === "not-probed" ? "Chrome pageControl readiness has not been probed yet." : undefined);
  const nextAction = readDashboardPageControlOperatorNextAction(pageControl, state, blockers)
    ?? readNonEmptyStringValue(pageControl.nextAction)
    ?? readNonEmptyStringValue(pageControl.guidance)
    ?? readDashboardPageControlNextAction(state, capabilities, contentScript, blockers);
  const summary: Record<string, unknown> = {
    schemaVersion: typeof pageControl.schemaVersion === "number" ? pageControl.schemaVersion : 1,
    state,
    source: source === "chrome-smoke"
      ? readNonEmptyStringValue(pageControl.source) ?? source
      : source,
    capable: typeof pageControl.capable === "boolean"
      ? pageControl.capable
      : isDashboardPageControlCapable(state, capabilities),
    reason: reason ?? "Chrome pageControl readiness has not reported a reason.",
    ...(nextAction ? { nextAction } : {}),
    ...(activeTab ? { activeTab } : {}),
    ...(contentScript ? { contentScript } : {}),
    capabilities,
    ...(blockers.length > 0 ? { blockers } : {}),
    ...(counts ? { counts } : {}),
    ...(typeof pageControl.observedAt === "string" ? { observedAt: pageControl.observedAt } : {})
  };

  return summary;
}

function createDashboardPageControlNotProbed(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    state: "not-probed",
    source: "dashboard-empty",
    capable: false,
    reason: "Chrome pageControl readiness has not been probed yet.",
    capabilities: {},
    nextAction: "Probe pageControl readiness from Chrome extension diagnostics."
  };
}

function readNonEmptyStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readDashboardPageControlCapabilities(
  capabilities: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!capabilities) {
    return {};
  }

  return [
    "diagnostics",
    "observe",
    "domActions",
    "screenshot",
    "click",
    "fill",
    "submit",
    "scroll"
  ].reduce<Record<string, unknown>>((summary, key) => {
    const value = capabilities[key];
    if (typeof value === "boolean" || typeof value === "string") {
      summary[key] = value;
    }
    return summary;
  }, {});
}

function readDashboardPageControlActiveTab(
  activeTab: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!activeTab) {
    return undefined;
  }

  const summary: Record<string, unknown> = {
    ...(typeof activeTab.state === "string" ? { state: activeTab.state } : {}),
    ...(Number.isInteger(activeTab.tabId) ? { tabId: activeTab.tabId } : {}),
    ...(Number.isInteger(activeTab.windowId) ? { windowId: activeTab.windowId } : {}),
    ...(typeof activeTab.host === "string" ? { host: activeTab.host } : {}),
    ...(typeof activeTab.scheme === "string" ? { scheme: activeTab.scheme } : {})
  };

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function readDashboardPageControlContentScript(
  contentScript: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!contentScript) {
    return undefined;
  }

  const summary: Record<string, unknown> = {
    ...(typeof contentScript.state === "string" ? { state: contentScript.state } : {}),
    ...(typeof contentScript.reason === "string" ? { reason: contentScript.reason } : {}),
    ...(typeof contentScript.lastError === "string" ? { lastError: contentScript.lastError } : {})
  };

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function readDashboardPageControlBlockers(value: unknown): Array<Record<string, string>> {
  return Array.isArray(value)
    ? value
      .map((entry) => readRecord(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => ({
        ...(typeof entry.code === "string" ? { code: entry.code } : {}),
        ...(typeof entry.reason === "string" ? { reason: entry.reason } : {}),
        ...(typeof entry.message === "string" ? { message: entry.message } : {})
      }))
      .filter((entry) => Object.keys(entry).length > 0)
    : [];
}

function readDashboardPageControlCounts(
  counts: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!counts) {
    return undefined;
  }

  const summary = [
    "interactiveElements",
    "forms",
    "fillableForms",
    "sensitiveForms"
  ].reduce<Record<string, unknown>>((record, key) => {
    if (Number.isFinite(counts[key])) {
      record[key] = counts[key];
    }
    return record;
  }, {});

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function readDashboardPageControlNextAction(
  state: string,
  capabilities: Record<string, unknown>,
  contentScript: Record<string, unknown> | undefined,
  blockers: Array<Record<string, string>>
): string | undefined {
  const blockerCode = blockers[0]?.code;
  if (state === "not-probed") {
    return "Probe pageControl readiness from Chrome extension diagnostics.";
  }
  if (state === "blocked_by_host_policy" || blockerCode === "blocked_by_host_policy") {
    return "Allow the current host in dashboard Chrome policy, then rerun diagnostics.";
  }
  if (state === "blocked_by_chrome_host_permission" || blockerCode === "blocked_by_chrome_host_permission") {
    return "Grant Chrome host permission for the current page, then rerun diagnostics.";
  }
  if (
    state === "content_script_not_loaded"
    || state === "not_loaded"
    || contentScript?.state === "not_loaded"
    || contentScript?.state === "not_queried"
  ) {
    return "Reload the active page or extension so the content script can report controls.";
  }
  if (state === "unavailable" || state === "active_tab_unavailable" || blockerCode === "active_tab_unavailable") {
    return "Open an active Chrome tab and rerun extension diagnostics.";
  }
  if (!isDashboardPageControlCapable(state, capabilities)) {
    return "Restore DOM actions or screenshot capability before using pageControl.";
  }

  return undefined;
}

function readDashboardPageControlOperatorNextAction(
  pageControl: Record<string, unknown>,
  state: string,
  blockers: Array<Record<string, string>>
): string | undefined {
  const reportedNextAction = readNonEmptyStringValue(pageControl.nextAction);

  if (!reportedNextAction) {
    return undefined;
  }
  if (!isDashboardPageControlMachineNextAction(reportedNextAction)) {
    return reportedNextAction;
  }

  const activeTab = readRecord(pageControl.activeTab);
  const chromeHostPermission = readRecord(pageControl.chromeHostPermission);
  const chromeCapturePermission = readRecord(pageControl.chromeCapturePermission);
  const blockerCodes = blockers.map((blocker) => blocker.code).filter(Boolean);
  const host = readNonEmptyStringValue(activeTab?.host)
    ?? readNonEmptyStringValue(chromeHostPermission?.host)
    ?? readDashboardHostFromPermissionOrigin(readNonEmptyStringValue(chromeHostPermission?.origin));
  const chromeHostOrigins = readDashboardStringArray(chromeHostPermission?.origins);
  const chromeCaptureOrigins = readDashboardStringArray(chromeCapturePermission?.origins);
  const chromePopupGrantOrigins = [
    ...(reportedNextAction === "grant_chrome_host_permission"
      || readNonEmptyStringValue(chromeHostPermission?.state) === "missing"
      || blockerCodes.includes("chrome_host_permission_missing")
      ? [chromeHostOrigins[0] ?? readNonEmptyStringValue(chromeHostPermission?.origin) ?? "the active page"]
      : []),
    ...(reportedNextAction === "grant_chrome_capture_permission"
      || readNonEmptyStringValue(chromeCapturePermission?.state) === "missing"
      || blockerCodes.includes("chrome_capture_permission_missing")
      ? [chromeCaptureOrigins[0] ?? "<all_urls>"]
      : [])
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
  const actions: string[] = [];

  if (state === "ready") {
    return "Chrome pageControl is ready for the current page.";
  }

  if (
    reportedNextAction === "allow_host"
    || state === "blocked_by_host_policy"
    || blockerCodes.includes("blocked_by_host_policy")
  ) {
    actions.push(host
      ? `Run \`${formatDashboardCommandLine(["skfiy", "chrome", "policy", "set", "--host", host, "--action", "allow-current-turn"])}\` or approve the host in Dashboard Chrome policy.`
      : "Allow the current host in Dashboard Chrome policy.");
  }

  if (chromePopupGrantOrigins.length > 0) {
    actions.push(
      `Open Dashboard > Browser and click Open access page, then click Grant ${chromePopupGrantOrigins.join(" + ")} and observe.`
    );
    actions.push(
      `Open the skfiy extension popup and click Grant ${chromePopupGrantOrigins.join(" + ")} and observe.`
    );
  }

  if (actions.length === 0) {
    actions.push("Refresh the skfiy Chrome extension and rerun diagnostics.");
  }

  return actions.join(" ");
}

function isDashboardPageControlMachineNextAction(value: string): boolean {
  return value === "allow_host"
    || value === "grant_chrome_host_permission"
    || value === "grant_chrome_capture_permission"
    || value === "send_page_action";
}

function readDashboardHostFromPermissionOrigin(origin: string | undefined): string | undefined {
  if (!origin) {
    return undefined;
  }

  try {
    return new URL(origin).host || undefined;
  } catch {
    return undefined;
  }
}

function readDashboardStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function formatDashboardCommandLine(commandLine: string[]): string {
  return commandLine.map(formatDashboardCommandArg).join(" ");
}

function formatDashboardCommandArg(arg: string): string {
  return /^[A-Za-z0-9_./:@%#{}=-]+$/.test(arg)
    ? arg
    : JSON.stringify(arg);
}

function isDashboardPageControlCapable(
  state: string,
  capabilities: Record<string, unknown>
): boolean {
  const hasReadyCapability = [
    capabilities.domActions,
    capabilities.screenshot,
    capabilities.click,
    capabilities.fill,
    capabilities.submit,
    capabilities.scroll
  ].some((value) => value === true || value === "background_required");

  return ["ready", "sensitive-paused", "needs_confirmation"].includes(state) && hasReadyCapability;
}

function isDashboardPageControlPolicyBlocked(
  pageControl: Record<string, unknown>
): boolean {
  const state = typeof pageControl.state === "string" ? pageControl.state : "";
  const blockerCodes = Array.isArray(pageControl.blockers)
    ? pageControl.blockers
      .map((blocker) => readRecord(blocker)?.code)
      .filter((code): code is string => typeof code === "string")
    : [];

  return state === "blocked_by_host_policy"
    || state === "blocked_by_chrome_host_permission"
    || blockerCodes.includes("blocked_by_host_policy")
    || blockerCodes.includes("blocked_by_chrome_host_permission");
}

function isDashboardPageControlUncontrollable(
  pageControl: Record<string, unknown>
): boolean {
  const state = typeof pageControl.state === "string" ? pageControl.state : "";
  const capabilities = readRecord(pageControl.capabilities) ?? {};
  const blockedStates = new Set([
    "unavailable",
    "active_tab_unavailable",
    "content_script_not_loaded",
    "not_loaded"
  ]);

  return blockedStates.has(state) || pageControl.capable === false || !isDashboardPageControlCapable(state, capabilities);
}

function createChromeExtensionBrowserSelectionSummary(
  selection: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!selection) {
    return undefined;
  }

  const summary = {
    ...(typeof selection.chromeAppName === "string" ? { chromeAppName: selection.chromeAppName } : {}),
    ...(typeof selection.source === "string" ? { source: selection.source } : {}),
    ...(typeof selection.loadExtensionFriendly === "boolean"
      ? { loadExtensionFriendly: selection.loadExtensionFriendly }
      : {}),
    ...(Array.isArray(selection.availableAppNames)
      ? { availableAppNames: selection.availableAppNames.filter((name): name is string => typeof name === "string") }
      : {}),
    ...(Array.isArray(selection.candidateAppNames)
      ? { candidateAppNames: selection.candidateAppNames.filter((name): name is string => typeof name === "string") }
      : {})
  };

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function readSmokeArtifactNativeHostBridgeSummary(
  target: string,
  artifact: Record<string, unknown>
): Record<string, unknown> {
  if (target !== "chrome") {
    return {};
  }

  const run = readRecord(artifact.nativeHostBridgeRun);
  if (!run) {
    return {};
  }

  const response = readRecord(run.response);
  const heartbeat = readRecord(run.heartbeat);
  const nativeHostBridge: Record<string, unknown> = {
    ...(typeof run.result === "string" ? { result: run.result } : {}),
    ...(typeof run.productPath === "string" ? { productPath: run.productPath } : {}),
    ...(typeof response?.result === "string" ? { responseResult: response.result } : {}),
    ...(typeof run.heartbeatPath === "string" ? { heartbeatPath: run.heartbeatPath } : {}),
    ...(typeof heartbeat?.hostName === "string" ? { heartbeatHostName: heartbeat.hostName } : {}),
    ...(typeof heartbeat?.launchOrigin === "string" ? { heartbeatLaunchOrigin: heartbeat.launchOrigin } : {}),
    ...(typeof heartbeat?.messageType === "string" ? { heartbeatMessageType: heartbeat.messageType } : {}),
    ...(typeof heartbeat?.requestId === "string" ? { heartbeatRequestId: heartbeat.requestId } : {})
  };

  return Object.keys(nativeHostBridge).length > 0 ? { nativeHostBridge } : {};
}

function readSmokeArtifactAgeSeconds(generatedAt: string, mtimeMs: number): number | undefined {
  const generatedAtMs = Date.parse(generatedAt);

  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(mtimeMs)) {
    return undefined;
  }

  return Math.max(0, Math.floor((generatedAtMs - mtimeMs) / 1000));
}

function readSmokeTarget(entry: string, artifact: Record<string, unknown>): string {
  if (typeof artifact.target === "string" && artifact.target.length > 0) {
    return artifact.target;
  }

  const normalized = path.basename(entry, ".json").toLowerCase();
  const knownTargets = [
    "ui",
    "desktop-session",
    "ghostty",
    "chrome",
    "cli",
    "codex-plugin",
    "dashboard",
    "finder",
    "money-run"
  ];

  return knownTargets.find((target) =>
    normalized === target
    || normalized.startsWith(`${target}-`)
    || normalized.startsWith(`${target}_`)
    || normalized.startsWith(`${target}.`)
  ) ?? "unknown";
}

function createDefaultDashboardWorkspaceIo(): DashboardWorkspaceIo {
  return {
    exists: (targetPath) => fs.existsSync(targetPath),
    readFile: (targetPath) => fs.readFileSync(targetPath, "utf8"),
    writeFile: (targetPath, content) => fs.writeFileSync(targetPath, content),
    rename: (fromPath, toPath) => fs.renameSync(fromPath, toPath),
    readdir: (targetPath) => fs.readdirSync(targetPath),
    stat: (targetPath) => fs.statSync(targetPath),
    homeDir: () => process.env.HOME,
    pid: () => process.pid,
    uptimeSeconds: () => Math.max(0, Math.round(process.uptime())),
    codeSignature: readCodeSignatureSync,
    permissions: readHelperPermissionsSync,
    desktopSession: readHelperDesktopSessionSync,
    tmux: readTmuxSync
  };
}

function readWorkspaceChromeNativeHost({
  cliPath,
  cliInstalled,
  io
}: {
  cliPath: string;
  cliInstalled: boolean;
  io: DashboardWorkspaceIo;
}): Record<string, unknown> {
  const homeDir = io.homeDir?.();
  if (!homeDir) {
    return {
      state: "unknown",
      hostName: CHROME_NATIVE_HOST_NAME,
      cliShimPath: cliPath,
      reason: "Home directory is required to locate the Chrome Native Messaging host manifest."
    };
  }

  const manifestPath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "NativeMessagingHosts",
    `${CHROME_NATIVE_HOST_NAME}.json`
  );

  if (!cliInstalled) {
    return {
      state: "cli-missing",
      hostName: CHROME_NATIVE_HOST_NAME,
      manifestPath,
      cliShimPath: cliPath,
      allowedOrigins: [],
      reason: `skfiy CLI shim is missing at ${cliPath}.`
    };
  }

  if (!io.exists(manifestPath)) {
    return {
      state: "missing",
      hostName: CHROME_NATIVE_HOST_NAME,
      manifestPath,
      cliShimPath: cliPath,
      allowedOrigins: [],
      reason: "Chrome Native Messaging host manifest is not installed."
    };
  }

  let manifest: Record<string, unknown>;
  try {
    const parsed = JSON.parse(io.readFile(manifestPath)) as unknown;
    const record = readRecord(parsed);
    if (!record) {
      return {
        state: "invalid",
        hostName: CHROME_NATIVE_HOST_NAME,
        manifestPath,
        cliShimPath: cliPath,
        allowedOrigins: [],
        reason: "Chrome Native Messaging host manifest is not an object."
      };
    }
    manifest = record;
  } catch {
    return {
      state: "invalid",
      hostName: CHROME_NATIVE_HOST_NAME,
      manifestPath,
      cliShimPath: cliPath,
      allowedOrigins: [],
      reason: "Chrome Native Messaging host manifest is not valid JSON."
    };
  }

  const allowedOrigins = Array.isArray(manifest.allowed_origins)
    ? manifest.allowed_origins.filter((origin): origin is string => typeof origin === "string")
    : [];
  const status = {
    hostName: CHROME_NATIVE_HOST_NAME,
    manifestPath,
    cliShimPath: cliPath,
    allowedOrigins
  };

  if (
    manifest.name !== CHROME_NATIVE_HOST_NAME
    || manifest.type !== "stdio"
    || manifest.path !== cliPath
  ) {
    return {
      state: "mismatched",
      ...status,
      installedPath: manifest.path,
      reason: "Chrome Native Messaging host manifest does not match the current skfiy CLI."
    };
  }

  return {
    state: "installed",
    ...status,
    reason: "Chrome Native Messaging host is installed."
  };
}

function createWorkspaceChromeExtensionStatus(
  nativeHost: Record<string, unknown>,
  connection?: Record<string, unknown>,
  hostPolicy?: DashboardChromeHostPolicyState
): Record<string, unknown> {
  const allowedOrigins = Array.isArray(nativeHost.allowedOrigins)
    ? nativeHost.allowedOrigins.filter((origin): origin is string => typeof origin === "string")
    : [];
  const common = {
    bridge: "native-messaging",
    liveConnection: readWorkspaceConnectionState(connection),
    nativeHostState: nativeHost.state,
    ...(typeof nativeHost.manifestPath === "string" ? { manifestPath: nativeHost.manifestPath } : {}),
    ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
    ...(readRecord(connection?.pageControl) ? { pageControl: readRecord(connection?.pageControl) } : {}),
    ...(readRecord(connection?.browserContext) ? { browserContext: readRecord(connection?.browserContext) } : {}),
    ...(connection && connection.state !== "unknown" ? { connection } : {}),
    ...(hostPolicy ? { hostPolicy } : {})
  };

  if (connection?.state === "connected") {
    return {
      state: "connected",
      ...common
    };
  }

  if (connection?.state === "stale" && nativeHost.state === "installed") {
    return {
      state: "native-host-installed",
      ...common,
      reason: "Chrome extension native-message heartbeat is stale."
    };
  }

  if (nativeHost.state === "installed") {
    return {
      state: "native-host-installed",
      ...common,
      reason: "Chrome Native Messaging host is installed; no live Chrome extension connection has been observed yet."
    };
  }

  if (nativeHost.state === "missing") {
    return {
      state: "native-host-missing",
      ...common,
      reason: "Chrome Native Messaging host manifest is not installed."
    };
  }

  if (nativeHost.state === "cli-missing") {
    return {
      state: "native-host-cli-missing",
      ...common,
      reason: "The Chrome Native Messaging host cannot run because the packaged skfiy CLI is missing."
    };
  }

  if (nativeHost.state === "mismatched") {
    return {
      state: "native-host-mismatched",
      ...common,
      reason: "Chrome Native Messaging host manifest points at a different skfiy CLI."
    };
  }

  if (nativeHost.state === "invalid") {
    return {
      state: "native-host-invalid",
      ...common,
      reason: "Chrome Native Messaging host manifest is invalid."
    };
  }

  return {
    state: "unknown",
    ...common,
    reason: "Runtime Chrome extension connection is not probed yet."
  };
}

function readWorkspaceChromeExtensionConnection({
  generatedAt,
  io
}: {
  generatedAt: string;
  io: DashboardWorkspaceIo;
}): Record<string, unknown> | undefined {
  const homeDir = io.homeDir?.();
  if (!homeDir) {
    return undefined;
  }

  const statePath = createChromeExtensionConnectionStatePath(homeDir);
  if (!io.exists(statePath)) {
    return {
      state: "unknown",
      liveConnection: "unknown",
      path: statePath,
      reason: "No Chrome extension connection heartbeat has been recorded."
    };
  }

  let heartbeat: Record<string, unknown>;
  try {
    const parsed = JSON.parse(io.readFile(statePath)) as unknown;
    const record = readRecord(parsed);
    if (!record) {
      return {
        state: "invalid",
        liveConnection: "unknown",
        path: statePath,
        reason: "Chrome extension connection heartbeat is not an object."
      };
    }
    heartbeat = record;
  } catch {
    return {
      state: "invalid",
      liveConnection: "unknown",
      path: statePath,
      reason: "Chrome extension connection heartbeat is not valid JSON."
    };
  }

  const observedAt = typeof heartbeat.observedAt === "string" ? heartbeat.observedAt : undefined;
  const observedAtMs = observedAt ? Date.parse(observedAt) : NaN;
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(generatedAtMs)) {
    return {
      state: "invalid",
      liveConnection: "unknown",
      path: statePath,
      reason: "Chrome extension connection heartbeat has invalid timestamps."
    };
  }

  const ageSeconds = Math.max(0, Math.floor((generatedAtMs - observedAtMs) / 1000));
  const connected = ageSeconds <= CHROME_EXTENSION_CONNECTION_TTL_SECONDS;
  const browserContext = createDashboardBrowserContextSummary(
    createBrowserPageContextFromConnection({
      ...heartbeat,
      state: connected ? "connected" : "stale",
      observedAt
    }),
    "runtime-heartbeat"
  );

  return {
    state: connected ? "connected" : "stale",
    liveConnection: connected ? "connected" : "stale",
    path: statePath,
    ageSeconds,
    observedAt,
    ...(typeof heartbeat.launchOrigin === "string" ? { launchOrigin: heartbeat.launchOrigin } : {}),
    ...(typeof heartbeat.messageType === "string" ? { messageType: heartbeat.messageType } : {}),
    ...(typeof heartbeat.requestId === "string" ? { requestId: heartbeat.requestId } : {}),
    ...(readRecord(heartbeat.pageControl) ? { pageControl: readRecord(heartbeat.pageControl) } : {}),
    ...(browserContext ? { browserContext } : {})
  };
}

function readWorkspaceChromeHostPolicy(io: DashboardWorkspaceIo): DashboardChromeHostPolicyState | undefined {
  const homeDir = io.homeDir?.();
  if (!homeDir) {
    return undefined;
  }

  const statePath = createChromeHostPolicyStatePath(homeDir);
  if (!io.exists(statePath)) {
    return createDashboardChromeHostPolicyState({
      schemaVersion: 1,
      state: "default",
      path: statePath,
      policy: createDefaultChromeHostPolicy(),
      reason: "Chrome host policy has not been configured yet."
    }, "default-policy");
  }
  const updatedAt = readWorkspaceFileUpdatedAt(statePath, io);

  try {
    const parsed = JSON.parse(io.readFile(statePath)) as unknown;
    const record = readRecord(parsed);
    if (!record) {
      return createDashboardChromeHostPolicyState({
        schemaVersion: 1,
        state: "invalid",
        path: statePath,
        policy: createDefaultChromeHostPolicy(),
        reason: "Chrome host policy file is not an object."
      }, "invalid-chrome-host-policy-file", updatedAt);
    }

    return createDashboardChromeHostPolicyState({
      schemaVersion: 1,
      state: "configured",
      path: statePath,
      policy: normalizeChromeHostPolicy(record.policy)
    }, "chrome-host-policy-file", updatedAt);
  } catch {
    return createDashboardChromeHostPolicyState({
      schemaVersion: 1,
      state: "invalid",
      path: statePath,
      policy: createDefaultChromeHostPolicy(),
      reason: "Chrome host policy file is not valid JSON."
    }, "invalid-chrome-host-policy-file", updatedAt);
  }
}

function createDashboardChromeHostPolicyState(
  state: ChromeHostPolicyState,
  source: DashboardChromeHostPolicySource,
  updatedAt?: string
): DashboardChromeHostPolicyState {
  return {
    ...state,
    source,
    ...(updatedAt ? { updatedAt } : {}),
    entries: createChromeHostPolicyEntries(state.policy)
  };
}

function createChromeHostPolicyEntries(policy: ChromeHostPolicy): Array<Record<string, unknown>> {
  return [
    ...policy.allowedHosts.map((host) => ({
      host,
      scope: "always",
      decision: "allow"
    })),
    ...policy.currentTurnAllowedHosts.map((host) => ({
      host,
      scope: "current-turn",
      decision: "allow"
    })),
    ...policy.blockedHosts.map((host) => ({
      host,
      scope: "host",
      decision: "block"
    }))
  ];
}

function readWorkspaceFileUpdatedAt(
  targetPath: string,
  io: DashboardWorkspaceIo
): string | undefined {
  try {
    const mtimeMs = io.stat(targetPath).mtimeMs;
    if (Number.isFinite(mtimeMs)) {
      return new Date(mtimeMs).toISOString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readWorkspaceConnectionState(connection: Record<string, unknown> | undefined): string {
  return connection?.liveConnection === "connected" || connection?.liveConnection === "stale"
    ? connection.liveConnection
    : "unknown";
}

function readWorkspacePid(io: DashboardWorkspaceIo): number {
  const pid = io.pid?.();

  return typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0
    ? pid
    : process.pid;
}

function readWorkspaceUptimeSeconds(io: DashboardWorkspaceIo): number {
  const uptimeSeconds = io.uptimeSeconds?.();

  return typeof uptimeSeconds === "number" && Number.isFinite(uptimeSeconds) && uptimeSeconds >= 0
    ? Math.round(uptimeSeconds)
    : Math.max(0, Math.round(process.uptime()));
}

function readWorkspaceCodeSignature(
  appPath: string,
  appInstalled: boolean,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  if (!appInstalled) {
    return {
      state: "missing",
      appPath,
      reason: "skfiy.app is missing."
    };
  }

  return io.codeSignature?.(appPath) ?? {
    state: "unknown",
    appPath,
    reason: "No code signature probe is configured."
  };
}

function readWorkspacePermissions(
  helperPath: string,
  helperInstalled: boolean,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  if (!helperInstalled) {
    return {
      ...createUnknownPermissions(),
      reason: `skfiy helper is missing at ${helperPath}.`
    };
  }

  try {
    const permissions = io.permissions?.(helperPath);
    if (!permissions) {
      return {
        ...createUnknownPermissions(),
        reason: "No permission probe is configured."
      };
    }

    return createPermissionStates(permissions);
  } catch (error) {
    return {
      ...createUnknownPermissions(),
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readWorkspaceDesktopSession(
  helperPath: string,
  helperInstalled: boolean,
  io: DashboardWorkspaceIo
): Record<string, unknown> {
  if (!helperInstalled) {
    return {
      state: "unknown",
      reason: `skfiy helper is missing at ${helperPath}.`
    };
  }

  try {
    const desktopSession = io.desktopSession?.(helperPath);
    if (!desktopSession) {
      return {
        state: "unknown",
        reason: "No desktop session probe is configured."
      };
    }

    const status = cloneRecord(desktopSession);
    return {
      ...status,
      state: readDesktopSessionState(status)
    };
  } catch (error) {
    return {
      state: "unknown",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function readCodeSignatureSync(appPath: string): Record<string, unknown> {
  const verify = spawnSync("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath
  ], {
    encoding: "utf8"
  });

  if (verify.status !== 0) {
    return {
      state: "invalid",
      appPath,
      reason: readSpawnMessage(verify, "codesign verification failed.")
    };
  }

  const details = spawnSync("codesign", [
    "-dr",
    "-",
    appPath
  ], {
    encoding: "utf8"
  });
  const requirement = `${details.stdout ?? ""}${details.stderr ?? ""}`.trim();

  if (details.status !== 0) {
    return {
      state: "invalid",
      appPath,
      reason: readSpawnMessage(details, "codesign designated requirement could not be read.")
    };
  }

  return {
    state: requirement.includes('identifier "com.sskift.skfiy"') ? "valid" : "invalid",
    appPath,
    requirement,
    ...(requirement.includes('identifier "com.sskift.skfiy"')
      ? {}
      : { reason: "Designated requirement does not include com.sskift.skfiy." })
  };
}

function readHelperPermissionsSync(helperPath: string): Record<string, unknown> {
  return readHelperJsonSync(helperPath, ["permissions-status"], "permissions-status");
}

function readHelperDesktopSessionSync(helperPath: string): Record<string, unknown> {
  return readHelperJsonSync(helperPath, ["desktop-session-status"], "desktop-session-status");
}

function readTmuxSync(args: string[]): DashboardTmuxResult {
  const result = spawnSync("tmux", args, {
    encoding: "utf8"
  });

  return {
    status: result.status,
    stdout: `${result.stdout ?? ""}`,
    stderr: `${result.stderr ?? ""}`,
    ...(result.error ? { error: result.error.message } : {})
  };
}

function readHelperJsonSync(
  helperPath: string,
  args: string[],
  commandName: string
): Record<string, unknown> {
  const result = spawnSync(helperPath, args, {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      `Desktop helper command failed (${commandName}) with exit code ${result.status ?? "unknown"}: ${readSpawnMessage(result, "No error output.")}`
    );
  }

  const text = `${result.stdout ?? ""}`.trim();
  let payload: unknown;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Desktop helper returned invalid JSON for ${commandName}: ${text || "(empty stdout)"}`);
  }

  return readRecord(unwrapHelperPayload(payload, commandName)) ?? {};
}

function unwrapHelperPayload(payload: unknown, commandName: string): unknown {
  const record = readRecord(payload);
  if (!record || typeof record.ok !== "boolean") {
    return payload;
  }

  const isEnvelope = "data" in record || "error" in record || typeof record.command === "string";
  if (!isEnvelope) {
    return payload;
  }

  if (!record.ok) {
    throw new Error(readHelperErrorMessage(record) ?? `Helper reported ${commandName} failed.`);
  }

  if (!("data" in record)) {
    throw new Error(`Desktop helper returned invalid JSON for ${commandName}: expected data in successful envelope.`);
  }

  return record.data;
}

function readHelperErrorMessage(record: Record<string, unknown>): string | undefined {
  const error = readRecord(record.error);

  if (typeof error?.message === "string") {
    return error.message;
  }

  return typeof record.message === "string" ? record.message : undefined;
}

function createPermissionStates(permissions: Record<string, unknown>): Record<string, string> {
  return {
    screenRecording: readPermissionState(permissions.screenRecording),
    accessibility: readPermissionState(permissions.accessibility),
    finderAutomation: readPermissionState(permissions.finderAutomation)
  };
}

function readPermissionState(value: unknown): string {
  const record = readRecord(value);
  const state = record ? record.state ?? readNativePermissionStatus(record) : value;
  const knownStates = new Set(["granted", "denied", "not-determined", "unknown"]);

  return typeof state === "string" && knownStates.has(state) ? state : "unknown";
}

function readNativePermissionStatus(record: Record<string, unknown>): string {
  switch (record.status) {
    case "authorized":
      return "granted";
    case "notDetermined":
      return "not-determined";
    case "denied":
    case "restricted":
    case "notAuthorized":
      return "denied";
    case "unknown":
      return "unknown";
    default:
      return record.granted === true ? "granted" : "unknown";
  }
}

function readDesktopSessionState(status: Record<string, unknown>): string {
  if (
    status.state === "controllable"
    || status.state === "blocked"
    || status.state === "unknown"
  ) {
    return status.state;
  }

  if (status.controllable === true) {
    return "controllable";
  }

  return status.controllable === false ? "blocked" : "unknown";
}

function readSpawnMessage(
  result: ReturnType<typeof spawnSync>,
  fallback: string
): string {
  if (result.error) {
    return result.error.message;
  }

  return `${result.stderr ?? ""}${result.stdout ?? ""}`.trim() || fallback;
}

function normalizeTmuxResult(result: DashboardTmuxResult): DashboardTmuxResult {
  return {
    status: typeof result.status === "number" || result.status === null ? result.status : result.exitCode,
    exitCode: typeof result.exitCode === "number" || result.exitCode === null ? result.exitCode : result.status,
    stdout: `${result.stdout ?? ""}`,
    stderr: `${result.stderr ?? ""}`,
    ...(typeof result.error === "string" && result.error.length > 0 ? { error: result.error } : {})
  };
}

function readTmuxExitStatus(result: DashboardTmuxResult): number | null {
  if (typeof result.status === "number" || result.status === null) {
    return result.status;
  }

  if (typeof result.exitCode === "number" || result.exitCode === null) {
    return result.exitCode;
  }

  return 1;
}

function readTmuxResultMessage(result: DashboardTmuxResult, fallback: string): string {
  return [
    result.error,
    result.stderr,
    result.stdout
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .join("\n") || fallback;
}

function formatTmuxCommand(args: string[]): string {
  return `tmux ${args.join(" ")}`;
}

function createUnknownPermissions(): Record<string, string> {
  return {
    screenRecording: "unknown",
    accessibility: "unknown",
    finderAutomation: "unknown"
  };
}

function sanitizeDashboardChromeExtensionStatus(
  extension: Record<string, unknown>
): Record<string, unknown> {
  const {
    pageObservation: _pageObservation,
    latestCommand: _latestCommand,
    connection,
    ...safeExtension
  } = extension;
  const safeConnection = sanitizeDashboardChromeExtensionConnection(readRecord(connection));

  return {
    ...safeExtension,
    ...(safeConnection ? { connection: safeConnection } : {})
  };
}

function sanitizeDashboardChromeExtensionConnection(
  connection: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!connection) {
    return undefined;
  }

  const {
    pageObservation: _pageObservation,
    latestCommand: _latestCommand,
    ...safeConnection
  } = connection;

  return safeConnection;
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return { ...record };
}
