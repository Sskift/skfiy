#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCT_PATH,
  REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS,
  classifyDashboardSmokeEvidence,
  createDashboardHelpText,
  createDefaultDashboardSmokeOptions,
  createRuntimeSnapshotCoverage,
  parseDashboardSmokeArgs,
  writeDashboardSmokeEvidence
} from "./smoke-dashboard-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DASHBOARD_ARGS = ["dashboard", "--no-open", "--port", "0", "--json"];
const CHROME_CONTROL_ACTION_PRODUCT_PATH = "dist/skfiy dashboard -> /api/chrome-control-action -> dist/skfiy chrome actions -> installed Chrome extension";
const DASHBOARD_CHROME_CONTROL_SMOKE_ACTIONS = [
  { action: "observe" },
  { action: "fill", selector: "#name", text: "skfiy-dashboard" },
  { action: "click", selector: "#click-only" },
  { action: "submit", selector: "form" },
  { action: "scroll", dy: 600 }
];
const DASHBOARD_MEMORY_SAFE_ENTRY = "User prefers concise Chinese updates.";
const DASHBOARD_MEMORY_SENSITIVE_ENTRY = "User token=secret should be removable without echo.";
const DASHBOARD_MEMORY_AGENT_ENTRY = "For dashboard work, prefer dense Obsidian-like knowledge surfaces.";

async function main() {
  const defaults = createDefaultDashboardSmokeOptions(ROOT_DIR);
  const options = parseDashboardSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createDashboardHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    cliPath: options.cliPath,
    command: [options.cliPath, ...DASHBOARD_ARGS],
    extensionChromeAppName: options.extensionChromeAppName,
    productPath: PRODUCT_PATH,
    runnerHasTmux: Boolean(process.env.TMUX),
    artifactPath: options.outputPath,
    cliOutput: undefined,
    cliStdout: "",
    cliStderr: "",
    isolatedHomeDir: undefined,
    descriptorResponse: undefined,
    snapshotResponse: undefined,
    operatorReadiness: undefined,
    eventsResponse: undefined,
    shellResponse: undefined,
    reactContentEvidence: undefined,
    knowledgeGraphEvidence: undefined,
    chromeHostPolicyApi: undefined,
    personalMemoryFixture: undefined,
    personalMemoryApi: undefined,
    dashboardChromeControlActionApi: undefined,
    dashboardStatusAutoDiscovery: undefined,
    runtimeSnapshotFixture: undefined,
    runtimeSnapshotCoverage: undefined,
    freshInstallRuntimeSnapshot: undefined,
    missingAfterTurnRuntimeSnapshot: undefined,
    tokenLeakDetected: false,
    result: "not-run"
  };
  let smokeLock;
  let dashboardProcess;
  let isolatedHomeDir;

  try {
    assertDashboardSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:dashboard"
    });
    isolatedHomeDir = await mkdtemp(path.join(tmpdir(), "skfiy-dashboard-smoke-home-"));
    evidence.isolatedHomeDir = isolatedHomeDir;
    evidence.runtimeSnapshotFixture = await seedRuntimeSnapshotFixture(isolatedHomeDir);
    evidence.personalMemoryFixture = await seedPersonalMemoryFixture(isolatedHomeDir);

    const launched = await launchDashboardCli(options, {
      homeDir: isolatedHomeDir
    });
    dashboardProcess = launched.child;
    evidence.pid = dashboardProcess.pid;
    evidence.cliOutput = launched.cliOutput;
    evidence.cliStdout = launched.stdout;
    evidence.cliStderr = launched.stderr;
    evidence.descriptorResponse = await readJsonResponse(
      new URL("/descriptor.json", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.snapshotResponse = await readJsonResponse(
      new URL("/snapshot.json", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.operatorReadiness = evidence.snapshotResponse?.body?.operatorReadiness;
    evidence.eventsResponse = await readEventStreamResponse(
      new URL("/events", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.shellResponse = await readTextResponse(launched.cliOutput.url, options.timeoutMs);
    evidence.reactContentEvidence = await collectReactDashboardContentEvidence({
      dashboardUrl: launched.cliOutput.url,
      shellBody: evidence.shellResponse?.body,
      timeoutMs: options.timeoutMs
    });
    evidence.knowledgeGraphEvidence = await collectDashboardScreenshotEvidence({
      dashboardUrl: launched.cliOutput.url,
      outputPath: options.outputPath,
      timeoutMs: options.timeoutMs
    });
    evidence.chromeHostPolicyApi = await exerciseChromeHostPolicyApi({
      dashboardUrl: launched.cliOutput.url,
      timeoutMs: options.timeoutMs
    });
    evidence.personalMemoryApi = await exercisePersonalMemoryApi({
      dashboardUrl: launched.cliOutput.url,
      fixture: evidence.personalMemoryFixture,
      timeoutMs: options.timeoutMs
    });
    if (options.extensionId) {
      evidence.dashboardChromeControlActionApi = await collectRealHomeChromeControlActionEvidence({
        options,
        extensionId: options.extensionId,
        fallbackSnapshot: evidence.snapshotResponse?.body
      });
    }
    evidence.dashboardStatusAutoDiscovery = await collectDashboardStatusAutoDiscoveryEvidence(options, {
      homeDir: isolatedHomeDir,
      cliOutput: launched.cliOutput
    });
    evidence.freshInstallRuntimeSnapshot = await collectFreshInstallRuntimeSnapshotEvidence(options);
    evidence.missingAfterTurnRuntimeSnapshot = await collectMissingAfterTurnRuntimeSnapshotEvidence(options);
    evidence.tokenLeakDetected = hasTokenLeak([
      evidence.cliStdout,
      evidence.cliStderr,
      JSON.stringify(evidence.descriptorResponse),
      JSON.stringify(evidence.snapshotResponse),
      JSON.stringify(evidence.eventsResponse),
      JSON.stringify(evidence.reactContentEvidence),
      JSON.stringify(evidence.knowledgeGraphEvidence),
      JSON.stringify(evidence.chromeHostPolicyApi),
      JSON.stringify(evidence.personalMemoryFixture),
      JSON.stringify(evidence.personalMemoryApi),
      JSON.stringify(evidence.dashboardChromeControlActionApi),
      JSON.stringify(evidence.dashboardStatusAutoDiscovery),
      JSON.stringify(evidence.freshInstallRuntimeSnapshot),
      JSON.stringify(evidence.missingAfterTurnRuntimeSnapshot),
      evidence.shellResponse?.body ?? ""
    ]);
    evidence.runtimeSnapshotCoverage = createRuntimeSnapshotCoverage(evidence);
    evidence.result = classifyDashboardSmokeEvidence(evidence);

    if (options.requirePassed && evidence.result !== "passed") {
      process.exitCode = 2;
    }
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
  } finally {
    if (dashboardProcess) {
      evidence.cleanup = await terminateDashboardProcess(dashboardProcess);
    }
    if (isolatedHomeDir) {
      await rm(isolatedHomeDir, { recursive: true, force: true }).catch((error) => {
        evidence.isolatedHomeCleanupError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      });
    }
    await smokeLock?.release();

    if (!evidence.runtimeSnapshotCoverage) {
      evidence.runtimeSnapshotCoverage = createRuntimeSnapshotCoverage(evidence);
    }

    if (options.outputPath) {
      try {
        await writeDashboardSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

async function collectReactDashboardContentEvidence({
  dashboardUrl,
  shellBody,
  timeoutMs
}) {
  const assetPath = readReactDashboardAssetPath(shellBody);
  if (!assetPath) {
    return {
      productPath: "dist/skfiy dashboard -> React asset content",
      status: "skipped",
      requiredMarkers: REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS,
      foundMarkers: [],
      missingMarkers: REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS,
      reason: "Dashboard shell did not reference a React module asset."
    };
  }

  const assetUrl = new URL(assetPath, dashboardUrl).toString();
  const response = await readTextResponse(assetUrl, timeoutMs);
  const body = response.body ?? "";
  const foundMarkers = REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS.filter((marker) =>
    body.includes(marker)
  );

  return {
    productPath: "dist/skfiy dashboard -> React asset content",
    assetUrl,
    status: response.status,
    requiredMarkers: REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS,
    foundMarkers,
    missingMarkers: REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS.filter((marker) =>
      !foundMarkers.includes(marker)
    )
  };
}

async function collectDashboardScreenshotEvidence({
  dashboardUrl,
  outputPath,
  timeoutMs
}) {
  const productPath = "dist/skfiy dashboard -> Electron screenshot -> Knowledge graph";
  if (!outputPath) {
    return {
      productPath,
      dashboardUrl,
      result: "skipped",
      reason: "No output path was provided, so no screenshot path could be derived."
    };
  }

  const electronPath = path.join(ROOT_DIR, "node_modules", ".bin", "electron");
  const screenshotPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}-knowledge-graph.png`
  );
  if (!existsSync(electronPath)) {
    return {
      productPath,
      dashboardUrl,
      screenshotPath,
      result: "skipped",
      reason: "Electron binary is not installed."
    };
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "skfiy-dashboard-knowledge-graph-"));
  const probePath = path.join(tempDir, "capture-dashboard-knowledge-graph.cjs");

  try {
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(probePath, createDashboardScreenshotProbeSource({
      dashboardUrl,
      screenshotPath,
      timeoutMs
    }), "utf8");
    return await runElectronDashboardScreenshotProbe({
      electronPath,
      probePath,
      timeoutMs
    });
  } catch (error) {
    return {
      productPath,
      dashboardUrl,
      screenshotPath,
      result: "error",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function createDashboardScreenshotProbeSource({
  dashboardUrl,
  screenshotPath,
  timeoutMs
}) {
  return `
const fs = require("node:fs/promises");
const { app, BrowserWindow } = require("electron");

const dashboardUrl = ${JSON.stringify(dashboardUrl)};
const screenshotPath = ${JSON.stringify(screenshotPath)};
const timeoutMs = ${JSON.stringify(timeoutMs)};
const productPath = "dist/skfiy dashboard -> Electron screenshot -> Knowledge graph";

app.commandLine.appendSwitch("disable-gpu");

async function main() {
  const timeout = setTimeout(() => {
    console.log(JSON.stringify({
      productPath,
      dashboardUrl,
      screenshotPath,
      result: "error",
      error: "Timed out capturing dashboard knowledge graph."
    }));
    app.exit(2);
  }, timeoutMs);

  await app.whenReady();
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await win.loadURL(dashboardUrl);
  await win.webContents.executeJavaScript(\`
    new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (document.querySelector('[aria-label="Knowledge graph"]')) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt > \${timeoutMs}) {
          resolve(false);
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  \`);

  const dom = await win.webContents.executeJavaScript(\`
    (async () => {
      const region = document.querySelector('[aria-label="Knowledge graph"]');
      region?.scrollIntoView({ block: "center", inline: "nearest" });
      const nodeItems = Array.from(document.querySelectorAll('[aria-label="Knowledge graph nodes"] li'));
      const linkItems = Array.from(document.querySelectorAll('[aria-label="Knowledge graph links"] li'));
      const vaultNoteItems = Array.from(document.querySelectorAll('[aria-label="Vault notes"] li'));
      const backlinkItems = Array.from(document.querySelectorAll('[aria-label="Vault backlinks"] li'));
      const learningLoopItems = Array.from(document.querySelectorAll('[aria-label="Learning loop"] li'));
      const focusedButton = document.querySelector('[aria-label="Vault notes"] button[aria-label="Open note User preferences.md"]')
        ?? document.querySelector('[aria-label="Vault notes"] button[aria-label^="Open note"]');
      focusedButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 60));
      const focusedNote = document.querySelector('[aria-label="Focused note"]');
      focusedNote?.scrollIntoView({ block: "center", inline: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 60));
      const focusedBacklinkItems = Array.from(document.querySelectorAll('[aria-label="Focused note backlinks"] li'));
      const learningLoopList = document.querySelector('[aria-label="Learning loop"]');
      const rects = nodeItems.map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          text: item.textContent,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height
        };
      });
      let fallbackTextOverlap = false;
      for (let left = 0; left < rects.length; left += 1) {
        for (let right = left + 1; right < rects.length; right += 1) {
          const a = rects[left];
          const b = rects[right];
          fallbackTextOverlap = fallbackTextOverlap
            || (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
        }
      }
      learningLoopList?.scrollIntoView({ block: "center", inline: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        regionFound: Boolean(region),
        nodeCount: nodeItems.length,
        linkCount: linkItems.length,
        vaultNoteCount: vaultNoteItems.length,
        focusedNoteFound: Boolean(focusedNote),
        focusedNoteTitle: focusedNote?.querySelector("h4")?.textContent ?? "",
        focusedBacklinkCount: focusedBacklinkItems.length,
        backlinkCount: backlinkItems.length,
        learningLoopCount: learningLoopItems.length,
        sessionNodeCount: nodeItems.filter((item) => /session/i.test(item.textContent ?? "")).length,
        personalSkillNodeCount: nodeItems.filter((item) => /Concise Chinese progress updates|Obsidian-style knowledge dashboard/i.test(item.textContent ?? "")).length,
        fallbackTextOverlap,
        nodeTexts: nodeItems.map((item) => item.textContent),
        linkTexts: linkItems.map((item) => item.textContent),
        vaultNoteTexts: vaultNoteItems.map((item) => item.textContent),
        focusedBacklinkTexts: focusedBacklinkItems.map((item) => item.textContent),
        learningLoopTexts: learningLoopItems.map((item) => item.textContent),
        personalSkillTexts: nodeItems
          .filter((item) => /Concise Chinese progress updates|Obsidian-style knowledge dashboard/i.test(item.textContent ?? ""))
          .map((item) => item.textContent),
        backlinkTexts: backlinkItems.map((item) => item.textContent)
      };
    })()
  \`);
  await new Promise((resolve) => setTimeout(resolve, 120));

  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  await fs.writeFile(screenshotPath, png);
  clearTimeout(timeout);
  console.log(JSON.stringify({
    productPath,
    dashboardUrl,
    screenshotPath,
    screenshotBytes: png.length,
    ...dom,
    result: dom.regionFound && dom.nodeCount >= 5 && dom.vaultNoteCount >= 3 && dom.focusedNoteFound && /\\.md$/u.test(dom.focusedNoteTitle) && dom.focusedBacklinkCount >= 1 && dom.backlinkCount >= 2 && dom.learningLoopCount >= 4 && dom.sessionNodeCount >= 2 && dom.personalSkillNodeCount >= 2 && dom.linkTexts.some((text) => typeof text === "string" && text.includes("guides prompt")) && !dom.fallbackTextOverlap ? "passed" : "failed"
  }));
  app.quit();
}

main().catch((error) => {
  console.log(JSON.stringify({
    productPath,
    dashboardUrl,
    screenshotPath,
    result: "error",
    error: error instanceof Error ? error.message : String(error)
  }));
  app.exit(1);
});
`;
}

function runElectronDashboardScreenshotProbe({
  electronPath,
  probePath,
  timeoutMs
}) {
  return new Promise((resolve) => {
    const child = spawn(electronPath, [probePath], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        resolve({
          productPath: "dist/skfiy dashboard -> Electron screenshot -> Knowledge graph",
          probePath,
          result: "error",
          stderr,
          error: `Timed out after ${timeoutMs}ms.`
        });
      }
    }, timeoutMs + 1_000);
    const settle = (payload) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(payload);
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle({
        productPath: "dist/skfiy dashboard -> Electron screenshot -> Knowledge graph",
        probePath,
        result: "error",
        stderr,
        error: error instanceof Error ? error.message : String(error)
      });
    });
    child.once("exit", (code, signal) => {
      const lastLine = stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1);
      try {
        settle({
          ...JSON.parse(lastLine ?? "{}"),
          probePath,
          stderr,
          exitCode: code,
          signal
        });
      } catch (error) {
        settle({
          productPath: "dist/skfiy dashboard -> Electron screenshot -> Knowledge graph",
          probePath,
          result: "error",
          stdout,
          stderr,
          exitCode: code,
          signal,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  });
}

function readReactDashboardAssetPath(shellBody) {
  if (typeof shellBody !== "string" || !shellBody.includes('id="dashboard-root"')) {
    return undefined;
  }

  return shellBody.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+\.js)["']/i)?.[1]
    ?? shellBody.match(/<script[^>]+src=["']([^"']+\.js)["'][^>]+type=["']module["']/i)?.[1];
}

async function seedRuntimeSnapshotFixture(homeDir) {
  const snapshotPath = createRuntimeSnapshotStatePath(homeDir);
  const snapshot = createRuntimeSnapshotFixture(new Date().toISOString());

  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  return {
    productPath: "smoke:dashboard -> isolated HOME -> runtime-snapshot.json",
    path: snapshotPath,
    snapshot
  };
}

async function seedPersonalMemoryFixture(homeDir) {
  const memoryDir = path.join(
    homeDir,
    "Library",
    "Application Support",
    "skfiy",
    "memory"
  );
  const userMemoryPath = path.join(memoryDir, "USER.md");
  const agentMemoryPath = path.join(memoryDir, "AGENT.md");
  const sessionMemoryPath = path.join(memoryDir, "sessions.jsonl");
  const now = new Date();
  const sessions = [
    {
      schemaVersion: 1,
      turnId: "dashboard-smoke-hermes-memory-turn",
      createdAt: new Date(now.getTime() - 60_000).toISOString(),
      userInput: "以后进度更新短一点",
      assistantReply: "我会用更短的中文更新。",
      providerLabel: "Hermes"
    },
    {
      schemaVersion: 1,
      turnId: "dashboard-smoke-memory-turn",
      createdAt: now.toISOString(),
      userInput: "Summarize the current dashboard state.",
      assistantReply: "The dashboard is showing local memory and runtime readiness.",
      providerLabel: "Codex",
      browserContext: {
        title: "skfiy Dashboard",
        url: "http://127.0.0.1/dashboard"
      }
    }
  ];

  await mkdir(memoryDir, { recursive: true });
  await writeFile(userMemoryPath, [
    DASHBOARD_MEMORY_SAFE_ENTRY,
    "---",
    DASHBOARD_MEMORY_SENSITIVE_ENTRY,
    ""
  ].join("\n"), "utf8");
  await writeFile(agentMemoryPath, `${DASHBOARD_MEMORY_AGENT_ENTRY}\n`, "utf8");
  await writeFile(sessionMemoryPath, `${sessions.map((session) => JSON.stringify(session)).join("\n")}\n`, "utf8");

  return {
    productPath: "smoke:dashboard -> isolated HOME -> personal memory files",
    userMemoryPath,
    agentMemoryPath,
    sessionMemoryPath,
    seededUserEntries: 2,
    seededAgentEntries: 1,
    seededSessionEntries: sessions.length
  };
}

async function exercisePersonalMemoryApi({ dashboardUrl, fixture, timeoutMs }) {
  const apiUrl = new URL("/api/personal-memory", dashboardUrl).toString();
  const productPath = "smoke:dashboard -> isolated HOME memory fixture -> /api/personal-memory";
  const snapshotBefore = await readJsonResponse(
    new URL("/snapshot.json", dashboardUrl).toString(),
    timeoutMs
  );
  const forgetResponse = await readJsonRequest(apiUrl, timeoutMs, {
    method: "POST",
    body: JSON.stringify({
      action: "forget",
      target: "user",
      content: DASHBOARD_MEMORY_SENSITIVE_ENTRY
    })
  });
  const rejectedAddResponse = await readJsonRequest(apiUrl, timeoutMs, {
    method: "POST",
    body: JSON.stringify({
      action: "add",
      target: "user",
      content: "User prefers dashboard smoke to reject broad memory writes."
    })
  });
  const snapshotAfter = await readJsonResponse(
    new URL("/snapshot.json", dashboardUrl).toString(),
    timeoutMs
  );
  const userMemoryAfter = await readFile(fixture.userMemoryPath, "utf8").catch(() => "");
  const tokenLeakDetected = hasTokenLeak([
    JSON.stringify(snapshotBefore),
    JSON.stringify(forgetResponse),
    JSON.stringify(rejectedAddResponse),
    JSON.stringify(snapshotAfter)
  ]);
  const passed = snapshotBefore.status === 200
    && snapshotBefore.body?.personalMemory?.userEntryCount >= 2
    && snapshotBefore.body.personalMemory.usage?.user?.limitChars === 1375
    && snapshotBefore.body.personalMemory.usage?.user?.usedChars > 0
    && snapshotBefore.body.personalMemory.usage?.agent?.limitChars === 2200
    && snapshotBefore.body.personalMemory.usage?.agent?.usedChars > 0
    && snapshotBefore.body.personalMemory.recentUserEntries?.includes("[redacted sensitive memory]")
    && forgetResponse.status === 200
    && forgetResponse.body?.result === "forgotten"
    && forgetResponse.body?.applied === 1
    && rejectedAddResponse.status === 400
    && rejectedAddResponse.body?.error?.code === "unknown-action"
    && snapshotAfter.status === 200
    && snapshotAfter.body?.personalMemory?.userEntryCount === snapshotBefore.body.personalMemory.userEntryCount - 1
    && snapshotAfter.body.personalMemory.usage?.user?.usedChars < snapshotBefore.body.personalMemory.usage.user.usedChars
    && !userMemoryAfter.includes(DASHBOARD_MEMORY_SENSITIVE_ENTRY)
    && userMemoryAfter.includes(DASHBOARD_MEMORY_SAFE_ENTRY)
    && !tokenLeakDetected;

  return {
    productPath,
    apiUrl,
    fixture,
    snapshotBefore,
    forgetResponse,
    rejectedAddResponse,
    snapshotAfter,
    userMemoryFileAfter: {
      sensitiveEntryPresent: userMemoryAfter.includes(DASHBOARD_MEMORY_SENSITIVE_ENTRY),
      keptEntryPresent: userMemoryAfter.includes(DASHBOARD_MEMORY_SAFE_ENTRY)
    },
    tokenLeakDetected,
    result: passed ? "passed" : "failed"
  };
}

async function collectDashboardStatusAutoDiscoveryEvidence(options, { homeDir, cliOutput }) {
  const command = [options.cliPath, "status", "--json"];
  const result = await runCliJsonCommand(command, {
    homeDir,
    timeoutMs: options.timeoutMs,
    extensionChromeAppName: options.extensionChromeAppName
  });

  return {
    productPath: "dist/skfiy dashboard -> dashboard-server.json -> skfiy status --json",
    command,
    homeDir,
    expectedUrl: cliOutput?.url,
    expectedPid: cliOutput?.serverPid,
    expectedStatePath: cliOutput?.statePath,
    ...result
  };
}

async function collectFreshInstallRuntimeSnapshotEvidence(options) {
  const isolatedHomeDir = await mkdtemp(path.join(tmpdir(), "skfiy-dashboard-fresh-home-"));
  const runtimeSnapshotPath = createRuntimeSnapshotStatePath(isolatedHomeDir);
  const evidence = {
    productPath: "smoke:dashboard -> isolated fresh HOME -> missing runtime-snapshot.json",
    isolatedHomeDir,
    runtimeSnapshotPath,
    runtimeSnapshotExistsBeforeLaunch: existsSync(runtimeSnapshotPath),
    runtimeSnapshotExistsAfterFetch: undefined,
    cliOutput: undefined,
    cliStdout: "",
    cliStderr: "",
    snapshotResponse: undefined,
    eventsResponse: undefined,
    cleanup: undefined,
    result: "not-run"
  };
  let dashboardProcess;

  try {
    const launched = await launchDashboardCli(options, {
      homeDir: isolatedHomeDir
    });
    dashboardProcess = launched.child;
    evidence.pid = dashboardProcess.pid;
    evidence.cliOutput = launched.cliOutput;
    evidence.cliStdout = launched.stdout;
    evidence.cliStderr = launched.stderr;
    evidence.snapshotResponse = await readJsonResponse(
      new URL("/snapshot.json", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.eventsResponse = await readEventStreamResponse(
      new URL("/events", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.runtimeSnapshotExistsAfterFetch = existsSync(runtimeSnapshotPath);
    evidence.result = "collected";
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (dashboardProcess) {
      evidence.cleanup = await terminateDashboardProcess(dashboardProcess);
    }
    await rm(isolatedHomeDir, { recursive: true, force: true }).catch((error) => {
      evidence.isolatedHomeCleanupError = error instanceof Error ? error.message : String(error);
    });
  }

  return evidence;
}

async function collectMissingAfterTurnRuntimeSnapshotEvidence(options) {
  const isolatedHomeDir = await mkdtemp(path.join(tmpdir(), "skfiy-dashboard-marker-home-"));
  const runtimeSnapshotPath = createRuntimeSnapshotStatePath(isolatedHomeDir);
  const markerPath = createRuntimeTurnMarkerStatePath(isolatedHomeDir);
  const marker = createRuntimeTurnMarkerFixture(new Date().toISOString());
  const evidence = {
    productPath: "smoke:dashboard -> isolated HOME marker -> missing runtime-snapshot.json",
    isolatedHomeDir,
    runtimeSnapshotPath,
    markerPath,
    marker,
    runtimeSnapshotExistsBeforeLaunch: existsSync(runtimeSnapshotPath),
    markerExistsBeforeLaunch: undefined,
    runtimeSnapshotExistsAfterFetch: undefined,
    cliOutput: undefined,
    cliStdout: "",
    cliStderr: "",
    snapshotResponse: undefined,
    eventsResponse: undefined,
    cleanup: undefined,
    result: "not-run"
  };
  let dashboardProcess;

  try {
    await mkdir(path.dirname(markerPath), { recursive: true });
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
    evidence.markerExistsBeforeLaunch = existsSync(markerPath);

    const launched = await launchDashboardCli(options, {
      homeDir: isolatedHomeDir
    });
    dashboardProcess = launched.child;
    evidence.pid = dashboardProcess.pid;
    evidence.cliOutput = launched.cliOutput;
    evidence.cliStdout = launched.stdout;
    evidence.cliStderr = launched.stderr;
    evidence.snapshotResponse = await readJsonResponse(
      new URL("/snapshot.json", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.eventsResponse = await readEventStreamResponse(
      new URL("/events", launched.cliOutput.url).toString(),
      options.timeoutMs
    );
    evidence.runtimeSnapshotExistsAfterFetch = existsSync(runtimeSnapshotPath);
    evidence.result = "collected";
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (dashboardProcess) {
      evidence.cleanup = await terminateDashboardProcess(dashboardProcess);
    }
    await rm(isolatedHomeDir, { recursive: true, force: true }).catch((error) => {
      evidence.isolatedHomeCleanupError = error instanceof Error ? error.message : String(error);
    });
  }

  return evidence;
}

function createRuntimeSnapshotStatePath(homeDir) {
  return path.join(
    homeDir,
    "Library",
    "Application Support",
    "skfiy",
    "runtime-snapshot.json"
  );
}

function createRuntimeTurnMarkerStatePath(homeDir) {
  return path.join(
    homeDir,
    "Library",
    "Application Support",
    "skfiy",
    "runtime-turn-marker.json"
  );
}

function createRuntimeSnapshotFixture(observedAt) {
  return {
    schemaVersion: 1,
    observedAt,
    currentTurn: {
      state: "approval_required",
      command: "dashboard smoke runtime snapshot fixture",
      targetApp: "Ghostty",
      targetBundleId: "com.mitchellh.ghostty",
      risk: "low",
      plannerProvider: "Dashboard Smoke Fixture",
      approvalRequired: true,
      approvalState: "required",
      stopState: "available",
      latestMessage: "Dashboard smoke runtime snapshot fixture is visible.",
      latestAction: {
        type: "verify",
        actionType: "type_text",
        status: "passed",
        message: "Dashboard smoke runtime snapshot fixture verification is visible."
      },
      latestVerification: {
        type: "verify",
        actionType: "type_text",
        status: "passed",
        message: "Dashboard smoke runtime snapshot fixture verification is visible."
      },
      latestScreenshot: {
        stage: "before",
        path: "/tmp/skfiy-dashboard-runtime-fixture-before.png",
        bundleId: "com.mitchellh.ghostty",
        recommendation: "structured_first",
        sourceCount: 2
      },
      source: "runtime-snapshot"
    },
    replay: {
      state: "available",
      outcome: "running",
      screenshotCount: 1,
      actionCount: 3,
      verificationCount: 1,
      timelineCount: 2,
      latestMessage: "Dashboard smoke runtime snapshot fixture is visible.",
      screenshots: [
        {
          stage: "before",
          path: "/tmp/skfiy-dashboard-runtime-fixture-before.png",
          bundleId: "com.mitchellh.ghostty",
          recommendation: "structured_first",
          sourceCount: 2
        }
      ],
      actions: [
        {
          type: "plan",
          providerLabel: "Dashboard Smoke Fixture",
          command: "dashboard smoke runtime snapshot fixture"
        },
        {
          type: "type_text",
          textLength: 40
        },
        {
          type: "verify",
          actionType: "type_text",
          status: "passed",
          message: "Dashboard smoke runtime snapshot fixture verification is visible."
        }
      ],
      verifications: [
        {
          type: "verify",
          actionType: "type_text",
          status: "passed",
          message: "Dashboard smoke runtime snapshot fixture verification is visible."
        }
      ],
      timelineTail: [
        {
          status: "executing",
          message: "Dashboard smoke runtime snapshot fixture started."
        },
        {
          status: "approval_required",
          command: "dashboard smoke runtime snapshot fixture",
          message: "Dashboard smoke runtime snapshot fixture is visible."
        }
      ],
      source: "runtime-snapshot"
    }
  };
}

function createRuntimeTurnMarkerFixture(observedAt) {
  return {
    schemaVersion: 1,
    observedAt,
    currentTurn: {
      state: "executing",
      command: "dashboard smoke runtime turn marker",
      latestMessage: "Dashboard smoke runtime turn marker is visible.",
      source: "runtime-turn-marker"
    }
  };
}

function assertDashboardSmokeReady(options) {
  if (!existsSync(options.cliPath)) {
    throw new Error(`Built CLI is missing at ${options.cliPath}. Run npm run build first.`);
  }

  if (typeof fetch !== "function") {
    throw new Error("This smoke script requires a Node runtime with global fetch support.");
  }
}

function launchDashboardCli(options, { homeDir } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(options.cliPath, DASHBOARD_ARGS, {
      cwd: ROOT_DIR,
      env: createDashboardSmokeEnv(options, { homeDir }),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`Timed out waiting for dashboard CLI JSON after ${options.timeoutMs}ms.`));
      }
    }, options.timeoutMs);
    const settle = (callback) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        callback();
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;

      try {
        const cliOutput = JSON.parse(stdout);

        settle(() => resolve({
          child,
          cliOutput,
          stdout,
          stderr
        }));
      } catch {
        // Pretty-printed JSON arrives over multiple chunks while the server keeps running.
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle(() => reject(error));
    });
    child.once("exit", (code, signal) => {
      settle(() => reject(new Error(
        `Dashboard CLI exited before printing JSON: code=${code ?? "null"} signal=${signal ?? "null"} stderr=${stderr.trim()}`
      )));
    });
  });
}

function runCliJsonCommand(command, { homeDir, timeoutMs, extensionChromeAppName }) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: ROOT_DIR,
      env: createDashboardSmokeEnv({ extensionChromeAppName }, { homeDir }),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        resolve({
          exitCode: null,
          signal: "timeout",
          stdout,
          stderr,
          stdoutJson: undefined,
          tokenLeakDetected: hasTokenLeak([stdout, stderr]),
          error: `Timed out after ${timeoutMs}ms.`
        });
      }
    }, timeoutMs);
    const settle = (payload) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(payload);
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      settle({
        exitCode: null,
        signal: "error",
        stdout,
        stderr,
        stdoutJson: undefined,
        tokenLeakDetected: hasTokenLeak([stdout, stderr]),
        error: error instanceof Error ? error.message : String(error)
      });
    });
    child.once("exit", (code, signal) => {
      let stdoutJson;
      let jsonParseError;

      try {
        stdoutJson = JSON.parse(stdout);
      } catch (error) {
        jsonParseError = error instanceof Error ? error.message : String(error);
      }

      settle({
        exitCode: code,
        signal,
        stdout,
        stderr,
        stdoutJson,
        tokenLeakDetected: hasTokenLeak([stdout, stderr]),
        ...(jsonParseError ? { jsonParseError } : {})
      });
    });
  });
}

function createDashboardSmokeEnv(options = {}, { homeDir } = {}) {
  return {
    ...process.env,
    ...(homeDir ? { HOME: homeDir } : {}),
    ...(options.extensionChromeAppName
      ? { SKFIY_CHROME_APP_NAME: options.extensionChromeAppName }
      : {})
  };
}

async function exerciseChromeHostPolicyApi({ dashboardUrl, timeoutMs }) {
  const apiUrl = new URL("/api/chrome-host-policy", dashboardUrl).toString();
  const productPath = "dist/skfiy -> dashboard /api/chrome-host-policy -> chrome-host-policy.json";
  const showDefault = await readJsonResponse(apiUrl, timeoutMs);
  const setResponse = await readJsonRequest(apiUrl, timeoutMs, {
    method: "POST",
    body: JSON.stringify({
      action: "allow-current-turn",
      host: "https://dashboard-smoke.example/path"
    })
  });
  const showConfigured = await readJsonResponse(apiUrl, timeoutMs);
  const resetResponse = await readJsonRequest(apiUrl, timeoutMs, {
    method: "POST",
    body: JSON.stringify({
      action: "reset"
    })
  });

  return {
    productPath,
    apiUrl,
    showDefault,
    setResponse,
    showConfigured,
    resetResponse
  };
}

async function collectRealHomeChromeControlActionEvidence({ options, extensionId, fallbackSnapshot }) {
  const realUserHomeDir = process.env.HOME;
  const evidence = {
    productPath: CHROME_CONTROL_ACTION_PRODUCT_PATH,
    homeMode: "real-user-home",
    realUserHomeDir,
    extensionChromeAppName: options.extensionChromeAppName,
    dashboard: undefined,
    extensionStatusBeforeActions: undefined,
    snapshotBeforeResponse: undefined,
    result: "not-run",
    tokenLeakDetected: false
  };
  let dashboardProcess;

  try {
    const launched = await launchDashboardCli(options);
    dashboardProcess = launched.child;
    evidence.dashboard = {
      pid: dashboardProcess.pid,
      cliOutput: launched.cliOutput,
      cliStdout: launched.stdout,
      cliStderr: launched.stderr
    };
    evidence.extensionStatusBeforeActions = await collectChromeExtensionStatusBeforeDashboardActions({
      options,
      extensionId
    });
    evidence.snapshotBeforeResponse = await readJsonResponse(
      new URL("/snapshot.json", launched.cliOutput.url).toString(),
      options.timeoutMs
    );

    const actionEvidence = await exerciseChromeControlActionApi({
      dashboardUrl: launched.cliOutput.url,
      extensionId,
      chromeAppName: options.extensionChromeAppName,
      snapshot: evidence.snapshotBeforeResponse?.body ?? fallbackSnapshot,
      timeoutMs: options.timeoutMs
    });

    Object.assign(evidence, actionEvidence, {
      productPath: CHROME_CONTROL_ACTION_PRODUCT_PATH,
      homeMode: "real-user-home",
      realUserHomeDir,
      dashboard: evidence.dashboard,
      extensionStatusBeforeActions: evidence.extensionStatusBeforeActions,
      snapshotBeforeResponse: evidence.snapshotBeforeResponse
    });
  } catch (error) {
    evidence.result = "error";
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (dashboardProcess) {
      evidence.dashboard = {
        ...(evidence.dashboard ?? {}),
        cleanup: await terminateDashboardProcess(dashboardProcess)
      };
    }
    evidence.tokenLeakDetected = hasTokenLeak([
      JSON.stringify(evidence.dashboard),
      JSON.stringify(evidence.extensionStatusBeforeActions),
      JSON.stringify(evidence.snapshotBeforeResponse),
      JSON.stringify(evidence.actionRuns),
      evidence.error
    ]);
    if (evidence.result === "passed" && evidence.tokenLeakDetected) {
      evidence.result = "failed";
    }
  }

  return evidence;
}

async function collectChromeExtensionStatusBeforeDashboardActions({ options, extensionId }) {
  const command = [
    options.cliPath,
    "chrome",
    "status",
    "--extension-id",
    extensionId,
    "--json"
  ];

  return {
    productPath: "dist/skfiy chrome status -> Chromium extension host-policy sync",
    command,
    extensionChromeAppName: options.extensionChromeAppName,
    ...await runCliJsonCommand(command, {
      timeoutMs: options.timeoutMs,
      extensionChromeAppName: options.extensionChromeAppName
    })
  };
}

async function exerciseChromeControlActionApi({ dashboardUrl, extensionId, chromeAppName, snapshot, timeoutMs }) {
  const apiUrl = new URL("/api/chrome-control-action", dashboardUrl).toString();
  const productPath = CHROME_CONTROL_ACTION_PRODUCT_PATH;
  const targetTab = readDashboardChromeControlTarget(snapshot);
  if (!targetTab || !Number.isInteger(targetTab.tabId)) {
    return {
      productPath,
      apiUrl,
      actionRuns: [],
      result: "blocked",
      reason: "dashboard-page-control-target-missing",
      tokenLeakDetected: false
    };
  }

  const actionRuns = [];
  for (const actionInput of DASHBOARD_CHROME_CONTROL_SMOKE_ACTIONS) {
    actionRuns.push(await runDashboardChromeControlActionWithRetry({
      apiUrl,
      dashboardUrl,
      actionInput,
      extensionId,
      chromeAppName: chromeAppName ?? snapshot?.runtimeHealth?.extension?.chromeAppName,
      targetTabId: targetTab.tabId,
      timeoutMs
    }));
  }

  const tokenLeakDetected = actionRuns.some((run) => run.tokenLeakDetected);
  const passed = actionRuns.length === DASHBOARD_CHROME_CONTROL_SMOKE_ACTIONS.length
    && actionRuns.every((run) => run.result === "passed")
    && !tokenLeakDetected;

  return {
    productPath,
    apiUrl,
    targetTab,
    actionRuns,
    tokenLeakDetected,
    result: passed ? "passed" : "failed"
  };
}

async function runDashboardChromeControlActionWithRetry({
  apiUrl,
  dashboardUrl,
  actionInput,
  extensionId,
  chromeAppName,
  targetTabId,
  timeoutMs
}) {
  const first = await runDashboardChromeControlActionOnce({
    apiUrl,
    dashboardUrl,
    actionInput,
    extensionId,
    chromeAppName,
    targetTabId,
    timeoutMs
  });

  if (
    actionInput.action !== "observe"
    || first.result === "passed"
    || first.response?.body?.blockerReason !== "page-control-observe-not-verified"
  ) {
    return first;
  }

  await new Promise((resolve) => setTimeout(resolve, 250));
  const retry = await runDashboardChromeControlActionOnce({
    apiUrl,
    dashboardUrl,
    actionInput,
    extensionId,
    chromeAppName,
    targetTabId,
    timeoutMs
  });

  return {
    ...retry,
    attempts: [first, retry],
    retriedAfter: "page-control-observe-not-verified"
  };
}

async function runDashboardChromeControlActionOnce({
  apiUrl,
  dashboardUrl,
  actionInput,
  extensionId,
  chromeAppName,
  targetTabId,
  timeoutMs
}) {
  const request = createDashboardChromeControlActionRequest({
    actionInput,
    extensionId,
    chromeAppName,
    targetTabId
  });
  const response = await readJsonRequest(apiUrl, timeoutMs, {
    method: "POST",
    body: JSON.stringify(request)
  });
  const snapshotAfterResponse = await readJsonResponse(
    new URL("/snapshot.json", dashboardUrl).toString(),
    timeoutMs
  );
  const tokenLeakDetected = hasTokenLeak([
    JSON.stringify(request),
    JSON.stringify(response),
    JSON.stringify(snapshotAfterResponse)
  ]);

  return {
    action: actionInput.action,
    apiUrl,
    request,
    response,
    snapshotAfterResponse,
    tokenLeakDetected,
    result: isDashboardChromeControlActionRunPassed({
      action: actionInput.action,
      targetTabId,
      response,
      snapshotAfterResponse,
      tokenLeakDetected
    }) ? "passed" : "failed"
  };
}

function createDashboardChromeControlActionRequest({ actionInput, extensionId, chromeAppName, targetTabId }) {
  return {
    action: actionInput.action,
    extensionId,
    ...(typeof chromeAppName === "string" && chromeAppName.trim()
      ? { chromeAppName: chromeAppName.trim() }
      : {}),
    targetTabId,
    ...(typeof actionInput.selector === "string" ? { selector: actionInput.selector } : {}),
    ...(typeof actionInput.text === "string" ? { text: actionInput.text } : {}),
    ...(Number.isFinite(actionInput.dy) ? { dy: actionInput.dy } : {})
  };
}

function isDashboardChromeControlActionRunPassed({
  action,
  targetTabId,
  response,
  snapshotAfterResponse,
  tokenLeakDetected
}) {
  const activityEntry = response?.body?.activityEntry;
  const snapshotActivity = snapshotAfterResponse?.body?.currentTurn?.chromeControlActivity;
  const replayActions = Array.isArray(snapshotAfterResponse?.body?.replay?.chromeControlActions)
    ? snapshotAfterResponse.body.replay.chromeControlActions
    : [];

  return response?.status === 200
    && response?.body?.result === "verified"
    && response?.body?.action === action
    && response?.body?.targetTabId === targetTabId
    && activityEntry?.kind === "chrome-control-action"
    && activityEntry?.title === `Chrome ${action}`
    && activityEntry?.result === "verified"
    && activityEntry?.target?.tabId === targetTabId
    && snapshotAfterResponse?.status === 200
    && snapshotActivity?.kind === "chrome-control-action"
    && snapshotActivity?.title === `Chrome ${action}`
    && snapshotActivity?.result === "verified"
    && snapshotActivity?.target?.tabId === targetTabId
    && replayActions.some((entry) =>
      entry?.kind === "chrome-control-action"
      && entry?.title === `Chrome ${action}`
      && entry?.target?.tabId === targetTabId
      && entry?.result === "verified"
    )
    && !tokenLeakDetected;
}

function readDashboardChromeControlTarget(snapshot) {
  const pageControl = snapshot?.runtimeHealth?.extension?.pageControl;
  const activeTab = pageControl?.activeTab;
  if (!activeTab || !Number.isInteger(activeTab.tabId)) {
    return undefined;
  }

  return {
    tabId: activeTab.tabId,
    ...(typeof activeTab.host === "string" ? { host: activeTab.host } : {}),
    ...(typeof activeTab.scheme === "string" ? { scheme: activeTab.scheme } : {})
  };
}

async function readJsonResponse(url, timeoutMs) {
  const textResponse = await readTextResponse(url, timeoutMs);
  let body;

  try {
    body = JSON.parse(textResponse.body);
  } catch (error) {
    return {
      ...textResponse,
      jsonParseError: error instanceof Error ? error.message : String(error)
    };
  }

  return {
    status: textResponse.status,
    headers: textResponse.headers,
    body,
    rawBody: textResponse.body
  };
}

async function readJsonRequest(url, timeoutMs, request = {}) {
  const textResponse = await readTextResponse(url, timeoutMs, request);
  let body;

  try {
    body = JSON.parse(textResponse.body);
  } catch (error) {
    return {
      ...textResponse,
      jsonParseError: error instanceof Error ? error.message : String(error)
    };
  }

  return {
    status: textResponse.status,
    headers: textResponse.headers,
    body,
    rawBody: textResponse.body
  };
}

async function readTextResponse(url, timeoutMs, request = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: request.method ?? "GET",
      headers: request.body ? {
        "content-type": "application/json"
      } : undefined,
      body: request.body,
      signal: controller.signal
    });

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readEventStreamResponse(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    const headers = Object.fromEntries(response.headers.entries());
    let body = "";

    if (!response.body) {
      return {
        status: response.status,
        headers,
        body,
        error: "SSE response did not expose a readable body."
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (!body.includes("\n\n")) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
      controller.abort();
    }

    return {
      status: response.status,
      headers,
      body: body.includes("\n\n") ? body.slice(0, body.indexOf("\n\n") + 2) : body
    };
  } finally {
    clearTimeout(timeout);
  }
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

async function terminateDashboardProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      signal: "none",
      exited: true,
      code: child.exitCode,
      signalCode: child.signalCode
    };
  }

  child.kill("SIGTERM");

  const result = await Promise.race([
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

  return result;
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

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
