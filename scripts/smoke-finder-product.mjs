#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  classifyFinderSmokeEvidence,
  createDefaultFinderSmokeOptions,
  createHelpText,
  parseFinderSmokeArgs,
  PRODUCT_PATH
} from "./smoke-finder-plan.mjs";
import { writeSmokeEvidence } from "./smoke-ghostty-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";

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
    productPath: PRODUCT_PATH,
    artifactPath: options.outputPath,
    fixtureRoot: undefined,
    command: undefined,
    beforeTree: [],
    afterTree: [],
    events: [],
    finderObservation: undefined,
    finderSemanticObservation: undefined,
    permissions: undefined,
    runtimeStatus: undefined,
    startupWarnings: undefined,
    appPolicySettings: undefined,
    result: "not-run"
  };
  let smokeLock;

  try {
    assertSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:finder"
    });
    evidence.fixtureRoot = await createFinderFixture();
    evidence.command = `整理 Finder 测试文件夹 ${evidence.fixtureRoot}`;
    evidence.beforeTree = await readDirectoryTree(evidence.fixtureRoot);

    if (!options.keepExisting) {
      await quitSkfiy();
      await sleep(700);
    }

    await launchSkfiy(options);
    evidence.processesAfterLaunch = await readSkfiyProcesses();

    const page = await waitForRendererPage(options.port, options.timeoutMs);
    const cdp = await createCdpClient(page.webSocketDebuggerUrl);

    try {
      await cdp.send("Runtime.enable");
      await cdp.send("Runtime.addBinding", { name: "skfiyFinderSmokeEvent" });
      await cdp.send("Runtime.evaluate", {
        expression: installEventSinkExpression(),
        awaitPromise: true,
        returnByValue: true
      });

      await cdp.send("Runtime.evaluate", {
        expression:
          `window.skfiy.runCommand(${JSON.stringify(evidence.command)}, { mode: "active" })`,
        awaitPromise: true,
        returnByValue: true
      });
      await sleep(options.settleMs);

      if (cdp.events.at(-1)?.status === "approval_required") {
        await cdp.send("Runtime.evaluate", {
          expression: "window.skfiy.approveTask()",
          awaitPromise: true,
          returnByValue: true
        });
      }

      await waitForTerminalTaskEvent(cdp, options.timeoutMs);

      const permissions = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getPermissions()",
        awaitPromise: true,
        returnByValue: true
      });
      const runtimeStatus = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getRuntimeStatus()",
        awaitPromise: true,
        returnByValue: true
      });
      const startupWarnings = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getStartupWarnings()",
        awaitPromise: true,
        returnByValue: true
      });
      const appPolicySettings = await cdp.send("Runtime.evaluate", {
        expression: "window.skfiy.getAppPolicySettings()",
        awaitPromise: true,
        returnByValue: true
      });

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
      evidence.afterTree = await readDirectoryTree(evidence.fixtureRoot);
      evidence.result = classifyFinderSmokeEvidence(evidence);
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
    if (!options.keepOpen) {
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

  if (typeof WebSocket !== "function") {
    throw new Error("This smoke script requires a Node runtime with global WebSocket support.");
  }
}

function formatLaunchCommand(options) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`;
}

async function createFinderFixture() {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skfiy-finder-smoke-"));
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
      || status === "idle"
    ) {
      return;
    }

    await sleep(250);
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
  await execFileAsync("osascript", [
    "-e",
    `tell application id "${BUNDLE_IDENTIFIER}" to quit`
  ]).catch(() => undefined);
}

async function readSkfiyProcesses() {
  return readProcessLines("dist/skfiy.app|/skfiy.app/Contents/MacOS|Electron.*skfiy");
}

async function readProcessLines(pattern) {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-fl", pattern]);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

await main();
