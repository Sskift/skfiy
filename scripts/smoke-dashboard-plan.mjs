import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

export const PRODUCT_PATH = "dist/skfiy -> skfiy dashboard -> loopback dashboard server";
export const DEFAULT_TIMEOUT_MS = 8_000;
const REQUIRED_DASHBOARD_CHROME_CONTROL_ACTIONS = ["observe", "fill", "click", "submit", "scroll"];
export const REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS = [
  "Assistant Provider",
  "Computer Use",
  "Chrome Browser Context",
  "Current Turn",
  "Chrome readiness",
  "Finder readiness",
  "Ghostty readiness",
  "Activity",
  "Latest blocker",
  "Runtime evidence",
  "Assistant providers",
  "Provider settings",
  "Knowledge graph",
  "User preferences",
  "Forget memory",
  "Latest session",
  "Browser Context",
  "injects prompt",
  "recalls context",
  "Vault lens",
  "Vault search",
  "Vault notes",
  "Focused note",
  "Focused neighborhood",
  "Vault backlinks",
  "Learning loop",
  "Prompt stack",
  "Prompt source ledger",
  "Recent session recall",
  "Chrome control actions",
  "Chrome host policy controls",
  "Observe current tab",
  "Screenshot current tab",
  "Click selector",
  "Fill selector",
  "Submit form",
  "Scroll page",
  "Chrome action selector",
  "Chrome fill text",
  "Chrome scroll delta",
  "Chrome host policy host",
  "Always allow",
  "Allow current turn",
  "Reset policy",
  "Automation monitors",
  "Automation monitor settings",
  "Monitor tmux session",
  "Run automation monitor:"
];

export function createDefaultDashboardSmokeOptions(rootDir) {
  return {
    cliPath: path.join(rootDir, "dist", "skfiy"),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: undefined,
    extensionId: undefined,
    extensionChromeAppName: undefined,
    requirePassed: false,
    help: false
  };
}

export function parseDashboardSmokeArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--cli":
        options.cliPath = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInteger(readRequiredValue(argv, index, arg), arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(readRequiredValue(argv, index, arg));
        index += 1;
        break;
      case "--extension-id":
        options.extensionId = readRequiredValue(argv, index, arg).trim();
        index += 1;
        break;
      case "--extension-chrome-app":
        options.extensionChromeAppName = readRequiredValue(argv, index, arg).trim();
        index += 1;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown dashboard smoke option: ${arg}`);
    }
  }

  return options;
}

export function classifyDashboardSmokeEvidence(evidence) {
  const cliOutput = evidence?.cliOutput;
  const descriptor = evidence?.descriptorResponse?.body;
  const snapshot = evidence?.snapshotResponse?.body;
  const shellBody = String(evidence?.shellResponse?.body ?? "");
  const outputBind = cliOutput?.bind;
  const descriptorBind = descriptor?.bind;
  const runtimeSnapshotCoverage = createRuntimeSnapshotCoverage(evidence);

  if (
    !evidence
    || evidence.runnerHasTmux
    || evidence.productPath !== PRODUCT_PATH
    || !isBuiltCliPath(evidence.cliPath)
    || !isDashboardCommand(evidence.command)
    || evidence.tokenLeakDetected
  ) {
    return "failed";
  }

  if (
    cliOutput?.command !== "dashboard"
    || cliOutput?.result !== "running"
    || cliOutput?.shouldOpen !== false
    || cliOutput?.tokenPrinted !== false
    || !hasDashboardLauncherContract(cliOutput)
    || !hasDashboardServerStatePath(cliOutput?.statePath)
    || !isLoopbackBind(outputBind)
    || !isMatchingDashboardUrl(cliOutput?.url, outputBind)
  ) {
    return "failed";
  }

  if (
    evidence.descriptorResponse?.status !== 200
    || descriptor?.auth?.tokenPrinted !== false
    || !hasDashboardBuildIdentity(descriptor?.runtime?.buildIdentity)
    || !isLoopbackBind(descriptorBind)
    || !sameBind(outputBind, descriptorBind)
    || descriptor?.url !== cliOutput.url
  ) {
    return "failed";
  }

  if (
    evidence.snapshotResponse?.status !== 200
    || snapshot?.schemaVersion !== 1
    || snapshot?.runtimeHealth?.package?.name !== "skfiy"
    || typeof snapshot?.runtimeHealth?.package?.version !== "string"
    || snapshot?.runtimeHealth?.app?.state !== "installed"
    || snapshot?.runtimeHealth?.app?.signing?.state !== "valid"
    || snapshot?.runtimeHealth?.cli?.state !== "installed"
    || !hasNativeHostEvidence(snapshot?.runtimeHealth?.nativeHost)
    || !hasExtensionAdapterEvidence(snapshot?.runtimeHealth?.extension)
    || !hasRuntimeSnapshotEvidence(
      snapshot?.runtimeHealth?.runtimeSnapshot,
      snapshot?.currentTurn,
      snapshot?.replay
    )
    || runtimeSnapshotCoverage.result !== "passed"
    || !hasRuntimeSnapshotCoverageEvidence(evidence.runtimeSnapshotCoverage, runtimeSnapshotCoverage)
    || !hasFreshInstallRuntimeSnapshotEvidence(evidence.freshInstallRuntimeSnapshot)
    || !hasMissingAfterTurnRuntimeSnapshotEvidence(evidence.missingAfterTurnRuntimeSnapshot)
    || snapshot?.runtimeHealth?.dashboard?.state !== "running"
    || snapshot?.runtimeHealth?.dashboard?.url !== cliOutput.url
    || !hasDashboardBuildIdentity(snapshot?.runtimeHealth?.dashboard?.buildIdentity)
    || snapshot?.runtimeHealth?.dashboard?.runtimeIdentity?.state !== "matched"
    || snapshot.runtimeHealth.dashboard.buildIdentity.fingerprint !== descriptor.runtime.buildIdentity.fingerprint
    || !Number.isInteger(snapshot?.runtimeHealth?.dashboard?.pid)
    || snapshot.runtimeHealth.dashboard.pid <= 0
    || !Number.isFinite(snapshot?.runtimeHealth?.dashboard?.uptimeSeconds)
    || snapshot.runtimeHealth.dashboard.uptimeSeconds < 0
    || !hasPermissionEvidence(snapshot?.permissions)
    || !hasDesktopSessionEvidence(snapshot?.runtimeHealth?.desktopSession)
    || !snapshot?.currentTurn
    || !snapshot?.replay
    || !Array.isArray(snapshot?.smokeEvidence?.artifacts)
    || !hasDogfoodReleaseEvidence(snapshot?.dogfoodRelease)
    || !hasLongHorizonEvidence(snapshot?.longHorizon)
    || !Array.isArray(snapshot?.alerts)
  ) {
    return "failed";
  }

  const chromeBlocked = hasChromeBlockedSmokeEvidence(snapshot.smokeEvidence.artifacts, snapshot);

  if (!hasOperatorReadinessEvidence(snapshot.operatorReadiness)) {
    return chromeBlocked && hasOperatorReadinessBlockedByChromeEvidence(snapshot.operatorReadiness)
      ? "blocked"
      : "failed";
  }

  if (
    !hasChromeNativeHostBridgeSmokeEvidence(snapshot.smokeEvidence.artifacts)
    || !hasChromeInstalledExtensionSmokeEvidence(snapshot.smokeEvidence.artifacts)
  ) {
    return chromeBlocked
      ? "blocked"
      : "failed";
  }

  if (!hasDashboardEventsEvidence(evidence.eventsResponse)) {
    return "failed";
  }

  if (!hasDashboardChromeHostPolicyApiEvidence(evidence.chromeHostPolicyApi)) {
    return "failed";
  }

  if (!hasDashboardPersonalMemoryApiEvidence(evidence.personalMemoryApi)) {
    return "failed";
  }

  if (!hasDashboardAutomationMonitorApiEvidence(evidence.dashboardAutomationMonitorApi)) {
    return "failed";
  }

  if (!hasDashboardStatusAutoDiscoveryEvidence(evidence.dashboardStatusAutoDiscovery, cliOutput)) {
    return "failed";
  }

  if (
    evidence.dashboardChromeControlActionApi
    && !hasDashboardChromeControlActionApiEvidence(evidence.dashboardChromeControlActionApi)
  ) {
    return "failed";
  }

  if (
    evidence.shellResponse?.status !== 200
    || !hasDashboardShellEvidence(shellBody, evidence.reactContentEvidence)
  ) {
    return "failed";
  }

  if (
    evidence.artifactPath
    && !hasDashboardKnowledgeGraphEvidence(evidence.knowledgeGraphEvidence)
  ) {
    return "failed";
  }

  return "passed";
}

function hasDashboardBuildIdentity(value) {
  return value?.schemaVersion === 1
    && typeof value?.fingerprint === "string"
    && value.fingerprint.length > 0
    && value.fingerprint !== "unknown";
}

function hasDashboardKnowledgeGraphEvidence(evidence) {
  const hasBrowserContextNode = Array.isArray(evidence?.nodeTexts)
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("Browser Context"));

  return evidence?.productPath === "dist/skfiy dashboard -> Electron screenshot -> Knowledge graph"
    && evidence?.result === "passed"
    && evidence?.regionFound === true
    && Number.isFinite(evidence?.screenshotBytes)
    && evidence.screenshotBytes > 0
    && Number.isInteger(evidence?.nodeCount)
    && evidence.nodeCount >= 5
    && Number.isInteger(evidence?.linkCount)
    && evidence.linkCount >= 2
    && Number.isInteger(evidence?.vaultNoteCount)
    && evidence.vaultNoteCount >= 3
    && evidence?.focusedNoteFound === true
    && typeof evidence?.focusedNoteTitle === "string"
    && evidence.focusedNoteTitle.endsWith(".md")
    && Number.isInteger(evidence?.focusedBacklinkCount)
    && evidence.focusedBacklinkCount >= 1
    && Number.isInteger(evidence?.vaultLensCount)
    && evidence.vaultLensCount >= 4
    && typeof evidence?.vaultLensSummary === "string"
    && evidence.vaultLensSummary.includes("Showing")
    && evidence?.vaultSearchInputFound === true
    && evidence?.vaultSearchQuery === "approval"
    && typeof evidence?.vaultSearchSummary === "string"
    && evidence.vaultSearchSummary.includes("approval")
    && Number.isInteger(evidence?.vaultSearchNodeCount)
    && evidence.vaultSearchNodeCount >= 2
    && Number.isInteger(evidence?.vaultSearchNoteCount)
    && evidence.vaultSearchNoteCount >= 2
    && Number.isInteger(evidence?.focusedNeighborhoodCount)
    && evidence.focusedNeighborhoodCount >= 1
    && Number.isInteger(evidence?.backlinkCount)
    && evidence.backlinkCount >= 2
    && Number.isInteger(evidence?.learningLoopCount)
    && evidence.learningLoopCount >= 4
    && Number.isInteger(evidence?.promptStackCount)
    && evidence.promptStackCount >= 5
    && Number.isInteger(evidence?.promptStackTierCount)
    && evidence.promptStackTierCount === evidence.promptStackCount
    && Number.isInteger(evidence?.promptSourceLedgerCount)
    && evidence.promptSourceLedgerCount >= 5
    && Number.isInteger(evidence?.promptProvenanceCount)
    && evidence.promptProvenanceCount >= 1
    && Number.isInteger(evidence?.sessionNodeCount)
    && evidence.sessionNodeCount >= 2
    && Number.isInteger(evidence?.personalSkillNodeCount)
    && evidence.personalSkillNodeCount >= 2
    && Number.isInteger(evidence?.workingProfileNodeCount)
    && evidence.workingProfileNodeCount >= 1
    && Number.isInteger(evidence?.workingProfileLinkCount)
    && evidence.workingProfileLinkCount >= 2
    && Number.isInteger(evidence?.workingProfileNoteCount)
    && evidence.workingProfileNoteCount >= 1
    && Number.isInteger(evidence?.memoryEvolutionNodeCount)
    && evidence.memoryEvolutionNodeCount >= 1
    && Number.isInteger(evidence?.memoryEvolutionLinkCount)
    && evidence.memoryEvolutionLinkCount >= 3
    && Number.isInteger(evidence?.memoryJournalNodeCount)
    && evidence.memoryJournalNodeCount >= 2
    && Number.isInteger(evidence?.memoryJournalLinkCount)
    && evidence.memoryJournalLinkCount >= 3
    && Number.isInteger(evidence?.pendingMemoryNodeCount)
    && evidence.pendingMemoryNodeCount >= 2
    && Number.isInteger(evidence?.pendingMemoryLinkCount)
    && evidence.pendingMemoryLinkCount >= 4
    && evidence?.fallbackTextOverlap === false
    && Array.isArray(evidence?.nodeTexts)
    && Array.isArray(evidence?.linkTexts)
    && Array.isArray(evidence?.vaultNoteTexts)
    && Array.isArray(evidence?.vaultLensTexts)
    && Array.isArray(evidence?.vaultSearchNodeTexts)
    && Array.isArray(evidence?.vaultSearchNoteTexts)
    && Array.isArray(evidence?.backlinkTexts)
    && Array.isArray(evidence?.focusedNeighborhoodTexts)
    && Array.isArray(evidence?.learningLoopTexts)
    && Number.isInteger(evidence?.sessionRecallRouteCount)
    && evidence.sessionRecallRouteCount >= 1
    && Number.isInteger(evidence?.sessionRecallTierCount)
    && evidence.sessionRecallTierCount === evidence.sessionRecallRouteCount
    && Number.isInteger(evidence?.sessionRecallBasisCount)
    && evidence.sessionRecallBasisCount >= 1
    && Array.isArray(evidence?.sessionRecallRouteTexts)
    && Array.isArray(evidence?.sessionRecallTierTexts)
    && Array.isArray(evidence?.sessionRecallBasisTexts)
    && Array.isArray(evidence?.promptStackTexts)
    && Array.isArray(evidence?.promptStackTierTexts)
    && Array.isArray(evidence?.promptSourceLedgerTexts)
    && Array.isArray(evidence?.memoryPressureLedgerTexts)
    && Array.isArray(evidence?.promptProvenanceTexts)
    && Array.isArray(evidence?.personalSkillTexts)
    && Array.isArray(evidence?.workingProfileTexts)
    && evidence.vaultLensTexts.some((text) => typeof text === "string" && text.includes("All"))
    && evidence.vaultLensTexts.some((text) => typeof text === "string" && text.includes("Skill"))
    && evidence.vaultNoteTexts.some((text) => typeof text === "string" && text.includes(".md"))
    && evidence.vaultNoteTexts.some((text) => typeof text === "string" && text.includes("Backlinks"))
    && evidence.vaultSearchNodeTexts.some((text) => typeof text === "string" && text.includes("Pending user memory"))
    && evidence.vaultSearchNodeTexts.some((text) => typeof text === "string" && text.includes("User preferences"))
    && evidence.vaultSearchNodeTexts.every((text) => typeof text === "string" && !text.includes("Latest session"))
    && evidence.vaultSearchNoteTexts.some((text) => typeof text === "string" && text.includes("Pending user memory.md"))
    && evidence.vaultSearchNoteTexts.some((text) => typeof text === "string" && text.includes("User preferences.md"))
    && evidence.vaultSearchNoteTexts.every((text) => typeof text === "string" && !text.includes("Latest session.md"))
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("Concise Chinese progress updates"))
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("Obsidian-style knowledge dashboard"))
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("Working profile"))
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("Memory evolution"))
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("Learning receipt"))
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("learned from Hermes turn"))
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("Pending user memory"))
    && evidence.nodeTexts.some((text) => typeof text === "string" && text.includes("replace · from User prefers concise Chinese updates. -> User prefers concise Chinese-first progress updates with verification evidence."))
    && evidence.linkTexts.some((text) => typeof text === "string" && text.includes("records timeline"))
    && evidence.linkTexts.some((text) => typeof text === "string" && text.includes("orders receipt"))
    && evidence.linkTexts.some((text) => typeof text === "string" && text.includes("records receipt"))
    && evidence.linkTexts.some((text) => typeof text === "string" && text.includes("updates memory"))
    && evidence.backlinkTexts.some((text) => typeof text === "string" && text.includes("injects prompt"))
    && evidence.backlinkTexts.some((text) => typeof text === "string" && text.includes("recalls context"))
    && evidence.backlinkTexts.some((text) => typeof text === "string" && text.includes("awaits approval"))
    && evidence.linkTexts.some((text) => typeof text === "string" && text.includes("guides prompt"))
    && evidence.linkTexts.some((text) => typeof text === "string" && text.includes("travels with prompt"))
    && evidence.linkTexts.some((text) => typeof text === "string" && text.includes("stages"))
    && evidence.linkTexts.some((text) => typeof text === "string" && text.includes("awaits approval"))
    && evidence.vaultNoteTexts.some((text) => typeof text === "string" && text.includes("Pending user memory.md"))
    && evidence.vaultNoteTexts.some((text) => typeof text === "string" && text.includes("Working profile.md"))
    && evidence.workingProfileTexts.some((text) => typeof text === "string" && text.includes("Working profile"))
    && evidence.workingProfileTexts.some((text) => typeof text === "string" && text.includes("travels with prompt"))
    && evidence.focusedNeighborhoodTexts.some((text) => typeof text === "string" && (
      text.includes("injects prompt")
      || text.includes("guides prompt")
      || text.includes("distills")
      || text.includes("recalls context")
      || text.includes("awaits approval")
    ))
    && evidence.learningLoopTexts.some((text) => typeof text === "string" && text.includes("teaches"))
    && evidence.learningLoopTexts.some((text) => typeof text === "string" && text.includes("distills"))
    && evidence.learningLoopTexts.some((text) => typeof text === "string" && text.includes("injects prompt"))
    && evidence.learningLoopTexts.some((text) => typeof text === "string" && text.includes("answered"))
    && evidence.sessionRecallRouteTexts.some((text) => typeof text === "string" && text.includes("recalls context ->"))
    && evidence.sessionRecallTierTexts.every((text) => typeof text === "string" && text.includes("volatile session recall"))
    && evidence.sessionRecallBasisTexts.some((text) => typeof text === "string" && text.includes("Recall basis: matched terms:"))
    && evidence.promptStackTexts.some((text) => typeof text === "string" && text.includes("Memory"))
    && evidence.promptStackTexts.some((text) => typeof text === "string" && text.includes("Recalled sessions"))
    && evidence.promptStackTexts.some((text) => typeof text === "string" && text.includes("Personal skills"))
    && evidence.promptStackTexts.some((text) => typeof text === "string" && text.includes("Working profile"))
    && evidence.promptStackTexts.some((text) => typeof text === "string" && text.includes("Background Agent"))
    && evidence.promptStackTierTexts.some((text) => typeof text === "string" && text.includes("volatile local memory"))
    && evidence.promptStackTierTexts.some((text) => typeof text === "string" && text.includes("volatile session recall"))
    && evidence.promptStackTierTexts.some((text) => typeof text === "string" && text.includes("stable learned habits"))
    && evidence.promptStackTierTexts.some((text) => typeof text === "string" && text.includes("volatile portable profile"))
    && (!hasBrowserContextNode
      || evidence.promptStackTierTexts.some((text) => typeof text === "string" && text.includes("live browser overlay")))
    && evidence.promptStackTierTexts.some((text) => typeof text === "string" && text.includes("runtime provider"))
    && evidence.promptSourceLedgerTexts.some((text) => typeof text === "string" && text.includes("Memory"))
    && evidence.memoryPressureLedgerTexts.some((text) => typeof text === "string" && text.includes("memory pressure warning"))
    && evidence.memoryPressureLedgerTexts.some((text) => typeof text === "string" && text.includes("User preferences"))
    && evidence.memoryPressureLedgerTexts.some((text) => typeof text === "string" && text.includes("chars"))
    && evidence.promptSourceLedgerTexts.some((text) => typeof text === "string" && text.includes("Pending memory"))
    && evidence.promptSourceLedgerTexts.some((text) => typeof text === "string" && text.includes("review gated"))
    && evidence.promptSourceLedgerTexts.some((text) => typeof text === "string" && text.includes("Browser Context"))
    && evidence.promptSourceLedgerTexts.some((text) => typeof text === "string" && text.includes("Background Agent"))
    && evidence.promptProvenanceTexts.some((text) => typeof text === "string" && text.includes("teaches"))
    && evidence.promptProvenanceTexts.some((text) => typeof text === "string" && text.includes("distills"))
    && evidence.promptProvenanceTexts.some((text) => typeof text === "string" && text.includes("injects prompt"))
    && evidence.promptProvenanceTexts.some((text) => typeof text === "string" && (
      text.includes("Codex")
      || text.includes("Hermes")
      || text.includes("Claude Code")
    ))
    && (!hasBrowserContextNode
      || evidence.backlinkTexts.some((text) => typeof text === "string" && text.includes("observed in")))
    && hasDashboardKnowledgeGraphVisualDesignContract(evidence.visualDesignContract)
    && typeof evidence?.screenshotPath === "string"
    && evidence.screenshotPath.endsWith("-knowledge-graph.png");
}

function hasDashboardKnowledgeGraphVisualDesignContract(contract) {
  return Number.isInteger(contract?.viewportWidth)
    && contract.viewportWidth >= 1200
    && Number.isInteger(contract?.viewportHeight)
    && contract.viewportHeight >= 800
    && contract?.shellUsesDarkGridBackground === true
    && contract?.graphCanvasUsesGridBackground === true
    && contract?.graphCanvasUsesDarkSurface === true
    && contract?.vaultLensUsesDarkPanel === true
    && contract?.focusedNotePanelUsesGradient === true
    && contract?.notesPanelUsesGradient === true
    && contract?.backlinksPanelUsesGradient === true
    && contract?.learningLoopPanelUsesGradient === true
    && contract?.promptStackPanelUsesGradient === true
    && contract?.promptSourceLedgerPanelUsesGradient === true
    && contract?.graphUsesGradientLinks === true
    && contract?.selectedNodeGlowVisible === true
    && contract?.paletteHasMultipleAccentFamilies === true
    && contract?.screenshotCoversDashboardShell === true
    && contract?.screenshotCoversKnowledgeGraph === true;
}

function hasDashboardLauncherContract(cliOutput) {
  const descriptor = cliOutput?.descriptor;

  return Number.isInteger(cliOutput?.serverPid)
    && cliOutput.serverPid > 0
    && cliOutput?.auth?.mode === "optional-token"
    && cliOutput.auth.tokenPrinted === false
    && cliOutput?.updates?.transport === "sse"
    && cliOutput.updates.scope === "local-http"
    && cliOutput?.eventStore?.mode === "append-only"
    && cliOutput.eventStore.requiredForExecution === false
    && descriptor?.auth?.mode === "optional-token"
    && descriptor.auth.tokenPrinted === false
    && descriptor?.updates?.transport === "sse"
    && descriptor.updates.scope === "local-http"
    && descriptor?.eventStore?.mode === "append-only"
    && descriptor.eventStore.requiredForExecution === false
    && isLoopbackBind(descriptor?.bind)
    && sameBind(cliOutput.bind, descriptor.bind)
    && descriptor.url === cliOutput.url
    && isMatchingDashboardUrl(descriptor.url, descriptor.bind);
}

function hasDashboardServerStatePath(statePath) {
  return typeof statePath === "string"
    && statePath.includes("Application Support/skfiy/dashboard-server.json");
}

export function createRuntimeSnapshotCoverage(evidence) {
  const fixture = readRuntimeSnapshotFixture(evidence?.runtimeSnapshotFixture);

  if (!fixture) {
    return createRuntimeSnapshotCoverageResult("skipped", {
      reason: "Runtime snapshot fixture was not seeded in the isolated HOME."
    });
  }

  const snapshotResponse = evidence?.snapshotResponse;
  if (snapshotResponse?.status !== 200) {
    return createRuntimeSnapshotCoverageResult("failed", {
      fixture,
      reason: `Dashboard /snapshot.json returned ${snapshotResponse?.status ?? "no response"}.`
    });
  }

  const snapshot = snapshotResponse.body;
  if (!snapshot || typeof snapshot !== "object") {
    return createRuntimeSnapshotCoverageResult("failed", {
      fixture,
      reason: "Dashboard /snapshot.json did not return an object."
    });
  }

  const runtimeSnapshot = snapshot.runtimeHealth?.runtimeSnapshot;
  const failures = [];

  if (runtimeSnapshot?.state !== "available") {
    failures.push("runtimeHealth.runtimeSnapshot.state is not available");
  }

  if (runtimeSnapshot?.path !== fixture.path) {
    failures.push("runtimeHealth.runtimeSnapshot.path does not match the seeded fixture path");
  }

  if (runtimeSnapshot?.observedAt !== fixture.snapshot.observedAt) {
    failures.push("runtimeHealth.runtimeSnapshot.observedAt does not match the seeded fixture");
  }

  collectRuntimePanelMismatches(
    failures,
    "currentTurn",
    snapshot.currentTurn,
    fixture.snapshot.currentTurn
  );
  collectRuntimePanelMismatches(
    failures,
    "replay",
    snapshot.replay,
    fixture.snapshot.replay
  );

  if (failures.length > 0) {
    return createRuntimeSnapshotCoverageResult("failed", {
      fixture,
      reason: failures.join("; "),
      failures
    });
  }

  return createRuntimeSnapshotCoverageResult("passed", {
    fixture,
    reason: "Seeded runtime snapshot currentTurn and replay are visible at /snapshot.json."
  });
}

export function createDashboardHelpText(defaults) {
  return `Usage: npm run smoke:dashboard -- [options]

Runs the built skfiy CLI through the dashboard product path:
dist/skfiy -> skfiy dashboard --no-open --port 0 --json -> loopback dashboard server.

Options:
  --cli <path>          Built CLI path. Default: ${defaults.cliPath}
  --timeout-ms <ms>     Wait time for CLI output and dashboard fetches. Default: ${defaults.timeoutMs}
  --output <path>       Persist JSON evidence to a file.
  --extension-id <id>   Exercise /api/chrome-control-action against this installed Chrome extension id.
  --extension-chrome-app <name>
                        Browser app for installed-extension dashboard action smoke. Use "Chromium" for dogfood.
  --require-passed      Exit 2 unless the dashboard smoke result is passed.
  -h, --help            Show this help.
`;
}

export async function writeDashboardSmokeEvidence(
  outputPath,
  evidence,
  io = { mkdir, writeFile }
) {
  const artifactPath = path.resolve(outputPath);

  await io.mkdir(path.dirname(artifactPath), { recursive: true });
  await io.writeFile(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function readRequiredValue(argv, index, name) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function readPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function isBuiltCliPath(cliPath) {
  if (typeof cliPath !== "string") {
    return false;
  }

  const normalized = path.normalize(cliPath);

  return path.basename(normalized) === "skfiy"
    && path.basename(path.dirname(normalized)) === "dist";
}

function isDashboardCommand(command) {
  if (!Array.isArray(command) || command.length < 6) {
    return false;
  }

  const [, subcommand, noOpenFlag, portFlag, portValue, jsonFlag] = command;

  return subcommand === "dashboard"
    && noOpenFlag === "--no-open"
    && portFlag === "--port"
    && portValue === "0"
    && jsonFlag === "--json";
}

function isLoopbackBind(bind) {
  return bind?.host === "127.0.0.1"
    && Number.isInteger(bind.port)
    && bind.port > 0
    && bind.port <= 65535;
}

function isMatchingDashboardUrl(url, bind) {
  return typeof url === "string"
    && isLoopbackBind(bind)
    && url === `http://127.0.0.1:${bind.port}/`;
}

function sameBind(left, right) {
  return left?.host === right?.host && left?.port === right?.port;
}

function hasPermissionEvidence(permissions) {
  const required = [
    "screenRecording",
    "accessibility"
  ];

  return required.every((permission) =>
    typeof permissions?.[permission] === "string"
    && permissions[permission] !== "unknown"
  );
}

function hasDesktopSessionEvidence(desktopSession) {
  return desktopSession?.state === "controllable" || desktopSession?.state === "blocked";
}

function hasNativeHostEvidence(nativeHost) {
  const allowedStates = new Set([
    "installed",
    "missing",
    "mismatched",
    "cli-missing",
    "invalid"
  ]);

  return allowedStates.has(nativeHost?.state)
    && nativeHost?.hostName === "com.sskift.skfiy"
    && typeof nativeHost?.manifestPath === "string"
    && nativeHost.manifestPath.includes("NativeMessagingHosts/com.sskift.skfiy.json")
    && typeof nativeHost?.cliShimPath === "string"
    && path.basename(nativeHost.cliShimPath) === "skfiy"
    && Array.isArray(nativeHost?.allowedOrigins)
    && typeof nativeHost?.reason === "string";
}

function hasExtensionAdapterEvidence(extension) {
  const allowedLiveConnectionStates = new Set(["unknown", "connected", "stale"]);

  return typeof extension?.state === "string"
    && extension.state !== "unknown"
    && extension?.bridge === "native-messaging"
    && allowedLiveConnectionStates.has(extension?.liveConnection)
    && hasChromeHostPolicyEvidence(extension?.hostPolicy)
    && (
      typeof extension?.reason === "string"
      || hasExtensionConnectionEvidence(extension?.connection)
    );
}

function hasChromeHostPolicyEvidence(hostPolicy) {
  return hostPolicy?.schemaVersion === 1
    && (hostPolicy.state === "default" || hostPolicy.state === "configured" || hostPolicy.state === "invalid")
    && typeof hostPolicy.path === "string"
    && hostPolicy.path.includes("Application Support/skfiy/chrome-host-policy.json")
    && hostPolicy.policy?.defaultMode === "ask"
    && Array.isArray(hostPolicy.policy?.allowedHosts)
    && Array.isArray(hostPolicy.policy?.currentTurnAllowedHosts)
    && Array.isArray(hostPolicy.policy?.blockedHosts);
}

function hasDashboardChromeHostPolicyApiEvidence(api) {
  const showDefault = api?.showDefault?.body;
  const setBody = api?.setResponse?.body;
  const showConfigured = api?.showConfigured?.body;
  const resetBody = api?.resetResponse?.body;
  const configuredPolicy = showConfigured?.hostPolicy?.policy;

  return api?.productPath === "dist/skfiy -> dashboard /api/chrome-host-policy -> chrome-host-policy.json"
    && typeof api?.apiUrl === "string"
    && api.apiUrl.includes("/api/chrome-host-policy")
    && api?.showDefault?.status === 200
    && api?.setResponse?.status === 200
    && api?.showConfigured?.status === 200
    && api?.resetResponse?.status === 200
    && showDefault?.command === "dashboard chrome policy show"
    && showDefault?.executesSystemMutation === false
    && hasChromeHostPolicyEvidence(showDefault?.hostPolicy)
    && setBody?.command === "dashboard chrome policy set"
    && setBody?.source === "dashboard"
    && setBody?.plannedMutation === true
    && setBody?.executesSystemMutation === true
    && setBody?.result === "configured"
    && setBody?.action === "allow_current_turn"
    && setBody?.host === "dashboard-smoke.example"
    && hasChromeHostPolicyEvidence(setBody?.hostPolicy)
    && setBody.hostPolicy.policy.currentTurnAllowedHosts?.includes("dashboard-smoke.example")
    && showConfigured?.command === "dashboard chrome policy show"
    && hasChromeHostPolicyEvidence(showConfigured?.hostPolicy)
    && configuredPolicy?.currentTurnAllowedHosts?.includes("dashboard-smoke.example")
    && resetBody?.command === "dashboard chrome policy reset"
    && resetBody?.source === "dashboard"
    && resetBody?.plannedMutation === true
    && resetBody?.executesSystemMutation === true
    && resetBody?.result === "reset"
    && hasChromeHostPolicyEvidence(resetBody?.hostPolicy)
    && resetBody.hostPolicy.state === "default";
}

function hasDashboardPersonalMemoryApiEvidence(api) {
  const beforeMemory = api?.snapshotBefore?.body?.personalMemory;
  const afterMemory = api?.snapshotAfter?.body?.personalMemory;
  const forgetBody = api?.forgetResponse?.body;
  const unsafeForgetBody = api?.unsafeForgetResponse?.body;
  const rejectedAddBody = api?.rejectedAddResponse?.body;
  const muteSkillBody = api?.muteSkillResponse?.body;
  const afterSkillMuteMemory = api?.snapshotAfterSkillMute?.body?.personalMemory;
  const beforeText = JSON.stringify(api?.snapshotBefore?.body ?? {});
  const afterText = JSON.stringify(api?.snapshotAfter?.body ?? {});
  const afterSkillMuteText = JSON.stringify(api?.snapshotAfterSkillMute?.body ?? {});
  const forgetText = JSON.stringify(forgetBody ?? {});
  const unsafeForgetText = JSON.stringify(unsafeForgetBody ?? {});
  const muteSkillText = JSON.stringify(muteSkillBody ?? {});

  return api?.productPath === "smoke:dashboard -> isolated HOME memory fixture -> /api/personal-memory"
    && typeof api?.apiUrl === "string"
    && api.apiUrl.endsWith("/api/personal-memory")
    && api?.fixture?.productPath === "smoke:dashboard -> isolated HOME -> personal memory files"
    && typeof api.fixture.userMemoryPath === "string"
    && api.fixture.userMemoryPath.includes("Application Support/skfiy/memory/USER.md")
    && typeof api.fixture.agentMemoryPath === "string"
    && api.fixture.agentMemoryPath.includes("Application Support/skfiy/memory/AGENT.md")
    && typeof api.fixture.personalSkillSettingsPath === "string"
    && api.fixture.personalSkillSettingsPath.includes("Application Support/skfiy/memory/personal-skills.json")
    && api.fixture.seededUserEntries >= 2
    && api.fixture.seededAgentEntries >= 1
    && api?.snapshotBefore?.status === 200
    && beforeMemory?.userEntryCount >= 2
    && beforeMemory?.agentEntryCount >= 1
    && Array.isArray(beforeMemory?.recentUserEntries)
    && beforeMemory.recentUserEntries.includes("[redacted sensitive memory]")
    && api?.forgetResponse?.status === 200
    && forgetBody?.command === "dashboard personal memory"
    && forgetBody?.source === "dashboard"
    && forgetBody?.plannedMutation === true
    && forgetBody?.executesSystemMutation === true
    && forgetBody?.result === "forgotten"
    && forgetBody?.applied === 1
    && forgetBody?.personalMemory?.userEntryCount === beforeMemory.userEntryCount - 1
    && api?.unsafeForgetResponse?.status === 200
    && unsafeForgetBody?.command === "dashboard personal memory"
    && unsafeForgetBody?.source === "dashboard"
    && unsafeForgetBody?.plannedMutation === true
    && unsafeForgetBody?.executesSystemMutation === true
    && unsafeForgetBody?.result === "forgotten"
    && unsafeForgetBody?.applied === 1
    && unsafeForgetBody?.personalMemory?.userEntryCount === beforeMemory.userEntryCount - 2
    && api?.rejectedAddResponse?.status === 400
    && rejectedAddBody?.command === "dashboard personal memory"
    && rejectedAddBody?.result === "error"
    && rejectedAddBody?.error?.code === "unknown-action"
    && api?.snapshotAfter?.status === 200
    && afterMemory?.userEntryCount === beforeMemory.userEntryCount - 2
    && afterMemory?.agentEntryCount === beforeMemory.agentEntryCount
    && Array.isArray(afterMemory?.personalSkills)
    && afterMemory.personalSkills.some((skill) => skill?.id === "dashboard-knowledge-surface")
    && typeof api?.personalSkillApiUrl === "string"
    && api.personalSkillApiUrl.endsWith("/api/personal-skills")
    && api?.muteSkillResponse?.status === 200
    && muteSkillBody?.command === "dashboard personal skills"
    && muteSkillBody?.source === "dashboard"
    && muteSkillBody?.plannedMutation === true
    && muteSkillBody?.executesSystemMutation === true
    && muteSkillBody?.result === "muted"
    && Array.isArray(muteSkillBody?.personalSkills?.disabledSkillIds)
    && muteSkillBody.personalSkills.disabledSkillIds.includes("dashboard-knowledge-surface")
    && api?.snapshotAfterSkillMute?.status === 200
    && Array.isArray(afterSkillMuteMemory?.mutedPersonalSkillIds)
    && afterSkillMuteMemory.mutedPersonalSkillIds.includes("dashboard-knowledge-surface")
    && Array.isArray(afterSkillMuteMemory?.personalSkills)
    && afterSkillMuteMemory.personalSkills.some((skill) => skill?.id === "communication-style")
    && !afterSkillMuteMemory.personalSkills.some((skill) => skill?.id === "dashboard-knowledge-surface")
    && api?.personalSkillSettingsFileAfter?.dashboardKnowledgeSurfaceMuted === true
    && api?.userMemoryFileAfter?.sensitiveEntryPresent === false
    && api?.userMemoryFileAfter?.unsafeEntryPresent === false
    && api?.userMemoryFileAfter?.keptEntryPresent === true
    && api?.tokenLeakDetected === false
    && api?.result === "passed"
    && !/token=/i.test(beforeText)
    && !/token=/i.test(afterText)
    && !/token=/i.test(afterSkillMuteText)
    && !/token=/i.test(forgetText)
    && !/ignore previous instructions/i.test(unsafeForgetText)
    && !/reveal secrets/i.test(unsafeForgetText)
    && !/token=/i.test(muteSkillText);
}

function hasDashboardAutomationMonitorApiEvidence(api) {
  const upsertBody = api?.upsertResponse?.body;
  const runNowBody = api?.runNowResponse?.body;
  const upsertMonitor = findAutomationMonitor(upsertBody?.automation, api?.monitorId);
  const runNowMonitor = findAutomationMonitor(runNowBody?.automation, api?.monitorId);
  const snapshotMonitor = findAutomationMonitor(api?.snapshotAfter?.body?.automation, api?.monitorId);
  const persistedMonitor = findAutomationMonitor(api?.persistedState, api?.monitorId);
  const upsertText = JSON.stringify(upsertBody ?? {});
  const runNowText = JSON.stringify(runNowBody ?? {});

  return api?.productPath === "smoke:dashboard -> isolated HOME automation monitor -> /api/automation-monitor"
    && typeof api?.apiUrl === "string"
    && api.apiUrl.endsWith("/api/automation-monitor")
    && typeof api?.statePath === "string"
    && api.statePath.includes("Application Support/skfiy/automation-monitors.json")
    && api?.sessionName === "dashboard-smoke-missing-session"
    && api?.monitorId === "tmux-session:dashboard-smoke-missing-session"
    && api?.snapshotBefore?.status === 200
    && api?.upsertResponse?.status === 200
    && upsertBody?.command === "dashboard automation monitor"
    && upsertBody?.source === "dashboard"
    && upsertBody?.plannedMutation === true
    && upsertBody?.executesSystemMutation === false
    && upsertBody?.mutatesSession === false
    && upsertBody?.result === "configured"
    && upsertBody?.monitorId === api.monitorId
    && upsertMonitor?.sessionName === api.sessionName
    && upsertMonitor?.intervalMs === 60_000
    && upsertMonitor?.checkCount === 1
    && api?.runNowResponse?.status === 200
    && runNowBody?.command === "dashboard automation monitor"
    && runNowBody?.source === "dashboard"
    && runNowBody?.plannedMutation === true
    && runNowBody?.executesSystemMutation === false
    && runNowBody?.mutatesSession === false
    && runNowBody?.result === "checked"
    && runNowBody?.monitorId === api.monitorId
    && runNowMonitor?.sessionName === api.sessionName
    && runNowMonitor?.checkCount === 2
    && api?.snapshotAfter?.status === 200
    && snapshotMonitor?.checkCount === 2
    && persistedMonitor?.checkCount === 2
    && api?.tokenLeakDetected === false
    && api?.result === "passed"
    && !/token=/i.test(upsertText)
    && !/token=/i.test(runNowText);
}

function findAutomationMonitor(snapshot, monitorId) {
  const monitors = Array.isArray(snapshot?.runtimes)
    ? snapshot.runtimes
    : Array.isArray(snapshot?.monitors)
      ? snapshot.monitors
      : [];

  return monitors.find((monitor) => monitor?.id === monitorId);
}

function hasDashboardStatusAutoDiscoveryEvidence(evidence, cliOutput) {
  const status = evidence?.stdoutJson;
  const dashboard = status?.dashboard;
  const dashboardReadiness = status?.readiness?.checks?.dashboard;

  return evidence?.productPath === "dist/skfiy dashboard -> dashboard-server.json -> skfiy status --json"
    && Array.isArray(evidence?.command)
    && evidence.command.length === 3
    && path.basename(evidence.command[0]) === "skfiy"
    && evidence.command[1] === "status"
    && evidence.command[2] === "--json"
    && evidence?.exitCode === 0
    && !evidence?.signal
    && evidence?.tokenLeakDetected === false
    && status?.schemaVersion === 1
    && status?.command === "status"
    && dashboard?.state === "running"
    && dashboard?.source === "dashboard-server-state"
    && dashboard?.url === cliOutput?.url
    && dashboard?.pid === cliOutput?.serverPid
    && dashboard?.statePath === cliOutput?.statePath
    && dashboard?.stale === false
    && dashboard?.runtimeIdentity?.state === "matched"
    && dashboard?.api?.chromeHostPolicy?.state === "reachable"
    && dashboardReadiness?.ready === true
    && dashboardReadiness?.state === "ready"
    && dashboardReadiness?.dashboardState === "running"
    && dashboardReadiness?.url === cliOutput?.url;
}

function hasDashboardChromeControlActionApiEvidence(evidence) {
  const dashboard = evidence?.dashboard;
  const realUserHomeDir = evidence?.realUserHomeDir;
  const actionRuns = Array.isArray(evidence?.actionRuns) ? evidence.actionRuns : [];

  return evidence?.productPath === "dist/skfiy dashboard -> /api/chrome-control-action -> dist/skfiy chrome actions -> installed Chrome extension"
    && evidence?.homeMode === "real-user-home"
    && typeof realUserHomeDir === "string"
    && realUserHomeDir.startsWith("/")
    && dashboard?.cliOutput?.command === "dashboard"
    && dashboard.cliOutput.result === "running"
    && typeof dashboard.cliOutput.url === "string"
    && typeof dashboard.cliOutput.statePath === "string"
    && dashboard.cliOutput.statePath.startsWith(`${realUserHomeDir}/`)
    && evidence.apiUrl?.startsWith(dashboard.cliOutput.url)
    && dashboard?.cleanup?.exited === true
    && evidence?.result === "passed"
    && evidence?.tokenLeakDetected === false
    && typeof evidence?.apiUrl === "string"
    && evidence.apiUrl.endsWith("/api/chrome-control-action")
    && REQUIRED_DASHBOARD_CHROME_CONTROL_ACTIONS.every((action) =>
      actionRuns.some((run) => hasDashboardChromeControlActionRunEvidence(run, action, evidence.apiUrl))
    );
}

function hasDashboardChromeControlActionRunEvidence(run, action, apiUrl) {
  const request = run?.request;
  const responseBody = run?.response?.body;
  const activityEntry = responseBody?.activityEntry;
  const snapshot = run?.snapshotAfterResponse?.body;
  const snapshotActivity = snapshot?.currentTurn?.chromeControlActivity;
  const replayActions = Array.isArray(snapshot?.replay?.chromeControlActions)
    ? snapshot.replay.chromeControlActions
    : [];

  return run?.action === action
    && run?.result === "passed"
    && run?.tokenLeakDetected === false
    && run?.apiUrl === apiUrl
    && request?.action === action
    && typeof request?.extensionId === "string"
    && request.extensionId.length > 0
    && Number.isInteger(request?.targetTabId)
    && run?.response?.status === 200
    && responseBody?.schemaVersion === 1
    && responseBody?.command === "dashboard chrome control action"
    && responseBody?.source === "dashboard"
    && responseBody?.plannedMutation === true
    && responseBody?.executesSystemMutation === true
    && responseBody?.result === "verified"
    && responseBody?.action === action
    && responseBody?.targetTabId === request.targetTabId
    && hasChromeControlActivityEntry(activityEntry, request.targetTabId, action)
    && run?.snapshotAfterResponse?.status === 200
    && hasChromeControlActivityEntry(snapshotActivity, request.targetTabId, action)
    && replayActions.some((entry) => hasChromeControlActivityEntry(entry, request.targetTabId, action));
}

function hasChromeControlActivityEntry(entry, targetTabId, action) {
  return entry?.kind === "chrome-control-action"
    && entry?.title === `Chrome ${action}`
    && entry?.result === "verified"
    && entry?.target?.app === "Google Chrome"
    && entry?.target?.tabId === targetTabId
    && typeof entry?.target?.host === "string"
    && entry.target.host.length > 0
    && typeof entry?.command === "string"
    && entry.command.includes(`dist/skfiy chrome ${action}`)
    && typeof entry?.timestamp === "string";
}

function hasExtensionConnectionEvidence(connection) {
  const allowedConnectionStates = new Set(["connected", "stale"]);

  return allowedConnectionStates.has(connection?.state)
    && connection?.liveConnection === connection.state
    && typeof connection?.path === "string"
    && connection.path.includes("Application Support/skfiy/chrome-extension-connection.json")
    && Number.isFinite(connection?.ageSeconds)
    && connection.ageSeconds >= 0
    && typeof connection?.observedAt === "string"
    && typeof connection?.launchOrigin === "string"
    && connection.launchOrigin.startsWith("chrome-extension://")
    && typeof connection?.messageType === "string"
    && typeof connection?.requestId === "string";
}

function hasRuntimeSnapshotEvidence(runtimeSnapshot, currentTurn, replay) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== "object") {
    return false;
  }

  if (
    !currentTurn
    || typeof currentTurn !== "object"
    || !replay
    || typeof replay !== "object"
    || currentTurn.source !== "runtime-snapshot"
    || replay.source !== "runtime-snapshot"
  ) {
    return false;
  }

  if (
    runtimeSnapshot.state === "available"
    && isRuntimeSnapshotPath(runtimeSnapshot.path)
    && typeof runtimeSnapshot.observedAt === "string"
  ) {
    return hasAvailableRuntimePanelEvidence(currentTurn, replay);
  }

  if (
    runtimeSnapshot.state === "missing"
    && isRuntimeSnapshotPath(runtimeSnapshot.path)
    && typeof runtimeSnapshot.reason === "string"
    && typeof currentTurn.reason === "string"
    && typeof replay.reason === "string"
  ) {
    return true;
  }

  if (runtimeSnapshot.state === "repaired" || runtimeSnapshot.state === "isolated") {
    return isRuntimeSnapshotPath(runtimeSnapshot.path)
      && isRuntimeSnapshotPath(runtimeSnapshot.replacementPath)
      && isRuntimeSnapshotIsolationPath(runtimeSnapshot.isolatedPath)
      && isSha256(runtimeSnapshot.sha256)
      && typeof runtimeSnapshot.observedAt === "string"
      && typeof runtimeSnapshot.reason === "string"
      && currentTurn.recovery?.state === runtimeSnapshot.state
      && replay.recovery?.state === runtimeSnapshot.state
      && currentTurn.recovery?.isolatedPath === runtimeSnapshot.isolatedPath
      && replay.recovery?.isolatedPath === runtimeSnapshot.isolatedPath
      && currentTurn.recovery?.replacementPath === runtimeSnapshot.replacementPath
      && replay.recovery?.replacementPath === runtimeSnapshot.replacementPath;
  }

  return false;
}

function hasRuntimeSnapshotCoverageEvidence(coverage, expectedCoverage) {
  return coverage?.result === "passed"
    && expectedCoverage?.result === "passed"
    && coverage?.path === expectedCoverage.path
    && coverage?.observedAt === expectedCoverage.observedAt
    && typeof coverage?.reason === "string"
    && Array.isArray(coverage?.currentTurnFields)
    && Array.isArray(coverage?.replayFields)
    && coverage.currentTurnFields.includes("command")
    && coverage.currentTurnFields.includes("targetApp")
    && coverage.currentTurnFields.includes("approvalState")
    && coverage.currentTurnFields.includes("stopState")
    && coverage.currentTurnFields.includes("latestAction")
    && coverage.currentTurnFields.includes("latestVerification")
    && coverage.currentTurnFields.includes("latestScreenshot")
    && coverage.replayFields.includes("screenshotCount")
    && coverage.replayFields.includes("verificationCount")
    && coverage.replayFields.includes("screenshots")
    && coverage.replayFields.includes("actions")
    && coverage.replayFields.includes("verifications")
    && coverage.replayFields.includes("timelineTail");
}

function hasFreshInstallRuntimeSnapshotEvidence(freshInstall) {
  const snapshot = freshInstall?.snapshotResponse?.body;
  const runtimeSnapshot = snapshot?.runtimeHealth?.runtimeSnapshot;
  const currentTurn = snapshot?.currentTurn;
  const replay = snapshot?.replay;
  const pathValue = runtimeSnapshot?.path;

  return freshInstall?.productPath === "smoke:dashboard -> isolated fresh HOME -> missing runtime-snapshot.json"
    && freshInstall?.runtimeSnapshotExistsBeforeLaunch === false
    && freshInstall?.runtimeSnapshotExistsAfterFetch === false
    && freshInstall?.snapshotResponse?.status === 200
    && freshInstall?.cliOutput?.command === "dashboard"
    && freshInstall?.cliOutput?.result === "running"
    && hasDashboardEventsEvidence(freshInstall?.eventsResponse)
    && runtimeSnapshot?.state === "missing"
    && runtimeSnapshot?.freshInstall === true
    && runtimeSnapshot?.emptyReasonCode === "runtime-snapshot-missing"
    && runtimeSnapshot?.reason === "Runtime snapshot has not been recorded yet."
    && isRuntimeSnapshotPath(pathValue)
    && currentTurn?.state === "idle"
    && currentTurn?.source === "runtime-snapshot"
    && currentTurn?.freshInstall === true
    && currentTurn?.emptyReasonCode === "runtime-snapshot-missing"
    && currentTurn?.reason === runtimeSnapshot.reason
    && currentTurn?.path === pathValue
    && replay?.state === "empty"
    && replay?.source === "runtime-snapshot"
    && replay?.freshInstall === true
    && replay?.emptyReasonCode === "runtime-snapshot-missing"
    && replay?.reason === runtimeSnapshot.reason
    && replay?.path === pathValue
    && freshInstall?.cleanup?.exited === true;
}

function hasMissingAfterTurnRuntimeSnapshotEvidence(missingAfterTurn) {
  const snapshot = missingAfterTurn?.snapshotResponse?.body;
  const runtimeSnapshot = snapshot?.runtimeHealth?.runtimeSnapshot;
  const currentTurn = snapshot?.currentTurn;
  const replay = snapshot?.replay;
  const pathValue = runtimeSnapshot?.path;
  const markerPath = runtimeSnapshot?.markerPath;
  const marker = missingAfterTurn?.marker;
  const matchingAlert = Array.isArray(snapshot?.alerts)
    ? snapshot.alerts.find((alert) =>
      alert?.code === "runtime-snapshot-missing-after-turn"
      && alert?.severity === "warning"
      && alert?.path === pathValue
      && alert?.markerPath === markerPath
    )
    : undefined;

  return missingAfterTurn?.productPath === "smoke:dashboard -> isolated HOME marker -> missing runtime-snapshot.json"
    && missingAfterTurn?.runtimeSnapshotExistsBeforeLaunch === false
    && missingAfterTurn?.markerExistsBeforeLaunch === true
    && missingAfterTurn?.runtimeSnapshotExistsAfterFetch === false
    && missingAfterTurn?.snapshotResponse?.status === 200
    && missingAfterTurn?.cliOutput?.command === "dashboard"
    && missingAfterTurn?.cliOutput?.result === "running"
    && hasDashboardEventsEvidence(missingAfterTurn?.eventsResponse)
    && runtimeSnapshot?.state === "missing-after-turn"
    && runtimeSnapshot?.freshInstall === false
    && runtimeSnapshot?.emptyReasonCode === "runtime-snapshot-missing-after-turn"
    && runtimeSnapshot?.reason === "Runtime snapshot is missing after a recent app turn was observed."
    && isRuntimeSnapshotPath(pathValue)
    && isRuntimeTurnMarkerPath(markerPath)
    && markerPath === missingAfterTurn?.markerPath
    && runtimeSnapshot?.markerObservedAt === marker?.observedAt
    && runtimeSnapshot?.markerState === "recent"
    && Number.isFinite(runtimeSnapshot?.markerAgeSeconds)
    && currentTurn?.state === marker?.currentTurn?.state
    && currentTurn?.command === marker?.currentTurn?.command
    && currentTurn?.source === "runtime-turn-marker"
    && currentTurn?.freshInstall === false
    && currentTurn?.path === pathValue
    && currentTurn?.markerPath === markerPath
    && replay?.state === "empty"
    && replay?.source === "runtime-snapshot"
    && replay?.freshInstall === false
    && replay?.path === pathValue
    && replay?.markerPath === markerPath
    && Boolean(matchingAlert)
    && missingAfterTurn?.cleanup?.exited === true;
}

function hasAvailableRuntimePanelEvidence(currentTurn, replay) {
  return typeof currentTurn?.state === "string"
    && currentTurn.state !== "idle"
    && typeof currentTurn?.command === "string"
    && currentTurn.command.length > 0
    && typeof currentTurn?.targetApp === "string"
    && typeof currentTurn?.targetBundleId === "string"
    && typeof currentTurn?.risk === "string"
    && typeof currentTurn?.plannerProvider === "string"
    && typeof currentTurn?.approvalRequired === "boolean"
    && typeof currentTurn?.latestMessage === "string"
    && replay?.state === "available"
    && typeof replay?.outcome === "string"
    && Number.isInteger(replay?.screenshotCount)
    && Number.isInteger(replay?.actionCount)
    && Number.isInteger(replay?.verificationCount)
    && Number.isInteger(replay?.timelineCount)
    && typeof replay?.latestMessage === "string";
}

function readRuntimeSnapshotFixture(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const snapshot = value.snapshot;
  const currentTurn = snapshot?.currentTurn;
  const replay = snapshot?.replay;

  if (
    typeof value.path !== "string"
    || !isRuntimeSnapshotPath(value.path)
    || snapshot?.schemaVersion !== 1
    || typeof snapshot?.observedAt !== "string"
    || !currentTurn
    || typeof currentTurn !== "object"
    || Array.isArray(currentTurn)
    || !replay
    || typeof replay !== "object"
    || Array.isArray(replay)
  ) {
    return undefined;
  }

  return {
    path: value.path,
    snapshot: {
      observedAt: snapshot.observedAt,
      currentTurn,
      replay
    }
  };
}

function collectRuntimePanelMismatches(failures, panelName, actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    failures.push(`${panelName} is not an object`);
    return;
  }

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expectedValue)) {
      failures.push(`${panelName}.${key} does not match the seeded fixture`);
    }
  }
}

function createRuntimeSnapshotCoverageResult(result, { fixture, reason, failures } = {}) {
  return {
    result,
    reason,
    ...(fixture ? {
      path: fixture.path,
      observedAt: fixture.snapshot.observedAt,
      currentTurnFields: Object.keys(fixture.snapshot.currentTurn),
      replayFields: Object.keys(fixture.snapshot.replay)
    } : {}),
    ...(failures ? { failures } : {})
  };
}

function isRuntimeSnapshotPath(value) {
  return typeof value === "string"
    && value.includes("Application Support/skfiy/runtime-snapshot.json");
}

function isRuntimeTurnMarkerPath(value) {
  return typeof value === "string"
    && value.includes("Application Support/skfiy/runtime-turn-marker.json");
}

function isRuntimeSnapshotIsolationPath(value) {
  return isRuntimeSnapshotPath(value)
    && /\.corrupt-[0-9A-Za-z]+-[a-f0-9]{12}\.json$/.test(value);
}

function hasChromeNativeHostBridgeSmokeEvidence(artifacts) {
  if (!Array.isArray(artifacts)) {
    return false;
  }

  return artifacts.some((artifact) => {
    const nativeHostBridge = artifact?.nativeHostBridge;

    return artifact?.target === "chrome"
      && nativeHostBridge?.result === "passed"
      && nativeHostBridge?.productPath === "dist/skfiy -> Chrome Native Messaging heartbeat"
      && nativeHostBridge?.responseResult === "accepted"
      && typeof nativeHostBridge?.heartbeatPath === "string"
      && nativeHostBridge.heartbeatPath.includes("Application Support/skfiy/chrome-extension-connection.json")
      && nativeHostBridge?.heartbeatHostName === "com.sskift.skfiy"
      && typeof nativeHostBridge?.heartbeatLaunchOrigin === "string"
      && nativeHostBridge.heartbeatLaunchOrigin.startsWith("chrome-extension://")
      && nativeHostBridge?.heartbeatMessageType === "skfiy.page.observe"
      && nativeHostBridge?.heartbeatRequestId === "chrome-smoke-native-host";
  });
}

function hasChromeInstalledExtensionSmokeEvidence(artifacts) {
  if (!Array.isArray(artifacts)) {
    return false;
  }

  return artifacts.some((artifact) => {
    const installedExtension = artifact?.installedExtension;
    const browserSelection = installedExtension?.browserSelection;
    const hasBrowserSelection = typeof browserSelection?.chromeAppName === "string"
      && typeof browserSelection?.source === "string"
      && typeof browserSelection?.loadExtensionFriendly === "boolean"
      && Array.isArray(browserSelection?.candidateAppNames);

    if (
      artifact?.target !== "chrome"
      || installedExtension?.productPath !== "Chrome MV3 extension -> Native Messaging -> dist/skfiy heartbeat"
      || !hasBrowserSelection
    ) {
      return false;
    }

    if (installedExtension?.result === "passed") {
      return true;
    }

    return installedExtension?.result === "blocked"
      && installedExtension?.blockedReason === "branded_chrome_load_extension_removed"
      && typeof installedExtension?.chromeVersion === "string"
      && installedExtension?.recommendedBrowser === "Chrome for Testing or Chromium"
      && Array.isArray(installedExtension?.diagnosticExtensionNames)
      && installedExtension.diagnosticExtensionNames.includes("Google Network Speech");
  });
}

function hasChromeBlockedSmokeEvidence(artifacts, snapshot) {
  if (!Array.isArray(artifacts)) {
    return false;
  }

  const knownBlockerPattern = /desktop-session-locked|extension-card-reload-required|chrome-capture-permission-missing|screen recording|accessibility|locked|loginwindow|display asleep/i;
  const desktopSession = snapshot?.runtimeHealth?.desktopSession;
  const alerts = Array.isArray(snapshot?.alerts) ? snapshot.alerts : [];
  const desktopBlockedBySnapshot = desktopSession?.state === "blocked"
    || desktopSession?.mainDisplayAsleep === true
    || desktopSession?.cgSessionScreenIsLocked === true
    || desktopSession?.ioConsoleLocked === true
    || desktopSession?.frontmostBundleId === "com.apple.loginwindow"
    || alerts.some((alert) =>
      alert?.code === "desktop-session-blocked"
      || alert?.code === "desktop-session-loginwindow"
      || alert?.code === "desktop-display-asleep"
    );

  return artifacts.some((artifact) => {
    if (artifact?.target !== "chrome" || artifact?.result !== "blocked") {
      return false;
    }

    const installedExtensionActionRun = artifact?.installedExtensionActionRun;
    const blockerText = [
      artifact.reason,
      artifact.blockedReason,
      artifact.nextAction,
      installedExtensionActionRun?.classification,
      installedExtensionActionRun?.blockedReason,
      installedExtensionActionRun?.reason
    ]
      .filter((value) => typeof value === "string")
      .join(" ");

    return knownBlockerPattern.test(blockerText)
      || (desktopBlockedBySnapshot && /chrome|extension|helper activate_app|reload-extension/i.test([
        artifact.productPath,
        artifact.command,
        artifact.path
      ].filter((value) => typeof value === "string").join(" ")));
  });
}

function hasDogfoodReleaseEvidence(dogfoodRelease) {
  return typeof dogfoodRelease?.state === "string"
    && hasLatestAlphaEvidence(dogfoodRelease.latestAlpha)
    && hasCurrentHeadEvidence(dogfoodRelease.currentHead)
    && hasReleaseDriftEvidence(dogfoodRelease.releaseDrift)
    && hasManifestEvidence(dogfoodRelease.manifest)
    && hasCohortEvidence(dogfoodRelease.cohort);
}

function hasLongHorizonEvidence(longHorizon) {
  const allowedStates = new Set([
    "observing",
    "needs_attention",
    "blocked"
  ]);

  return allowedStates.has(longHorizon?.state)
    && longHorizon?.session === "money-run"
    && longHorizon?.source === "tmux-read-only-probe"
    && longHorizon?.mutatesSession === false
    && Number.isInteger(longHorizon?.summary?.windowCount)
    && Number.isInteger(longHorizon?.summary?.paneCount)
    && Array.isArray(longHorizon?.summary?.activePaneIds)
    && Array.isArray(longHorizon?.summary?.deadPaneIds)
    && Array.isArray(longHorizon?.signals)
    && typeof longHorizon?.recommendation?.action === "string"
    && typeof longHorizon?.recommendation?.reason === "string"
    && longHorizon?.recommendation?.mutatesSession === false
    && Array.isArray(longHorizon?.probeCommands)
    && longHorizon.probeCommands.includes("tmux has-session -t money-run");
}

function hasOperatorReadinessEvidence(operatorReadiness) {
  const commandSurface = operatorReadiness?.commandSurface;
  const extensionReadiness = operatorReadiness?.extensionReadiness;
  const packagedBinary = operatorReadiness?.packagedBinary;
  const recentSmokeEvidence = operatorReadiness?.recentSmokeEvidence;
  const allowedOverallStates = new Set(["ready", "needs-evidence", "blocked"]);
  const allowedCheckStates = new Set(["ready", "needs-evidence", "blocked"]);

  return allowedOverallStates.has(operatorReadiness?.state)
    && commandSurface?.state === "ready"
    && typeof commandSurface?.path === "string"
    && path.basename(commandSurface.path) === "skfiy"
    && allowedCheckStates.has(extensionReadiness?.state)
    && typeof extensionReadiness?.nativeHostState === "string"
    && packagedBinary?.state === "ready"
    && packagedBinary?.checks?.app === true
    && packagedBinary?.checks?.helper === true
    && packagedBinary?.checks?.cli === true
    && packagedBinary?.checks?.signing === true
    && packagedBinary?.signingState === "valid"
    && recentSmokeEvidence?.state === "ready"
    && Array.isArray(recentSmokeEvidence?.requiredTargets)
    && ["chrome", "cli"].every((target) =>
      recentSmokeEvidence.requiredTargets.includes(target)
    )
    && Array.isArray(recentSmokeEvidence?.recentPassedTargets)
    && ["chrome", "cli"].every((target) =>
      recentSmokeEvidence.recentPassedTargets.includes(target)
    )
    && Array.isArray(recentSmokeEvidence?.missingTargets)
    && recentSmokeEvidence.missingTargets.length === 0;
}

function hasOperatorReadinessBlockedByChromeEvidence(operatorReadiness) {
  const commandSurface = operatorReadiness?.commandSurface;
  const extensionReadiness = operatorReadiness?.extensionReadiness;
  const packagedBinary = operatorReadiness?.packagedBinary;
  const recentSmokeEvidence = operatorReadiness?.recentSmokeEvidence;
  const allowedOverallStates = new Set(["needs-evidence", "blocked"]);
  const allowedCheckStates = new Set(["needs-evidence", "blocked"]);

  return allowedOverallStates.has(operatorReadiness?.state)
    && commandSurface?.state === "ready"
    && typeof commandSurface?.path === "string"
    && path.basename(commandSurface.path) === "skfiy"
    && allowedCheckStates.has(extensionReadiness?.state)
    && typeof extensionReadiness?.nativeHostState === "string"
    && packagedBinary?.state === "ready"
    && packagedBinary?.checks?.app === true
    && packagedBinary?.checks?.helper === true
    && packagedBinary?.checks?.cli === true
    && packagedBinary?.checks?.signing === true
    && packagedBinary?.signingState === "valid"
    && recentSmokeEvidence?.state === "needs-evidence"
    && Array.isArray(recentSmokeEvidence?.requiredTargets)
    && ["chrome", "cli"].every((target) =>
      recentSmokeEvidence.requiredTargets.includes(target)
    )
    && Array.isArray(recentSmokeEvidence?.recentPassedTargets)
    && recentSmokeEvidence.recentPassedTargets.includes("cli")
    && Array.isArray(recentSmokeEvidence?.missingTargets)
    && recentSmokeEvidence.missingTargets.includes("chrome");
}

function hasDashboardShellEvidence(shellBody, reactContentEvidence) {
  return hasLegacyDashboardShellEvidence(shellBody)
    || (
      hasReactDashboardShellEvidence(shellBody)
      && hasReactDashboardContentEvidence(reactContentEvidence)
    );
}

function hasLegacyDashboardShellEvidence(shellBody) {
  return shellBody.includes("skfiy Dashboard")
    && shellBody.includes("/descriptor.json")
    && shellBody.includes("/snapshot.json")
    && shellBody.includes('new EventSource("/events")')
    && shellBody.includes("data-dashboard-root")
    && shellBody.includes('aria-label="skfiy user dashboard"')
    && shellBody.includes('data-user-panel="home"')
    && shellBody.includes('data-user-panel="approvals"')
    && shellBody.includes('data-user-panel="apps-sites"')
    && shellBody.includes("renderUserDashboard(snapshot)")
    && shellBody.includes("readUserNextAction(snapshot)")
    && shellBody.includes("Advanced Diagnostics")
    && shellBody.includes("data-snapshot-state")
    && shellBody.includes('data-panel-body="operator-readiness"')
    && shellBody.includes('data-panel-body="long-horizon-supervision"')
    && shellBody.includes("/api/chrome-host-policy")
    && shellBody.includes('fetch("/snapshot.json", { cache: "no-store" })')
    && shellBody.includes("renderAppPolicyPanel(snapshot)")
    && shellBody.includes("renderOperatorReadinessPanel(snapshot)")
    && shellBody.includes("renderLongHorizonPanel")
    && shellBody.includes("renderAlertsPanel(snapshot)")
    && shellBody.includes("groupAlerts(alerts)")
    && shellBody.includes("createAlertBand(group)")
    && shellBody.includes("data-alert-groups");
}

function hasReactDashboardShellEvidence(shellBody) {
  return shellBody.includes("<!doctype html>")
    && shellBody.includes("<title>skfiy dashboard</title>")
    && shellBody.includes('id="dashboard-root"')
    && shellBody.includes('type="module"')
    && shellBody.includes("/assets/")
    && shellBody.includes(".js");
}

function hasReactDashboardContentEvidence(reactContentEvidence) {
  return reactContentEvidence?.productPath === "dist/skfiy dashboard -> React asset content"
    && reactContentEvidence?.status === 200
    && Array.isArray(reactContentEvidence?.requiredMarkers)
    && REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS.every((marker) =>
      reactContentEvidence.requiredMarkers.includes(marker)
    )
    && Array.isArray(reactContentEvidence?.foundMarkers)
    && REQUIRED_REACT_DASHBOARD_CONTENT_MARKERS.every((marker) =>
      reactContentEvidence.foundMarkers.includes(marker)
    )
    && Array.isArray(reactContentEvidence?.missingMarkers)
    && reactContentEvidence.missingMarkers.length === 0
    && typeof reactContentEvidence?.assetUrl === "string"
    && reactContentEvidence.assetUrl.includes("/assets/")
    && reactContentEvidence.assetUrl.endsWith(".js");
}

function hasDashboardEventsEvidence(eventsResponse) {
  if (
    eventsResponse?.status !== 200
    || eventsResponse?.headers?.["content-type"] !== "text/event-stream; charset=utf-8"
    || eventsResponse?.headers?.["cache-control"] !== "no-store, no-transform"
  ) {
    return false;
  }

  const event = parseFirstServerSentEvent(eventsResponse.body);

  return event?.event === "snapshot"
    && event.data?.schemaVersion === 1
    && typeof event.data?.generatedAt === "string"
    && event.data?.currentTurn
    && event.data?.replay;
}

function parseFirstServerSentEvent(body) {
  if (typeof body !== "string" || !body.includes("\n\n")) {
    return undefined;
  }

  const lines = body.slice(0, body.indexOf("\n\n")).split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLine = lines.find((line) => line.startsWith("data: "));

  if (!eventLine || !dataLine) {
    return undefined;
  }

  try {
    return {
      event: eventLine.slice("event: ".length),
      data: JSON.parse(dataLine.slice("data: ".length))
    };
  } catch {
    return undefined;
  }
}

function hasLatestAlphaEvidence(latestAlpha) {
  if (!latestAlpha || typeof latestAlpha !== "object") {
    return false;
  }

  if (latestAlpha.state === "missing") {
    return typeof latestAlpha.path === "string";
  }

  return (latestAlpha.state === "published" || latestAlpha.state === "present")
    && typeof latestAlpha.tagName === "string"
    && typeof latestAlpha.commitSha === "string"
    && typeof latestAlpha.manifestPath === "string"
    && typeof latestAlpha.zipPath === "string"
    && isSha256(latestAlpha.zipSha256);
}

function hasCurrentHeadEvidence(currentHead) {
  return currentHead?.state === "present"
    && isCommitSha(currentHead.commitSha)
    && typeof currentHead.shortCommit === "string"
    && currentHead.shortCommit === currentHead.commitSha.slice(0, 7);
}

function hasReleaseDriftEvidence(releaseDrift) {
  if (!releaseDrift || typeof releaseDrift !== "object") {
    return false;
  }

  if (releaseDrift.state === "unknown") {
    return typeof releaseDrift.reason === "string";
  }

  return (releaseDrift.state === "current" || releaseDrift.state === "behind-head")
    && isCommitSha(releaseDrift.releaseCommitSha)
    && isCommitSha(releaseDrift.currentHeadCommitSha)
    && (
      releaseDrift.state === "current"
        ? releaseDrift.releaseCommitSha === releaseDrift.currentHeadCommitSha
        : releaseDrift.releaseCommitSha !== releaseDrift.currentHeadCommitSha
    );
}

function hasManifestEvidence(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return false;
  }

  if (manifest.state === "missing" || manifest.state === "unknown") {
    return typeof manifest.reason === "string" || typeof manifest.path === "string";
  }

  return manifest.state === "present"
    && typeof manifest.path === "string"
    && isSha256(manifest.sha256)
    && typeof manifest.commitSha === "string"
    && manifest.bundleIdentifier === "com.sskift.skfiy"
    && isSha256(manifest.zipSha256);
}

function hasCohortEvidence(cohort) {
  if (!cohort || typeof cohort !== "object") {
    return false;
  }

  return (cohort.state === "present" || cohort.state === "missing")
    && Number.isInteger(cohort.totalReports)
    && cohort.totalReports >= 0
    && Number.isInteger(cohort.acceptedReportCount)
    && cohort.acceptedReportCount >= 0
    && Number.isInteger(cohort.distinctRealTesterCount)
    && cohort.distinctRealTesterCount >= 0
    && typeof cohort.ready === "boolean"
    && typeof cohort.passedReady === "boolean"
    && hasWorkflowCoverage(cohort.workflowCoverage)
    && hasWorkflowCoverage(cohort.passedWorkflowCoverage)
    && Array.isArray(cohort.acceptedReportIssueUrls);
}

function hasWorkflowCoverage(coverage) {
  const requiredWorkflows = [
    "coding-terminal",
    "screenshot-inspection",
    "finder-file",
    "browser-fallback"
  ];

  return coverage && typeof coverage === "object"
    && requiredWorkflows.every((workflow) => typeof coverage[workflow] === "boolean");
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}
