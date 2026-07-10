import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from "node:fs";
import path from "node:path";
import {
  compactRecord,
  readBoolean,
  readErrorMessage,
  readNumber,
  readRecord,
  readString
} from "./cli-record-utils.js";

export function withFinderSmokeStatus<TStatus extends Record<string, unknown>>(
  status: TStatus,
  context: { rootDir: string }
): TStatus & { finder: Record<string, unknown> } {
  const permissions = readRecord(status.permissions);
  const finder = readRecord(status.finder);
  const existingLatestSmoke = readRecord(finder?.latestSmoke);
  const latestSmoke = existingLatestSmoke ?? readLatestFinderSmokeEvidence(context.rootDir);
  const existingAutomation = readRecord(finder?.automation);
  const permissionState =
    readString(existingAutomation?.permissionState)
    ?? readString(permissions?.finderAutomation)
    ?? "unknown";
  const evidence = readString(latestSmoke.automationEvidence) ?? "unknown";

  return {
    ...status,
    finder: {
      ...finder,
      automation: {
        ...existingAutomation,
        state: readString(existingAutomation?.state)
          ?? createFinderAutomationState(permissionState, latestSmoke),
        permissionState,
        evidence
      },
      latestSmoke
    }
  };
}

export function readLatestFinderSmokeEvidence(rootDir: string): Record<string, unknown> {
  const smokeDir = path.join(rootDir, ".skfiy-smoke");

  if (!existsSync(smokeDir)) {
    return {
      state: "missing",
      automationEvidence: "unknown",
      directory: smokeDir,
      reason: "No Finder smoke artifact has been collected yet."
    };
  }

  const candidates: Array<{
    artifact: Record<string, unknown>;
    filePath: string;
    mtimeMs: number;
  }> = [];

  try {
    for (const entry of readdirSync(smokeDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(smokeDir, entry.name);
      const artifact = readSmokeArtifactFile(filePath);

      if (!artifact || !isFinderSmokeArtifact(entry.name, artifact)) {
        continue;
      }

      candidates.push({
        artifact,
        filePath,
        mtimeMs: statSync(filePath).mtimeMs
      });
    }
  } catch (error) {
    return {
      state: "unavailable",
      automationEvidence: "unknown",
      directory: smokeDir,
      reason: readErrorMessage(error)
    };
  }

  const latest = candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  if (!latest) {
    return {
      state: "missing",
      automationEvidence: "unknown",
      directory: smokeDir,
      reason: "No Finder smoke artifact has been collected yet."
    };
  }

  return createFinderSmokeEvidenceSummary(latest);
}

export function createFinderAutomationState(
  permissionState: string | undefined,
  latestSmoke: Record<string, unknown> | undefined
): string {
  if (permissionState === "granted") {
    return "granted";
  }

  if (readString(latestSmoke?.automationEvidence) === "proven") {
    return "proven-by-smoke";
  }

  if (readString(latestSmoke?.automationEvidence) === "blocked") {
    return "blocked-by-permission";
  }

  return "unknown";
}

export function isFinderSmokeDesktopPreflightBlocked(
  latestSmoke: Record<string, unknown> | undefined
): boolean {
  const desktopPreflight = readRecord(latestSmoke?.desktopPreflight);

  return readString(desktopPreflight?.result) === "blocked"
    && (
      readBoolean(desktopPreflight?.controllable) === false
      || readString(desktopPreflight?.frontmostBundleId) === "com.apple.loginwindow"
      || readBoolean(desktopPreflight?.mainDisplayAsleep) === true
      || /desktop session|loginwindow|display.*asleep|unlock/i.test(readString(desktopPreflight?.reason) ?? "")
    );
}

export function createFinderDesktopPreflightDiagnosticMessage(
  latestSmoke: Record<string, unknown>
): string {
  const desktopPreflight = readRecord(latestSmoke.desktopPreflight);
  const details = [
    readString(desktopPreflight?.frontmostBundleId)
      ? `frontmostBundleId=${readString(desktopPreflight?.frontmostBundleId)}`
      : undefined,
    readBoolean(desktopPreflight?.mainDisplayAsleep) === true
      ? "mainDisplayAsleep=true"
      : undefined,
    readBoolean(desktopPreflight?.controllable) === false
      ? "controllable=false"
      : undefined
  ].filter(Boolean).join(", ");
  const suffix = details ? ` (${details})` : "";

  return `Finder Automation has not been proven because the latest Finder smoke was blocked by desktop preflight${suffix}.`;
}

export function createFinderAutomationPermissionDiagnosticMessage(
  latestSmoke: Record<string, unknown>
): string {
  const reason = [
    readString(readRecord(latestSmoke.finderObservation)?.reason),
    readString(readRecord(latestSmoke.finderSemanticObservation)?.reason),
    readString(readRecord(latestSmoke.finderItemDragDrop)?.reason)
  ].find(Boolean);

  return reason
    ? `Finder Automation appears blocked by macOS Automation permission: ${reason}`
    : "Finder Automation appears blocked by macOS Automation permission.";
}

export function createFinderSmokeRerunAction(): string {
  return "Wake and unlock the Mac, keep the display awake, then rerun `npm run smoke:finder -- --output .skfiy-smoke/finder-current.json --require-passed`.";
}

function readSmokeArtifactFile(filePath: string): Record<string, unknown> | undefined {
  try {
    return readRecord(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return undefined;
  }
}

function isFinderSmokeArtifact(fileName: string, artifact: Record<string, unknown>): boolean {
  return fileName.startsWith("finder") || readString(artifact.target) === "finder";
}

function createFinderSmokeEvidenceSummary({
  artifact,
  filePath,
  mtimeMs
}: {
  artifact: Record<string, unknown>;
  filePath: string;
  mtimeMs: number;
}): Record<string, unknown> {
  const desktopPreflight = readFinderDesktopPreflightSummary(readRecord(artifact.desktopPreflight));
  const finderObservation = readFinderStepSummary(readRecord(artifact.finderObservation));
  const finderSemanticObservation = readFinderStepSummary(readRecord(artifact.finderSemanticObservation));
  const finderItemDragDrop = readFinderStepSummary(readRecord(artifact.finderItemDragDrop));
  const result = readString(artifact.result) ?? "unknown";
  const automationEvidence = readFinderAutomationEvidence({
    result,
    desktopPreflight,
    finderObservation,
    finderSemanticObservation,
    finderItemDragDrop
  });
  const state = createFinderSmokeState({ result, automationEvidence, desktopPreflight });

  return compactRecord({
    state,
    result,
    automationEvidence,
    path: filePath,
    mtimeMs,
    timestamp: readString(artifact.timestamp),
    productPath: readString(artifact.productPath),
    desktopPreflight,
    finderObservation,
    finderSemanticObservation,
    finderItemDragDrop,
    nextAction: createFinderSmokeNextAction(state, automationEvidence)
  });
}

function readFinderDesktopPreflightSummary(
  desktopPreflight: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!desktopPreflight) {
    return undefined;
  }

  const frontmost = readRecord(desktopPreflight.frontmost);
  const display = readRecord(desktopPreflight.display);

  return compactRecord({
    result: readString(desktopPreflight.result),
    reason: readString(desktopPreflight.reason),
    controllable: readBoolean(desktopPreflight.controllable),
    frontmostBundleId: readString(frontmost?.bundleId),
    frontmostLocalizedName: readString(frontmost?.localizedName),
    frontmostProcessIdentifier: readNumber(frontmost?.processIdentifier),
    mainDisplayAsleep: readBoolean(display?.mainDisplayAsleep)
  });
}

function readFinderStepSummary(step: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!step) {
    return undefined;
  }

  return compactRecord({
    result: readString(step.result),
    reason: readString(step.reason),
    accessibilityTrusted: readBoolean(step.accessibilityTrusted)
  });
}

function readFinderAutomationEvidence({
  result,
  desktopPreflight,
  finderObservation,
  finderSemanticObservation,
  finderItemDragDrop
}: {
  result: string;
  desktopPreflight?: Record<string, unknown>;
  finderObservation?: Record<string, unknown>;
  finderSemanticObservation?: Record<string, unknown>;
  finderItemDragDrop?: Record<string, unknown>;
}): "proven" | "blocked" | "unproven" | "unknown" {
  if (
    result === "passed"
    || readString(finderObservation?.result) === "passed"
    || readString(finderSemanticObservation?.result) === "passed"
    || readString(finderItemDragDrop?.result) === "passed"
  ) {
    return "proven";
  }

  if (hasFinderAutomationPermissionReason([
    readString(finderObservation?.reason),
    readString(finderSemanticObservation?.reason),
    readString(finderItemDragDrop?.reason)
  ])) {
    return "blocked";
  }

  if (isFinderSmokeDesktopPreflightBlocked({ desktopPreflight })) {
    return "unproven";
  }

  return result === "unknown" ? "unknown" : "unproven";
}

function createFinderSmokeState({
  result,
  automationEvidence,
  desktopPreflight
}: {
  result: string;
  automationEvidence: string;
  desktopPreflight?: Record<string, unknown>;
}): string {
  if (automationEvidence === "proven") {
    return "proven";
  }

  if (automationEvidence === "blocked") {
    return "blocked-by-permission";
  }

  if (isFinderSmokeDesktopPreflightBlocked({ desktopPreflight })) {
    return "blocked-by-desktop-preflight";
  }

  return result;
}

function hasFinderAutomationPermissionReason(reasons: Array<string | undefined>): boolean {
  return reasons.some((reason) => Boolean(
    reason
    && /(finder automation|automation permission|apple events?|not authorized to send apple events|not permitted to control finder|tcc)/i.test(reason)
  ));
}

function createFinderSmokeNextAction(state: string, automationEvidence: string): string {
  if (automationEvidence === "blocked") {
    return "Open System Settings > Privacy & Security > Automation and grant skfiy permission to control Finder, then rerun the Finder smoke.";
  }

  if (state === "blocked-by-desktop-preflight") {
    return createFinderSmokeRerunAction();
  }

  return "Run a Finder smoke once and grant Finder Automation when macOS prompts.";
}
