#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  classifyFinderSmokeEvidence,
  createBlockedEnvironmentFinderEvidence,
  createFinderTargetDirSafetyEvidence,
  createPermissionBlockedFinderEvidence,
  createDefaultFinderSmokeOptions,
  createHelpText,
  parseProcessIds,
  parseFinderSmokeArgs,
  readFinderProductPath,
  withSmokeTimeout
} from "./smoke-finder-plan.mjs";
import { writeSmokeEvidence } from "./smoke-ghostty-plan.mjs";
import {
  createDesktopSessionBlockedEvent,
  createDesktopSessionPreflightEvidence,
  isDesktopSessionPreflightBlocked
} from "./smoke-desktop-preflight.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";
import { SKFIY_APP_PROCESS_PATTERN } from "./skfiy-process-matching.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";

async function main() {
  const defaults = createDefaultFinderSmokeOptions(ROOT_DIR);
  const options = parseFinderSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    launch: formatLaunchCommand(options),
    appLaunchViaOpen: true,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: readFinderProductPath(options.targetMode),
    artifactPath: options.outputPath,
    desktopPreflight: undefined,
    targetMode: options.targetMode,
    targetDir: options.targetDir,
    resolvedTargetDir: undefined,
    targetDirSafety: undefined,
    fixtureRoot: undefined,
    command: undefined,
    beforeTree: [],
    afterTree: [],
    events: [],
    finderObservation: undefined,
    finderSemanticObservation: undefined,
    finderPlanPreview: undefined,
    finderPlanConfirmation: undefined,
    finderDragProbe: undefined,
    finderItemDragDrop: undefined,
    permissions: undefined,
    runtimeStatus: undefined,
    startupWarnings: undefined,
    appPolicySettings: undefined,
    result: "not-run"
  };
  let smokeLock;
  let launchedSkfiy = false;

  try {
    assertSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:finder"
    });
    evidence.desktopPreflight = await createDesktopSessionPreflightEvidence({
      appPath: options.appPath
    });
    if (isDesktopSessionPreflightBlocked(evidence.desktopPreflight)) {
      evidence.events = [createDesktopSessionBlockedEvent(evidence.desktopPreflight)];
      evidence.finderObservation = {
        result: "blocked",
        reason: evidence.desktopPreflight.reason
      };
      evidence.result = "blocked";
      return;
    }

    evidence.resolvedTargetDir = options.targetDir
      ? readFinderTargetDirectory(options.targetDir)
      : undefined;
    evidence.fixtureRoot = await createFinderFixture(evidence.resolvedTargetDir ?? os.tmpdir());
    evidence.targetDirSafety = createFinderTargetDirSafetyEvidence({
      targetDir: evidence.resolvedTargetDir,
      fixtureRoot: evidence.fixtureRoot
    });
    assertFinderTargetDirSafety(evidence.targetDirSafety, options);
    evidence.command = readFinderSmokeCommand(options.targetMode, evidence.fixtureRoot);
    evidence.beforeTree = await readDirectoryTree(evidence.fixtureRoot);

    if (
      options.targetMode === "current-finder-folder"
      || options.targetMode === "drag-probe"
      || options.targetMode === "item-drag-drop"
    ) {
      await openFinderFolder(evidence.fixtureRoot);
      await sleep(700);
    }

    if (options.targetMode === "selected-finder-folder") {
      await selectFinderFolder(evidence.fixtureRoot);
      await sleep(700);
    }

    if (!options.keepExisting) {
      await quitSkfiy();
      await sleep(700);
    }

    await launchSkfiy(options);
    launchedSkfiy = true;
    evidence.processesAfterLaunch = await readSkfiyProcesses();

    const page = await waitForRendererPage(options.port, options.timeoutMs);
    const cdp = await createCdpClient(page.webSocketDebuggerUrl);
    const sendCdp = (method, params, label) => withSmokeTimeout(
      cdp.send(method, params),
      options.timeoutMs,
      label
    );

    try {
      await sendCdp("Runtime.enable", undefined, "Finder Runtime.enable");
      await sendCdp(
        "Runtime.addBinding",
        { name: "skfiyFinderSmokeEvent" },
        "Finder Runtime.addBinding"
      );
      await sendCdp("Runtime.evaluate", {
        expression: installEventSinkExpression(),
        awaitPromise: true,
        returnByValue: true
      }, "Finder install event sink");

      await sendCdp("Runtime.evaluate", {
        expression:
          `window.skfiy.runCommand(${JSON.stringify(evidence.command)}, { mode: "active" })`,
        awaitPromise: true,
        returnByValue: true
      }, "Finder runCommand");
      await sleep(options.settleMs);

      await approvePendingFinderTasks(cdp, options, sendCdp);

      const permissions = await sendCdp("Runtime.evaluate", {
        expression: "window.skfiy.getPermissions()",
        awaitPromise: true,
        returnByValue: true
      }, "Finder getPermissions");
      const runtimeStatus = await sendCdp("Runtime.evaluate", {
        expression: "window.skfiy.getRuntimeStatus()",
        awaitPromise: true,
        returnByValue: true
      }, "Finder getRuntimeStatus");
      const startupWarnings = await sendCdp("Runtime.evaluate", {
        expression: "window.skfiy.getStartupWarnings()",
        awaitPromise: true,
        returnByValue: true
      }, "Finder getStartupWarnings");
      const appPolicySettings = await sendCdp("Runtime.evaluate", {
        expression: "window.skfiy.getAppPolicySettings()",
        awaitPromise: true,
        returnByValue: true
      }, "Finder getAppPolicySettings");

      evidence.permissions = permissions.result?.value;
      evidence.runtimeStatus = runtimeStatus.result?.value;
      evidence.startupWarnings = startupWarnings.result?.value;
      evidence.appPolicySettings = appPolicySettings.result?.value;
      evidence.events = cdp.events;
      evidence.finderObservation = readFinderObservation(cdp.events);
      evidence.finderSemanticObservation = readFinderSemanticObservation(
        cdp.events,
        evidence.finderObservation
      );
      evidence.finderPlanPreview = readFinderPlanPreview(cdp.events);
      evidence.finderPlanConfirmation = readFinderPlanConfirmation(cdp.events);
      evidence.finderDragProbe = readFinderDragProbe(cdp.events, evidence.finderObservation);
      evidence.finderItemDragDrop = readFinderItemDragDrop(
        cdp.events,
        evidence.finderObservation,
        evidence.fixtureRoot
      );
      applyPermissionBlockedFinderEvidence(evidence);
      evidence.afterTree = await readDirectoryTree(evidence.fixtureRoot);
      evidence.result = classifyFinderSmokeEvidence(evidence);
    } catch (error) {
      evidence.events = cdp.events;
      evidence.finderObservation = readFinderObservation(cdp.events);
      evidence.finderSemanticObservation = readFinderSemanticObservation(
        cdp.events,
        evidence.finderObservation
      );
      evidence.finderPlanPreview = readFinderPlanPreview(cdp.events);
      evidence.finderPlanConfirmation = readFinderPlanConfirmation(cdp.events);
      evidence.finderDragProbe = readFinderDragProbe(cdp.events, evidence.finderObservation);
      evidence.finderItemDragDrop = readFinderItemDragDrop(
        cdp.events,
        evidence.finderObservation,
        evidence.fixtureRoot
      );
      applyPermissionBlockedFinderEvidence(evidence);
      throw error;
    } finally {
      cdp.close();
    }

    if (options.requirePassed && evidence.result !== "passed") {
      process.exitCode = 2;
    }
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    if (!options.keepOpen && launchedSkfiy) {
      await quitSkfiy();
      await sleep(700);
      evidence.processesAfterCleanup = await readSkfiyProcesses();
    }
    if (evidence.fixtureRoot) {
      await rm(evidence.fixtureRoot, { recursive: true, force: true });
    }
    await smokeLock?.release();

    if (options.outputPath) {
      try {
        await writeSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

function assertSmokeReady(options) {
  if (!existsSync(options.appPath)) {
    throw new Error(`App bundle is missing at ${options.appPath}. Run npm run build first.`);
  }

  if (options.targetDir) {
    readFinderTargetDirectory(options.targetDir);
  }

  if (typeof WebSocket !== "function") {
    throw new Error("This smoke script requires a Node runtime with global WebSocket support.");
  }
}

function formatLaunchCommand(options) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`;
}

function readFinderTargetDirectory(targetDir) {
  try {
    const targetStat = statSync(targetDir);
    if (!targetStat.isDirectory()) {
      throw new Error("not a directory");
    }

    return realpathSync(targetDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`--target-dir must be an existing directory: ${targetDir}. ${detail}`);
  }
}

function assertFinderTargetDirSafety(targetDirSafety, options) {
  if (!options.targetDir) {
    return;
  }

  if (
    targetDirSafety?.result !== "passed"
    || targetDirSafety.fixtureInsideTargetDir !== true
  ) {
    throw new Error("--target-dir safety check failed: fixture root must be an isolated child directory.");
  }
}

async function createFinderFixture(parentDir) {
  const rootPath = await mkdtemp(path.join(parentDir, "skfiy-finder-smoke-"));
  await writeFile(path.join(rootPath, "photo.png"), "image");
  await writeFile(path.join(rootPath, "notes.pdf"), "document");
  await writeFile(path.join(rootPath, "script.ts"), "code");
  return rootPath;
}

async function readDirectoryTree(rootPath) {
  const entries = [];

  async function visit(currentPath, relativePath) {
    const children = await readdir(currentPath, { withFileTypes: true });
    for (const child of children) {
      const childRelativePath = relativePath ? path.join(relativePath, child.name) : child.name;
      const childPath = path.join(currentPath, child.name);

      if (child.isDirectory()) {
        await visit(childPath, childRelativePath);
      } else {
        entries.push(childRelativePath);
      }
    }
  }

  await visit(rootPath, "");
  return entries.sort();
}

async function launchSkfiy(options) {
  await execFileAsync("open", [
    "-n",
    "-a",
    options.appPath,
    "--args",
    `--remote-debugging-port=${options.port}`
  ]);
}

async function openFinderFolder(folderPath) {
  await execFileAsync("open", [folderPath]);
}

async function selectFinderFolder(folderPath) {
  await execFileAsync("open", ["-R", folderPath]);
}

function readFinderSmokeCommand(targetMode, fixtureRoot) {
  if (targetMode === "current-finder-folder") {
    return "整理 Finder 当前文件夹";
  }

  if (targetMode === "selected-finder-folder") {
    return "整理 Finder 选中文件夹";
  }

  if (targetMode === "drag-probe") {
    return `探测 Finder 拖拽测试文件夹 ${fixtureRoot}`;
  }

  if (targetMode === "item-drag-drop") {
    return `拖放 Finder 测试文件夹 ${fixtureRoot}`;
  }

  return `整理 Finder 测试文件夹 ${fixtureRoot}`;
}

async function waitForRendererPage(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => {
        if (!response.ok) {
          throw new Error(`CDP returned HTTP ${response.status}.`);
        }

        return response.json();
      });
      const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);

      if (page) {
        return page;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Timed out waiting for skfiy renderer on CDP port ${port}.`
      + (lastError instanceof Error ? ` Last error: ${lastError.message}` : "")
  );
}

async function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const events = [];
  let nextId = 1;

  ws.addEventListener("message", (raw) => {
    const message = JSON.parse(raw.data.toString());

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }

      return;
    }

    if (
      message.method === "Runtime.bindingCalled"
      && message.params?.name === "skfiyFinderSmokeEvent"
    ) {
      events.push(JSON.parse(message.params.payload));
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return {
    events,
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      ws.close();
    }
  };
}

function installEventSinkExpression() {
  return `(() => {
    if (!window.skfiy) {
      throw new Error("window.skfiy preload API is unavailable.");
    }

    if (!window.__skfiyFinderSmokeInstalled) {
      window.__skfiyFinderSmokeInstalled = true;
      window.skfiy.onTaskEvent((event) => {
        globalThis.skfiyFinderSmokeEvent(JSON.stringify(event));
      });
    }

    return true;
  })()`;
}

async function waitForTerminalTaskEvent(cdp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = cdp.events.at(-1)?.status;
    if (
      status === "completed"
      || status === "failed"
      || status === "approval_required"
      || status === "needs_confirmation"
      || status === "idle"
    ) {
      return;
    }

    await sleep(250);
  }
}

async function approvePendingFinderTasks(cdp, options, sendCdp) {
  const deadline = Date.now() + options.timeoutMs;
  let approvedEventCount = 0;
  let approvalAttempts = 0;

  while (Date.now() < deadline && approvalAttempts < 4) {
    await waitForTerminalTaskEvent(cdp, Math.max(250, deadline - Date.now()));
    const status = cdp.events.at(-1)?.status;

    if (status !== "approval_required") {
      return;
    }

    if (cdp.events.length === approvedEventCount) {
      await sleep(250);
      continue;
    }

    approvedEventCount = cdp.events.length;
    approvalAttempts += 1;
    await sendCdp("Runtime.evaluate", {
      expression: "window.skfiy.approveTask()",
      awaitPromise: false,
      returnByValue: true
    }, `Finder approveTask ${approvalAttempts}`);
    await sleep(options.settleMs);
  }
}

function readFinderObservation(events) {
  const beforeObservation = events.find((event) => (
    event?.replayRecord?.stage === "before"
    && event.replayRecord.bundleId === "com.apple.finder"
  ))?.replayRecord;

  if (beforeObservation) {
    return {
      result: "passed",
      screenshotPath: beforeObservation.screenshotPath,
      frontmostBundleId: beforeObservation.frontmostBundleId,
      isRunning: beforeObservation.isRunning,
      isActive: beforeObservation.isActive,
      accessibilityTrusted: beforeObservation.accessibilityTrusted,
      windowCount: Array.isArray(beforeObservation.windows)
        ? beforeObservation.windows.length
        : undefined
    };
  }

  const blockedEvent = events.find((event) => (
    typeof event?.message === "string"
    && (
      event.message.includes("Verification failed (activate):")
      || event.message.includes("Verification failed (observe):")
    )
    && isPermissionBlockedMessage(event.message)
  ));

  if (blockedEvent) {
    return {
      result: "blocked",
      reason: blockedEvent.message
    };
  }

  return {
    result: "missing"
  };
}

function readFinderSemanticObservation(events, finderObservation) {
  const selectionEvent = events.find((event) => event?.finderSelection)?.finderSelection;

  if (selectionEvent) {
    return {
      result: "passed",
      source: selectionEvent.source,
      frontmostBundleId: selectionEvent.frontmostBundleId,
      targetPath: selectionEvent.targetPath,
      selectedCount: Array.isArray(selectionEvent.selection)
        ? selectionEvent.selection.length
        : undefined,
      selectedItems: Array.isArray(selectionEvent.selection)
        ? selectionEvent.selection.map((item) => ({
          path: item.path,
          name: item.name,
          kind: item.kind
        }))
        : []
    };
  }

  const blockedEvent = events.find((event) => (
    typeof event?.message === "string"
    && event.message.includes("Verification failed (selection):")
    && isPermissionBlockedMessage(event.message)
  ));

  if (blockedEvent) {
    return {
      result: "blocked",
      reason: blockedEvent.message
    };
  }

  if (finderObservation?.result === "blocked") {
    return {
      result: "blocked",
      reason: `Skipped Finder semantic selection because Finder observe_app was blocked: ${finderObservation.reason}`
    };
  }

  return {
    result: "missing"
  };
}

function readFinderPlanPreview(events) {
  const preview = events.find((event) => event?.finderPlanPreview)?.finderPlanPreview;

  if (preview) {
    return {
      result: "passed",
      rootPath: preview.rootPath,
      operationCount: preview.operationCount,
      destructiveOperationCount: preview.destructiveOperationCount,
      createFolders: Array.isArray(preview.createFolders) ? preview.createFolders : [],
      moveFiles: Array.isArray(preview.moveFiles) ? preview.moveFiles : []
    };
  }

  return {
    result: "missing"
  };
}

function readFinderPlanConfirmation(events) {
  const confirmationIndex = events.findIndex((event) => (
    event?.status === "approval_required"
    && typeof event.message === "string"
    && event.message.includes("Finder plan confirmation required")
  ));

  if (confirmationIndex === -1) {
    return {
      result: "missing"
    };
  }

  const previewIndex = events.findIndex((event) => event?.finderPlanPreview);
  const confirmationEvent = events[confirmationIndex];
  const continuedAfterConfirmation = events.slice(confirmationIndex + 1).some((event) =>
    event?.status !== "approval_required"
  );

  return {
    result: continuedAfterConfirmation ? "passed" : "waiting",
    reason: confirmationEvent.message.replace(/^.*Finder plan confirmation required:\s*/, ""),
    confirmedAfterPreview: previewIndex !== -1 && previewIndex < confirmationIndex && continuedAfterConfirmation
  };
}

function readFinderDragProbe(events, finderObservation) {
  const passedEvent = events.find((event) => (
    typeof event?.message === "string"
    && event.message.startsWith("Verified drag:")
  ));

  if (passedEvent) {
    return {
      result: "passed",
      source: "finder-hid-drag",
      frontmostBundleId: "com.apple.finder",
      message: passedEvent.message
    };
  }

  const blockedEvent = events.find((event) => (
    typeof event?.message === "string"
    && event.message.includes("Verification failed (drag):")
    && isPermissionBlockedMessage(event.message)
  ));

  if (blockedEvent) {
    return {
      result: "blocked",
      reason: blockedEvent.message
    };
  }

  if (finderObservation?.result === "blocked") {
    return {
      result: "blocked",
      reason: `Skipped Finder drag probe because Finder observe_app was blocked: ${finderObservation.reason}`
    };
  }

  return {
    result: "missing"
  };
}

function readFinderItemDragDrop(events, finderObservation, fixtureRoot) {
  const passedEvent = events.find((event) => (
    typeof event?.message === "string"
    && event.message.startsWith("Verified item_drag_drop:")
  ));

  if (passedEvent) {
    return {
      result: "passed",
      source: "finder-applescript-layout+hid-drag",
      frontmostBundleId: "com.apple.finder",
      folderPath: fixtureRoot,
      movedItem: "photo.png",
      targetItem: "Images",
      message: passedEvent.message
    };
  }

  const blockedEvent = events.find((event) => (
    typeof event?.message === "string"
    && (
      event.message.includes("Verification failed (layout):")
      || event.message.includes("Verification failed (drag):")
    )
    && isPermissionBlockedMessage(event.message)
  ));

  if (blockedEvent) {
    return {
      result: "blocked",
      reason: blockedEvent.message
    };
  }

  if (finderObservation?.result === "blocked") {
    return {
      result: "blocked",
      reason: `Skipped Finder item drag/drop because Finder observe_app was blocked: ${finderObservation.reason}`
    };
  }

  return {
    result: "missing"
  };
}

function applyPermissionBlockedFinderEvidence(evidence) {
  const permissionBlock = createPermissionBlockedFinderEvidence(evidence.permissions)
    ?? createBlockedEnvironmentFinderEvidence(evidence.events);
  if (!permissionBlock) {
    return;
  }

  if (!evidence.finderObservation || evidence.finderObservation.result === "missing") {
    evidence.finderObservation = permissionBlock;
  }

  if (!evidence.finderSemanticObservation || evidence.finderSemanticObservation.result === "missing") {
    evidence.finderSemanticObservation = {
      result: "blocked",
      reason: `Skipped Finder semantic selection because ${permissionBlock.reason}`
    };
  }

  if (!evidence.finderDragProbe || evidence.finderDragProbe.result === "missing") {
    evidence.finderDragProbe = {
      result: "blocked",
      reason: `Skipped Finder drag probe because ${permissionBlock.reason}`
    };
  }

  if (!evidence.finderItemDragDrop || evidence.finderItemDragDrop.result === "missing") {
    evidence.finderItemDragDrop = {
      result: "blocked",
      reason: `Skipped Finder item drag/drop because ${permissionBlock.reason}`
    };
  }
}

function isPermissionBlockedMessage(message) {
  const normalized = message.toLowerCase();
  return normalized.includes("permission")
    && (
      normalized.includes("accessibility")
      || normalized.includes("screen recording")
      || normalized.includes("automation")
    );
}

async function quitSkfiy() {
  await withSmokeTimeout(
    execFileAsync("osascript", [
      "-e",
      `tell application id "${BUNDLE_IDENTIFIER}" to quit`
    ]),
    2_000,
    "Finder quit skfiy"
  ).catch(() => undefined);

  await waitForSkfiyExit(2_000);
  const remaining = parseProcessIds(await readSkfiyProcesses());
  if (remaining.length > 0) {
    await terminateProcesses(remaining, "SIGTERM");
    await waitForSkfiyExit(2_000);
  }

  const stubborn = parseProcessIds(await readSkfiyProcesses());
  if (stubborn.length > 0) {
    await terminateProcesses(stubborn, "SIGKILL");
    await waitForSkfiyExit(1_000);
  }
}

async function readSkfiyProcesses() {
  return readProcessLines(SKFIY_APP_PROCESS_PATTERN);
}

async function readProcessLines(pattern) {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-fl", pattern]);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function waitForSkfiyExit(timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await readSkfiyProcesses()).length === 0) {
      return;
    }

    await sleep(100);
  }
}

async function terminateProcesses(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

await main();
