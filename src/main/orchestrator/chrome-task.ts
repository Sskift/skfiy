import { buildCdpCommand, type CdpCommand } from "../computer-use/browser-control.js";
import { createSensitiveTextPatterns } from "../computer-use/sensitive-ui-policy.js";
import type { RiskDecision } from "../../shared/types.js";

const CHROME_APP_NAME = "Chrome";
const CHROME_PAGE_PREFIX = "打开 Chrome 测试页面 ";
const CHROME_PAGE_SUFFIX = " 并提取正文";
const CHROME_FORM_PREFIX = "填写 Chrome 测试表单 ";
const CHROME_FORM_SUFFIX = " 并提取正文";
const CHROME_FORM_FIELD_MARKER = " 字段 ";
const CHROME_FORM_CLICK_MARKER = " 点击 ";

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
      actionType: "navigate" | "fill_selector" | "click_selector" | "extract_text";
      status: "passed";
      message: string;
    }
  | {
      type: "verification_failed";
      stage: "input" | "connection" | "navigation" | "interaction" | "extraction" | "sensitive";
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

    if (isChromeFormIntent(parsed)) {
      try {
        await client.sendCdpCommand(buildCdpCommand({
          type: "fill_selector",
          selector: parsed.fieldSelector,
          value: parsed.value
        }));
        yield {
          type: "action_verified",
          actionType: "fill_selector",
          status: "passed",
          message: `Filled ${parsed.fieldSelector}.`
        };

        await client.sendCdpCommand(buildCdpCommand({
          type: "click_selector",
          selector: parsed.submitSelector
        }));
        yield {
          type: "action_verified",
          actionType: "click_selector",
          status: "passed",
          message: `Clicked ${parsed.submitSelector}.`
        };
      } catch (error) {
        yield {
          type: "verification_failed",
          stage: "interaction",
          reason: readErrorMessage(error, "Chrome form interaction failed.")
        };
        return;
      }

      await client.waitForPageReady?.();
    }

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
  | {
      ok: true;
      kind: "form";
      url: string;
      fieldSelector: string;
      value: string;
      submitSelector: string;
    }
  | { ok: false; reason: string } {
  const trimmed = input.trim();

  const formIntent = parseChromeFormIntent(trimmed);
  if (formIntent.ok) {
    return formIntent;
  }

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

function parseChromeFormIntent(input: string):
  | {
      ok: true;
      kind: "form";
      url: string;
      fieldSelector: string;
      value: string;
      submitSelector: string;
    }
  | { ok: false } {
  if (!input.startsWith(CHROME_FORM_PREFIX) || !input.endsWith(CHROME_FORM_SUFFIX)) {
    return { ok: false };
  }

  const body = input
    .slice(CHROME_FORM_PREFIX.length, input.length - CHROME_FORM_SUFFIX.length)
    .trim();
  const fieldIndex = body.indexOf(CHROME_FORM_FIELD_MARKER);
  const clickIndex = body.indexOf(CHROME_FORM_CLICK_MARKER);

  if (fieldIndex <= 0 || clickIndex <= fieldIndex) {
    return { ok: false };
  }

  const url = body.slice(0, fieldIndex).trim();
  const assignment = body
    .slice(fieldIndex + CHROME_FORM_FIELD_MARKER.length, clickIndex)
    .trim();
  const submitSelector = body
    .slice(clickIndex + CHROME_FORM_CLICK_MARKER.length)
    .trim();
  const equalsIndex = assignment.indexOf("=");

  if (equalsIndex <= 0 || !submitSelector) {
    return { ok: false };
  }

  const fieldSelector = assignment.slice(0, equalsIndex).trim();
  const value = assignment.slice(equalsIndex + 1).trim();

  if (!isSupportedUrl(url) || !fieldSelector || !value) {
    return { ok: false };
  }

  return {
    ok: true,
    kind: "form",
    url,
    fieldSelector,
    value,
    submitSelector
  };
}

function isChromeFormIntent(
  intent: { ok: true; url: string } | {
    ok: true;
    kind: "form";
    url: string;
    fieldSelector: string;
    value: string;
    submitSelector: string;
  }
): intent is {
  ok: true;
  kind: "form";
  url: string;
  fieldSelector: string;
  value: string;
  submitSelector: string;
} {
  return "kind" in intent && intent.kind === "form";
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
