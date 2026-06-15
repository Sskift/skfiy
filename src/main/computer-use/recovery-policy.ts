import type { DesktopAppState, DesktopWindowInfo } from "./types.js";

export type AppRecoveryDecision =
  | { type: "continue" }
  | { type: "recover"; action: "activate" | "open"; reason: string }
  | { type: "ask_user"; reason: string }
  | { type: "pause"; reason: string };

export interface AppRecoveryTarget {
  bundleId: string;
  pid?: number;
  marker?: string;
  sensitiveTitlePatterns?: RegExp[];
}

export function decideAppRecovery(
  observation: DesktopAppState,
  target: AppRecoveryTarget
): AppRecoveryDecision {
  const windows = observation.windows ?? [];

  if (hasSensitiveWindow(windows, target.sensitiveTitlePatterns ?? [])) {
    return {
      type: "pause",
      reason: "Sensitive UI is visible."
    };
  }

  if (!observation.isRunning || windows.length === 0) {
    return {
      type: "recover",
      action: "open",
      reason: "Target app is not running or has no observable windows."
    };
  }

  const markedWindowCount = countMarkedWindows(windows, target.marker);
  if (markedWindowCount > 1) {
    return {
      type: "ask_user",
      reason: "Multiple marked target windows were observed."
    };
  }

  if (
    !observation.isActive
    || (observation.frontmostBundleId && observation.frontmostBundleId !== target.bundleId)
  ) {
    return {
      type: "recover",
      action: "activate",
      reason: "Target app is running but not frontmost."
    };
  }

  return { type: "continue" };
}

function hasSensitiveWindow(
  windows: readonly DesktopWindowInfo[],
  patterns: readonly RegExp[]
): boolean {
  return windows.some((window) => {
    const title = window.title ?? "";
    return patterns.some((pattern) => pattern.test(title));
  });
}

function countMarkedWindows(
  windows: readonly DesktopWindowInfo[],
  marker: string | undefined
): number {
  if (!marker) {
    return 0;
  }

  const normalizedMarker = marker.toLowerCase();
  return windows.filter((window) => {
    const title = window.title?.toLowerCase() ?? "";
    return title.includes(normalizedMarker);
  }).length;
}
