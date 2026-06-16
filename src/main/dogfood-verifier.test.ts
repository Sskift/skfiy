import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("dogfood artifact verifier", () => {
  const modulePath = path.join(process.cwd(), "scripts", "verify-dogfood-artifacts.mjs");
  const requiredManifestEvidence = [
    "npm run smoke:ui -- --output <path>",
    "npm run smoke:ghostty -- --output <path>",
    "npm run smoke:chrome -- --output <path>",
    "npm run smoke:finder -- --output <path>",
    "npm run smoke:voice -- --output <path>",
    "action verification events when Computer Use passes",
    "Ghostty app policy settings",
    "clipboard read/write approval runs",
    "Chrome app policy settings",
    "Chrome test-page extraction evidence",
    "Finder app policy settings",
    "Finder test-folder organization evidence"
  ];
  const ghosttyAppPolicySettings = {
    apps: [
      { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "allow" },
      { name: "Chrome", bundleId: "com.google.Chrome", policy: "ask" },
      { name: "Finder", bundleId: "com.apple.finder", policy: "ask" }
    ]
  };
  const clipboardApprovalRuns = [
    {
      id: "clipboard-read-approval",
      result: "needs-user-confirmation",
      events: [
        {
          status: "executing",
          message: "Risk high: Command can read or overwrite clipboard contents."
        },
        {
          status: "approval_required",
          message: "Approval required (high): Command can read or overwrite clipboard contents.",
          command: "pbpaste"
        }
      ]
    },
    {
      id: "clipboard-write-approval",
      result: "needs-user-confirmation",
      events: [
        {
          status: "executing",
          message: "Risk high: Command can read or overwrite clipboard contents."
        },
        {
          status: "approval_required",
          message: "Approval required (high): Command can read or overwrite clipboard contents.",
          command: "echo skfiy | pbcopy"
        }
      ]
    }
  ];
  const createFinderSmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    productPath: "renderer -> preload -> main -> fs -> Finder",
    artifactPath,
    appPolicySettings: ghosttyAppPolicySettings,
    beforeTree: ["notes.pdf", "photo.png", "script.ts"],
    afterTree: ["Code/script.ts", "Documents/notes.pdf", "Images/photo.png"],
    events: [
      {
        status: "approval_required",
        message: "Approval required (app policy): Finder requires approval by app policy."
      },
      {
        status: "executing",
        message: "Verified create_folder: Created folder: /tmp/demo/Images"
      },
      {
        status: "executing",
        message: "Verified move_file: Moved file: /tmp/demo/photo.png -> /tmp/demo/Images/photo.png"
      },
      {
        status: "completed",
        message: "Finder test folder organized."
      }
    ],
    processesAfterCleanup: []
  });
  const createChromeSmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    appLaunchViaOpen: true,
    chromeLaunchViaOpen: true,
    runnerHasTmux: false,
    productPath: "renderer -> preload -> main -> CDP -> Chrome",
    artifactPath,
    chromeEndpoint: "http://127.0.0.1:9444",
    appPolicySettings: ghosttyAppPolicySettings,
    extractedText: "skfiy chrome smoke ready",
    events: [
      {
        status: "approval_required",
        message: "Approval required (app policy): Chrome requires approval by app policy."
      },
      {
        status: "executing",
        message: "Verified navigate: Navigated to: file:///tmp/skfiy-chrome.html"
      },
      {
        status: "executing",
        message: "Verified extract_text: Extracted text: skfiy chrome smoke ready"
      },
      {
        status: "completed",
        message: "Chrome test page extracted: skfiy chrome smoke ready"
      }
    ],
    chromeProcessesAfterCleanup: [],
    processesAfterCleanup: []
  });
  const createBrokenChromeSmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    appLaunchViaOpen: true,
    chromeLaunchViaOpen: false,
    runnerHasTmux: true,
    productPath: "cdp-only",
    artifactPath,
    appPolicySettings: {
      apps: []
    },
    extractedText: "",
    events: [
      {
        status: "completed",
        message: "Chrome test page extracted:"
      }
    ],
    chromeProcessesAfterCleanup: ["123 Google Chrome"],
    processesAfterCleanup: ["456 skfiy.app"]
  });
  const createBrokenFinderSmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    appLaunchViaOpen: true,
    runnerHasTmux: true,
    productPath: "fs-only",
    artifactPath,
    appPolicySettings: {
      apps: []
    },
    beforeTree: ["photo.png"],
    afterTree: ["photo.png"],
    events: [
      {
        status: "completed",
        message: "Finder test folder organized."
      }
    ],
    processesAfterCleanup: ["123 skfiy.app"]
  });

  it("is exposed as an npm script for dogfood evidence checks", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:verify": "node scripts/verify-dogfood-artifacts.mjs"
    });
  });

  it("parses an explicit manifest path and require-passed gate", async () => {
    const {
      createDefaultDogfoodVerifyOptions,
      parseDogfoodVerifyArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodVerifyOptions: (rootDir: string) => Record<string, unknown>;
      parseDogfoodVerifyArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodVerifyOptions("/repo");

    expect(parseDogfoodVerifyArgs([
      "--manifest",
      ".skfiy-alpha/skfiy.json",
      "--require-passed",
      "--require-current-head"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy.json"),
      requirePassed: true,
      requireCurrentHead: true
    });
  });

  it("accepts a complete blocked dogfood evidence chain from the packaged app", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
        artifactPath: uiSmokePath,
        petClicked: true,
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制", state: "denied", stateText: "未授权" },
          { label: "辅助功能", state: "denied", stateText: "未授权" },
          { label: "麦克风", state: "not-determined", stateText: "待授权" },
          { label: "语音识别", state: "not-determined", stateText: "待授权" }
        ],
        processesAfterCleanup: []
      },
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        appPolicySettings: ghosttyAppPolicySettings,
        permissions: {
          screenRecording: { state: "denied" },
          accessibility: { state: "denied" }
        },
        runs: clipboardApprovalRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        speechStatus: {
          locale: "zh-CN",
          recognizerAvailable: true,
          speechRecognition: { state: "not-determined" },
          microphone: { state: "granted" }
        },
        providerEvents: [
          { providerId: "native-macos", state: "unavailable" }
        ],
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "passed",
      manifestPath,
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "manifest.uiSmokeArtifactPath", ok: true }),
        expect.objectContaining({ id: "manifest.smokeArtifactPath", ok: true }),
        expect.objectContaining({ id: "manifest.chromeSmokeArtifactPath", ok: true }),
        expect.objectContaining({ id: "manifest.finderSmokeArtifactPath", ok: true }),
        expect.objectContaining({ id: "manifest.voiceSmokeArtifactPath", ok: true }),
        expect.objectContaining({ id: "ui.productPath", ok: true }),
        expect.objectContaining({ id: "ghostty.productPath", ok: true }),
        expect.objectContaining({ id: "chrome.productPath", ok: true }),
        expect.objectContaining({ id: "chrome.actionVerification", ok: true }),
        expect.objectContaining({ id: "finder.productPath", ok: true }),
        expect.objectContaining({ id: "finder.actionVerification", ok: true }),
        expect.objectContaining({ id: "voice.productPath", ok: true })
      ])
    });
  });

  it("fails Ghostty matrix evidence that omits clipboard approval runs", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
        artifactPath: uiSmokePath,
        petClicked: true,
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
          { label: "麦克风" },
          { label: "语音识别" }
        ],
        processesAfterCleanup: []
      },
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        appPolicySettings: ghosttyAppPolicySettings,
        runs: [
          {
            id: "pwd-readonly",
            result: "blocked",
            events: [
              { status: "failed", message: "Screen Recording permission is required." }
            ]
          }
        ],
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        speechStatus: {
          locale: "zh-CN",
          recognizerAvailable: true,
          speechRecognition: { state: "not-determined" },
          microphone: { state: "granted" }
        },
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ghostty.clipboardApprovalRuns")
      ])
    });
  });

  it("fails when artifacts were captured through tmux or with missing product paths", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: []
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: true,
        productPath: "preload-only",
        artifactPath: uiSmokePath,
        petClicked: false,
        onboardingVisible: false,
        permissionRows: [],
        processesAfterCleanup: ["123 skfiy.app"]
      },
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: true,
        productPath: "helper-only",
        artifactPath: ghosttySmokePath,
        processesAfterCleanup: ["123 skfiy.app"]
      },
      [chromeSmokePath]: createBrokenChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createBrokenFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "helper-only",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("manifest.requiredDogfoodEvidence.ui"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.actionVerification"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.appPolicy"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.clipboardApproval"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chrome"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeAppPolicy"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeExtraction"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finder"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderAppPolicy"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderOrganization"),
        expect.stringContaining("ui.runnerHasTmux"),
        expect.stringContaining("ui.productPath"),
        expect.stringContaining("ui.petClicked"),
        expect.stringContaining("ui.permissionRows"),
        expect.stringContaining("ui.processesAfterCleanup"),
        expect.stringContaining("ghostty.runnerHasTmux"),
        expect.stringContaining("ghostty.productPath"),
        expect.stringContaining("ghostty.appPolicySettings"),
        expect.stringContaining("ghostty.clipboardApprovalRuns"),
        expect.stringContaining("ghostty.processesAfterCleanup"),
        expect.stringContaining("chrome.runnerHasTmux"),
        expect.stringContaining("chrome.productPath"),
        expect.stringContaining("chrome.appPolicySettings"),
        expect.stringContaining("chrome.approval"),
        expect.stringContaining("chrome.actionVerification"),
        expect.stringContaining("chrome.extractedText"),
        expect.stringContaining("chrome.chromeProcessesAfterCleanup"),
        expect.stringContaining("chrome.processesAfterCleanup"),
        expect.stringContaining("finder.runnerHasTmux"),
        expect.stringContaining("finder.productPath"),
        expect.stringContaining("finder.appPolicySettings"),
        expect.stringContaining("finder.approval"),
        expect.stringContaining("finder.actionVerification"),
        expect.stringContaining("finder.beforeTree"),
        expect.stringContaining("finder.afterTree"),
        expect.stringContaining("finder.processesAfterCleanup"),
        expect.stringContaining("voice.productPath")
      ])
    });
  });

  it("fails passed Ghostty evidence that lacks action verification events", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: true
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
        artifactPath: uiSmokePath,
        petClicked: true,
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
          { label: "麦克风" },
          { label: "语音识别" }
        ],
        processesAfterCleanup: []
      },
      [ghosttySmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        appPolicySettings: ghosttyAppPolicySettings,
        runs: clipboardApprovalRuns,
        events: [
          { status: "completed", message: "Command completed in Ghostty." }
        ],
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        speechStatus: {
          locale: "zh-CN",
          recognizerAvailable: true,
          speechRecognition: { state: "granted" },
          microphone: { state: "granted" }
        },
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ghostty.actionVerification")
      ])
    });
  });

  it("fails when current-head evidence is required but the manifest commit is stale", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false,
      requireCurrentHead: true,
      currentHeadSha: "fresh-head"
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "stale-head",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
        artifactPath: uiSmokePath,
        petClicked: true,
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
          { label: "麦克风" },
          { label: "语音识别" }
        ],
        processesAfterCleanup: []
      },
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        appPolicySettings: ghosttyAppPolicySettings,
        runs: clipboardApprovalRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        speechStatus: {
          locale: "zh-CN",
          recognizerAvailable: true,
          speechRecognition: { state: "not-determined" },
          microphone: { state: "granted" }
        },
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("manifest.currentHead")
      ])
    });
  });

  it("fails when native voice smoke does not include structured speech permission status", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const uiSmokePath = "/repo/.skfiy-smoke/ui.json";
    const ghosttySmokePath = "/repo/.skfiy-smoke/ghostty.json";
    const chromeSmokePath = "/repo/.skfiy-smoke/chrome.json";
    const finderSmokePath = "/repo/.skfiy-smoke/finder.json";
    const voiceSmokePath = "/repo/.skfiy-smoke/voice.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: "a".repeat(64) },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        voiceSmokeArtifactPath: voiceSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
        artifactPath: uiSmokePath,
        petClicked: true,
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
          { label: "麦克风" },
          { label: "语音识别" }
        ],
        processesAfterCleanup: []
      },
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        appPolicySettings: ghosttyAppPolicySettings,
        runs: clipboardApprovalRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
        artifactPath: voiceSmokePath,
        provider: "native-macos",
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("voice.speechStatus")
      ])
    });
  });
});

function createMemoryIo(files: Record<string, unknown>) {
  return {
    async readJson(filePath: string) {
      const value = files[filePath];
      if (value === undefined || Buffer.isBuffer(value)) {
        throw new Error(`Missing JSON: ${filePath}`);
      }

      return value;
    },
    async stat(filePath: string) {
      const value = files[filePath];
      if (!Buffer.isBuffer(value)) {
        throw new Error(`Missing file: ${filePath}`);
      }

      return { size: value.byteLength };
    }
  };
}
