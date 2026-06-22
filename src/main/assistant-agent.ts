import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createAssistantChatReply } from "./assistant-chat.js";

export type AssistantAgentMode = "local" | "codex" | "claude-code";
export type AssistantAgentProviderId = AssistantAgentMode;
export type AssistantAgentCliBinarySource = "default" | "env";
export type AssistantAgentExecutableSource = AssistantAgentCliBinarySource | "built-in";
export type AssistantAgentProviderReadiness = "ready" | "unconfigured" | "unavailable";

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
  label: "Local" | "Codex" | "Claude Code";
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
  options: { cwd: string; timeoutMs: number }
) => Promise<AssistantAgentProcessResult>;

export type AssistantAgentExecutableResolver = (command: string) => Promise<string>;

export interface RunAssistantAgentTurnInput {
  settings: AssistantAgentSettings;
  runProcess?: AssistantAgentProcessRunner;
}

export interface AssistantAgentTurnResult {
  providerLabel: "Local" | "Codex" | "Claude Code";
  message: string;
}

const DEFAULT_ASSISTANT_AGENT_TIMEOUT_MS = 45_000;
const READINESS_PROBE_TIMEOUT_MS = 5_000;
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
      label: "Local",
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
  userInput: string
): AssistantAgentInvocation | null {
  const prompt = createAssistantAgentPrompt(userInput);

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
        "--ignore-user-config",
        "--ignore-rules",
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
        "--tools",
        "",
        "--safe-mode",
        "--no-chrome",
        "--strict-mcp-config",
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
  { settings, runProcess = runAssistantAgentProcess }: RunAssistantAgentTurnInput
): Promise<AssistantAgentTurnResult> {
  const invocation = buildAssistantAgentInvocation(settings, userInput);

  if (!invocation) {
    return {
      providerLabel: "Local",
      message: createAssistantChatReply(userInput)
    };
  }

  const result = await runProcess(invocation.command, invocation.args, {
    cwd: settings.cwd,
    timeoutMs: settings.timeoutMs
  });
  const message = result.stdout.trim();

  if (!message) {
    throw new Error(`${invocation.label} returned an empty assistant response.`);
  }

  return {
    providerLabel: invocation.label,
    message
  };
}

async function runAssistantAgentProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number }
): Promise<AssistantAgentProcessResult> {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024,
    encoding: "utf8"
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
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
  const result = await execFileAsync("/usr/bin/env", ["which", command], {
    timeout: READINESS_PROBE_TIMEOUT_MS,
    maxBuffer: 64 * 1024,
    encoding: "utf8"
  });
  const resolvedPath = result.stdout.trim().split(/\r?\n/u)[0];
  if (!resolvedPath) {
    throw new Error(`${command} was not found on PATH.`);
  }

  return resolvedPath;
}

function createAssistantAgentPrompt(userInput: string): string {
  return [
    "You are the background agent for skfiy, an agent-first macOS desktop pet.",
    "Answer the user's conversational request concisely in Chinese.",
    "Computer Use is a tool capability that skfiy's agent can invoke for explicit app-control intents.",
    "Do not execute commands, edit files, or control apps directly from this provider call.",
    "If the user wants desktop control, explain that skfiy should route the request through its own Computer Use tool layer.",
    "",
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
