#!/usr/bin/env node
import { existsSync } from "node:fs";
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
    petClicked: false,
    petDrag: undefined,
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
    dispatchPetPointerEvent.toString(),
    hasWindowBounds.toString(),
    `return inspectPermissionOnboardingExpression(${JSON.stringify(settleMs)});`,
    "})()"
  ].join("\n");
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
    "辅助功能": "accessibility",
    "麦克风": "microphone",
    "语音识别": "speech-recognition"
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

  return new Promise((resolve) => {
    window.setTimeout(() => {
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

      resolve({
        petClicked: Boolean(pet),
        petDrag,
        onboardingVisible: Boolean(onboarding),
        permissionRows,
        permissionSettingTargets,
        visibleText: document.body.innerText.slice(0, 2_000)
      });
    }, settleMs);
  });
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
