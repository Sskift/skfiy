#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  CURRENT_PAGE_COMMAND,
  FALLBACK_PRODUCT_PATH,
  FALLBACK_SWITCH_PRODUCT_PATH,
  classifyChromeBringYourOwnCurrentPageEvidence,
  classifyChromeCurrentPageSmokeEvidence,
  classifyChromeFallbackSwitchEvidence,
  classifyChromeFallbackSmokeEvidence,
  classifyChromeSmokeEvidence,
  createDefaultChromeSmokeOptions,
  createHelpText,
  EXPECTED_TEXT,
  FORM_EXPECTED_TEXT,
  INSTALLED_EXTENSION_PRODUCT_PATH,
  NATIVE_HOST_BRIDGE_PRODUCT_PATH,
  parseChromeSmokeArgs,
  PRODUCT_PATH,
  selectInstalledExtensionChromeApp
} from "./smoke-chrome-plan.mjs";
import { writeSmokeEvidence } from "./smoke-ghostty-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";
import { SKFIY_APP_PROCESS_PATTERN } from "./skfiy-process-matching.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";
const FORM_FIELDS = [
  { selector: "#name", value: "skfiy" },
  { selector: "#email", value: "agent@skfiy.test" },
  { selector: "#role", value: "operator" }
];
const SENSITIVE_FORM_FIELDS = [
  { selector: "#password", value: "skfiy-test-secret" }
];
const EXPECTED_CURRENT_PAGE_COMMAND = "观察 Chrome 当前页面并提取正文";

async function main() {
  const defaults = createDefaultChromeSmokeOptions(ROOT_DIR);
  const options = parseChromeSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createHelpText(defaults));
    return;
  }

  const chromeEndpoint = options.currentPageEndpoint ?? `http://127.0.0.1:${options.chromePort}`;
  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    chromeAppName: options.chromeAppName,
    launch: formatLaunchCommand(options, chromeEndpoint),
    fallbackLaunch: formatFallbackLaunchCommand(options),
    chromeLaunch: options.currentPageEndpoint
      ? `provided Chrome CDP endpoint: ${options.currentPageEndpoint}`
      : formatChromeLaunchCommand(options),
    appLaunchViaOpen: true,
    chromeLaunchViaOpen: options.currentPageEndpoint ? false : true,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: PRODUCT_PATH,
    fallbackProductPath: FALLBACK_PRODUCT_PATH,
    fallbackSwitchProductPath: FALLBACK_SWITCH_PRODUCT_PATH,
    targetMode: options.currentPageEndpoint ? "bring-your-own-current-page" : "fixture-suite",
    artifactPath: options.outputPath,
    fixtureRoot: undefined,
    pageUrl: undefined,
    sensitivePageUrl: undefined,
    formPageUrl: undefined,
    chromeEndpoint,
    currentPageEndpoint: options.currentPageEndpoint,
    command: undefined,
    currentPageCommand: CURRENT_PAGE_COMMAND,
    sensitiveCommand: undefined,
    formCommand: undefined,
    sensitiveFormCommand: undefined,
    extractedText: "",
    events: [],
    realCurrentPageRun: undefined,
    currentPageRun: undefined,
    sensitiveRun: undefined,
    formRun: undefined,
    sensitiveFormRun: undefined,
    nativeHostBridgeRun: undefined,
    installedExtensionRun: undefined,
    fallbackRun: undefined,
    fallbackSwitchRun: undefined,
    permissions: undefined,
    runtimeStatus: undefined,
    startupWarnings: undefined,
    appPolicySettings: undefined,
    result: "not-run"
  };
  let smokeLock;

  try {
    assertChromeSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:chrome"
    });
    evidence.nativeHostBridgeRun = await runChromeNativeHostBridgeSmoke(options);
    evidence.installedExtensionRun = await runInstalledChromeExtensionSmoke(options);

    if (options.currentPageEndpoint) {
      if (!options.keepExisting) {
        await quitSkfiy();
        await sleep(700);
      }

      await launchSkfiy(options, chromeEndpoint);
      evidence.processesAfterLaunch = await readSkfiyProcesses();

      const page = await waitForRendererPage(options.port, options.timeoutMs);
      const cdp = await createCdpClient(page.webSocketDebuggerUrl);

      try {
        await cdp.send("Runtime.enable");
        await cdp.send("Runtime.addBinding", { name: "skfiyChromeSmokeEvent" });
        await cdp.send("Runtime.evaluate", {
          expression: installEventSinkExpression(),
          awaitPromise: true,
          returnByValue: true
        });

        await readRendererEvidence(cdp, evidence);
        evidence.realCurrentPageRun = await runChromeBringYourOwnCurrentPageCommand(
          cdp,
          options,
          evidence
        );
        evidence.currentPageRun = evidence.realCurrentPageRun;
        evidence.events = evidence.realCurrentPageRun.events;
        evidence.result = evidence.realCurrentPageRun.result;
        if (
          evidence.result === "passed"
          && (
            evidence.nativeHostBridgeRun.result !== "passed"
            || !isInstalledExtensionSmokeAcceptable(evidence.installedExtensionRun)
          )
        ) {
          evidence.result = "failed";
        }
      } finally {
        cdp.close();
      }

      if (options.requirePassed && evidence.result !== "passed") {
        process.exitCode = 2;
      }

      return;
    }

    const fixture = await createChromeFixture();
    evidence.fixtureRoot = fixture.rootPath;
    evidence.pageUrl = fixture.url;
    evidence.sensitivePageUrl = fixture.sensitiveUrl;
    evidence.formPageUrl = fixture.formUrl;
    evidence.command = `打开 Chrome 测试页面 ${fixture.url} 并提取正文`;
    evidence.sensitiveCommand = `打开 Chrome 测试页面 ${fixture.sensitiveUrl} 并提取正文`;
    evidence.formCommand = `填写 Chrome 测试表单 ${fixture.formUrl} 字段 ${formatFormAssignments(FORM_FIELDS)} 点击 #submit 并提取正文`;
    evidence.sensitiveFormCommand = `填写 Chrome 测试表单 ${fixture.formUrl} 字段 ${formatFormAssignments(SENSITIVE_FORM_FIELDS)} 点击 #submit 并提取正文`;

    if (!options.keepExisting) {
      await quitSkfiy();
      await killChromeSmokeProcesses(fixture.chromeUserDataDir);
      await sleep(700);
    }

    await launchChrome(options, fixture.chromeUserDataDir);
    await waitForChromeEndpoint(options.chromePort, options.timeoutMs);
    evidence.chromeProcessesAfterLaunch = await readChromeSmokeProcesses(fixture.chromeUserDataDir);

    await launchSkfiy(options, chromeEndpoint);
    evidence.processesAfterLaunch = await readSkfiyProcesses();

    const page = await waitForRendererPage(options.port, options.timeoutMs);
    const cdp = await createCdpClient(page.webSocketDebuggerUrl);

    try {
      await cdp.send("Runtime.enable");
      await cdp.send("Runtime.addBinding", { name: "skfiyChromeSmokeEvent" });
      await cdp.send("Runtime.evaluate", {
        expression: installEventSinkExpression(),
        awaitPromise: true,
        returnByValue: true
      });

      const primaryEvents = await runChromeProductCommand(
        cdp,
        evidence.command,
        options
      );

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
      evidence.events = primaryEvents;
      evidence.extractedText = extractCompletedChromeText(primaryEvents);
      evidence.result = classifyChromeSmokeEvidence(evidence);

      const currentPageEvents = await runChromeProductCommand(
        cdp,
        evidence.currentPageCommand,
        options
      );
      const currentPageText = extractCompletedChromeCurrentPageText(currentPageEvents);
      const currentPageSnapshot = extractChromeCurrentPageSnapshot(currentPageEvents);
      evidence.currentPageRun = {
        command: evidence.currentPageCommand,
        pageSnapshot: currentPageSnapshot,
        events: currentPageEvents,
        extractedText: currentPageText,
        result: classifyChromeCurrentPageSmokeEvidence({
          ...evidence,
          events: currentPageEvents,
          pageSnapshot: currentPageSnapshot
        })
      };

      if (evidence.result === "passed" && evidence.currentPageRun.result !== "passed") {
        evidence.result = "failed";
      }

      const sensitiveEvents = await runChromeProductCommand(
        cdp,
        evidence.sensitiveCommand,
        options
      );
      evidence.sensitiveRun = {
        pageUrl: evidence.sensitivePageUrl,
        command: evidence.sensitiveCommand,
        events: sensitiveEvents,
        result: classifyChromeSmokeEvidence({
          ...evidence,
          events: sensitiveEvents,
          extractedText: ""
        })
      };

      if (evidence.result === "passed" && evidence.sensitiveRun.result !== "sensitive-paused") {
        evidence.result = "failed";
      }

      const formEvents = await runChromeProductCommand(
        cdp,
        evidence.formCommand,
        options
      );
      const formText = extractCompletedChromeText(formEvents);
      evidence.formRun = {
        pageUrl: evidence.formPageUrl,
        command: evidence.formCommand,
        fields: FORM_FIELDS,
        events: formEvents,
        extractedText: formText,
        result: classifyChromeSmokeEvidence({
          ...evidence,
          events: formEvents,
          extractedText: formText,
          expectedText: FORM_EXPECTED_TEXT
        })
      };

      if (evidence.result === "passed" && evidence.formRun.result !== "passed") {
        evidence.result = "failed";
      }

      const sensitiveFormEvents = await runChromeProductCommand(
        cdp,
        evidence.sensitiveFormCommand,
        options
      );
      evidence.sensitiveFormRun = {
        pageUrl: evidence.formPageUrl,
        command: evidence.sensitiveFormCommand,
        fields: SENSITIVE_FORM_FIELDS,
        events: sensitiveFormEvents,
        result: classifyChromeSmokeEvidence({
          ...evidence,
          events: sensitiveFormEvents,
          extractedText: ""
        })
      };

      if (evidence.result === "passed" && evidence.sensitiveFormRun.result !== "sensitive-paused") {
        evidence.result = "failed";
      }

      const fallback = await runChromeFallbackProductCommand(
        options,
        evidence.command
      );
      evidence.fallbackRun = {
        command: evidence.command,
        productPath: FALLBACK_PRODUCT_PATH,
        appLaunchViaOpen: true,
        runnerHasTmux: Boolean(process.env.TMUX),
        events: fallback.events,
        processesAfterLaunch: fallback.processesAfterLaunch,
        result: classifyChromeFallbackSmokeEvidence({
          events: fallback.events,
          appLaunchViaOpen: true,
          runnerHasTmux: Boolean(process.env.TMUX),
          productPath: FALLBACK_PRODUCT_PATH
        })
      };

      if (
        evidence.result === "passed"
        && !["fallback-observed", "fallback-blocked"].includes(evidence.fallbackRun.result)
      ) {
        evidence.result = "failed";
      }

      const fallbackSwitch = await runChromeFallbackSwitchProductCommand(
        options,
        evidence.command
      );
      evidence.fallbackSwitchRun = {
        command: evidence.command,
        productPath: FALLBACK_SWITCH_PRODUCT_PATH,
        configuredEndpoint: fallbackSwitch.configuredEndpoint,
        launch: fallbackSwitch.launch,
        appLaunchViaOpen: true,
        runnerHasTmux: Boolean(process.env.TMUX),
        events: fallbackSwitch.events,
        processesAfterLaunch: fallbackSwitch.processesAfterLaunch,
        result: classifyChromeFallbackSwitchEvidence({
          events: fallbackSwitch.events,
          appLaunchViaOpen: true,
          runnerHasTmux: Boolean(process.env.TMUX),
          productPath: FALLBACK_SWITCH_PRODUCT_PATH,
          configuredEndpoint: fallbackSwitch.configuredEndpoint
        })
      };

      if (
        evidence.result === "passed"
        && !["fallback-switched-observed", "fallback-switched-blocked"].includes(
          evidence.fallbackSwitchRun.result
        )
      ) {
        evidence.result = "failed";
      }
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
      await sleep(500);
      evidence.processesAfterCleanup = await readSkfiyProcesses();
    }
    if (evidence.fixtureRoot) {
      await killChromeSmokeProcesses(path.join(evidence.fixtureRoot, "chrome-profile"));
      await sleep(500);
      evidence.chromeProcessesAfterCleanup = await readChromeSmokeProcesses(
        path.join(evidence.fixtureRoot, "chrome-profile")
      );
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

function assertChromeSmokeReady(options) {
  if (!existsSync(options.appPath)) {
    throw new Error(`App bundle is missing at ${options.appPath}. Run npm run build first.`);
  }
  if (!existsSync(options.cliPath)) {
    throw new Error(`Packaged skfiy CLI is missing at ${options.cliPath}. Run npm run build first.`);
  }

  if (typeof WebSocket !== "function") {
    throw new Error("This smoke script requires a Node runtime with global WebSocket support.");
  }

  if (CURRENT_PAGE_COMMAND !== EXPECTED_CURRENT_PAGE_COMMAND) {
    throw new Error("Chrome current-page smoke command changed without updating product evidence.");
  }
}

async function runChromeNativeHostBridgeSmoke(options) {
  const launchOrigin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";
  const requestId = "chrome-smoke-native-host";
  const hostPolicyRequestId = "chrome-smoke-host-policy";
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "skfiy-chrome-native-host-"));
  const heartbeatPath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "skfiy",
    "chrome-extension-connection.json"
  );
  const command = [options.cliPath, launchOrigin];
  const message = {
    schemaVersion: 1,
    type: "skfiy.page.observe",
    requestId,
    payload: { currentTab: true }
  };
  const hostPolicyMessage = {
    schemaVersion: 1,
    type: "skfiy.host_policy.request",
    requestId: hostPolicyRequestId
  };

  try {
    const { code, signal, stdout, stderr } = await runNativeHostFrame({
      command,
      homeDir,
      message
    });
    const response = readNativeHostResponse(stdout);
    const heartbeat = JSON.parse(await readFile(heartbeatPath, "utf8"));
    const policyRun = await runNativeHostFrame({
      command,
      homeDir,
      message: hostPolicyMessage
    });
    const hostPolicyResponse = readNativeHostResponse(policyRun.stdout);
    const passed = code === 0
      && signal === null
      && policyRun.code === 0
      && policyRun.signal === null
      && response?.type === "skfiy.native.response"
      && response?.requestId === requestId
      && response?.result === "accepted"
      && hostPolicyResponse?.type === "skfiy.native.response"
      && hostPolicyResponse?.requestId === hostPolicyRequestId
      && hostPolicyResponse?.result === "accepted"
      && hostPolicyResponse?.hostPolicy?.schemaVersion === 1
      && hostPolicyResponse?.hostPolicy?.policy?.defaultMode === "ask"
      && heartbeat?.hostName === "com.sskift.skfiy"
      && heartbeat?.launchOrigin === launchOrigin
      && heartbeat?.messageType === "skfiy.page.observe"
      && heartbeat?.requestId === requestId;

    return {
      result: passed ? "passed" : "failed",
      productPath: NATIVE_HOST_BRIDGE_PRODUCT_PATH,
      command,
      exitCode: code,
      signal,
      response,
      hostPolicyExitCode: policyRun.code,
      hostPolicySignal: policyRun.signal,
      hostPolicyResponse,
      heartbeatPath,
      heartbeat,
      stderr: [stderr, policyRun.stderr].filter(Boolean).join("\n")
    };
  } catch (error) {
    return {
      result: "error",
      productPath: NATIVE_HOST_BRIDGE_PRODUCT_PATH,
      command,
      heartbeatPath,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
}

async function runInstalledChromeExtensionSmoke(options) {
  const extensionPath = path.join(ROOT_DIR, "chrome-extension");
  const requestId = "chrome-smoke-installed-extension";
  const homeDir = os.homedir();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skfiy-chrome-extension-smoke-"));
  const chromeUserDataDir = path.join(tempRoot, "chrome-profile");
  const chromePort = options.chromePort + 2000;
  const browserSelection = selectInstalledExtensionChromeApp({
    chromeAppName: options.chromeAppName,
    extensionChromeAppName: options.extensionChromeAppName,
    availableAppNames: discoverInstalledExtensionChromeAppNames()
  });
  const extensionChromeAppName = browserSelection.chromeAppName;
  const heartbeatPath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "skfiy",
    "chrome-extension-connection.json"
  );
  let manifestPath;
  let manifestBackup;
  let heartbeatBackup;
  let extensionId;
  let launchOrigin;
  let extensionPageUrl;
  let response;

  try {
    await launchChromeWithExtension({
      chromeAppName: extensionChromeAppName,
      chromeUserDataDir,
      chromePort,
      extensionPath
    });
    const firstWorker = await findSkfiyExtensionWorker(chromePort, options.timeoutMs);
    if (!firstWorker.worker) {
      return createInstalledExtensionLoadBlockedRun({
        chromeAppName: extensionChromeAppName,
        browserSelection,
        chromePort,
        chromeUserDataDir,
        extensionPath,
        heartbeatPath,
        diagnostic: firstWorker
      });
    }

    const { worker: loadedWorker } = firstWorker;
    extensionId = readExtensionIdFromUrl(loadedWorker.url);
    launchOrigin = `chrome-extension://${extensionId}/`;
    await killChromeSmokeProcesses(chromeUserDataDir);
    await sleep(500);

    manifestPath = createNativeMessagingHostManifestPath(homeDir, extensionChromeAppName);
    manifestBackup = await readOptionalFile(manifestPath);
    heartbeatBackup = await readOptionalFile(heartbeatPath);
    await writeNativeMessagingHostManifest({
      homeDir,
      cliPath: options.cliPath,
      extensionId,
      chromeAppName: extensionChromeAppName
    });

    await launchChromeWithExtension({
      chromeAppName: extensionChromeAppName,
      chromeUserDataDir,
      chromePort,
      extensionPath
    });
    await waitForChromeEndpoint(chromePort, options.timeoutMs);
    const secondWorker = await findSkfiyExtensionWorker(chromePort, options.timeoutMs);
    if (!secondWorker.worker) {
      return createInstalledExtensionLoadBlockedRun({
        chromeAppName: extensionChromeAppName,
        browserSelection,
        chromePort,
        chromeUserDataDir,
        extensionPath,
        heartbeatPath,
        manifestPath,
        diagnostic: secondWorker
      });
    }

    extensionPageUrl = secondWorker.worker.url;
    const cdp = await createCdpClient(secondWorker.worker.webSocketDebuggerUrl);

    try {
      await cdp.send("Runtime.enable");
      const evaluation = await cdp.send("Runtime.evaluate", {
        expression: createInstalledExtensionNativeMessageExpression(requestId),
        awaitPromise: true,
        returnByValue: true
      });
      response = readInstalledExtensionNativeMessageEvaluation(evaluation);
    } finally {
      cdp.close();
    }

    let heartbeat;
    let heartbeatReadError;
    try {
      heartbeat = JSON.parse(await readFile(heartbeatPath, "utf8"));
    } catch (error) {
      heartbeatReadError = error instanceof Error ? error.message : String(error);
    }
    const passed = response?.type === "skfiy.native.response"
      && response?.requestId === requestId
      && response?.result === "accepted"
      && heartbeat?.hostName === "com.sskift.skfiy"
      && heartbeat?.launchOrigin === launchOrigin
      && heartbeat?.messageType === "skfiy.page.observe"
      && heartbeat?.requestId === requestId;

    return {
      result: passed ? "passed" : "failed",
      productPath: INSTALLED_EXTENSION_PRODUCT_PATH,
      chromeLaunch: formatChromeExtensionLaunchCommand(
        extensionChromeAppName,
        chromePort,
        chromeUserDataDir,
        extensionPath
      ),
      browserSelection,
      chromePort,
      extensionPath,
      extensionPageUrl,
      extensionId,
      launchOrigin,
      firstWorkerUrl: loadedWorker.url,
      response,
      heartbeatPath,
      ...(heartbeat ? { heartbeat } : {}),
      ...(heartbeatReadError ? { heartbeatReadError } : {}),
      manifestPath,
      processesAfterLaunch: await readChromeSmokeProcesses(chromeUserDataDir)
    };
  } catch (error) {
    return {
      result: "error",
      productPath: INSTALLED_EXTENSION_PRODUCT_PATH,
      extensionPath,
      browserSelection,
      chromePort,
      ...(extensionId ? { extensionId } : {}),
      ...(launchOrigin ? { launchOrigin } : {}),
      ...(extensionPageUrl ? { extensionPageUrl } : {}),
      ...(response ? { response } : {}),
      ...(manifestPath ? { manifestPath } : {}),
      heartbeatPath,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await killChromeSmokeProcesses(chromeUserDataDir);
    await sleep(500);
    if (manifestPath && manifestBackup) {
      await restoreOptionalFile(manifestPath, manifestBackup);
    }
    if (heartbeatBackup) {
      await restoreOptionalFile(heartbeatPath, heartbeatBackup);
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function launchChromeWithExtension({
  chromeAppName,
  chromeUserDataDir,
  chromePort,
  extensionPath
}) {
  await execFileAsync("open", [
    "-na",
    chromeAppName,
    "--args",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeUserDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "about:blank"
  ]);
}

async function writeNativeMessagingHostManifest({
  homeDir,
  cliPath,
  extensionId,
  chromeAppName
}) {
  const manifestPath = createNativeMessagingHostManifestPath(homeDir, chromeAppName);
  const manifest = {
    name: "com.sskift.skfiy",
    description: "skfiy desktop Computer Use bridge",
    path: cliPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`]
  };

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifestPath;
}

function createNativeMessagingHostManifestPath(homeDir, chromeAppName = "") {
  const supportRoot = readChromeNativeMessagingSupportRoot(chromeAppName);
  return path.join(
    homeDir,
    "Library",
    "Application Support",
    ...supportRoot,
    "NativeMessagingHosts",
    "com.sskift.skfiy.json"
  );
}

function readChromeNativeMessagingSupportRoot(chromeAppName) {
  if (/Chrome for Testing/i.test(chromeAppName)) {
    return ["Google", "ChromeForTesting"];
  }

  if (/Chromium/i.test(chromeAppName)) {
    return ["Chromium"];
  }

  return ["Google", "Chrome"];
}

function discoverInstalledExtensionChromeAppNames() {
  const appNames = [
    "Google Chrome for Testing",
    "Chromium",
    "Google Chrome"
  ];

  return appNames.filter((appName) => isMacAppInstalled(appName));
}

function isMacAppInstalled(appName) {
  return [
    path.join("/Applications", `${appName}.app`),
    path.join(os.homedir(), "Applications", `${appName}.app`)
  ].some((appPath) => existsSync(appPath));
}

function formatChromeExtensionLaunchCommand(chromeAppName, chromePort, chromeUserDataDir, extensionPath) {
  return `open -na ${chromeAppName} --args --remote-debugging-port=${chromePort} --user-data-dir=${chromeUserDataDir} --load-extension=${extensionPath}`;
}

async function readOptionalFile(targetPath) {
  if (!existsSync(targetPath)) {
    return { exists: false, content: "" };
  }

  return {
    exists: true,
    content: await readFile(targetPath, "utf8")
  };
}

async function restoreOptionalFile(targetPath, backup) {
  if (backup.exists) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, backup.content);
    return;
  }

  await rm(targetPath, { force: true });
}

function createInstalledExtensionLoadBlockedRun({
  chromeAppName,
  browserSelection,
  chromePort,
  chromeUserDataDir,
  extensionPath,
  heartbeatPath,
  manifestPath,
  diagnostic
}) {
  const blockedReason = isBrandedChromeLoadExtensionRemoved({
    chromeAppName,
    chromeVersion: diagnostic.chromeVersion
  })
    ? "branded_chrome_load_extension_removed"
    : "skfiy_extension_worker_not_loaded";

  return {
    result: blockedReason === "branded_chrome_load_extension_removed" ? "blocked" : "error",
    productPath: INSTALLED_EXTENSION_PRODUCT_PATH,
    chromeLaunch: formatChromeExtensionLaunchCommand(
      chromeAppName,
      chromePort,
      chromeUserDataDir,
      extensionPath
    ),
    browserSelection,
    chromePort,
    chromeVersion: diagnostic.chromeVersion,
    extensionPath,
    heartbeatPath,
    ...(manifestPath ? { manifestPath } : {}),
    blockedReason,
    recommendedBrowser: "Chrome for Testing or Chromium",
    diagnosticTargets: diagnostic.targets,
    diagnosticExtensions: diagnostic.extensions
  };
}

function isInstalledExtensionSmokeAcceptable(run) {
  return run?.result === "passed"
    || (
      run?.result === "blocked"
      && run?.blockedReason === "branded_chrome_load_extension_removed"
    );
}

function isBrandedChromeLoadExtensionRemoved({ chromeAppName, chromeVersion }) {
  return /Google Chrome/i.test(chromeAppName)
    && !/Chrome for Testing/i.test(chromeAppName)
    && readChromeMajorVersion(chromeVersion) >= 137;
}

function readChromeMajorVersion(chromeVersion) {
  const matched = String(chromeVersion ?? "").match(/(?:Chrome|Chromium)\/(\d+)/i);
  return matched ? Number.parseInt(matched[1], 10) : 0;
}

async function findSkfiyExtensionWorker(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  let lastExtensions = [];
  let chromeVersion = "";
  let lastError;

  while (Date.now() < deadline) {
    try {
      chromeVersion = chromeVersion || await readChromeVersion(port).catch(() => "");
      const targets = await readChromeTargets(port);
      lastTargets = targets;
      lastExtensions = [];
      const workers = targets.filter((target) =>
        target.type === "service_worker"
          && typeof target.url === "string"
          && target.url.startsWith("chrome-extension://")
          && typeof target.webSocketDebuggerUrl === "string"
      );

      for (const worker of workers) {
        const extension = await readExtensionWorkerIdentity(worker).catch((error) => ({
          url: worker.url,
          error: error instanceof Error ? error.message : String(error)
        }));
        lastExtensions.push(extension);

        if (extension.manifestName === "skfiy Chrome Adapter") {
          return {
            worker,
            targets: summarizeChromeTargets(lastTargets),
            extensions: lastExtensions,
            chromeVersion
          };
        }
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  return {
    worker: undefined,
    targets: summarizeChromeTargets(lastTargets),
    extensions: lastExtensions,
    chromeVersion,
    error: lastError instanceof Error ? lastError.message : undefined
  };
}

async function readChromeVersion(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) {
    throw new Error(`Chrome CDP version endpoint returned HTTP ${response.status}.`);
  }

  const version = await response.json();
  return typeof version.Browser === "string" ? version.Browser : "";
}

async function readChromeTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`Chrome CDP target list returned HTTP ${response.status}.`);
  }

  return response.json();
}

function summarizeChromeTargets(targets) {
  return targets.map((target) => ({
    type: target.type,
    url: target.url,
    title: target.title
  }));
}

async function readExtensionWorkerIdentity(worker) {
  const cdp = await createCdpClient(worker.webSocketDebuggerUrl);

  try {
    await cdp.send("Runtime.enable");
    const evaluation = await cdp.send("Runtime.evaluate", {
      expression: "JSON.stringify({ id: chrome.runtime.id, manifestName: chrome.runtime.getManifest().name, permissions: chrome.runtime.getManifest().permissions ?? [] })",
      awaitPromise: true,
      returnByValue: true
    });
    const value = evaluation.result?.value;
    const parsed = typeof value === "string" ? JSON.parse(value) : {};

    return {
      url: worker.url,
      id: parsed.id,
      manifestName: parsed.manifestName,
      permissions: parsed.permissions
    };
  } finally {
    cdp.close();
  }
}

function readExtensionIdFromUrl(url) {
  const matched = url.match(/^chrome-extension:\/\/([^/]+)\//);
  if (!matched?.[1]) {
    throw new Error(`Could not read extension id from URL: ${url}`);
  }

  return matched[1];
}

function createInstalledExtensionNativeMessageExpression(requestId) {
  return `(() => new Promise((resolve) => {
    const finishJson = (response) => resolve(JSON.stringify(response));
    if (typeof chrome.runtime.connectNative !== "function") {
      finishJson({
        type: "skfiy.native.message",
        schemaVersion: 1,
        requestId: ${JSON.stringify(requestId)},
        ok: false,
        error: "native_messaging_api_unavailable",
        runtimeKeys: Object.keys(chrome.runtime).sort(),
        manifestPermissions: chrome.runtime.getManifest().permissions ?? []
      });
      return;
    }

    const port = chrome.runtime.connectNative("com.sskift.skfiy");
    let settled = false;
    const timeout = setTimeout(() => finish({
      type: "skfiy.native.message",
      schemaVersion: 1,
      requestId: ${JSON.stringify(requestId)},
      ok: false,
      error: "native_host_timeout"
    }), 5000);
    const finish = (response) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      try {
        port.disconnect();
      } catch {}
      finishJson(response);
    };
    port.onMessage.addListener((response) => finish(response));
    port.onDisconnect.addListener(() => finish({
      type: "skfiy.native.message",
      schemaVersion: 1,
      requestId: ${JSON.stringify(requestId)},
      ok: false,
      error: chrome.runtime.lastError?.message ?? "native_host_disconnected"
    }));
    port.postMessage({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      requestId: ${JSON.stringify(requestId)},
      payload: { currentTab: true }
    });
  }))()`;
}

function readInstalledExtensionNativeMessageEvaluation(evaluation) {
  const value = evaluation.result?.value;
  if (typeof value !== "string") {
    return {
      ok: false,
      error: "extension_evaluation_not_json",
      valueType: typeof value,
      resultType: evaluation.result?.type,
      resultSubtype: evaluation.result?.subtype,
      exceptionText: evaluation.exceptionDetails?.text,
      exceptionDescription: evaluation.exceptionDetails?.exception?.description
    };
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return {
      ok: false,
      error: "extension_evaluation_invalid_json",
      raw: value,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function runNativeHostFrame({ command, homeDir, message }) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    const frame = Buffer.alloc(payload.byteLength + 4);
    frame.writeUInt32LE(payload.byteLength, 0);
    payload.copy(frame, 4);

    const child = spawn(command[0], command.slice(1), {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        HOME: homeDir,
        SKFIY_NATIVE_MESSAGING_HOST: "1"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({
        code: code ?? 1,
        signal,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
    child.stdin.end(frame);
  });
}

function readNativeHostResponse(stdout) {
  if (!Buffer.isBuffer(stdout) || stdout.byteLength < 4) {
    throw new Error("Chrome Native Messaging host did not write a response frame.");
  }

  const payloadByteLength = stdout.readUInt32LE(0);
  if (stdout.byteLength < payloadByteLength + 4) {
    throw new Error("Chrome Native Messaging host wrote an incomplete response frame.");
  }

  return JSON.parse(stdout.subarray(4, 4 + payloadByteLength).toString("utf8"));
}

function formatLaunchCommand(options, chromeEndpoint) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port} --skfiy-chrome-cdp-endpoint=${chromeEndpoint}`;
}

function formatFallbackLaunchCommand(options) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port}`;
}

function formatFallbackSwitchLaunchCommand(options, configuredEndpoint) {
  return `open -na ${options.appPath} --args --remote-debugging-port=${options.port} --skfiy-chrome-cdp-endpoint=${configuredEndpoint}`;
}

function formatChromeLaunchCommand(options) {
  return `open -na ${options.chromeAppName} --args --remote-debugging-port=${options.chromePort}`;
}

async function createChromeFixture() {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skfiy-chrome-smoke-"));
  const chromeUserDataDir = path.join(rootPath, "chrome-profile");
  const pagePath = path.join(rootPath, "index.html");
  const sensitivePagePath = path.join(rootPath, "sensitive.html");
  const formPagePath = path.join(rootPath, "form.html");
  await writeFile(pagePath, `<!doctype html>
<html>
  <head><title>skfiy chrome smoke</title></head>
  <body><main>${EXPECTED_TEXT}</main></body>
</html>
`);
  await writeFile(sensitivePagePath, `<!doctype html>
<html>
  <head><title>skfiy sensitive smoke</title></head>
  <body><main>Enter password and one-time code</main></body>
</html>
`);
  await writeFile(formPagePath, `<!doctype html>
<html>
  <head><title>skfiy form smoke</title></head>
  <body>
    <main>
      <form id="profile">
        <label>Name <input id="name" name="name" /></label>
        <label>Email <input id="email" name="email" /></label>
        <label>Role <input id="role" name="role" /></label>
        <button id="submit" type="submit">Submit</button>
      </form>
      <p id="result">waiting for input</p>
    </main>
    <script>
      document.querySelector("#profile").addEventListener("submit", (event) => {
        event.preventDefault();
        document.querySelector("#result").textContent =
          document.querySelector("#name").value + " "
          + document.querySelector("#email").value + " "
          + document.querySelector("#role").value + " form submitted";
      });
    </script>
  </body>
</html>
`);
  return {
    rootPath,
    chromeUserDataDir,
    url: pathToFileURL(pagePath).href,
    sensitiveUrl: pathToFileURL(sensitivePagePath).href,
    formUrl: pathToFileURL(formPagePath).href
  };
}

function formatFormAssignments(fields) {
  return fields.map((field) => `${field.selector}=${field.value}`).join("; ");
}

async function launchChrome(options, chromeUserDataDir) {
  await execFileAsync("open", [
    "-n",
    "-a",
    options.chromeAppName,
    "--args",
    `--remote-debugging-port=${options.chromePort}`,
    `--user-data-dir=${chromeUserDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ]);
}

async function launchSkfiy(options, chromeEndpoint) {
  await execFileAsync("open", [
    "-n",
    "-a",
    options.appPath,
    "--args",
    `--remote-debugging-port=${options.port}`,
    `--skfiy-chrome-cdp-endpoint=${chromeEndpoint}`
  ]);
}

async function launchSkfiyWithoutChromeEndpoint(options) {
  await execFileAsync("open", [
    "-n",
    "-a",
    options.appPath,
    "--args",
    `--remote-debugging-port=${options.port}`
  ]);
}

async function runChromeFallbackProductCommand(options, command) {
  await quitSkfiy();
  await sleep(500);
  await launchSkfiyWithoutChromeEndpoint(options);
  const processesAfterLaunch = await readSkfiyProcesses();
  const page = await waitForRendererPage(options.port, options.timeoutMs);
  const cdp = await createCdpClient(page.webSocketDebuggerUrl);

  try {
    await cdp.send("Runtime.enable");
    await cdp.send("Runtime.addBinding", { name: "skfiyChromeSmokeEvent" });
    await cdp.send("Runtime.evaluate", {
      expression: installEventSinkExpression(),
      awaitPromise: true,
      returnByValue: true
    });

    return {
      events: await runChromeProductCommand(cdp, command, options),
      processesAfterLaunch
    };
  } finally {
    cdp.close();
  }
}

async function runChromeFallbackSwitchProductCommand(options, command) {
  await quitSkfiy();
  await sleep(500);
  const configuredEndpoint = readBrokenChromeEndpoint(options);
  const launch = formatFallbackSwitchLaunchCommand(options, configuredEndpoint);
  await launchSkfiy(options, configuredEndpoint);
  const processesAfterLaunch = await readSkfiyProcesses();
  const page = await waitForRendererPage(options.port, options.timeoutMs);
  const cdp = await createCdpClient(page.webSocketDebuggerUrl);

  try {
    await cdp.send("Runtime.enable");
    await cdp.send("Runtime.addBinding", { name: "skfiyChromeSmokeEvent" });
    await cdp.send("Runtime.evaluate", {
      expression: installEventSinkExpression(),
      awaitPromise: true,
      returnByValue: true
    });

    return {
      configuredEndpoint,
      launch,
      events: await runChromeProductCommand(cdp, command, options),
      processesAfterLaunch
    };
  } finally {
    cdp.close();
  }
}

async function runChromeBringYourOwnCurrentPageCommand(cdp, options, evidence) {
  const events = await runChromeProductCommand(cdp, CURRENT_PAGE_COMMAND, options);
  const extractedText = extractCompletedChromeCurrentPageText(events);
  const pageSnapshot = extractChromeCurrentPageSnapshot(events);

  return {
    command: CURRENT_PAGE_COMMAND,
    chromeEndpoint: options.currentPageEndpoint,
    productPath: PRODUCT_PATH,
    appLaunchViaOpen: true,
    chromeLaunchViaOpen: false,
    runnerHasTmux: Boolean(process.env.TMUX),
    pageSnapshot,
    events,
    extractedText,
    result: classifyChromeBringYourOwnCurrentPageEvidence({
      ...evidence,
      chromeEndpoint: options.currentPageEndpoint,
      chromeLaunchViaOpen: false,
      events,
      pageSnapshot
    })
  };
}

async function readRendererEvidence(cdp, evidence) {
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
}

function readBrokenChromeEndpoint(options) {
  return `http://127.0.0.1:${options.chromePort + 1000}`;
}

async function waitForChromeEndpoint(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const pages = await response.json();
        if (pages.some((page) => page.type === "page" && page.webSocketDebuggerUrl)) {
          return;
        }
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Timed out waiting for Chrome CDP on port ${port}.`
      + (lastError instanceof Error ? ` Last error: ${lastError.message}` : "")
  );
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
      && message.params?.name === "skfiyChromeSmokeEvent"
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

async function runChromeProductCommand(cdp, command, options) {
  const startIndex = cdp.events.length;
  await cdp.send("Runtime.evaluate", {
    expression:
      `window.skfiy.runCommand(${JSON.stringify(command)}, { mode: "active" })`,
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
  return cdp.events.slice(startIndex);
}

function installEventSinkExpression() {
  return `(() => {
    if (!window.skfiy) {
      throw new Error("window.skfiy preload API is unavailable.");
    }

    if (!window.__skfiyChromeSmokeInstalled) {
      window.__skfiyChromeSmokeInstalled = true;
      window.skfiy.onTaskEvent((event) => {
        globalThis.skfiyChromeSmokeEvent(JSON.stringify(event));
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
      || status === "needs_confirmation"
      || status === "idle"
    ) {
      return;
    }

    await sleep(250);
  }
}

function extractCompletedChromeText(events) {
  const completed = events.findLast((event) =>
    event?.status === "completed"
      && typeof event.message === "string"
      && event.message.startsWith("Chrome test page extracted:")
  );

  return completed?.message?.slice("Chrome test page extracted:".length).trim() ?? "";
}

function extractCompletedChromeCurrentPageText(events) {
  const prefix = "Chrome current page extracted:";
  const completed = events.findLast((event) =>
    event?.status === "completed"
      && typeof event.message === "string"
      && event.message.startsWith(prefix)
  );

  return completed?.message?.slice(prefix.length).trim() ?? "";
}

function extractChromeCurrentPageSnapshot(events) {
  const extractedText = extractCompletedChromeCurrentPageText(events);
  const event = events.findLast((item) =>
    item?.status === "executing"
      && typeof item.message === "string"
      && item.message.startsWith("Verified current_page_snapshot:")
  );
  const matched = event?.message?.match(
    /^Verified current_page_snapshot: Observed current page: (.*) \((.*)\)$/
  );

  return {
    title: matched?.[1]?.trim() ?? "",
    url: matched?.[2]?.trim() ?? "",
    text: extractedText
  };
}

async function quitSkfiy() {
  await execFileAsync("osascript", [
    "-e",
    `tell application id "${BUNDLE_IDENTIFIER}" to quit`
  ]).catch(() => undefined);
}

async function killChromeSmokeProcesses(chromeUserDataDir) {
  await execFileAsync("pkill", ["-f", chromeUserDataDir]).catch(() => undefined);
}

async function readSkfiyProcesses() {
  return readProcessLines(SKFIY_APP_PROCESS_PATTERN);
}

async function readChromeSmokeProcesses(chromeUserDataDir) {
  return readProcessLines(chromeUserDataDir);
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
