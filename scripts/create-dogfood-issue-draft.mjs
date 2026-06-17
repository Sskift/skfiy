#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDogfoodReportFromManifest } from "./update-dogfood-cohort.mjs";
import {
  REQUIRED_DOGFOOD_WORKFLOWS,
  verifyDogfoodCohort
} from "./verify-dogfood-cohort.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const STOP_TURN_EVIDENCE_SOURCE = "runtimeStatus.stopTurnHotkey";
const SMOKE_ARTIFACT_OPTIONS = [
  ["uiSmokeArtifactPath", "uiSmokeArtifactPath", "UI smoke artifact", "--ui-smoke-artifact"],
  ["smokeArtifactPath", "smokeArtifactPath", "smoke artifact", "--smoke-artifact"],
  ["chromeSmokeArtifactPath", "chromeSmokeArtifactPath", "Chrome smoke artifact", "--chrome-smoke-artifact"],
  ["finderSmokeArtifactPath", "finderSmokeArtifactPath", "Finder smoke artifact", "--finder-smoke-artifact"],
  ["voiceSmokeArtifactPath", "voiceSmokeArtifactPath", "voice smoke artifact", "--voice-smoke-artifact"]
];

export function createDefaultDogfoodIssueDraftOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    testerId: undefined,
    workflows: [],
    uiSmokeArtifactPath: undefined,
    smokeArtifactPath: undefined,
    chromeSmokeArtifactPath: undefined,
    finderSmokeArtifactPath: undefined,
    voiceSmokeArtifactPath: undefined,
    outputPath: undefined,
    checkReport: false,
    help: false
  };
}

export function parseDogfoodIssueDraftArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--manifest":
        options.manifestPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--tester-id":
        options.testerId = readValue(argv, index, arg);
        index += 1;
        break;
      case "--workflows":
        options.workflows = readWorkflowList(readValue(argv, index, arg));
        index += 1;
        break;
      case "--ui-smoke-artifact":
        options.uiSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--smoke-artifact":
        options.smokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--chrome-smoke-artifact":
        options.chromeSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--finder-smoke-artifact":
        options.finderSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--voice-smoke-artifact":
        options.voiceSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--check-report":
        options.checkReport = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function createDogfoodIssueDraft(options, io = createDefaultIo()) {
  validateOptions(options);

  const manifest = await io.readJson(options.manifestPath);
  const smokePaths = resolveSmokePaths(options, manifest);
  const smokeArtifacts = {
    ui: await io.readJson(smokePaths.uiSmokeArtifactPath),
    ghostty: await io.readJson(smokePaths.smokeArtifactPath),
    chrome: await io.readJson(smokePaths.chromeSmokeArtifactPath),
    finder: await io.readJson(smokePaths.finderSmokeArtifactPath),
    voice: await io.readJson(smokePaths.voiceSmokeArtifactPath)
  };
  validateSmokeArtifactPaths(smokeArtifacts, smokePaths);

  const summary = createDraftSummary(options, smokeArtifacts);
  const body = createDogfoodIssueBody({
    manifest,
    manifestPath: options.manifestPath,
    smokePaths,
    smokeArtifacts,
    testerId: options.testerId.trim(),
    workflows: options.workflows,
    summary
  });
  const outputPath = typeof options.outputPath === "string"
    ? options.outputPath
    : path.join(options.rootDir ?? DEFAULT_ROOT_DIR, ".skfiy-dogfood", "issues", `${options.testerId.trim()}.md`);

  await io.mkdir(path.dirname(outputPath), { recursive: true });
  await io.writeText(outputPath, body);
  const reportPreview = options.checkReport === true
    ? await createReportPreview(options, io, body)
    : undefined;
  const reportPreviewEligibility = reportPreview
    ? await verifyReportPreviewEligibility(reportPreview, options)
    : undefined;

  return {
    result: "created",
    outputPath,
    summary,
    ...(reportPreview ? { reportPreview } : {}),
    ...(reportPreviewEligibility ? { reportPreviewEligibility } : {})
  };
}

export function createDogfoodIssueDraftHelpText() {
  return [
    "Usage: npm run dogfood:issue -- --manifest <alpha-manifest> --tester-id <id> --workflows <ids> [--output <issue-body.md>]",
    "",
    "Creates a GitHub dogfood issue body draft from one real tester machine.",
    "The draft copies alpha identity, all five smoke artifact paths, app bundle preflight,",
    "UI pet drag evidence, panic stop evidence, permission states, and core evidence",
    "from the manifest and smoke JSON files so maintainers can file an accepted GitHub dogfood issue",
    "without manually retyping fields that dogfood:report later verifies.",
    "Use --check-report to round-trip the generated draft through dogfood:report's parser locally.",
    "--check-report also prints reportPreviewEligibility, using dogfood:cohort report-level checks.",
    "",
    "Required smoke artifact arguments default to the paths recorded in the alpha manifest, but can be overridden:",
    ...SMOKE_ARTIFACT_OPTIONS.map(([, , label, cli]) => `  ${cli} <path>  ${label}`),
    "",
    "Required workflows:",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `  - ${workflow}`)
  ].join("\n");
}

function validateOptions(options) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  if (typeof options.testerId !== "string" || options.testerId.trim().length === 0) {
    throw new Error("Missing --tester-id <id>.");
  }
  if (!Array.isArray(options.workflows) || options.workflows.length === 0) {
    throw new Error("Missing --workflows <workflow[,workflow]>.");
  }
  const unknownWorkflow = options.workflows.find((workflow) =>
    !REQUIRED_DOGFOOD_WORKFLOWS.includes(workflow)
  );
  if (unknownWorkflow) {
    throw new Error(`Unknown dogfood workflow: ${unknownWorkflow}.`);
  }
}

async function createReportPreview(options, io, body) {
  const issueUrl = "https://github.com/Sskift/skfiy/issues/dogfood-issue-draft-preview";
  const issueLabels = [
    "dogfood:accepted",
    ...options.workflows.map((workflow) => `workflow:${workflow}`)
  ];

  return await createDogfoodReportFromManifest({
    manifestPath: options.manifestPath,
    issueUrl,
    now: options.now
  }, {
    ...io,
    async readIssue() {
      return {
        body,
        labels: issueLabels
      };
    }
  });
}

async function verifyReportPreviewEligibility(reportPreview, options) {
  const cohortPath = path.join(
    options.rootDir ?? DEFAULT_ROOT_DIR,
    ".skfiy-dogfood",
    "issue-draft-report-preview-cohort.json"
  );
  const cohort = {
    schemaVersion: 1,
    cohortName: "issue-draft-report-preview",
    generatedAt: typeof options.now === "function" ? options.now() : new Date().toISOString(),
    manifestPath: reportPreview.manifestPath,
    reports: [reportPreview]
  };
  const result = await verifyDogfoodCohort({
    cohortPath
  }, {
    async readJson(filePath) {
      if (filePath !== cohortPath) {
        throw new Error(`Unexpected synthetic cohort path: ${filePath}`);
      }

      return cohort;
    }
  });
  const blockingChecks = result.checks.filter((check) =>
    check.ok !== true
      && (
        check.id === "cohort.manifestPath"
        || check.id.startsWith("report.")
      )
  );

  return {
    eligible: blockingChecks.length === 0,
    blockingChecks
  };
}

function resolveSmokePaths(options, manifest) {
  return Object.fromEntries(
    SMOKE_ARTIFACT_OPTIONS.map(([optionKey, manifestKey]) => {
      const configuredPath = options[optionKey];
      const manifestPath = manifest?.[manifestKey];
      const selectedPath = typeof configuredPath === "string" ? configuredPath : manifestPath;
      if (typeof selectedPath !== "string" || selectedPath.trim().length === 0) {
        throw new Error(`Missing ${optionKey}.`);
      }
      if (!path.isAbsolute(selectedPath)) {
        throw new Error(`${optionKey} must be an absolute path.`);
      }

      return [optionKey, selectedPath];
    })
  );
}

function validateSmokeArtifactPaths(smokeArtifacts, smokePaths) {
  validateSmokeArtifactPath("UI smoke artifact", smokeArtifacts.ui, smokePaths.uiSmokeArtifactPath);
  validateSmokeArtifactPath("smoke artifact", smokeArtifacts.ghostty, smokePaths.smokeArtifactPath);
  validateSmokeArtifactPath("Chrome smoke artifact", smokeArtifacts.chrome, smokePaths.chromeSmokeArtifactPath);
  validateSmokeArtifactPath("Finder smoke artifact", smokeArtifacts.finder, smokePaths.finderSmokeArtifactPath);
  validateSmokeArtifactPath("voice smoke artifact", smokeArtifacts.voice, smokePaths.voiceSmokeArtifactPath);
}

function validateSmokeArtifactPath(label, artifact, expectedPath) {
  if (artifact?.artifactPath !== expectedPath) {
    throw new Error(`${label} artifactPath must match the issue draft path.`);
  }
}

function createDraftSummary(options, smokeArtifacts) {
  const workflowResults = readWorkflowArtifactResults(options.workflows, smokeArtifacts);

  return {
    testerId: options.testerId.trim(),
    workflows: options.workflows,
    computerUseResult: chooseComputerUseResult(workflowResults),
    runnerHasTmux: Object.values(smokeArtifacts).some((artifact) => artifact?.runnerHasTmux === true)
  };
}

function createDogfoodIssueBody({
  manifest,
  manifestPath,
  smokePaths,
  smokeArtifacts,
  testerId,
  workflows,
  summary
}) {
  const permissionStates = readPermissionStates(smokeArtifacts);
  const alphaZipPath = typeof manifest?.zip?.path === "string" ? manifest.zip.path : "";
  const commitSha = typeof manifest?.commitSha === "string" ? manifest.commitSha : "";
  const asrProvider = readFirstString([smokeArtifacts.voice?.provider], "not tested");

  return [
    "### alpha manifest",
    "",
    path.basename(manifestPath),
    "",
    "### alpha zip",
    "",
    path.basename(alphaZipPath),
    "",
    "### commit sha",
    "",
    commitSha,
    "",
    "### tester id",
    "",
    testerId,
    "",
    "### cohort workflows",
    "",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) =>
      `- [${workflows.includes(workflow) ? "x" : " "}] ${workflow}`
    ),
    "",
    "### UI smoke artifact",
    "",
    smokePaths.uiSmokeArtifactPath,
    "",
    "### smoke artifact",
    "",
    smokePaths.smokeArtifactPath,
    "",
    "### Chrome smoke artifact",
    "",
    smokePaths.chromeSmokeArtifactPath,
    "",
    "### Finder smoke artifact",
    "",
    smokePaths.finderSmokeArtifactPath,
    "",
    "### voice smoke artifact",
    "",
    smokePaths.voiceSmokeArtifactPath,
    "",
    "### runnerHasTmux",
    "",
    String(summary.runnerHasTmux),
    "",
    "### app bundle preflight",
    "",
    createAppBundlePreflightEvidence(smokeArtifacts),
    "",
    "### UI pet drag evidence",
    "",
    createUiPetDragEvidence(smokeArtifacts.ui?.petDrag),
    "",
    "### Screen Recording",
    "",
    permissionStates.screenRecording,
    "",
    "### Accessibility",
    "",
    permissionStates.accessibility,
    "",
    "### Microphone",
    "",
    permissionStates.microphone,
    "",
    "### Speech Recognition",
    "",
    permissionStates.speechRecognition,
    "",
    "### ASR provider",
    "",
    asrProvider,
    "",
    "### Computer Use result",
    "",
    summary.computerUseResult,
    "",
    "### before screenshot / after screenshot",
    "",
    createScreenshotEvidence(smokeArtifacts),
    "",
    "### action verification events",
    "",
    createActionVerificationEvidence(smokeArtifacts),
    "",
    "### non-terminal voice route guards",
    "",
    createNonComputerUseRouteGuardEvidence(smokeArtifacts.ghostty),
    "",
    "### app policy settings",
    "",
    createAppPolicyEvidence(smokeArtifacts),
    "",
    "### Chrome extracted text",
    "",
    createChromeEvidence(smokeArtifacts.chrome),
    "",
    "### Finder observe_app",
    "",
    createJsonEvidence(smokeArtifacts.finder?.finderObservation),
    "",
    "### Finder semantic selection",
    "",
    createJsonEvidence(smokeArtifacts.finder?.finderSemanticObservation),
    "",
    "### Finder plan preview",
    "",
    createFinderPlanPreviewEvidence(smokeArtifacts.finder?.finderPlanPreview),
    "",
    "### Finder plan confirmation",
    "",
    createJsonEvidence(smokeArtifacts.finder?.finderPlanConfirmation),
    "",
    "### Finder item drag/drop",
    "",
    createJsonEvidence(smokeArtifacts.finder?.finderItemDragDrop),
    "",
    "### Finder before tree / after tree",
    "",
    createFinderTreeEvidence(smokeArtifacts.finder),
    "",
    "### External Doubao voice transcript-to-task evidence",
    "",
    createVoiceTranscriptTaskEvidence(smokeArtifacts.voice),
    "",
    "### External Doubao voice no-transcript/cancellation evidence",
    "",
    createVoiceNoTranscriptEvidence(smokeArtifacts.voice),
    "",
    "### panic stop",
    "",
    createStopTurnEvidence(smokeArtifacts)
  ].join("\n");
}

function readPermissionStates(smokeArtifacts) {
  const artifactValues = Object.values(smokeArtifacts);

  return {
    screenRecording: readPermissionState(artifactValues, "screenRecording"),
    accessibility: readPermissionState(artifactValues, "accessibility"),
    microphone: readPermissionState(artifactValues, "microphone"),
    speechRecognition: readPermissionState(artifactValues, "speechRecognition")
  };
}

function readPermissionState(artifacts, key) {
  for (const artifact of artifacts) {
    const state = artifact?.permissionStates?.[key]?.state
      ?? artifact?.permissions?.[key]?.state
      ?? artifact?.speechStatus?.[key]?.state;
    if (typeof state === "string" && state.trim().length > 0 && state !== "unknown") {
      return state;
    }
  }

  return "unknown";
}

function chooseComputerUseResult(results) {
  if (results.includes("blocked")) {
    return "blocked";
  }
  if (results.includes("needs-user-confirmation")) {
    return "needs-user-confirmation";
  }
  if (results.includes("sensitive-paused")) {
    return "sensitive-paused";
  }
  if (results.includes("no-transcript")) {
    return "no-transcript";
  }
  if (results.includes("failed")) {
    return "failed";
  }
  if (results.includes("denied")) {
    return "denied";
  }
  if (results.includes("passed")) {
    return "passed";
  }

  return "not tested";
}

function readWorkflowArtifactResults(workflows, smokeArtifacts) {
  const results = [];

  if (workflows.includes("coding-terminal") || workflows.includes("screenshot-inspection")) {
    results.push(smokeArtifacts.ghostty?.result);
  }
  if (workflows.includes("finder-file")) {
    results.push(smokeArtifacts.finder?.result);
  }
  if (workflows.includes("browser-fallback")) {
    results.push(smokeArtifacts.chrome?.result);
  }

  return results.filter((result) => typeof result === "string" && result.length > 0);
}

function createScreenshotEvidence(smokeArtifacts) {
  const paths = [
    ["before screenshot", smokeArtifacts.ghostty?.beforeScreenshotPath ?? smokeArtifacts.finder?.beforeScreenshotPath],
    ["after screenshot", smokeArtifacts.ghostty?.afterScreenshotPath ?? smokeArtifacts.finder?.afterScreenshotPath]
  ].filter(([, value]) => typeof value === "string" && value.length > 0);

  if (paths.length === 0) {
    return "not available";
  }

  return paths.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function createActionVerificationEvidence(smokeArtifacts) {
  const messages = [
    ...readTaskMessages(smokeArtifacts.ghostty),
    ...readTaskMessages(smokeArtifacts.chrome),
    ...readTaskMessages(smokeArtifacts.finder)
  ].filter((message) => message.startsWith("Verified "));

  return messages.length > 0 ? messages.join("\n") : "not available";
}

function createNonComputerUseRouteGuardEvidence(ghosttyArtifact) {
  const runs = Array.isArray(ghosttyArtifact?.runs) ? ghosttyArtifact.runs : [];
  const routeGuardRuns = runs.filter((run) =>
    run?.id === "chat-question-route-guard"
      || run?.id === "unsupported-desktop-route-guard"
  );

  return routeGuardRuns.length > 0 ? createJsonEvidence(routeGuardRuns) : "not available";
}

function readTaskMessages(artifact) {
  if (!Array.isArray(artifact?.taskEvents)) {
    return [];
  }

  return artifact.taskEvents
    .map((event) => typeof event?.message === "string" ? event.message : "")
    .filter(Boolean);
}

function createAppPolicyEvidence(smokeArtifacts) {
  const entries = Object.values(smokeArtifacts)
    .flatMap((artifact) => Array.isArray(artifact?.appPolicySettings) ? artifact.appPolicySettings : []);

  if (entries.length === 0) {
    return "not available";
  }

  return entries.map((entry) => JSON.stringify(entry)).join("\n");
}

function createAppBundlePreflightEvidence(smokeArtifacts) {
  const appArtifact = smokeArtifacts.ui ?? smokeArtifacts.ghostty ?? smokeArtifacts.chrome
    ?? smokeArtifacts.finder ?? smokeArtifacts.voice;

  return [
    `appPath: ${readFirstString([appArtifact?.appPath], "not available")}`,
    `launch: ${readFirstString([appArtifact?.launch], "not available")}`,
    `appLaunchViaOpen: ${String(appArtifact?.appLaunchViaOpen === true)}`,
    `runnerHasTmux: ${String(appArtifact?.runnerHasTmux === true)}`,
    `productPath: ${readFirstString([appArtifact?.productPath], "not available")}`
  ].join("\n");
}

function createUiPetDragEvidence(petDrag) {
  if (!petDrag || typeof petDrag !== "object") {
    return "not available";
  }

  return [
    `result: ${readFirstString([petDrag.result], "not available")}`,
    `source: ${readFirstString([petDrag.source], "not available")}`,
    `beforeBounds: ${createJsonEvidence(petDrag.beforeBounds)}`,
    `afterBounds: ${createJsonEvidence(petDrag.afterBounds)}`,
    `moveEvents: ${Array.isArray(petDrag.moveEvents) ? petDrag.moveEvents.length : 0}`,
    `totalDeltaX: ${formatNumberEvidence(petDrag.totalDeltaX)}`,
    `totalDeltaY: ${formatNumberEvidence(petDrag.totalDeltaY)}`,
    `upwardMovement: ${String(petDrag.upwardMovement === true)}`,
    `suppressedClickAfterDrag: ${String(petDrag.suppressedClickAfterDrag === true)}`
  ].join("\n");
}

function createStopTurnEvidence(smokeArtifacts) {
  const status = readStopTurnHotkeyStatus(smokeArtifacts);

  if (!status) {
    return "not available";
  }

  return [
    `accelerator: ${readFirstString([status.accelerator], "not available")}`,
    `label: ${readFirstString([status.label], "not available")}`,
    `registered: ${String(status.registered === true)}`,
    `source: ${STOP_TURN_EVIDENCE_SOURCE}`
  ].join("\n");
}

function readStopTurnHotkeyStatus(smokeArtifacts) {
  for (const artifact of Object.values(smokeArtifacts)) {
    const status = artifact?.runtimeStatus?.stopTurnHotkey;
    if (status && typeof status === "object") {
      return status;
    }
  }

  return undefined;
}

function createChromeEvidence(chromeArtifact) {
  return [
    `productPath: ${readFirstString([chromeArtifact?.productPath], "not available")}`,
    `extractedText: ${readFirstString([chromeArtifact?.extractedText], "not available")}`,
    `currentPageRun: ${createJsonEvidence(chromeArtifact?.currentPageRun)}`,
    `realCurrentPageRun: ${createJsonEvidence(chromeArtifact?.realCurrentPageRun)}`,
    `sensitiveRun: ${createJsonEvidence(chromeArtifact?.sensitiveRun)}`,
    `formRun: ${createJsonEvidence(chromeArtifact?.formRun)}`,
    `fallbackRun: ${createJsonEvidence(chromeArtifact?.fallbackRun)}`,
    `fallbackSwitchRun: ${createJsonEvidence(chromeArtifact?.fallbackSwitchRun)}`
  ].join("\n");
}

function createFinderTreeEvidence(finderArtifact) {
  const before = createJsonEvidence(finderArtifact?.beforeTree);
  const after = createJsonEvidence(finderArtifact?.afterTree);

  if (before === "not available" && after === "not available") {
    return "not available";
  }

  return [`beforeTree: ${before}`, `afterTree: ${after}`].join("\n");
}

function createFinderPlanPreviewEvidence(planPreview) {
  if (planPreview === undefined || planPreview === null) {
    return "not available";
  }

  const lines = [];
  if (typeof planPreview?.result === "string") {
    lines.push(`result: ${planPreview.result}`);
  }
  if (Number.isFinite(planPreview?.destructiveOperationCount)) {
    lines.push(`destructiveOperationCount: ${planPreview.destructiveOperationCount}`);
  }
  lines.push(`raw: ${createJsonEvidence(planPreview)}`);

  return lines.join("\n");
}

function createVoiceTranscriptTaskEvidence(voiceArtifact) {
  const transcriptEvents = Array.isArray(voiceArtifact?.transcriptEvents)
    ? voiceArtifact.transcriptEvents
    : [];
  const taskEvents = Array.isArray(voiceArtifact?.taskEvents) ? voiceArtifact.taskEvents : [];
  const finalTranscripts = transcriptEvents.filter((event) =>
    (event?.final === true || event?.isFinal === true)
      && typeof event?.text === "string"
      && event.text.trim().length > 0
  );
  const turnReplay = voiceArtifact?.turnReplay;

  if (finalTranscripts.length === 0 || taskEvents.length === 0) {
    return "not available";
  }

  return [
    `transcriptEvents: ${createJsonEvidence(finalTranscripts)}`,
    `taskEvents: ${createJsonEvidence(taskEvents)}`,
    `turnReplay: ${createJsonEvidence(turnReplay)}`
  ].join("\n");
}

function createVoiceNoTranscriptEvidence(voiceArtifact) {
  const transcriptEvents = Array.isArray(voiceArtifact?.transcriptEvents)
    ? voiceArtifact.transcriptEvents
    : [];
  const noTranscriptEvents = transcriptEvents.filter((event) =>
    event?.type === "no_transcript" || event?.type === "cancelled"
  );

  return noTranscriptEvents.length > 0 ? createJsonEvidence(noTranscriptEvents) : "not available";
}

function createJsonEvidence(value) {
  if (value === undefined || value === null) {
    return "not available";
  }

  return JSON.stringify(value);
}

function readFirstString(values, fallback) {
  const value = values.find((item) => typeof item === "string" && item.trim().length > 0);
  return value ?? fallback;
}

function formatNumberEvidence(value) {
  return Number.isFinite(value) ? String(value) : "not available";
}

function readWorkflowList(value) {
  return [...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function createDefaultIo() {
  return {
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async writeText(filePath, value) {
      await writeFile(filePath, value);
    },
    async mkdir(dirPath, options) {
      await mkdir(dirPath, options);
    }
  };
}

async function runCli() {
  const defaults = createDefaultDogfoodIssueDraftOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodIssueDraftArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodIssueDraftHelpText());
    return;
  }

  const result = await createDogfoodIssueDraft(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
