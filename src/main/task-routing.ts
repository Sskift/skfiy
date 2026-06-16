import { parseChromePageIntent } from "./orchestrator/chrome-task.js";
import { parseFinderOrganizationIntent } from "./orchestrator/finder-task.js";
import { parseTerminalIntent } from "../shared/terminal-intent.js";

export const GHOSTTY_BUNDLE_ID = "com.mitchellh.ghostty";
export const CHROME_BUNDLE_ID = "com.google.Chrome";
export const FINDER_BUNDLE_ID = "com.apple.finder";

export type CommandRoute =
  | { kind: "ghostty"; bundleId: typeof GHOSTTY_BUNDLE_ID }
  | { kind: "chrome"; bundleId: typeof CHROME_BUNDLE_ID }
  | { kind: "finder"; bundleId: typeof FINDER_BUNDLE_ID }
  | { kind: "chat"; reason: string }
  | { kind: "needs_clarification"; reason: string };

export function selectCommandRoute(command: string): CommandRoute {
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

  const terminalIntent = parseTerminalIntent(command);

  if (terminalIntent.ok) {
    return {
      kind: "ghostty",
      bundleId: GHOSTTY_BUNDLE_ID
    };
  }

  if (isConversationalPrompt(command)) {
    return {
      kind: "chat",
      reason: "Conversational prompt should be answered by the assistant instead of typed into Ghostty."
    };
  }

  return {
    kind: "needs_clarification",
    reason: "No supported desktop control route matched this request."
  };
}

function isConversationalPrompt(command: string): boolean {
  const normalized = command.trim().toLowerCase();

  return [
    "你是谁",
    "你叫什么",
    "你能做什么",
    "介绍一下",
    "你好",
    "hello",
    "hi"
  ].some((phrase) => normalized.includes(phrase));
}
