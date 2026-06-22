import { parseChromePageIntent } from "./orchestrator/chrome-task.js";
import { parseFinderOrganizationIntent } from "./orchestrator/finder-task.js";
import { parseTerminalIntent } from "../shared/terminal-intent.js";

export const GHOSTTY_BUNDLE_ID = "com.mitchellh.ghostty";
export const CHROME_BUNDLE_ID = "com.google.Chrome";
export const FINDER_BUNDLE_ID = "com.apple.finder";
const GENERIC_VISIBLE_APP_CLARIFICATION_REASON =
  "Generic visible-app control is not a supported product route yet. Name Ghostty, Chrome/Chromium, Finder, or money-run supervision.";

export type CommandRoute =
  | { kind: "ghostty"; bundleId: typeof GHOSTTY_BUNDLE_ID }
  | { kind: "chrome"; bundleId: typeof CHROME_BUNDLE_ID }
  | { kind: "finder"; bundleId: typeof FINDER_BUNDLE_ID }
  | { kind: "tmux_supervision"; sessionName: "money-run" }
  | { kind: "chat"; reason: string }
  | { kind: "needs_clarification"; reason: string };

export function selectCommandRoute(command: string): CommandRoute {
  if (isMoneyRunSupervisionRequest(command)) {
    return {
      kind: "tmux_supervision",
      sessionName: "money-run"
    };
  }

  const chromeIntent = parseChromePageIntent(command);
  if (chromeIntent.ok) {
    return {
      kind: "chrome",
      bundleId: CHROME_BUNDLE_ID
    };
  }

  const finderIntent = parseFinderOrganizationIntent(command);

  if (finderIntent.ok) {
    return {
      kind: "finder",
      bundleId: FINDER_BUNDLE_ID
    };
  }

  if (isUnsupportedVisibleAppControlRequest(command)) {
    return {
      kind: "needs_clarification",
      reason: GENERIC_VISIBLE_APP_CLARIFICATION_REASON
    };
  }

  if (isShortGreetingPrompt(command)) {
    return createChatRoute();
  }

  const terminalIntent = parseTerminalIntent(command);

  if (terminalIntent.ok && isExplicitTerminalControlRequest(command)) {
    return {
      kind: "ghostty",
      bundleId: GHOSTTY_BUNDLE_ID
    };
  }

  if (isConversationalPrompt(command)) {
    return createChatRoute();
  }

  return {
    kind: "needs_clarification",
    reason: "No supported desktop control route matched this request."
  };
}

function createChatRoute(): CommandRoute {
  return {
    kind: "chat",
    reason: "Conversational prompt should be answered by the assistant instead of typed into Ghostty."
  };
}

function isShortGreetingPrompt(command: string): boolean {
  const normalized = normalizeConversationalPrompt(command);

  return /^(hello|hi|hey|yo|你好|哈喽|哈啰|嗨)(\s+(skfiy|assistant|bot))?$/.test(normalized);
}

function isConversationalPrompt(command: string): boolean {
  const normalized = normalizeConversationalPrompt(command);

  return [
    "你是谁",
    "你叫什么",
    "你能做什么",
    "介绍一下"
  ].some((phrase) => normalized.includes(phrase));
}

function normalizeConversationalPrompt(command: string): string {
  return command
    .trim()
    .toLowerCase()
    .replace(/^[\s,，。.!！?？、]+|[\s,，。.!！?？、]+$/g, "")
    .replace(/\s+/g, " ");
}

function isExplicitTerminalControlRequest(command: string): boolean {
  const normalized = command.trim().toLowerCase();

  return /\b(ghostty|terminal|shell|term)\b|终端|命令行/u.test(normalized);
}

function isMoneyRunSupervisionRequest(command: string): boolean {
  const normalized = command.trim().toLowerCase();

  if (!normalized.includes("money-run")) {
    return false;
  }

  const mentionsTmuxContext = /\btmux\b|\bsession\b|会话/u.test(normalized);
  const asksForSupervision = [
    "监督",
    "观察",
    "监控",
    "看着",
    "盯着",
    "supervise",
    "monitor",
    "watch",
    "observe"
  ].some((phrase) => normalized.includes(phrase));

  return mentionsTmuxContext && asksForSupervision;
}

function isUnsupportedVisibleAppControlRequest(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  const asksForDesktopControl = /输入|点击|点|观察|查看|读取|截图|按|拖|滚动|\b(type|click|observe|watch|read|inspect|capture|press|drag|scroll)\b/u
    .test(normalized);

  if (!asksForDesktopControl) {
    return false;
  }

  const namesSupportedApp = /\b(ghostty|chrome|chromium|finder)\b/u.test(normalized);
  const namesUnsupportedApp = !namesSupportedApp
    && /(?:用|在)\s+[a-z][a-z0-9 ._-]*\s*(?:输入|点击|点|观察|查看|读取|截图|按|拖|滚动)/u
      .test(normalized);
  const namesGenericVisibleTarget =
    /\b(any|current|frontmost)\s+visible\s+(app|application|window|button)\b|\bvisible\s+(app|application)\b|当前屏幕可见|屏幕可见|当前可见\s*(app|应用|程序|窗口|按钮)?|可见\s*(app|应用|程序|窗口|按钮)|任意.*(app|应用|程序)/u
      .test(normalized);

  return namesUnsupportedApp || namesGenericVisibleTarget;
}
