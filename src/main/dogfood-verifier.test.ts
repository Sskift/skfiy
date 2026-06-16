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
    "Permission settings direct links",
    "Native voice transcript-to-task evidence",
    "action verification events when Computer Use passes",
    "Ghostty app policy settings",
    "clipboard read/write approval runs",
    "Chrome app policy settings",
    "Chrome test-page extraction evidence",
    "Chrome current-page observation evidence",
    "Chrome sensitive-page pause evidence",
    "Chrome form action evidence",
    "Chrome screenshot fallback evidence",
    "Chrome fallback switching evidence",
    "Finder app policy settings",
    "Finder observe_app screenshot or permission-blocked evidence",
    "Finder semantic selection evidence",
    "Finder plan preview evidence",
    "Finder plan confirmation evidence",
    "Finder test-folder organization evidence",
    "Finder item drag/drop evidence"
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
    productPath: "renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder",
    artifactPath,
    targetMode: "item-drag-drop",
    finderObservation: {
      result: "passed",
      screenshotPath: "/tmp/skfiy/finder-before.png",
      frontmostBundleId: "com.apple.finder",
      windowCount: 1
    },
    finderSemanticObservation: {
      result: "passed",
      source: "finder-applescript",
      frontmostBundleId: "com.apple.finder",
      targetPath: "/tmp/skfiy-finder-smoke",
      selectedCount: 1
    },
    finderPlanPreview: {
      result: "passed",
      rootPath: "/tmp/skfiy-finder-smoke",
      operationCount: 6,
      destructiveOperationCount: 0,
      createFolders: [
        "/tmp/skfiy-finder-smoke/Images",
        "/tmp/skfiy-finder-smoke/Documents",
        "/tmp/skfiy-finder-smoke/Code"
      ],
      moveFiles: [
        {
          from: "/tmp/skfiy-finder-smoke/photo.png",
          to: "/tmp/skfiy-finder-smoke/Images/photo.png"
        },
        {
          from: "/tmp/skfiy-finder-smoke/notes.pdf",
          to: "/tmp/skfiy-finder-smoke/Documents/notes.pdf"
        },
        {
          from: "/tmp/skfiy-finder-smoke/script.ts",
          to: "/tmp/skfiy-finder-smoke/Code/script.ts"
        }
      ]
    },
    finderItemDragDrop: {
      result: "passed",
      source: "finder-applescript-layout+hid-drag",
      frontmostBundleId: "com.apple.finder",
      folderPath: "/tmp/skfiy-finder-smoke",
      movedItem: "photo.png",
      targetItem: "Images",
      message: "Verified item_drag_drop: Dragged Finder item: /tmp/demo/photo.png -> /tmp/demo/Images/photo.png"
    },
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
        message: "Finder plan preview: 3 folders, 3 moves, 0 destructive operations."
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
          status: "executing",
          message: "Verified item_drag_drop: Dragged Finder item: /tmp/demo/photo.png -> /tmp/demo/Images/photo.png"
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
    currentPageRun: {
      result: "passed",
      command: "观察 Chrome 当前页面并提取正文",
      pageSnapshot: {
        url: "file:///tmp/skfiy-chrome.html",
        title: "skfiy chrome smoke",
        text: "skfiy chrome smoke ready"
      },
      extractedText: "skfiy chrome smoke ready",
      events: [
        {
          status: "approval_required",
          message: "Approval required (app policy): Chrome requires approval by app policy."
        },
        {
          status: "executing",
          message: "Verified current_page_snapshot: Observed current page: skfiy chrome smoke (file:///tmp/skfiy-chrome.html)"
        },
        {
          status: "completed",
          message: "Chrome current page extracted: skfiy chrome smoke ready"
        }
      ]
    },
    sensitiveRun: {
      result: "sensitive-paused",
      pageUrl: "file:///tmp/skfiy-login.html",
      events: [
        {
          status: "approval_required",
          message: "Approval required (app policy): Chrome requires approval by app policy."
        },
        {
          status: "executing",
          message: "Verified navigate: Navigated to: file:///tmp/skfiy-login.html"
        },
        {
          status: "needs_confirmation",
          message: "Verification failed (sensitive): Sensitive UI text is visible."
        }
      ]
    },
    formRun: {
      result: "passed",
      pageUrl: "file:///tmp/skfiy-form.html",
      fields: [
        { selector: "#name", value: "skfiy" },
        { selector: "#email", value: "agent@skfiy.test" },
        { selector: "#role", value: "operator" }
      ],
      extractedText: "skfiy agent@skfiy.test operator form submitted",
      events: [
        {
          status: "approval_required",
          message: "Approval required (app policy): Chrome requires approval by app policy."
        },
        {
          status: "executing",
          message: "Verified navigate: Navigated to: file:///tmp/skfiy-form.html"
        },
        {
          status: "executing",
          message: "Verified fill_selector: Filled #name."
        },
        {
          status: "executing",
          message: "Verified fill_selector: Filled #email."
        },
        {
          status: "executing",
          message: "Verified fill_selector: Filled #role."
        },
        {
          status: "executing",
          message: "Verified click_selector: Clicked #submit."
        },
        {
          status: "executing",
          message: "Verified extract_text: Extracted text: skfiy agent@skfiy.test operator form submitted"
        },
        {
          status: "completed",
          message: "Chrome test page extracted: skfiy agent@skfiy.test operator form submitted"
        }
      ]
    },
    fallbackRun: {
      result: "fallback-blocked",
      command: "打开 Chrome 测试页面 file:///tmp/skfiy-chrome.html 并提取正文",
      productPath: "renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (connection): Chrome CDP endpoint is not configured; screenshot fallback failed: Screen Recording permission is required"
        }
      ]
    },
    fallbackSwitchRun: {
      result: "fallback-switched-blocked",
      command: "打开 Chrome 测试页面 file:///tmp/skfiy-chrome.html 并提取正文",
      productPath: "renderer -> preload -> main -> CDP failure -> helper observe_app -> Chrome screenshot fallback",
      configuredEndpoint: "http://127.0.0.1:65530",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      events: [
        {
          status: "executing",
          message: "Switching Chrome control from CDP to screenshot_fallback (navigation): Chrome CDP navigation failed: fetch failed"
        },
        {
          status: "needs_confirmation",
          message: "Verification failed (navigation): Chrome CDP navigation failed: fetch failed screenshot fallback failed: Screen Recording permission is required"
        }
      ]
    },
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
    sensitiveRun: {
      result: "passed",
      events: [
        {
          status: "completed",
          message: "Chrome test page extracted: password"
        }
      ]
    },
    formRun: {
      result: "failed",
      extractedText: "",
      events: [
        {
          status: "completed",
          message: "Chrome test page extracted:"
        }
      ]
    },
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
  const createUiSmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
    artifactPath,
    petClicked: true,
    onboardingVisible: true,
    permissionRows: [
      { label: "屏幕录制", state: "denied", stateText: "未授权" },
      { label: "辅助功能", state: "denied", stateText: "未授权" },
      { label: "麦克风", state: "not-determined", stateText: "待授权" },
      { label: "语音识别", state: "not-determined", stateText: "待授权" }
    ],
    permissionSettingTargets: [
      { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" },
      { label: "辅助功能", target: "accessibility", buttonLabel: "打开辅助功能设置" },
      { label: "麦克风", target: "microphone", buttonLabel: "打开麦克风设置" },
      { label: "语音识别", target: "speech-recognition", buttonLabel: "打开语音识别设置" }
    ],
    processesAfterCleanup: []
  });
  const createGhosttySmokeArtifact = (artifactPath: string) => ({
    result: "blocked",
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    productPath: "renderer -> preload -> main -> helper -> Ghostty",
    artifactPath,
    appPolicySettings: ghosttyAppPolicySettings,
    permissions: {
      screenRecording: { state: "denied" },
      accessibility: { state: "denied" }
    },
    runs: clipboardApprovalRuns,
    processesAfterCleanup: []
  });
  const createVoiceSmokeArtifact = (artifactPath: string) => ({
    result: "blocked",
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
    artifactPath,
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
  });
  const createPassedVoiceSmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    productPath: "renderer -> preload -> main -> helper -> native macOS Speech",
    artifactPath,
    provider: "native-macos",
    speechStatus: {
      locale: "zh-CN",
      recognizerAvailable: true,
      speechRecognition: { state: "granted" },
      microphone: { state: "granted" }
    },
    providerEvents: [
      {
        providerId: "native-macos",
        state: "listening",
        message: "macOS system speech is listening."
      },
      {
        providerId: "native-macos",
        state: "stopped",
        message: "macOS system speech finished."
      }
    ],
    transcriptEvents: [
      {
        providerId: "native-macos",
        isFinal: true,
        text: "打开 Ghostty 执行 pwd",
        confidence: 0.9
      }
    ],
    taskEvents: [
      {
        status: "observing",
        message: "Preparing Computer Use command from voice transcript."
      }
    ],
    processesAfterCleanup: []
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
      createDogfoodVerifyHelpText,
      parseDogfoodVerifyArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodVerifyOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodVerifyHelpText: () => string;
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
    expect(createDogfoodVerifyHelpText()).toContain("Chrome current-page observation evidence");
    expect(createDogfoodVerifyHelpText()).toContain("native voice transcript-to-task evidence");
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
        permissionSettingTargets: [
          { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" },
          { label: "辅助功能", target: "accessibility", buttonLabel: "打开辅助功能设置" },
          { label: "麦克风", target: "microphone", buttonLabel: "打开麦克风设置" },
          { label: "语音识别", target: "speech-recognition", buttonLabel: "打开语音识别设置" }
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
        expect.objectContaining({ id: "chrome.currentPage", ok: true }),
        expect.objectContaining({ id: "chrome.sensitivePause", ok: true }),
        expect.objectContaining({ id: "chrome.formAction", ok: true }),
        expect.objectContaining({ id: "chrome.fallback", ok: true }),
        expect.objectContaining({ id: "finder.productPath", ok: true }),
        expect.objectContaining({ id: "finder.actionVerification", ok: true }),
        expect.objectContaining({ id: "finder.planPreview", ok: true }),
        expect.objectContaining({ id: "finder.itemDragDrop", ok: true }),
        expect.objectContaining({ id: "voice.productPath", ok: true })
      ])
    });
  });

  it("fails Finder evidence that omits item drag/drop evidence", async () => {
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
    const finderArtifact = {
      ...createFinderSmokeArtifact(finderSmokePath),
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      targetMode: "explicit-path",
      finderItemDragDrop: undefined,
      events: createFinderSmokeArtifact(finderSmokePath).events.filter((event) => (
        !event.message?.startsWith("Verified item_drag_drop:")
      ))
    };

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
      [finderSmokePath]: finderArtifact,
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
        expect.stringContaining("finder.itemDragDrop")
      ])
    });
  });

  it("fails Finder evidence that omits the pre-execution plan preview", async () => {
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
    const finderArtifact = createFinderSmokeArtifact(finderSmokePath);
    delete (finderArtifact as { finderPlanPreview?: unknown }).finderPlanPreview;

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
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: finderArtifact,
      [voiceSmokePath]: createVoiceSmokeArtifact(voiceSmokePath)
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("finder.planPreview")
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

  it("fails current Finder folder evidence when semantic target does not match the fixture", async () => {
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
    const finderArtifact = {
      ...createFinderSmokeArtifact(finderSmokePath),
      targetMode: "current-finder-folder",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
      finderSemanticObservation: {
        result: "passed",
        source: "finder-applescript",
        frontmostBundleId: "com.apple.finder",
        targetPath: "/tmp/not-the-fixture",
        selectedCount: 0
      }
    };

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
      [finderSmokePath]: finderArtifact,
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
        expect.stringContaining("finder.currentFolderTarget")
      ])
    });
  });

  it("fails current Finder folder evidence without second-stage plan confirmation", async () => {
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
    const finderArtifact = {
      ...createFinderSmokeArtifact(finderSmokePath),
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      targetMode: "current-finder-folder",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
      finderPlanConfirmation: undefined,
      finderSemanticObservation: {
        result: "passed",
        source: "finder-applescript",
        frontmostBundleId: "com.apple.finder",
        targetPath: "/tmp/skfiy-finder-smoke",
        selectedCount: 0
      }
    };

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
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: finderArtifact,
      [voiceSmokePath]: createVoiceSmokeArtifact(voiceSmokePath)
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("finder.planConfirmation")
      ])
    });
  });

  it("fails selected Finder folder evidence when semantic selection does not include the fixture", async () => {
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
    const finderArtifact = {
      ...createFinderSmokeArtifact(finderSmokePath),
      targetMode: "selected-finder-folder",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
      finderSemanticObservation: {
        result: "passed",
        source: "finder-applescript",
        frontmostBundleId: "com.apple.finder",
        targetPath: "/tmp",
        selectedCount: 1,
        selectedItems: [
          {
            path: "/tmp/not-the-fixture",
            name: "not-the-fixture",
            kind: "directory"
          }
        ]
      }
    };

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
      [finderSmokePath]: finderArtifact,
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
        expect.stringContaining("finder.selectedFolderTarget")
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
        expect.stringContaining("manifest.requiredDogfoodEvidence.voiceTranscriptTask"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeAppPolicy"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeExtraction"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeCurrentPage"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeSensitivePause"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeFormAction"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeFallback"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chromeFallbackSwitch"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finder"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderAppPolicy"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderObservation"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderSemanticObservation"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderPlanPreview"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderPlanConfirmation"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderOrganization"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.finderItemDragDrop"),
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
        expect.stringContaining("chrome.currentPage"),
        expect.stringContaining("chrome.sensitivePause"),
        expect.stringContaining("chrome.formAction"),
        expect.stringContaining("chrome.fallback"),
        expect.stringContaining("chrome.fallbackSwitch"),
        expect.stringContaining("chrome.chromeProcessesAfterCleanup"),
        expect.stringContaining("chrome.processesAfterCleanup"),
        expect.stringContaining("finder.runnerHasTmux"),
        expect.stringContaining("finder.productPath"),
        expect.stringContaining("finder.appPolicySettings"),
        expect.stringContaining("finder.approval"),
        expect.stringContaining("finder.observation"),
        expect.stringContaining("finder.semanticObservation"),
        expect.stringContaining("finder.planPreview"),
        expect.stringContaining("finder.actionVerification"),
        expect.stringContaining("finder.itemDragDrop"),
        expect.stringContaining("finder.beforeTree"),
        expect.stringContaining("finder.afterTree"),
        expect.stringContaining("finder.processesAfterCleanup"),
        expect.stringContaining("voice.productPath")
      ])
    });
  });

  it("fails when Chrome smoke lacks configured-CDP fallback switch evidence", async () => {
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
    const chromeArtifact = createChromeSmokeArtifact(chromeSmokePath);
    delete (chromeArtifact as { fallbackSwitchRun?: unknown }).fallbackSwitchRun;

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
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: chromeArtifact,
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: createVoiceSmokeArtifact(voiceSmokePath)
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("chrome.fallbackSwitch")
      ])
    });
  });

  it("fails when Chrome smoke lacks current-page observation evidence", async () => {
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
    const chromeArtifact = createChromeSmokeArtifact(chromeSmokePath);
    delete (chromeArtifact as { currentPageRun?: unknown }).currentPageRun;

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
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: chromeArtifact,
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: createVoiceSmokeArtifact(voiceSmokePath)
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("chrome.currentPage")
      ])
    });
  });

  it("fails when permission onboarding lacks direct System Settings targets", async () => {
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
        permissionSettingTargets: [
          { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" }
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
          microphone: { state: "not-determined" }
        },
        dictationSettings: { provider: "native-macos" },
        events: [{ status: "failed", message: "Microphone permission is not-determined." }],
        providerEvents: [{ providerId: "native-macos", state: "unavailable" }],
        processesAfterCleanup: []
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ui.permissionSettings")
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

  it("fails passed native voice evidence without transcript-to-task proof", async () => {
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
    const incompleteVoice = createPassedVoiceSmokeArtifact(voiceSmokePath);

    delete (incompleteVoice as { transcriptEvents?: unknown }).transcriptEvents;
    delete (incompleteVoice as { taskEvents?: unknown }).taskEvents;

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
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [voiceSmokePath]: incompleteVoice
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("voice.transcript"),
        expect.stringContaining("voice.downstreamTask")
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
