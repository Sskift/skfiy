import { classifyTerminalCommand } from "../../shared/risk-policy.js";
import type { GhosttyTaskEvent } from "./events.js";

const GHOSTTY_APP_NAME = "Ghostty";
const GHOSTTY_BUNDLE_ID = "com.mitchellh.ghostty";

export interface DesktopApp {
  name: string;
  bundleId: string;
}

export interface DesktopScreenshot {
  path: string;
}

export interface DesktopClient {
  listApps(): Promise<DesktopApp[]>;
  activateApp(bundleId: string): Promise<void>;
  screenshot(): Promise<DesktopScreenshot>;
  typeText(text: string): Promise<void>;
  pressKey(key: "enter"): Promise<void>;
}

export interface GhosttyTaskOptions {
  approved?: boolean;
  signal?: AbortSignal;
}

export async function* runGhosttyCommandTask(
  client: DesktopClient,
  command: string,
  options: GhosttyTaskOptions = {}
): AsyncGenerator<GhosttyTaskEvent> {
  const risk = classifyTerminalCommand(command);

  yield {
    type: "started",
    command,
    risk
  };

  if (risk.requiresApproval) {
    yield {
      type: "approval_required",
      command,
      risk
    };

    if (!options.approved || risk.level === "blocked") {
      return;
    }
  }

  if (isAborted(options.signal)) {
    return;
  }

  yield {
    type: "locating_app",
    appName: GHOSTTY_APP_NAME
  };

  if (isAborted(options.signal)) {
    return;
  }

  const apps = await client.listApps();
  const ghostty = apps.find((app) => app.bundleId === GHOSTTY_BUNDLE_ID);

  if (!ghostty) {
    throw new Error("Ghostty is not running or could not be found.");
  }

  if (isAborted(options.signal)) {
    return;
  }

  await client.activateApp(ghostty.bundleId);
  yield {
    type: "app_activated",
    appName: ghostty.name,
    bundleId: ghostty.bundleId
  };

  if (isAborted(options.signal)) {
    return;
  }

  const before = await client.screenshot();
  yield {
    type: "screenshot_before",
    path: before.path
  };

  if (isAborted(options.signal)) {
    return;
  }

  await client.typeText(command);
  yield {
    type: "typing",
    command
  };

  if (isAborted(options.signal)) {
    return;
  }

  await client.pressKey("enter");
  yield {
    type: "submitted",
    key: "enter"
  };

  if (isAborted(options.signal)) {
    return;
  }

  const after = await client.screenshot();
  yield {
    type: "screenshot_after",
    path: after.path
  };

  yield {
    type: "completed",
    command,
    summary: "Command submitted to Ghostty."
  };
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}
