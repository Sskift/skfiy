#!/usr/bin/env node
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  classifyVoiceSmokeEvidence,
  createDefaultVoiceSmokeOptions,
  createVoiceHelpText,
  formatVoiceLaunchCommand,
  parseVoiceSmokeArgs,
  writeVoiceSmokeEvidence
} from "./smoke-voice-plan.mjs";
import { acquireSmokeLock } from "./smoke-lock.mjs";
import { SKFIY_APP_PROCESS_PATTERN } from "./skfiy-process-matching.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";

async function main() {
  const defaults = createDefaultVoiceSmokeOptions(ROOT_DIR);
  const options = parseVoiceSmokeArgs(process.argv.slice(2), defaults);

  if (options.help) {
    process.stdout.write(createVoiceHelpText(defaults));
    return;
  }

  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    provider: options.provider,
    locale: options.locale,
    launch: formatVoiceLaunchCommand(options),
    appLaunchViaOpen: true,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: options.productPath,
    artifactPath: options.outputPath,
    preparation: undefined,
    permissions: undefined,
    speechStatus: undefined,
    runtimeStatus: undefined,
    startupWarnings: undefined,
    dictationSettingsBefore: undefined,
    dictationSettingsAfter: undefined,
    providerEvents: [],
    transcriptEvents: [],
    taskEvents: [],
    turnReplay: undefined,
    submission: undefined,
    result: "not-run"
  };
  let smokeLock;

  try {
    assertVoiceSmokeReady(options);
    smokeLock = await acquireSmokeLock({
      rootDir: ROOT_DIR,
      scriptName: "smoke:voice"
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
      await cdp.send("Runtime.addBinding", { name: "skfiyVoiceSmokeEvent" });
      await cdp.send("Runtime.evaluate", {
        expression: installVoiceEventSinkExpression(),
        awaitPromise: true,
        returnByValue: true
      });

      evidence.dictationSettingsBefore = await evaluateValue(
        cdp,
        "window.skfiy.getDictationSettings()"
      );
      evidence.permissions = await evaluateValue(cdp, "window.skfiy.getPermissions()");
      evidence.speechStatus = await evaluateValue(
        cdp,
        `window.skfiy.getNativeSpeechStatus(${JSON.stringify(options.locale)})`
      );
      evidence.runtimeStatus = await evaluateValue(cdp, "window.skfiy.getRuntimeStatus()");
      evidence.startupWarnings = await evaluateValue(cdp, "window.skfiy.getStartupWarnings()");

      evidence.dictationSettingsAfter = await evaluateValue(
        cdp,
        `window.skfiy.setDictationSettings({ provider: "native-macos", nativeSpeechLocale: ${JSON.stringify(options.locale)} })`
      );
      evidence.preparation = await evaluateValue(cdp, "window.skfiy.prepareDictation()");

      if (evidence.preparation?.nativeDictationActive) {
        await sleep(options.listenMs);
      } else {
        await sleep(Math.min(options.listenMs, 1_000));
      }

      const finalTranscript = readFinalTranscript(cdp.events);
      if (finalTranscript) {
        evidence.submission = await evaluateValue(
          cdp,
          `window.skfiy.submitDictation(${JSON.stringify(evidence.preparation?.sessionId)}, ${JSON.stringify(finalTranscript)}, { stopNativeDictation: false })`
        );
        await waitForTaskTerminalEvent(cdp.events, Math.min(options.timeoutMs, 5_000));
      }

      await evaluateValue(
        cdp,
        `window.skfiy.stopDictation(${JSON.stringify(evidence.preparation?.sessionId)})`
      );
      await sleep(300);

      evidence.providerEvents = cdp.events
        .filter((event) => event.channel === "provider")
        .map((event) => event.payload);
      evidence.transcriptEvents = cdp.events
        .filter((event) => event.channel === "transcript")
        .map((event) => event.payload);
      evidence.taskEvents = cdp.events
        .filter((event) => event.channel === "task")
        .map((event) => event.payload);
      evidence.turnReplay = await readTurnReplayEvidence(cdp);
      evidence.result = classifyVoiceSmokeEvidence(evidence);
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
        await writeVoiceSmokeEvidence(options.outputPath, evidence);
      } catch (error) {
        evidence.artifactError = error instanceof Error ? error.message : String(error);
        process.exitCode = process.exitCode ?? 1;
      }
    }

    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }
}

function assertVoiceSmokeReady(options) {
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
      && message.params?.name === "skfiyVoiceSmokeEvent"
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

async function evaluateValue(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  return response.result?.value;
}

function readFinalTranscript(events) {
  const transcriptEvents = events
    .filter((event) => event.channel === "transcript")
    .map((event) => event.payload)
    .filter((event) =>
      event?.isFinal === true
      && typeof event.text === "string"
      && event.text.trim().length > 0
    );
  const finalEvent = transcriptEvents.at(-1);

  return typeof finalEvent?.text === "string" ? finalEvent.text.trim() : "";
}

async function waitForTaskTerminalEvent(events, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (events.some((event) =>
      event.channel === "task"
      && ["completed", "failed", "needs_confirmation"].includes(event.payload?.status)
    )) {
      return;
    }

    await sleep(200);
  }
}

async function readTurnReplayEvidence(cdp) {
  const replay = await evaluateValue(cdp, "window.skfiy.getTurnReplay()");
  if (!replay || typeof replay !== "object") {
    return replay;
  }

  return {
    ...replay,
    transcript: {
      ...replay.transcript,
      screenshots: await Promise.all(
        (Array.isArray(replay.transcript?.screenshots) ? replay.transcript.screenshots : [])
          .map(addScreenshotFileSize)
      )
    }
  };
}

async function addScreenshotFileSize(screenshot) {
  if (
    !screenshot
    || typeof screenshot !== "object"
    || typeof screenshot.path !== "string"
    || screenshot.path.trim().length === 0
  ) {
    return screenshot;
  }

  try {
    const screenshotStat = await stat(screenshot.path);
    return {
      ...screenshot,
      bytes: screenshotStat.size
    };
  } catch {
    return {
      ...screenshot,
      bytes: 0
    };
  }
}

function installVoiceEventSinkExpression() {
  return `(() => {
    if (!window.skfiy) {
      throw new Error("window.skfiy preload API is unavailable.");
    }

    if (!window.__skfiyVoiceSmokeInstalled) {
      window.__skfiyVoiceSmokeInstalled = true;
      window.skfiy.onDictationProviderEvent((event) => {
        globalThis.skfiyVoiceSmokeEvent(JSON.stringify({ channel: "provider", payload: event }));
      });
      window.skfiy.onDictationTranscriptEvent((event) => {
        globalThis.skfiyVoiceSmokeEvent(JSON.stringify({ channel: "transcript", payload: event }));
      });
      window.skfiy.onTaskEvent((event) => {
        globalThis.skfiyVoiceSmokeEvent(JSON.stringify({ channel: "task", payload: event }));
      });
    }

    return true;
  })()`;
}

async function quitSkfiy() {
  await execFileAsync("osascript", [
    "-e",
    `tell application id "${BUNDLE_IDENTIFIER}" to quit`
  ]).catch(() => undefined);
}

async function readSkfiyProcesses() {
  try {
    const { stdout } = await execFileAsync("pgrep", [
      "-fl",
      SKFIY_APP_PROCESS_PATTERN
    ]);
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
