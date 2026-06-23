import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createAssistantChatReply } from "./assistant-chat.js";
import {
  createBrowserPageContextPromptBlock,
  type BrowserPageContext
} from "./browser-page-context.js";
import { selectCommandRoute, type CommandRoute, type ExecutableCommandRoute } from "./task-routing.js";

export type AssistantAgentMode = "local" | "codex" | "claude-code";
export type AssistantAgentProviderId = AssistantAgentMode;
export type AssistantAgentCliBinarySource = "default" | "env";
export type AssistantAgentExecutableSource = AssistantAgentCliBinarySource | "built-in";
export type AssistantAgentProviderReadiness = "ready" | "unconfigured" | "unavailable";
export type AssistantAgentTurnStatus = "completed" | "failed" | "cancelled";

export interface AssistantAgentSettings {
  mode: AssistantAgentMode;
  codexBinary: string;
  codexBinarySource: AssistantAgentCliBinarySource;
  claudeCodeBinary: string;
  claudeCodeBinarySource: AssistantAgentCliBinarySource;
  cwd: string;
  timeoutMs: number;
}

export interface AssistantAgentInvocation {
  command: string;
  args: string[];
  label: "Codex" | "Claude Code";
}

export interface AssistantAgentProcessResult {
  stdout: string;
  stderr: string;
}

export interface AssistantAgentProviderState {
  provider: "assistant";
  id: AssistantAgentProviderId;
  label: "Built-in" | "Codex" | "Claude Code";
  selected: boolean;
  configured: boolean;
  executablePath?: string;
  executableSource: AssistantAgentExecutableSource;
  resolvedExecutablePath?: string;
  readiness: AssistantAgentProviderReadiness;
  lastError?: string;
}

export type AssistantAgentProcessRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal | undefined }
) => Promise<AssistantAgentProcessResult>;

export type AssistantAgentExecutableResolver = (command: string) => Promise<string>;

export interface RunAssistantAgentTurnInput {
  settings: AssistantAgentSettings;
  browserPageContext?: BrowserPageContext;
  runProcess?: AssistantAgentProcessRunner;
  now?: () => Date;
  createTurnId?: () => string;
  signal?: AbortSignal;
}

export interface AssistantAgentTurnCancellation {
  requested: boolean;
  reason?: string;
}

export interface AssistantAgentTurnError {
  message: string;
}

export interface AssistantAgentPlannedToolCall {
  id: string;
  type: "computer-use";
  name: "desktop-control";
  status: "planned";
  createdAt: string;
  input: {
    command: string;
    route: ExecutableCommandRoute;
  };
}

export interface AssistantAgentTurnResult {
  id: string;
  createdAt: string;
  status: AssistantAgentTurnStatus;
  providerLabel: "Built-in" | "Codex" | "Claude Code";
  message: string;
  error?: AssistantAgentTurnError | undefined;
  route: CommandRoute;
  toolCalls: AssistantAgentPlannedToolCall[];
  cancellation: AssistantAgentTurnCancellation;
}

export class AssistantAgentTurnRuntimeError extends Error {
  readonly turn: AssistantAgentTurnResult;

  constructor(turn: AssistantAgentTurnResult) {
    super(turn.error?.message ?? "Assistant agent turn failed.");
    this.name = "AssistantAgentTurnRuntimeError";
    this.turn = turn;
  }
}

const DEFAULT_ASSISTANT_AGENT_TIMEOUT_MS = 45_000;
const READINESS_PROBE_TIMEOUT_MS = 5_000;
const BUILT_IN_ASSISTANT_AGENT_LABEL = "Built-in";
const CLAUDE_CODE_DISALLOWED_TOOLS = "Bash,Edit,MultiEdit,Write,NotebookEdit,WebFetch,WebSearch,Task";
const execFileAsync = promisify(execFile);

export function readInitialAssistantAgentSettings(
  env: {
    SKFIY_ASSISTANT_AGENT?: string;
    SKFIY_CODEX_BIN?: string;
    SKFIY_CLAUDE_CODE_BIN?: string;
    SKFIY_ASSISTANT_AGENT_CWD?: string;
    SKFIY_ASSISTANT_AGENT_TIMEOUT_MS?: string;
  },
  defaults: { cwd?: string } = {}
): AssistantAgentSettings {
  const configuredCodexBinary = readOptionalString(env.SKFIY_CODEX_BIN);
  const configuredClaudeCodeBinary = readOptionalString(env.SKFIY_CLAUDE_CODE_BIN);

  return {
    mode: readAssistantAgentMode(env.SKFIY_ASSISTANT_AGENT),
    codexBinary: configuredCodexBinary ?? "codex",
    codexBinarySource: configuredCodexBinary ? "env" : "default",
    claudeCodeBinary: configuredClaudeCodeBinary ?? "claude",
    claudeCodeBinarySource: configuredClaudeCodeBinary ? "env" : "default",
    cwd: readOptionalString(env.SKFIY_ASSISTANT_AGENT_CWD) ?? defaults.cwd ?? process.cwd(),
    timeoutMs: readPositiveInteger(env.SKFIY_ASSISTANT_AGENT_TIMEOUT_MS)
      ?? DEFAULT_ASSISTANT_AGENT_TIMEOUT_MS
  };
}

/**
 * Integration note: dashboard/main can expose this structured state once those
 * surfaces are in scope; until then this owned module is the source of truth.
 */
export async function readAssistantAgentProviderStates(
  settings: AssistantAgentSettings,
  options: {
    resolveExecutable?: AssistantAgentExecutableResolver;
  } = {}
): Promise<AssistantAgentProviderState[]> {
  const resolveExecutable = options.resolveExecutable ?? resolveAssistantAgentExecutable;

  return [
    {
      provider: "assistant",
      id: "local",
      label: BUILT_IN_ASSISTANT_AGENT_LABEL,
      selected: settings.mode === "local",
      configured: true,
      executableSource: "built-in",
      readiness: "ready"
    },
    await readCliAssistantAgentProviderState({
      id: "codex",
      label: "Codex",
      selected: settings.mode === "codex",
      executablePath: settings.codexBinary,
      executableSource: settings.codexBinarySource,
      resolveExecutable
    }),
    await readCliAssistantAgentProviderState({
      id: "claude-code",
      label: "Claude Code",
      selected: settings.mode === "claude-code",
      executablePath: settings.claudeCodeBinary,
      executableSource: settings.claudeCodeBinarySource,
      resolveExecutable
    })
  ];
}

export function buildAssistantAgentInvocation(
  settings: AssistantAgentSettings,
  userInput: string,
  browserPageContext?: BrowserPageContext
): AssistantAgentInvocation | null {
  const prompt = createAssistantAgentPrompt(userInput, browserPageContext);

  if (settings.mode === "codex") {
    return {
      command: settings.codexBinary,
      args: [
        "exec",
        "--sandbox",
        "read-only",
        "--ask-for-approval",
        "never",
        "--cd",
        settings.cwd,
        "--skip-git-repo-check",
        "--ephemeral",
        "--color",
        "never",
        prompt
      ],
      label: "Codex"
    };
  }

  if (settings.mode === "claude-code") {
    return {
      command: settings.claudeCodeBinary,
      args: [
        "--print",
        "--output-format",
        "text",
        "--permission-mode",
        "dontAsk",
        "--disallowedTools",
        CLAUDE_CODE_DISALLOWED_TOOLS,
        "--safe-mode",
        "--no-chrome",
        "--disable-slash-commands",
        "--no-session-persistence",
        prompt
      ],
      label: "Claude Code"
    };
  }

  return null;
}

export async function runAssistantAgentTurn(
  userInput: string,
  {
    settings,
    runProcess = runAssistantAgentProcess,
    now = () => new Date(),
    createTurnId = createAssistantAgentTurnId,
    signal,
    browserPageContext
  }: RunAssistantAgentTurnInput
): Promise<AssistantAgentTurnResult> {
  const id = createTurnId();
  const createdAt = now().toISOString();
  const route = selectCommandRoute(userInput);
  const invocation = buildAssistantAgentInvocation(settings, userInput, browserPageContext);
  const providerLabel = invocation?.label ?? BUILT_IN_ASSISTANT_AGENT_LABEL;
  const toolCalls = createAssistantAgentPlannedToolCalls({
    turnId: id,
    createdAt,
    command: userInput,
    route
  });

  if (signal?.aborted) {
    throw new AssistantAgentTurnRuntimeError({
      id,
      createdAt,
      status: "cancelled",
      providerLabel,
      message: "",
      error: { message: "Assistant agent turn was cancelled." },
      route,
      toolCalls,
      cancellation: readAssistantAgentCancellation(signal)
    });
  }

  if (!invocation) {
    return {
      id,
      createdAt,
      status: "completed",
      providerLabel: BUILT_IN_ASSISTANT_AGENT_LABEL,
      message: createAssistantChatReply(userInput),
      route,
      toolCalls,
      cancellation: { requested: false }
    };
  }

  let result: AssistantAgentProcessResult;
  try {
    result = await runProcess(invocation.command, invocation.args, {
      cwd: settings.cwd,
      timeoutMs: settings.timeoutMs,
      signal
    });
  } catch (error) {
    throw new AssistantAgentTurnRuntimeError({
      id,
      createdAt,
      status: signal?.aborted ? "cancelled" : "failed",
      providerLabel,
      message: "",
      error: { message: readErrorMessage(error) },
      route,
      toolCalls,
      cancellation: readAssistantAgentCancellation(signal)
    });
  }

  if (signal?.aborted) {
    throw new AssistantAgentTurnRuntimeError({
      id,
      createdAt,
      status: "cancelled",
      providerLabel,
      message: "",
      error: { message: "Assistant agent turn was cancelled." },
      route,
      toolCalls,
      cancellation: readAssistantAgentCancellation(signal)
    });
  }

  const message = result.stdout.trim();

  if (!message) {
    throw new AssistantAgentTurnRuntimeError({
      id,
      createdAt,
      status: "failed",
      providerLabel,
      message: "",
      error: { message: `${invocation.label} returned an empty assistant response.` },
      route,
      toolCalls,
      cancellation: { requested: false }
    });
  }

  return {
    id,
    createdAt,
    status: "completed",
    providerLabel,
    message,
    route,
    toolCalls,
    cancellation: { requested: false }
  };
}

async function runAssistantAgentProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal | undefined }
): Promise<AssistantAgentProcessResult> {
  const resolvedCommand = await resolveAssistantAgentExecutable(command).catch(() => command);
  const result = await execFileAsync(resolvedCommand, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    signal: options.signal,
    maxBuffer: 1024 * 1024,
    encoding: "utf8"
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function createAssistantAgentTurnId(): string {
  return `assistant-turn-${randomUUID()}`;
}

function createAssistantAgentPlannedToolCalls({
  turnId,
  createdAt,
  command,
  route
}: {
  turnId: string;
  createdAt: string;
  command: string;
  route: CommandRoute;
}): AssistantAgentPlannedToolCall[] {
  if (
    route.kind === "chat"
    || route.kind === "needs_clarification"
    || route.kind === "denied"
    || route.kind === "blocked"
  ) {
    return [];
  }
  const toolRoute = route.kind === "needs_confirmation" ? route.targetRoute : route;

  return [
    {
      id: `${turnId}-tool-1`,
      type: "computer-use",
      name: "desktop-control",
      status: "planned",
      createdAt,
      input: {
        command,
        route: toolRoute
      }
    }
  ];
}

function readAssistantAgentCancellation(
  signal: AbortSignal | undefined
): AssistantAgentTurnCancellation {
  if (!signal?.aborted) {
    return { requested: false };
  }

  return {
    requested: true,
    reason: signal.reason instanceof Error
      ? signal.reason.message
      : typeof signal.reason === "string" ? signal.reason : undefined
  };
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readCliAssistantAgentProviderState({
  id,
  label,
  selected,
  executablePath,
  executableSource,
  resolveExecutable
}: {
  id: "codex" | "claude-code";
  label: "Codex" | "Claude Code";
  selected: boolean;
  executablePath: string;
  executableSource: AssistantAgentCliBinarySource;
  resolveExecutable: AssistantAgentExecutableResolver;
}): Promise<AssistantAgentProviderState> {
  const configuredExecutable = readOptionalString(executablePath);
  if (!configuredExecutable) {
    return {
      provider: "assistant",
      id,
      label,
      selected,
      configured: false,
      executableSource,
      readiness: "unconfigured",
      lastError: `${label} executable is not configured.`
    };
  }

  try {
    const resolvedExecutablePath = await resolveExecutable(configuredExecutable);
    return {
      provider: "assistant",
      id,
      label,
      selected,
      configured: true,
      executablePath: configuredExecutable,
      executableSource,
      resolvedExecutablePath,
      readiness: "ready"
    };
  } catch (error) {
    return {
      provider: "assistant",
      id,
      label,
      selected,
      configured: true,
      executablePath: configuredExecutable,
      executableSource,
      readiness: "unavailable",
      lastError: error instanceof Error ? error.message : String(error)
    };
  }
}

async function resolveAssistantAgentExecutable(command: string): Promise<string> {
  const configuredCommand = readOptionalString(command);

  if (!configuredCommand) {
    throw new Error("Assistant executable is not configured.");
  }

  if (isPathLikeCommand(configuredCommand)) {
    if (existsSync(configuredCommand)) {
      return configuredCommand;
    }
    throw new Error(`${configuredCommand} was not found.`);
  }

  try {
    const result = await execFileAsync("/usr/bin/env", ["which", configuredCommand], {
      timeout: READINESS_PROBE_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      encoding: "utf8"
    });
    const resolvedPath = result.stdout.trim().split(/\r?\n/u)[0];
    if (resolvedPath) {
      return resolvedPath;
    }
  } catch {
    // GUI-launched macOS apps often miss Homebrew paths; fall back below.
  }

  const fallbackPath = resolveCommonMacCliPath(configuredCommand);
  if (fallbackPath) {
    return fallbackPath;
  }

  throw new Error(`${configuredCommand} was not found on PATH or common macOS CLI locations.`);
}

function isPathLikeCommand(command: string): boolean {
  return path.isAbsolute(command) || command.includes("/");
}

function resolveCommonMacCliPath(command: string): string | undefined {
  const candidateDirs = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), "bin")
  ];

  return candidateDirs
    .map((directory) => path.join(directory, command))
    .find((candidate) => existsSync(candidate));
}

function createAssistantAgentPrompt(userInput: string, browserPageContext?: BrowserPageContext): string {
  return [
    "You are the background agent for skfiy, an agent-first macOS desktop pet.",
    "Answer the user's conversational request concisely in Chinese.",
    "Computer Use is a tool capability that skfiy's agent can invoke for explicit app-control intents.",
    "Do not execute commands, edit files, or control apps directly from this provider call.",
    "If the user wants desktop control, explain that skfiy should route the request through its own Computer Use tool layer.",
    "",
    ...(browserPageContext ? [createBrowserPageContextPromptBlock(browserPageContext), ""] : []),
    `User: ${userInput.trim()}`
  ].join("\n");
}

function readAssistantAgentMode(value: unknown): AssistantAgentMode {
  if (value === "codex") {
    return "codex";
  }

  if (value === "claude-code" || value === "claudecode" || value === "claude") {
    return "claude-code";
  }

  return "local";
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
