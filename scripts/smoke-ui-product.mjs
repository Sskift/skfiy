#!/usr/bin/env node
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  classifyUiSmokeEvidence,
  createDefaultUiSmokeOptions,
  createUiHelpText,
  formatUiLaunchCommand,
  parseUiSmokeArgs,
  writeUiSmokeEvidence
} from "./smoke-ui-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";
import { SKFIY_APP_PROCESS_PATTERN } from "./skfiy-process-matching.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";

async function main() {
  const defaults = createDefaultUiSmokeOptions(ROOT_DIR);
  const options = parseUiSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createUiHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    launch: formatUiLaunchCommand(options),
    appLaunchViaOpen: true,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: options.productPath,
    artifactPath: options.outputPath,
    requiredPermissionLabels: options.requiredPermissionLabels,
    permissions: undefined,
    permissionDiagnostics: undefined,
    desktopSessionDiagnostics: undefined,
    startupWarnings: undefined,
    runtimeStatus: undefined,
    rendererScreenshot: undefined,
    layoutDiagnostics: undefined,
    petClicked: false,
    petDrag: undefined,
    stopTurnBehavior: undefined,
    onboardingVisible: false,
    permissionRows: [],
    permissionSettingTargets: [],
    result: "not-run"
  };
  let smokeLock;

  try {
    assertUiSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:ui"
    });

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
      await cdp.send("Page.enable");

      evidence.permissions = await evaluateValue(cdp, "window.skfiy.getPermissions()");
      evidence.permissionDiagnostics = await evaluateValue(
        cdp,
        "window.skfiy.getPermissionDiagnostics()"
      );
      evidence.desktopSessionDiagnostics = await evaluateValue(
        cdp,
        "window.skfiy.getDesktopSessionDiagnostics()"
      );
      evidence.runtimeStatus = await evaluateValue(cdp, "window.skfiy.getRuntimeStatus()");
      evidence.startupWarnings = await evaluateValue(cdp, "window.skfiy.getStartupWarnings()");

      Object.assign(
        evidence,
        await evaluateValue(
          cdp,
          createInspectPermissionOnboardingExpression(options.settleMs)
        )
      );
      evidence.layoutDiagnostics = await evaluateValue(
        cdp,
        createInspectSettingsLayoutExpression(options.settleMs)
      );
      evidence.rendererScreenshot = await captureRendererScreenshot(cdp, options);
      evidence.result = classifyUiSmokeEvidence(evidence);
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
    await smokeLock?.release();

    if (options.outputPath) {
      try {
        await writeUiSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

function assertUiSmokeReady(options) {
  if (!existsSync(options.appPath)) {
    throw new Error(`App bundle is missing at ${options.appPath}. Run npm run build first.`);
  }

  if (typeof WebSocket !== "function") {
    throw new Error("This smoke script requires a Node runtime with global WebSocket support.");
  }
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
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return {
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

async function evaluateValue(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (response.exceptionDetails) {
    throw new Error(formatRuntimeExceptionDetails(response.exceptionDetails));
  }

  return response.result?.value;
}

function createInspectPermissionOnboardingExpression(settleMs) {
  return [
    "(() => {",
    inspectPermissionOnboardingExpression.toString(),
    exercisePetDrag.toString(),
    exerciseStopTurnBehavior.toString(),
    waitForTaskEvent.toString(),
    dispatchPetPointerEvent.toString(),
    hasWindowBounds.toString(),
    `return inspectPermissionOnboardingExpression(${JSON.stringify(settleMs)});`,
    "})()"
  ].join("\n");
}

function createInspectSettingsLayoutExpression(settleMs) {
  return [
    "(() => {",
    inspectSettingsLayoutExpression.toString(),
    readButtonIconAlignmentDiagnostics.toString(),
    rectToPlainObject.toString(),
    roundMetric.toString(),
    `return inspectSettingsLayoutExpression(${JSON.stringify(settleMs)});`,
    "})()"
  ].join("\n");
}

async function captureRendererScreenshot(cdp, options) {
  if (!options.outputPath) {
    return {
      source: "cdp Page.captureScreenshot",
      path: null,
      exists: false,
      bytes: 0
    };
  }

  const outputPath = replaceOutputExtension(options.outputPath, ".png");
  const response = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true
  });
  const bytes = Buffer.from(String(response.data ?? ""), "base64");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);

  return {
    source: "cdp Page.captureScreenshot",
    path: outputPath,
    exists: true,
    bytes: bytes.length
  };
}

function replaceOutputExtension(outputPath, extension) {
  const parsed = path.parse(outputPath);
  return path.join(parsed.dir, `${parsed.name}${extension}`);
}

function formatRuntimeExceptionDetails(exceptionDetails) {
  const parts = [
    exceptionDetails.exception?.description,
    exceptionDetails.text,
    exceptionDetails.stackTrace?.callFrames
      ?.map((frame) => `${frame.functionName || "<anonymous>"}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`)
      .join("\n")
  ].filter(Boolean);

  return parts.join("\n") || "Renderer evaluation failed.";
}

async function quitSkfiy() {
  await execFileAsync("osascript", [
    "-e",
    `tell application id "${BUNDLE_IDENTIFIER}" to quit`
  ]).catch(() => undefined);
}

async function readSkfiyProcesses() {
  return readProcessLines(SKFIY_APP_PROCESS_PATTERN);
}

async function readProcessLines(pattern) {
  const script = `ps -axo pid=,command= | grep -E ${JSON.stringify(pattern)} | grep -v grep || true`;
  const { stdout } = await execFileAsync("sh", ["-c", script]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function inspectPermissionOnboardingExpression(settleMs) {
  const permissionTargets = {
    "屏幕录制": "screen-recording",
    "辅助功能": "accessibility"
  };
  const pet = Array.from(document.querySelectorAll("[aria-label]")).find((element) =>
    /skfiy codex-style pet/i.test(element.getAttribute("aria-label") ?? "")
  );
  const petDrag = await exercisePetDrag(pet);

  if (pet) {
    pet.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  await new Promise((resolve) => window.setTimeout(resolve, settleMs));

  const onboarding = document.querySelector('[aria-label="权限引导"]');
  const permissionRows = onboarding
    ? Array.from(onboarding.querySelectorAll(".permission-row")).map((row) => {
        const label = row.querySelector("span")?.textContent?.trim() ?? "";
        const stateText = row.querySelector("strong")?.textContent?.trim() ?? "";
        const state = row.querySelector("strong")?.getAttribute("data-state") ?? "";
        const buttonLabel = row.querySelector("button")?.getAttribute("aria-label") ?? "";

        return {
          label,
          state,
          stateText,
          buttonLabel
        };
      })
    : [];
  const permissionSettingTargets = permissionRows
    .filter((row) => row.buttonLabel)
    .map((row) => ({
      label: row.label,
      target: permissionTargets[row.label] ?? "unknown",
      buttonLabel: row.buttonLabel
    }));
  const stopTurnBehavior = await exerciseStopTurnBehavior();

  return {
    petClicked: Boolean(pet),
    petDrag,
    stopTurnBehavior,
    onboardingVisible: Boolean(onboarding),
    permissionRows,
    permissionSettingTargets,
    visibleText: document.body.innerText.slice(0, 2_000)
  };
}

async function inspectSettingsLayoutExpression(settleMs) {
  const pet = Array.from(document.querySelectorAll("[aria-label]")).find((element) =>
    /skfiy codex-style pet/i.test(element.getAttribute("aria-label") ?? "")
  );

  if (pet) {
    pet.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  await new Promise((resolve) => window.setTimeout(resolve, settleMs));
  document.querySelector('[aria-label="权限"]')?.scrollIntoView({
    block: "nearest",
    inline: "nearest"
  });
  await new Promise((resolve) => window.setTimeout(resolve, 120));

  return {
    settingsVisible: Boolean(document.querySelector('[aria-label="skfiy settings"]')),
    permissionPanelVisible: Boolean(document.querySelector('[aria-label="权限"]')),
    buttonIconAlignment: readButtonIconAlignmentDiagnostics(),
    visibleText: document.body.innerText.slice(0, 2_000)
  };
}

function readButtonIconAlignmentDiagnostics() {
  const items = Array.from(document.querySelectorAll("button"))
    .flatMap((button) => {
      const icon = button.querySelector("svg");

      if (!icon) {
        return [];
      }

      const buttonRect = button.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const centerDeltaX = roundMetric(
        iconRect.left + iconRect.width / 2 - (buttonRect.left + buttonRect.width / 2)
      );
      const centerDeltaY = roundMetric(
        iconRect.top + iconRect.height / 2 - (buttonRect.top + buttonRect.height / 2)
      );
      const maxCenterDelta = roundMetric(Math.max(Math.abs(centerDeltaX), Math.abs(centerDeltaY)));

      return [{
        label: button.getAttribute("aria-label") || button.textContent.trim().slice(0, 80),
        button: rectToPlainObject(buttonRect),
        icon: rectToPlainObject(iconRect),
        centerDeltaX,
        centerDeltaY,
        maxCenterDelta,
        aligned: maxCenterDelta <= 1.5
      }];
    });
  const maxCenterDelta = roundMetric(
    Math.max(0, ...items.map((item) => item.maxCenterDelta))
  );

  return {
    result: items.length === 0
      ? "missing"
      : items.every((item) => item.aligned)
        ? "passed"
        : "misaligned",
    maxCenterDelta,
    threshold: 1.5,
    items
  };
}

function rectToPlainObject(rect) {
  return {
    x: roundMetric(rect.x),
    y: roundMetric(rect.y),
    width: roundMetric(rect.width),
    height: roundMetric(rect.height),
    top: roundMetric(rect.top),
    right: roundMetric(rect.right),
    bottom: roundMetric(rect.bottom),
    left: roundMetric(rect.left)
  };
}

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

async function exercisePetDrag(pet) {
  const skfiy = window.skfiy;
  const moveEvents = [
    { deltaX: 12, deltaY: -58 },
    { deltaX: 0, deltaY: -30 }
  ];

  if (
    !pet
    || typeof PointerEvent !== "function"
    || typeof skfiy?.moveWindowBy !== "function"
    || typeof skfiy?.getWindowBounds !== "function"
  ) {
    return {
      result: "missing",
      source: "renderer-pointer-events-window-bounds",
      beforeBounds: null,
      afterBounds: null,
      moveEvents,
      totalDeltaX: 0,
      totalDeltaY: 0,
      upwardMovement: false,
      suppressedClickAfterDrag: false
    };
  }

  const beforeBounds = await skfiy.getWindowBounds();

  dispatchPetPointerEvent(pet, "pointerdown", { screenX: 100, screenY: 100, buttons: 1 });
  dispatchPetPointerEvent(pet, "pointermove", { screenX: 112, screenY: 42, buttons: 1 });
  dispatchPetPointerEvent(pet, "pointermove", { screenX: 112, screenY: 12, buttons: 1 });
  dispatchPetPointerEvent(pet, "pointerup", { screenX: 112, screenY: 12, buttons: 0 });
  await new Promise((resolve) => window.setTimeout(resolve, 250));

  const afterBounds = await skfiy.getWindowBounds();

  pet.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window
  }));

  const totalDeltaX = hasWindowBounds(beforeBounds) && hasWindowBounds(afterBounds)
    ? afterBounds.x - beforeBounds.x
    : 0;
  const totalDeltaY = hasWindowBounds(beforeBounds) && hasWindowBounds(afterBounds)
    ? afterBounds.y - beforeBounds.y
    : 0;
  const suppressedClickAfterDrag = !document.querySelector('[aria-label="权限引导"]');

  return {
    result: hasWindowBounds(beforeBounds)
      && hasWindowBounds(afterBounds)
      && totalDeltaY < 0
      && suppressedClickAfterDrag
      ? "passed"
      : "failed",
    source: "renderer-pointer-events-window-bounds",
    beforeBounds,
    afterBounds,
    moveEvents,
    totalDeltaX,
    totalDeltaY,
    upwardMovement: totalDeltaY < 0,
    suppressedClickAfterDrag
  };
}

function dispatchPetPointerEvent(pet, type, { screenX, screenY, buttons }) {
  pet.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    pointerId: 41,
    pointerType: "mouse",
    button: 0,
    buttons,
    screenX,
    screenY,
    clientX: 48,
    clientY: 48
  }));
}

async function exerciseStopTurnBehavior() {
  const skfiy = window.skfiy;
  const command = "mkdir skfiy-stop-smoke";

  if (
    !skfiy
    || typeof skfiy.runCommand !== "function"
    || typeof skfiy.onTaskEvent !== "function"
  ) {
    return {
      result: "missing",
      source: "renderer-escape-key-product-path",
      command,
      beforeStatus: "missing",
      afterStatus: "missing",
      beforeMessage: "",
      afterMessage: ""
    };
  }

  const events = [];
  const unsubscribe = skfiy.onTaskEvent((event) => {
    events.push(event);
  });

  try {
    await skfiy.runCommand(command, { mode: "active" });
    const before = await waitForTaskEvent(events, (event) => event.status === "approval_required");

    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    }));

    const after = await waitForTaskEvent(
      events,
      (event) => event.status === "idle" && typeof event.message === "string"
        && event.message.includes("Task stopped")
    );

    return {
      result: before?.status === "approval_required" && after?.status === "idle" ? "passed" : "failed",
      source: "renderer-escape-key-product-path",
      command,
      beforeStatus: before?.status ?? "missing",
      afterStatus: after?.status ?? "missing",
      beforeMessage: before?.message ?? "",
      afterMessage: after?.message ?? "",
      eventCount: events.length
    };
  } catch (error) {
    return {
      result: "failed",
      source: "renderer-escape-key-product-path",
      command,
      beforeStatus: "error",
      afterStatus: "error",
      beforeMessage: "",
      afterMessage: error instanceof Error ? error.message : String(error),
      eventCount: events.length
    };
  } finally {
    unsubscribe();
  }
}

async function waitForTaskEvent(events, predicate) {
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    const event = events.find(predicate);
    if (event) {
      return event;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  return undefined;
}

function hasWindowBounds(bounds) {
  return bounds
    && typeof bounds === "object"
    && Number.isFinite(bounds.x)
    && Number.isFinite(bounds.y)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main();
