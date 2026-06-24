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
    realTurnIdentityContract: undefined,
    personalMemoryFallbackContract: undefined,
    postTurnPersonalizationContract: undefined,
    result: "not-run"
  };
  let smokeLock;

  try {
    assertCliSmokeReady(options);
    await prepareIsolatedHome(options);
    evidence.providerPromptContract = await collectProviderPromptContract();
    evidence.realTurnIdentityContract = await collectRealTurnIdentityContract();
    evidence.personalMemoryFallbackContract = await collectPersonalMemoryFallbackContract();
    evidence.postTurnPersonalizationContract = await collectPostTurnPersonalizationContract();
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
      && (provider.mode !== "claude-code" || provider.usesSystemIdentityPrompt)
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

async function collectRealTurnIdentityContract() {
  const modulePath = path.join(ROOT_DIR, "dist", "main", "assistant-agent.js");
  const productPath = "dist/main/assistant-agent.js -> runAssistantAgentTurn -> real provider identity contract";
  const { runAssistantAgentTurn } = await import(pathToFileURL(modulePath).href);
  const providers = await Promise.all([
    collectRealTurnIdentityProviderContract(runAssistantAgentTurn, {
      mode: "codex",
      codexBinary: "codex",
      codexBinarySource: "default",
      claudeCodeBinary: "claude",
      claudeCodeBinarySource: "default",
      hermesBinary: "hermes",
      hermesBinarySource: "default",
      cwd: ROOT_DIR,
      timeoutMs: 45_000
    }),
    collectRealTurnIdentityProviderContract(runAssistantAgentTurn, {
      mode: "claude-code",
      codexBinary: "codex",
      codexBinarySource: "default",
      claudeCodeBinary: "claude",
      claudeCodeBinarySource: "default",
      hermesBinary: "hermes",
      hermesBinarySource: "default",
      cwd: ROOT_DIR,
      timeoutMs: 45_000
    }),
    collectRealTurnIdentityProviderContract(runAssistantAgentTurn, {
      mode: "hermes",
      codexBinary: "codex",
      codexBinarySource: "default",
      claudeCodeBinary: "claude",
      claudeCodeBinarySource: "default",
      hermesBinary: "hermes",
      hermesBinarySource: "default",
      cwd: ROOT_DIR,
      timeoutMs: 45_000
    })
  ]);
  const tokenLeakDetected = hasTokenLeak(providers.map((provider) => JSON.stringify(provider)));
  const passed = providers.length === 3
    && providers.every((provider) => (
      provider.status === "completed"
      && provider.runnerSawSkfiyIdentity
      && provider.runnerSawUserPrompt
      && provider.providerBoundaryPresent
      && provider.responseProviderLabel === provider.label
      && provider.responseMessage === "我是 skfiy。"
      && (
        provider.identityChannel === "system-prompt"
        || provider.skfiyIdentityBeforeUser
      )
      && (
        provider.mode !== "claude-code"
        || (
          provider.identityChannel === "system-prompt"
          && provider.userPromptHasNoDuplicateIdentity
        )
      )
      && (
        provider.mode === "claude-code"
        || provider.identityChannel === "query-prompt"
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

async function collectRealTurnIdentityProviderContract(runAssistantAgentTurn, settings) {
  const userInput = "你是谁";
  let capturedCommand = "";
  let capturedArgs = [];
  let capturedOptions;
  const turn = await runAssistantAgentTurn(userInput, {
    settings,
    runProcess: async (command, args, options) => {
      capturedCommand = command;
      capturedArgs = args;
      capturedOptions = options;
      return {
        stdout: "我是 skfiy。\n",
        stderr: ""
      };
    },
    now: () => new Date("2026-06-24T08:00:00.000Z"),
    createTurnId: () => `real-turn-identity-${settings.mode}`
  });
  const invocation = {
    command: capturedCommand,
    args: capturedArgs,
    label: turn.providerLabel
  };
  const prompt = readInvocationPrompt(invocation);
  const systemPrompt = readInvocationSystemPrompt(invocation);
  const identityChannel = settings.mode === "claude-code" ? "system-prompt" : "query-prompt";
  const identityPrompt = identityChannel === "system-prompt" ? systemPrompt : prompt;
  const identityIndex = identityPrompt.indexOf("The speaking assistant identity for this conversation is skfiy.");
  const userIndex = prompt.indexOf(`User: ${userInput}`);

  return {
    mode: settings.mode,
    label: turn.providerLabel,
    commandBasename: path.basename(capturedCommand),
    status: turn.status,
    identityChannel,
    runnerSawSkfiyIdentity: identityPrompt.includes("You are skfiy")
      && identityPrompt.includes("The speaking assistant identity for this conversation is skfiy.")
      && identityPrompt.includes("When asked who you are, answer as skfiy."),
    runnerSawUserPrompt: prompt.includes(`User: ${userInput}`),
    skfiyIdentityBeforeUser: identityIndex >= 0 && userIndex > identityIndex,
    userPromptHasNoDuplicateIdentity: settings.mode === "claude-code"
      ? !prompt.includes("The speaking assistant identity for this conversation is skfiy.")
      : undefined,
    providerBoundaryPresent: identityPrompt.includes("Codex, Claude Code, and Hermes are only backend providers used to run this turn.")
      && identityPrompt.includes("Treat Codex, Claude Code, and Hermes as internal backend implementation details.")
      && identityPrompt.includes("Do not introduce yourself as Codex, Claude Code, Hermes"),
    responseProviderLabel: turn.providerLabel,
    responseMessage: turn.message,
    runnerCwdIsProductRoot: capturedOptions?.cwd === ROOT_DIR,
    runnerTimeoutMs: capturedOptions?.timeoutMs
  };
}

async function collectPersonalMemoryFallbackContract() {
  const modulePath = path.join(ROOT_DIR, "dist", "main", "personal-memory-review.js");
  const productPath = "dist/main/personal-memory-review.js -> createFallbackPersonalMemoryOperations -> local memory fallback contract";
  const { createFallbackPersonalMemoryOperations } = await import(pathToFileURL(modulePath).href);
  const expectedContent = "User prefers concise Chinese progress updates.";
  const explicitRememberContent = "User explicitly asked skfiy to remember: 以后回答我时先给结论，再给验证证据.";
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
  const explicitRememberOperations = createFallbackPersonalMemoryOperations({
    userInput: "请记住：以后回答我时先给结论，再给验证证据。",
    assistantReply: "记住了。",
    existingMemory: { userEntries: [], agentEntries: [] }
  });
  const explicitForgetOperations = createFallbackPersonalMemoryOperations({
    userInput: "忘记：以后回答我时先给结论，再给验证证据。",
    assistantReply: "我会忘记这条偏好。",
    existingMemory: { userEntries: [explicitRememberContent], agentEntries: [] }
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
  const explicitRemember = summarizeMemoryFallbackOperations(explicitRememberOperations);
  const explicitForget = summarizeMemoryFallbackOperations(explicitForgetOperations);
  const secretLikeRequest = summarizeMemoryFallbackOperations(secretLikeRequestOperations);
  const duplicatePreference = summarizeMemoryFallbackOperations(duplicatePreferenceOperations);
  const tokenLeakDetected = hasTokenLeak([
    JSON.stringify(explicitPreference),
    JSON.stringify(oneOffRequest),
    JSON.stringify(dashboardStylePreference),
    JSON.stringify(explicitRemember),
    JSON.stringify(explicitForget),
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
    && explicitRemember.operationCount === 1
    && explicitRemember.operations[0]?.action === "add"
    && explicitRemember.operations[0]?.target === "user"
    && explicitRemember.operations[0]?.content === explicitRememberContent
    && explicitForget.operationCount === 1
    && explicitForget.operations[0]?.action === "remove"
    && explicitForget.operations[0]?.target === "user"
    && explicitForget.operations[0]?.content === explicitRememberContent
    && secretLikeRequest.operationCount === 0
    && oneOffRequest.operationCount === 0
    && duplicatePreference.operationCount === 0
    && !tokenLeakDetected;

  return {
    productPath,
    modulePath,
    explicitPreference,
    dashboardStylePreference,
    explicitRemember,
    explicitForget,
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

async function collectPostTurnPersonalizationContract() {
  const modulePath = path.join(ROOT_DIR, "dist", "main", "personalization-learning-loop.js");
  const productPath = "dist/main/personalization-learning-loop.js -> recordCompletedAssistantTurnForPersonalization -> post-turn learning contract";
  const [
    { recordCompletedAssistantTurnForPersonalization },
    { createPersonalMemoryStore },
    { createPendingPersonalMemoryStore },
    { createSessionMemoryStore }
  ] = await Promise.all([
    import(pathToFileURL(modulePath).href),
    import(pathToFileURL(path.join(ROOT_DIR, "dist", "main", "personal-memory.js")).href),
    import(pathToFileURL(path.join(ROOT_DIR, "dist", "main", "personal-memory-pending.js")).href),
    import(pathToFileURL(path.join(ROOT_DIR, "dist", "main", "session-memory.js")).href)
  ]);
  const durableReviewWrite = await collectDurableReviewWrite({
    recordCompletedAssistantTurnForPersonalization,
    createPersonalMemoryStore,
    createSessionMemoryStore
  });
  const fallbackWrite = await collectFallbackWrite({
    recordCompletedAssistantTurnForPersonalization,
    createPersonalMemoryStore,
    createSessionMemoryStore
  });
  const stagedWhenApprovalEnabled = await collectStagedWhenApprovalEnabled({
    recordCompletedAssistantTurnForPersonalization,
    createPersonalMemoryStore,
    createPendingPersonalMemoryStore,
    createSessionMemoryStore
  });
  const tokenLeakDetected = hasTokenLeak([
    JSON.stringify(durableReviewWrite),
    JSON.stringify(fallbackWrite),
    JSON.stringify(stagedWhenApprovalEnabled)
  ]);
  const passed = durableReviewWrite.sessionCount === 1
    && durableReviewWrite.durableUserEntries.includes("User prefers dense Obsidian-like dashboard surfaces.")
    && durableReviewWrite.reviewPromptIncludesDurableInstruction
    && durableReviewWrite.reviewPromptReceivesExistingMemory
    && fallbackWrite.durableUserEntries.includes("User prefers concise Chinese progress updates.")
    && stagedWhenApprovalEnabled.durableUserEntryCount === 0
    && stagedWhenApprovalEnabled.pendingWriteCount === 1
    && stagedWhenApprovalEnabled.pendingSource === "post-turn-review"
    && stagedWhenApprovalEnabled.pendingContent === "User prefers dense Obsidian-like knowledge surfaces for dashboard work."
    && !tokenLeakDetected;

  return {
    productPath,
    modulePath,
    durableReviewWrite,
    fallbackWrite,
    stagedWhenApprovalEnabled,
    tokenLeakDetected,
    result: passed ? "passed" : "failed"
  };
}

async function collectDurableReviewWrite({
  recordCompletedAssistantTurnForPersonalization,
  createPersonalMemoryStore,
  createSessionMemoryStore
}) {
  const files = new Map();
  const memoryStore = createPersonalMemoryStore({
    baseDir: "/tmp/skfiy-cli-post-turn-contract",
    io: createMemoryIo(files)
  });
  const sessionMemoryStore = createSessionMemoryStore({
    baseDir: "/tmp/skfiy-cli-post-turn-contract",
    io: createSessionIo(files)
  });
  let reviewPrompt = "";
  let reviewPersonalMemory;

  await recordCompletedAssistantTurnForPersonalization({
    userInput: "以后 dashboard 要有 Obsidian 那种视觉冲击。",
    turn: createCompletedTurn("turn-durable-review", "Codex", "我会记下这个偏好。"),
    browserPageContext: {
      state: "ready",
      url: "https://example.test/dashboard",
      title: "Dashboard brief"
    },
    memoryStore,
    sessionMemoryStore,
    runReviewTurn: async (prompt, { personalMemory }) => {
      reviewPrompt = prompt;
      reviewPersonalMemory = personalMemory;
      return createCompletedTurn(
        "turn-memory-review",
        "Hermes",
        `{"operations":[{"action":"add","target":"user","content":"User prefers dense Obsidian-like dashboard surfaces."}]}`
      );
    }
  });

  return {
    sessionCount: sessionMemoryStore.readAll().length,
    durableUserEntries: memoryStore.read().userEntries,
    reviewPromptIncludesDurableInstruction: reviewPrompt.includes("durable user preferences"),
    reviewPromptReceivesExistingMemory: Array.isArray(reviewPersonalMemory?.userEntries)
      && Array.isArray(reviewPersonalMemory?.agentEntries)
  };
}

async function collectFallbackWrite({
  recordCompletedAssistantTurnForPersonalization,
  createPersonalMemoryStore,
  createSessionMemoryStore
}) {
  const files = new Map();
  const memoryStore = createPersonalMemoryStore({
    baseDir: "/tmp/skfiy-cli-fallback-contract",
    io: createMemoryIo(files)
  });
  const sessionMemoryStore = createSessionMemoryStore({
    baseDir: "/tmp/skfiy-cli-fallback-contract",
    io: createSessionIo(files)
  });

  await recordCompletedAssistantTurnForPersonalization({
    userInput: "以后进度更新短一点，中文就好",
    turn: createCompletedTurn("turn-fallback", "Hermes", "好的，我会更简洁。"),
    browserPageContext: {
      state: "blocked",
      reason: "no browser context"
    },
    memoryStore,
    sessionMemoryStore,
    runReviewTurn: async () => createCompletedTurn("turn-memory-review", "Hermes", `{"operations":[]}`)
  });

  return {
    durableUserEntries: memoryStore.read().userEntries
  };
}

async function collectStagedWhenApprovalEnabled({
  recordCompletedAssistantTurnForPersonalization,
  createPersonalMemoryStore,
  createPendingPersonalMemoryStore,
  createSessionMemoryStore
}) {
  const files = new Map();
  const memoryStore = createPersonalMemoryStore({
    baseDir: "/tmp/skfiy-cli-staged-contract",
    io: createMemoryIo(files)
  });
  const pendingMemoryStore = createPendingPersonalMemoryStore({
    baseDir: "/tmp/skfiy-cli-staged-contract",
    io: createPendingIo(files),
    now: () => new Date("2026-06-24T07:30:00.000Z")
  });
  const sessionMemoryStore = createSessionMemoryStore({
    baseDir: "/tmp/skfiy-cli-staged-contract",
    io: createSessionIo(files)
  });

  await recordCompletedAssistantTurnForPersonalization({
    userInput: "以后 dashboard 默认做 Obsidian 那种密集知识图谱。",
    turn: createCompletedTurn("turn-staged", "Claude Code", "我会记下这个方向。"),
    browserPageContext: {
      state: "unavailable"
    },
    memoryStore,
    pendingMemoryStore,
    sessionMemoryStore,
    memoryWriteApprovalEnabled: true,
    runReviewTurn: async () => createCompletedTurn(
      "turn-memory-review",
      "Claude Code",
      `{"operations":[{"action":"add","target":"user","content":"User prefers dense Obsidian-like knowledge surfaces for dashboard work."}]}`
    )
  });

  const pendingWrites = pendingMemoryStore.read();

  return {
    durableUserEntryCount: memoryStore.read().userEntries.length,
    pendingWriteCount: pendingWrites.length,
    pendingSource: pendingWrites[0]?.source,
    pendingContent: pendingWrites[0]?.content
  };
}

function createCompletedTurn(id, providerLabel, message) {
  return {
    id,
    createdAt: "2026-06-24T07:00:00.000Z",
    status: "completed",
    providerLabel,
    message,
    route: {
      kind: "chat",
      reason: "Conversational prompt should be answered by the assistant instead of typed into Ghostty."
    },
    toolCalls: [],
    cancellation: {
      requested: false
    }
  };
}

function createMemoryIo(files) {
  return {
    exists: (targetPath) => files.has(targetPath),
    mkdir: () => undefined,
    readFile: (targetPath) => files.get(targetPath) ?? "",
    stat: (targetPath) => ({ mtimeMs: files.has(targetPath) ? Date.parse("2026-06-24T07:00:00.000Z") : 0 }),
    writeFile: (targetPath, content) => {
      files.set(targetPath, content);
    }
  };
}

function createPendingIo(files) {
  return {
    exists: (targetPath) => files.has(targetPath),
    mkdir: () => undefined,
    readFile: (targetPath) => files.get(targetPath) ?? "",
    writeFile: (targetPath, content) => {
      files.set(targetPath, content);
    }
  };
}

function createSessionIo(files) {
  return {
    exists: (targetPath) => files.has(targetPath),
    mkdir: () => undefined,
    readFile: (targetPath) => files.get(targetPath) ?? "",
    writeFile: (targetPath, content) => {
      files.set(targetPath, content);
    }
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
  const systemPrompt = readInvocationSystemPrompt(invocation);
  const identityPrompt = settings.mode === "claude-code" ? systemPrompt : prompt;
  const argsText = invocation.args.join("\n");
  const skfiyIndex = identityPrompt.indexOf("You are skfiy");
  const memoryIndex = prompt.indexOf("<skfiy-recalled-memory>");
  const sessionRecallIndex = prompt.indexOf("<skfiy-recalled-sessions>");
  const browserContextIndex = prompt.indexOf("Current Chrome page");
  const userIndex = prompt.indexOf(`User: ${userInput}`);
  const providerIdentityInternalized = identityPrompt.includes("The speaking assistant identity for this conversation is skfiy.")
    && identityPrompt.includes("Treat Codex, Claude Code, and Hermes as internal backend implementation details.")
    && identityPrompt.includes("If asked about the backend, explain that skfiy can use Codex, Claude Code, or Hermes behind the pet.")
    && identityPrompt.includes("Speak from skfiy's first-person perspective");
  const providerBoundaryPresent = identityPrompt.includes("Codex, Claude Code, and Hermes are only backend providers")
    && identityPrompt.includes("When asked who you are, answer as skfiy.")
    && identityPrompt.includes("Do not introduce yourself as Codex, Claude Code, Hermes")
    && identityPrompt.includes("Computer Use is a tool capability")
    && identityPrompt.includes("Do not execute commands, edit files, or control apps directly from this provider call.");

  return {
    mode: settings.mode,
    label: invocation.label,
    commandBasename: path.basename(invocation.command),
    promptHash: createHash("sha256").update(prompt).digest("hex"),
    promptLength: prompt.length,
    skfiyIdentityBeforeUser: settings.mode === "claude-code"
      ? skfiyIndex >= 0
        && userIndex >= 0
        && !prompt.includes("The speaking assistant identity for this conversation is skfiy.")
      : skfiyIndex >= 0 && userIndex > skfiyIndex,
    memoryBeforeBrowserContext: memoryIndex >= 0 && browserContextIndex > memoryIndex,
    sessionRecallAfterMemory: sessionRecallIndex >= 0 && sessionRecallIndex > memoryIndex,
    sessionRecallBeforeBrowserContext: sessionRecallIndex >= 0 && browserContextIndex > sessionRecallIndex,
    sessionRecallRedactsToken: prompt.includes("token [redacted]") && !prompt.includes("sk-provider-contract-secret"),
    browserContextBeforeUser: browserContextIndex >= 0 && userIndex > browserContextIndex,
    providerIdentityInternalized,
    providerBoundaryPresent,
    usesSystemIdentityPrompt: settings.mode === "claude-code"
      ? systemPrompt.includes("The speaking assistant identity for this conversation is skfiy.")
        && systemPrompt.includes("Codex, Claude Code, and Hermes are only backend providers used to run this turn.")
        && systemPrompt.includes("Speak from skfiy's first-person perspective")
        && systemPrompt.includes("When asked who you are, answer as skfiy.")
        && !systemPrompt.includes(`User: ${userInput}`)
      : undefined,
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
    rejectsDirectDesktopControl: identityPrompt.includes("route the request through its own Computer Use tool layer"),
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

function readInvocationSystemPrompt(invocation) {
  const systemPromptIndex = invocation.args.indexOf("--system-prompt");
  return systemPromptIndex >= 0 ? invocation.args[systemPromptIndex + 1] ?? "" : "";
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
