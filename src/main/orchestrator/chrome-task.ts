import { buildCdpCommand, type CdpCommand } from "../computer-use/browser-control.js";
import { createSensitiveTextPatterns } from "../computer-use/sensitive-ui-policy.js";
import type { RiskDecision } from "../../shared/types.js";

const CHROME_APP_NAME = "Chrome";
const CHROME_PAGE_PREFIX = "打开 Chrome 测试页面 ";
const CHROME_PAGE_SUFFIX = " 并提取正文";

const CHROME_PAGE_RISK: RiskDecision = {
  level: "medium",
  reason: "Chrome test-page control navigates the browser and reads page text.",
  requiresApproval: true
};
const SENSITIVE_CHROME_TEXT_PATTERNS = createSensitiveTextPatterns();

export interface ChromeTaskClient {
  sendCdpCommand(command: CdpCommand): Promise<unknown>;
  waitForPageReady?: () => Promise<void>;
}

export type ChromeTaskEvent =
  | {
      type: "started";
      command: string;
      risk: RiskDecision;
    }
  | {
      type: "approval_required";
      command: string;
      risk: RiskDecision;
    }
  | {
      type: "locating_app";
      appName: string;
    }
  | {
      type: "action_verified";
      actionType: "navigate" | "extract_text";
      status: "passed";
      message: string;
    }
  | {
      type: "verification_failed";
      stage: "input" | "connection" | "navigation" | "extraction" | "sensitive";
      reason: string;
    }
  | {
      type: "completed";
      command: string;
      summary: string;
    };

export interface ChromeTaskOptions {
  approved?: boolean;
}

export async function* runChromePageTask(
  input: string,
  client: ChromeTaskClient | undefined,
  options: ChromeTaskOptions = {}
): AsyncGenerator<ChromeTaskEvent> {
  const parsed = parseChromePageIntent(input);
  const command = parsed.ok ? parsed.url : input.trim();

  yield {
    type: "started",
    command,
    risk: parsed.ok ? CHROME_PAGE_RISK : blockedDecision(parsed.reason)
  };

  if (!parsed.ok) {
    yield {
      type: "verification_failed",
      stage: "input",
      reason: parsed.reason
    };
    return;
  }

  yield {
    type: "approval_required",
    command: parsed.url,
    risk: CHROME_PAGE_RISK
  };

  if (!options.approved) {
    return;
  }

  if (!client) {
    yield {
      type: "verification_failed",
      stage: "connection",
      reason: "Chrome CDP endpoint is not configured."
    };
    return;
  }

  yield {
    type: "locating_app",
    appName: CHROME_APP_NAME
  };

  try {
    await client.sendCdpCommand(buildCdpCommand({ type: "navigate", url: parsed.url }));
  } catch (error) {
    yield {
      type: "verification_failed",
      stage: "navigation",
      reason: readErrorMessage(error, "Chrome navigation failed.")
    };
    return;
  }

  yield {
    type: "action_verified",
    actionType: "navigate",
    status: "passed",
    message: `Navigated to: ${parsed.url}`
  };

  try {
    await client.waitForPageReady?.();
    const result = await client.sendCdpCommand(buildCdpCommand({ type: "extract_text" }));
    const extractedText = readRuntimeStringResult(result);

    if (hasSensitiveText(extractedText)) {
      yield {
        type: "verification_failed",
        stage: "sensitive",
        reason: "Sensitive UI text is visible."
      };
      return;
    }

    yield {
      type: "action_verified",
      actionType: "extract_text",
      status: "passed",
      message: `Extracted text: ${extractedText}`
    };
    yield {
      type: "completed",
      command: parsed.url,
      summary: `Chrome test page extracted: ${extractedText}`
    };
  } catch (error) {
    yield {
      type: "verification_failed",
      stage: "extraction",
      reason: readErrorMessage(error, "Chrome text extraction failed.")
    };
  }
}

function hasSensitiveText(value: string): boolean {
  return SENSITIVE_CHROME_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

export function parseChromePageIntent(input: string):
  | { ok: true; url: string }
  | { ok: false; reason: string } {
  const trimmed = input.trim();

  if (!trimmed.startsWith(CHROME_PAGE_PREFIX) || !trimmed.endsWith(CHROME_PAGE_SUFFIX)) {
    return {
      ok: false,
      reason: "Chrome page control requires: 打开 Chrome 测试页面 <url> 并提取正文"
    };
  }

  const url = trimmed
    .slice(CHROME_PAGE_PREFIX.length, trimmed.length - CHROME_PAGE_SUFFIX.length)
    .trim();

  if (!isSupportedUrl(url)) {
    return {
      ok: false,
      reason: "Chrome page control requires a file:, http:, or https: URL."
    };
  }

  return {
    ok: true,
    url
  };
}

function blockedDecision(reason: string): RiskDecision {
  return {
    level: "blocked",
    reason,
    requiresApproval: true
  };
}

function isSupportedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "file:" || url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readRuntimeStringResult(value: unknown): string {
  if (
    value
    && typeof value === "object"
    && "result" in value
    && value.result
    && typeof value.result === "object"
    && "value" in value.result
    && typeof value.result.value === "string"
  ) {
    return value.result.value;
  }

  throw new Error("Chrome CDP extraction did not return a string value.");
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
