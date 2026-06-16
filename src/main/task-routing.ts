import { parseFinderOrganizationIntent } from "./orchestrator/finder-task.js";

export const GHOSTTY_BUNDLE_ID = "com.mitchellh.ghostty";
export const FINDER_BUNDLE_ID = "com.apple.finder";

export type CommandRoute =
  | { kind: "ghostty"; bundleId: typeof GHOSTTY_BUNDLE_ID }
  | { kind: "finder"; bundleId: typeof FINDER_BUNDLE_ID };

export function selectCommandRoute(command: string): CommandRoute {
  const finderIntent = parseFinderOrganizationIntent(command);

  if (finderIntent.ok) {
    return {
      kind: "finder",
      bundleId: FINDER_BUNDLE_ID
    };
  }

  return {
    kind: "ghostty",
    bundleId: GHOSTTY_BUNDLE_ID
  };
}
