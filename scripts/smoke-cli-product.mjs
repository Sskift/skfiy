#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PRODUCT_PATH,
  classifyCliSmokeEvidence,
  createCliSmokeCommandRuns,
  createCliSmokeHelpText,
  createDefaultCliSmokeOptions,
  parseCliSmokeArgs,
  writeCliSmokeEvidence
} from "./smoke-cli-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const defaults = createDefaultCliSmokeOptions(ROOT_DIR);
  const options = parseCliSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createCliSmokeHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    cliPath: options.cliPath,
    isolatedHomeDir: options.isolatedHomeDir,
    scratchDir: options.scratchDir,
    productPath: PRODUCT_PATH,
    profile: options.profile,
    runnerHasTmux: Boolean(process.env.TMUX),
    artifactPath: options.outputPath,
    commands: [],
    providerPromptContract: undefined,
    personalMemoryFallbackContract: undefined,
    result: "not-run"
  };
  let smokeLock;

  try {
    assertCliSmokeReady(options);
    await prepareIsolatedHome(options);
    evidence.providerPromptContract = await collectProviderPromptContract();
    evidence.personalMemoryFallbackContract = await collectPersonalMemoryFallbackContract();
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:cli"
    });

    for (const run of createCliSmokeCommandRuns(options)) {
      if (run.nestedProductSmoke && smokeLock) {
        await smokeLock.release();
        smokeLock = undefined;
      }

      const commandEvidence = run.longRunning
        ? await launchLongRunningCommand(run, options)
        : await runCommand(run, options);

      evidence.commands.push(commandEvidence);
    }

    evidence.result = classifyCliSmokeEvidence(evidence);
    if (options.requirePassed && evidence.result !== "passed") {
      process.exitCode = 2;
    }
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    await smokeLock?.release();

    if (options.outputPath) {
      try {
        await writeCliSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

async function collectProviderPromptContract() {
  const modulePath = path.join(ROOT_DIR, "dist", "main", "assistant-agent.js");
  const productPath = "dist/main/assistant-agent.js -> buildAssistantAgentInvocation -> provider prompt contract";
  const { buildAssistantAgentInvocation } = await import(pathToFileURL(modulePath).href);
  const browserPageContext = {
    state: "ready",
    url: "https://example.test/skfiy-provider-contract",
    title: "skfiy provider contract",
    visibleText: "Provider contract page with bounded browser context.",
    observedAt: "2026-06-23T00:00:00.000Z"
  };
  const personalMemory = {
    userEntries: ["User prefers concise Chinese progress updates."],
    agentEntries: ["For provider calls, preserve skfiy identity and Computer Use boundaries."]
  };
  const recalledSessions = [
    {
      turnId: "provider-contract-recall",
      createdAt: "2026-06-23T00:05:00.000Z",
      userInput: "我喜欢 Obsidian 风格 dashboard，token sk-provider-contract-secret-123456 不要泄漏",
      assistantReply: "我会使用知识图谱、backlinks 和深色画布。",
      providerLabel: "Hermes",
      browserContext: {
        url: "https://example.test/skfiy-provider-contract",
        title: "skfiy provider contract"
      }
    }
  ];
  const userInput = "你是谁，并总结当前页面。";
  const providers = [
    createProviderPromptContract(buildAssistantAgentInvocation, {
      mode: "codex",
      codexBinary: "codex",
      codexBinarySource: "default",
      claudeCodeBinary: "claude",
      claudeCodeBinarySource: "default",
      hermesBinary: "hermes",
      hermesBinarySource: "default",
      cwd: ROOT_DIR,
      timeoutMs: 45_000
    }, userInput, browserPageContext, personalMemory, recalledSessions),
    createProviderPromptContract(buildAssistantAgentInvocation, {
      mode: "claude-code",
      codexBinary: "codex",
      codexBinarySource: "default",
      claudeCodeBinary: "claude",
      claudeCodeBinarySource: "default",
      hermesBinary: "hermes",
      hermesBinarySource: "default",
      cwd: ROOT_DIR,
      timeoutMs: 45_000
    }, userInput, browserPageContext, personalMemory, recalledSessions),
    createProviderPromptContract(buildAssistantAgentInvocation, {
      mode: "hermes",
      codexBinary: "codex",
      codexBinarySource: "default",
      claudeCodeBinary: "claude",
      claudeCodeBinarySource: "default",
      hermesBinary: "hermes",
      hermesBinarySource: "default",
      cwd: ROOT_DIR,
      timeoutMs: 45_000
    }, userInput, browserPageContext, personalMemory, recalledSessions)
  ];
  const tokenLeakDetected = hasTokenLeak(providers.map((provider) => JSON.stringify(provider)));
  const passed = providers.length === 3
    && providers.every((provider) => (
      provider.skfiyIdentityBeforeUser
      && provider.memoryBeforeBrowserContext
      && provider.sessionRecallAfterMemory
      && provider.sessionRecallBeforeBrowserContext
      && provider.browserContextBeforeUser
      && provider.sessionRecallRedactsToken
      && provider.providerBoundaryPresent
      && provider.rejectsDirectDesktopControl
      && provider.dangerousFlagsAbsent
      && (
        provider.usesReadOnlySandbox
        || provider.disallowsMutatingTools
        || provider.usesBoundedChatToolset
      )
    ))
    && !tokenLeakDetected;

  return {
    productPath,
    modulePath,
    providers,
    tokenLeakDetected,
    result: passed ? "passed" : "failed"
  };
}

async function collectPersonalMemoryFallbackContract() {
  const modulePath = path.join(ROOT_DIR, "dist", "main", "personal-memory-review.js");
  const productPath = "dist/main/personal-memory-review.js -> createFallbackPersonalMemoryOperations -> local memory fallback contract";
  const { createFallbackPersonalMemoryOperations } = await import(pathToFileURL(modulePath).href);
  const expectedContent = "User prefers concise Chinese progress updates.";
  const explicitPreferenceOperations = createFallbackPersonalMemoryOperations({
    userInput: "以后进度更新短一点，中文就好",
    assistantReply: "好的，我会更简洁。",
    existingMemory: { userEntries: [], agentEntries: [] }
  });
  const oneOffRequestOperations = createFallbackPersonalMemoryOperations({
    userInput: "现在打开 Chrome 并总结这个网页",
    assistantReply: "好的。",
    existingMemory: { userEntries: [], agentEntries: [] }
  });
  const dashboardStylePreferenceOperations = createFallbackPersonalMemoryOperations({
    userInput: "以后 dashboard 默认做 Obsidian 那种密集知识图谱，不要营销大卡片。",
    assistantReply: "记住了，我会按更密集的知识面板来做。",
    existingMemory: { userEntries: [], agentEntries: [] }
  });
  const secretLikeRequestOperations = createFallbackPersonalMemoryOperations({
    userInput: "记住我的 API token 是 sk-provider-contract-secret-123456",
    assistantReply: "我不能保存密钥。",
    existingMemory: { userEntries: [], agentEntries: [] }
  });
  const duplicatePreferenceOperations = createFallbackPersonalMemoryOperations({
    userInput: "以后进度更新短一点，中文就好",
    assistantReply: "好的，我会更简洁。",
    existingMemory: { userEntries: [expectedContent], agentEntries: [] }
  });
  const explicitPreference = summarizeMemoryFallbackOperations(explicitPreferenceOperations);
  const oneOffRequest = summarizeMemoryFallbackOperations(oneOffRequestOperations);
  const dashboardStylePreference = summarizeMemoryFallbackOperations(dashboardStylePreferenceOperations);
  const secretLikeRequest = summarizeMemoryFallbackOperations(secretLikeRequestOperations);
  const duplicatePreference = summarizeMemoryFallbackOperations(duplicatePreferenceOperations);
  const tokenLeakDetected = hasTokenLeak([
    JSON.stringify(explicitPreference),
    JSON.stringify(oneOffRequest),
    JSON.stringify(dashboardStylePreference),
    JSON.stringify(secretLikeRequest),
    JSON.stringify(duplicatePreference)
  ]);
  const passed = explicitPreference.operationCount === 1
    && explicitPreference.operations[0]?.action === "add"
    && explicitPreference.operations[0]?.target === "user"
    && explicitPreference.operations[0]?.content === expectedContent
    && dashboardStylePreference.operationCount === 2
    && dashboardStylePreference.operations.some((operation) => (
      operation.action === "add"
      && operation.target === "user"
      && operation.content === "User prefers dense Obsidian-like knowledge surfaces for dashboard work."
    ))
    && dashboardStylePreference.operations.some((operation) => (
      operation.action === "add"
      && operation.target === "user"
      && operation.content === "User dislikes marketing-style hero/card-heavy dashboard layouts."
    ))
    && secretLikeRequest.operationCount === 0
    && oneOffRequest.operationCount === 0
    && duplicatePreference.operationCount === 0
    && !tokenLeakDetected;

  return {
    productPath,
    modulePath,
    explicitPreference,
    dashboardStylePreference,
    secretLikeRequest,
    oneOffRequest,
    duplicatePreference,
    tokenLeakDetected,
    result: passed ? "passed" : "failed"
  };
}

function summarizeMemoryFallbackOperations(operations) {
  return {
    operationCount: operations.length,
    operations: operations.map((operation) => ({
      action: operation.action,
      target: operation.target,
      content: operation.content
    }))
  };
}

function createProviderPromptContract(
  buildAssistantAgentInvocation,
  settings,
  userInput,
  browserPageContext,
  personalMemory,
  recalledSessions
) {
  const invocation = buildAssistantAgentInvocation(
    settings,
    userInput,
    browserPageContext,
    personalMemory,
    recalledSessions
  );
  const prompt = readInvocationPrompt(invocation);
  const argsText = invocation.args.join("\n");
  const skfiyIndex = prompt.indexOf("You are skfiy");
  const memoryIndex = prompt.indexOf("<skfiy-recalled-memory>");
  const sessionRecallIndex = prompt.indexOf("<skfiy-recalled-sessions>");
  const browserContextIndex = prompt.indexOf("Current Chrome page");
  const userIndex = prompt.indexOf(`User: ${userInput}`);
  const providerIdentityInternalized = prompt.includes("The speaking assistant identity for this conversation is skfiy.")
    && prompt.includes("Treat Codex, Claude Code, and Hermes as internal backend implementation details.")
    && prompt.includes("If asked about the backend, explain that skfiy can use Codex, Claude Code, or Hermes behind the pet.");
  const providerBoundaryPresent = prompt.includes("Codex, Claude Code, and Hermes are only backend providers")
    && prompt.includes("When asked who you are, answer as skfiy.")
    && prompt.includes("Do not introduce yourself as Codex, Claude Code, Hermes")
    && prompt.includes("Computer Use is a tool capability")
    && prompt.includes("Do not execute commands, edit files, or control apps directly from this provider call.");

  return {
    mode: settings.mode,
    label: invocation.label,
    commandBasename: path.basename(invocation.command),
    promptHash: createHash("sha256").update(prompt).digest("hex"),
    promptLength: prompt.length,
    skfiyIdentityBeforeUser: skfiyIndex >= 0 && userIndex > skfiyIndex,
    memoryBeforeBrowserContext: memoryIndex >= 0 && browserContextIndex > memoryIndex,
    sessionRecallAfterMemory: sessionRecallIndex >= 0 && sessionRecallIndex > memoryIndex,
    sessionRecallBeforeBrowserContext: sessionRecallIndex >= 0 && browserContextIndex > sessionRecallIndex,
    sessionRecallRedactsToken: prompt.includes("token [redacted]") && !prompt.includes("sk-provider-contract-secret"),
    browserContextBeforeUser: browserContextIndex >= 0 && userIndex > browserContextIndex,
    providerIdentityInternalized,
    providerBoundaryPresent,
    usesReadOnlySandbox: settings.mode === "codex"
      ? invocation.args.includes("--sandbox") && invocation.args.includes("read-only")
      : undefined,
    disallowsMutatingTools: settings.mode === "claude-code"
      ? argsText.includes("--disallowedTools")
        && argsText.includes("Bash,Edit,MultiEdit,Write,NotebookEdit,WebFetch,WebSearch,Task")
        && argsText.includes("--permission-mode\ndontAsk")
        && argsText.includes("--safe-mode")
      : undefined,
    usesBoundedChatToolset: settings.mode === "hermes"
      ? invocation.args[0] === "chat"
        && invocation.args.includes("--query")
        && argsText.includes("--max-turns\n1")
        && argsText.includes("--toolsets\nsafe")
        && argsText.includes("--source\nskfiy-pet-chat")
      : undefined,
    rejectsDirectDesktopControl: prompt.includes("route the request through its own Computer Use tool layer"),
    dangerousFlagsAbsent: !containsAny(invocation.args, [
      "--oneshot",
      "--yolo",
      "--ask-for-approval",
      "--tools",
      "--strict-mcp-config",
      "--ignore-user-config"
    ])
  };
}

function readInvocationPrompt(invocation) {
  if (invocation.label === "Hermes") {
    const queryIndex = invocation.args.indexOf("--query");
    return queryIndex >= 0 ? invocation.args[queryIndex + 1] ?? "" : "";
  }

  return invocation.args.at(-1) ?? "";
}

function containsAny(values, candidates) {
  return candidates.some((candidate) => values.includes(candidate));
}

function assertCliSmokeReady(options) {
  if (!existsSync(options.cliPath)) {
    throw new Error(`Built CLI is missing at ${options.cliPath}. Run npm run build first.`);
  }
}

async function prepareIsolatedHome(options) {
  await rm(options.isolatedHomeDir, { force: true, recursive: true });
  await mkdir(options.isolatedHomeDir, { recursive: true });
  await mkdir(options.scratchDir, { recursive: true });
}

function runCommand(run, options) {
  return new Promise((resolve) => {
    const child = spawn(run.command[0], run.command.slice(1), {
      cwd: ROOT_DIR,
      env: createCommandEnv(options),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolve(createCommandEvidence(run, {
        exitCode: 1,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error)
      }));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve(createCommandEvidence(run, {
        exitCode: code ?? 1,
        signal,
        stdout,
        stderr
      }));
    });
  });
}

function launchLongRunningCommand(run, options) {
  return new Promise((resolve) => {
    const child = spawn(run.command[0], run.command.slice(1), {
      cwd: ROOT_DIR,
      env: createCommandEnv(options),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settle(async () => ({
        exitCode: 1,
        stdout,
        stderr,
        error: `Timed out waiting for ${run.id} JSON after ${options.timeoutMs}ms.`,
        cleanup: await terminateLongRunningCommand(child)
      }));
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;

      try {
        JSON.parse(stdout);
        settle(async () => ({
          exitCode: 0,
          stdout,
          stderr,
          cleanup: await terminateLongRunningCommand(child)
        }));
      } catch {
        // Pretty JSON may arrive over multiple chunks while the process keeps running.
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle(async () => ({
        exitCode: 1,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error),
        cleanup: await terminateLongRunningCommand(child)
      }));
    });
    child.once("exit", (code, signal) => {
      settle(async () => ({
        exitCode: code ?? 1,
        signal,
        stdout,
        stderr
      }));
    });

    async function settle(readResult) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(createCommandEvidence(run, await readResult()));
    }
  });
}

function createCommandEvidence(run, result) {
  const evidence = {
    id: run.id,
    command: run.command,
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutJson: undefined,
    jsonParseError: undefined,
    error: result.error,
    cleanup: result.cleanup,
    tokenLeakDetected: hasTokenLeak([result.stdout, result.stderr])
  };

  try {
    evidence.stdoutJson = JSON.parse(result.stdout);
  } catch (error) {
    evidence.jsonParseError = error instanceof Error ? error.message : String(error);
  }

  return evidence;
}

function createCommandEnv(options) {
  return {
    ...process.env,
    HOME: options.isolatedHomeDir,
    USERPROFILE: options.isolatedHomeDir
  };
}

async function terminateLongRunningCommand(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      signal: "none",
      exited: true,
      code: child.exitCode,
      signalCode: child.signalCode
    };
  }

  child.kill("SIGTERM");

  return Promise.race([
    waitForExit(child).then(({ code, signal }) => ({
      signal: "SIGTERM",
      exited: true,
      code,
      signalCode: signal
    })),
    sleep(1_000).then(async () => {
      child.kill("SIGKILL");
      const { code, signal } = await waitForExit(child);

      return {
        signal: "SIGKILL",
        exited: true,
        code,
        signalCode: signal
      };
    })
  ]);
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }

    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasTokenLeak(parts) {
  return parts
    .filter((part) => typeof part === "string")
    .some((part) =>
      /token=/i.test(part)
      || /"tokenPrinted"\s*:\s*true/i.test(part)
      || /"token"\s*:\s*"[^"]+"/i.test(part)
    );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
