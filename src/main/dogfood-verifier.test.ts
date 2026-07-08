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
    "npm run smoke:dashboard -- --output <path>",
    "npm run smoke:money-run -- --require-passed --output <path>",
    "Permission settings direct links",
    "Panic stop runtime hotkey evidence",
    "Panic stop product-path behavior evidence",
    "Dashboard readiness and dogfood evidence",
    "Accepted GitHub dogfood issue source",
    "action verification events when Computer Use passes",
    "Ghostty app policy settings",
    "clipboard read/write approval runs",
    "non-Computer-Use route guard runs",
    "Chrome app policy settings",
    "Chrome test-page extraction evidence",
    "Chrome Native Messaging heartbeat evidence",
    "Chrome installed-extension smoke evidence",
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
    "Finder item drag/drop evidence",
    "Long-horizon money-run supervision evidence"
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
  const nonComputerUseRouteGuardRuns = [
    {
      id: "chat-question-route-guard",
      result: "answered-without-computer-use",
      events: [
        {
          status: "completed",
          message: "我是 skfiy，可以回答问题，也可以在需要时调用 Computer Use 工具执行受控桌面操作。"
        }
      ]
    },
    {
      id: "unsupported-desktop-route-guard",
      result: "needs-clarification",
      events: [
        {
          status: "needs_clarification",
          message: "No supported desktop control route matched this request. 请明确目标应用和动作。"
        }
      ]
    }
  ];
  const ghosttyMatrixRuns = [
    ...clipboardApprovalRuns,
    ...nonComputerUseRouteGuardRuns
  ];
  const empty42ByteZipSha256 = "094c4931fdb2f2af417c9e0322a9716006e8211fe9017f671ac6e3251300acca";
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
    nativeHostBridgeRun: {
      result: "passed",
      productPath: "dist/skfiy -> Chrome Native Messaging heartbeat",
      command: [
        "/repo/dist/skfiy",
        "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
      ],
      response: {
        schemaVersion: 1,
        type: "skfiy.native.response",
        requestId: "chrome-smoke-native-host",
        result: "accepted"
      },
      heartbeatPath: "/repo/.skfiy-smoke/chrome-native-home/Library/Application Support/skfiy/chrome-extension-connection.json",
      heartbeat: {
        schemaVersion: 1,
        hostName: "com.sskift.skfiy",
        launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
        messageType: "skfiy.page.observe",
        requestId: "chrome-smoke-native-host"
      }
    },
    installedExtensionRun: {
      result: "blocked",
      productPath: "Chrome MV3 extension -> Native Messaging -> dist/skfiy heartbeat",
      chromeVersion: "Chrome/146.0.7680.80",
      extensionPath: "/repo/chrome-extension",
      heartbeatPath: "/repo/.skfiy-smoke/chrome-installed-extension-home/Library/Application Support/skfiy/chrome-extension-connection.json",
      blockedReason: "branded_chrome_load_extension_removed",
      recommendedBrowser: "Chrome for Testing or Chromium",
      diagnosticExtensions: [
        {
          id: "aapocclcgogkmnckokdopfmhonfmgoek",
          manifestName: "Google Network Speech"
        }
      ]
    },
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
  const createDashboardSmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    artifactPath,
    runnerHasTmux: false,
    productPath: "dist/skfiy -> skfiy dashboard -> loopback dashboard server",
    descriptorResponse: {
      status: 200
    },
    snapshotResponse: {
      status: 200,
      body: {
        schemaVersion: 1
      }
    },
    runtimeSnapshotCoverage: {
      result: "passed"
    },
    tokenLeakDetected: false,
    operatorReadiness: {
      state: "ready"
    },
    snapshot: {
      dogfoodRelease: {
        state: "ready"
      },
      evidenceSummary: {
        state: "ready"
      }
    }
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
  const createUiPetDragEvidence = () => ({
    result: "passed",
    source: "renderer-pointer-events-window-bounds",
    beforeBounds: { x: 1200, y: 820, width: 320, height: 224 },
    afterBounds: { x: 1212, y: 732, width: 320, height: 224 },
    moveEvents: [
      { deltaX: 12, deltaY: -58 },
      { deltaX: 0, deltaY: -30 }
    ],
    totalDeltaX: 12,
    totalDeltaY: -88,
    upwardMovement: true,
    suppressedClickAfterDrag: true
  });
  const createStopTurnRuntimeStatus = () => ({
    stopTurnHotkey: {
      accelerator: "Control+Alt+Shift+Esc",
      label: "Ctrl Opt Shift Esc",
      registered: true
    }
  });
  const createStopTurnBehavior = () => ({
    result: "passed",
    source: "renderer-escape-key-product-path",
    command: "mkdir skfiy-stop-smoke",
    beforeStatus: "approval_required",
    afterStatus: "cancelled",
    afterMessage: "Task stopped."
  });
  const createUiSmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
    artifactPath,
    petClicked: true,
    petDrag: createUiPetDragEvidence(),
    runtimeStatus: createStopTurnRuntimeStatus(),
    stopTurnBehavior: createStopTurnBehavior(),
    onboardingVisible: true,
    permissionRows: [
      { label: "屏幕录制", state: "denied", stateText: "未授权" },
      { label: "辅助功能", state: "denied", stateText: "未授权" }
    ],
    permissionSettingTargets: [
      { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" },
      { label: "辅助功能", target: "accessibility", buttonLabel: "打开辅助功能设置" }
    ],
    desktopSessionDiagnostics: {
      state: "controllable",
      status: {
        controllable: true,
        frontmostBundleId: "com.sskift.skfiy",
        frontmostLocalizedName: "skfiy",
        frontmostProcessIdentifier: 123
      },
      reason: "Desktop session is controllable."
    },
    processesAfterCleanup: []
  });
  const createDesktopPreflightBlockedEvidence = () => ({
    timestamp: "2026-06-19T08:33:23.556Z",
    appPath: "/repo/dist/skfiy.app",
    helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
    productPath: "packaged helper -> desktop-session-status",
    frontmost: {
      bundleId: "com.apple.loginwindow",
      localizedName: "loginwindow",
      processIdentifier: 591
    },
    controllable: false,
    result: "blocked",
    reason: "Desktop session is not controllable before target app launch: frontmostBundleId=com.apple.loginwindow frontmostProcessIdentifier=591. Unlock the Mac and keep the display awake, then retry."
  });
  const createDisplayAsleepPreflightBlockedEvidence = () => ({
    ...createDesktopPreflightBlockedEvidence(),
    display: {
      mainDisplayAsleep: true
    },
    reason: "Main display is asleep before target app launch and frontmostBundleId=com.apple.loginwindow frontmostProcessIdentifier=591. Wake and unlock the Mac, then retry."
  });
  const createDesktopPreflightBlockedEvent = () => {
    const desktopPreflight = createDesktopPreflightBlockedEvidence();

    return {
      status: "failed",
      message: desktopPreflight.reason,
      desktopPreflight
    };
  };
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
    runs: ghosttyMatrixRuns,
    processesAfterCleanup: []
  });
  const createPassedGhosttySmokeArtifact = (artifactPath: string) => ({
    result: "passed",
    appLaunchViaOpen: true,
    runnerHasTmux: false,
    productPath: "renderer -> preload -> main -> helper -> Ghostty",
    artifactPath,
    appPolicySettings: ghosttyAppPolicySettings,
    runs: ghosttyMatrixRuns,
    screenshots: [
      {
        stage: "before",
        path: "/repo/.skfiy-smoke/ghostty-before.png",
        bundleId: "com.mitchellh.ghostty",
        exists: true,
        nonEmpty: true,
        bytes: 1200
      },
      {
        stage: "after",
        path: "/repo/.skfiy-smoke/ghostty-after.png",
        bundleId: "com.mitchellh.ghostty",
        exists: true,
        nonEmpty: true,
        bytes: 1400
      }
    ],
    events: [
      { status: "executing", message: "Verified type_text: Helper accepted type_text." },
      { status: "executing", message: "Verified press_key: Helper accepted press_key." },
      { status: "completed", message: "Command completed in Ghostty." }
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
    expect(createDogfoodVerifyHelpText()).toContain("Chrome Native Messaging heartbeat evidence");
    expect(createDogfoodVerifyHelpText()).toContain("Chrome installed-extension smoke evidence");
    expect(createDogfoodVerifyHelpText()).toContain("Chrome current-page observation evidence");
    expect(createDogfoodVerifyHelpText()).not.toMatch(/voice|Speech|Microphone|语音|麦克风/i);
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
    const dashboardSmokePath = "/repo/.skfiy-smoke/dashboard.json";
    const moneyRunSmokePath = "/repo/.skfiy-smoke/money-run.json";
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        dashboardSmokeArtifactPath: dashboardSmokePath,
        moneyRunSmokeArtifactPath: moneyRunSmokePath,
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
        petDrag: createUiPetDragEvidence(),
        runtimeStatus: createStopTurnRuntimeStatus(),
        stopTurnBehavior: createStopTurnBehavior(),
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制", state: "denied", stateText: "未授权" },
          { label: "辅助功能", state: "denied", stateText: "未授权" }
        ],
        permissionSettingTargets: [
          { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" },
          { label: "辅助功能", target: "accessibility", buttonLabel: "打开辅助功能设置" }
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
        runs: ghosttyMatrixRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
      [dashboardSmokePath]: createDashboardSmokeArtifact(dashboardSmokePath),
      [moneyRunSmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "LaunchServices -> renderer -> preload -> main -> tmux supervision -> tmux read-only probes",
        artifactPath: moneyRunSmokePath,
        events: [
          {
            status: "approval_required",
            message: "Approval required: money-run tmux supervision is read-only but requires user approval."
          }
        ],
        mutatesSession: false,
        tmuxSupervisionReport: {
          sessionName: "money-run",
          mutatesSession: false,
          status: "observing",
          summary: {
            windowCount: 1,
            paneCount: 1
          }
        },
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
        expect.objectContaining({ id: "manifest.dashboardSmokeArtifactPath", ok: true }),
        expect.objectContaining({ id: "ui.productPath", ok: true }),
        expect.objectContaining({ id: "ui.stopTurnHotkey", ok: true }),
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
        expect.objectContaining({ id: "dashboard.artifactPath", ok: true }),
        expect.objectContaining({ id: "dashboard.result", ok: true }),
        expect.objectContaining({ id: "dashboard.tokenLeak", ok: true }),
        expect.objectContaining({ id: "moneyRun.productPath", ok: true }),
        expect.objectContaining({ id: "moneyRun.readOnly", ok: true }),
        expect.objectContaining({ id: "moneyRun.report", ok: true })
      ])
    });
  });

  it("fails when manifest smoke artifact filenames point at another alpha sha", async () => {
    const {
      verifyDogfoodArtifacts
    } = await import(pathToFileURL(modulePath).href) as {
      verifyDogfoodArtifacts: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const manifestPath = "/repo/.skfiy-alpha/skfiy.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc1234567890",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: "/repo/.skfiy-smoke/ui-deadbee.json",
        smokeArtifactPath: "/repo/.skfiy-smoke/ghostty-abc1234.json",
        chromeSmokeArtifactPath: "/repo/.skfiy-smoke/chrome-abc1234.json",
        finderSmokeArtifactPath: "/repo/.skfiy-smoke/finder-abc1234.json",
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42)
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        "manifest.currentAlphaSmokeArtifactPaths: manifest smoke artifact paths with alpha suffixes must reference current alpha abc1234; mismatched uiSmokeArtifactPath=/repo/.skfiy-smoke/ui-deadbee.json"
      ]),
      checks: expect.arrayContaining([
        expect.objectContaining({
          id: "manifest.currentAlphaSmokeArtifactPaths",
          ok: false
        })
      ])
    });
  });

  it("accepts desktop-session preflight blocked evidence before target app launch", async () => {
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
    const dashboardSmokePath = "/repo/.skfiy-smoke/dashboard.json";
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        desktopPreflight: createDesktopPreflightBlockedEvidence(),
        events: [createDesktopPreflightBlockedEvent()]
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder",
        artifactPath: finderSmokePath,
        targetMode: "item-drag-drop",
        desktopPreflight: createDesktopPreflightBlockedEvidence(),
        events: [createDesktopPreflightBlockedEvent()],
        finderObservation: {
          result: "blocked",
          reason: createDesktopPreflightBlockedEvidence().reason
        }
      }
    }))).resolves.toMatchObject({
      result: "passed",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "ghostty.desktopPreflight", ok: true }),
        expect.objectContaining({ id: "finder.desktopPreflight", ok: true }),
        expect.objectContaining({ id: "ghostty.processesAfterCleanup", ok: true }),
        expect.objectContaining({ id: "finder.processesAfterCleanup", ok: true })
      ])
    });
  });

  it("accepts display-asleep desktop preflight blocked evidence before target app launch", async () => {
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
    const dashboardSmokePath = "/repo/.skfiy-smoke/dashboard.json";
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";
    const desktopPreflight = createDisplayAsleepPreflightBlockedEvidence();
    const desktopPreflightEvent = {
      status: "failed",
      message: desktopPreflight.reason,
      desktopPreflight
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        desktopPreflight,
        events: [desktopPreflightEvent]
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: {
        result: "blocked",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder",
        artifactPath: finderSmokePath,
        targetMode: "item-drag-drop",
        desktopPreflight,
        events: [desktopPreflightEvent],
        finderObservation: {
          result: "blocked",
          reason: desktopPreflight.reason
        }
      }
    }))).resolves.toMatchObject({
      result: "passed",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "ghostty.desktopPreflight", ok: true }),
        expect.objectContaining({ id: "finder.desktopPreflight", ok: true })
      ])
    });
  });

  it("fails UI smoke evidence that omits desktop session diagnostics", async () => {
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
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";
    const uiArtifact = {
      ...createUiSmokeArtifact(uiSmokePath),
      result: "no-onboarding",
      onboardingVisible: false,
      permissions: {
        screenRecording: { state: "granted" },
        accessibility: { state: "granted" },
      }
    };
    delete (uiArtifact as { desktopSessionDiagnostics?: unknown }).desktopSessionDiagnostics;

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: uiArtifact,
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "ui.desktopSessionDiagnostics", ok: false })
      ])
    });
  });

  it("accepts UI onboarding evidence with default external text-entry permission rows", async () => {
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
    const dashboardSmokePath = "/repo/.skfiy-smoke/dashboard.json";
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: {
        ...createUiSmokeArtifact(uiSmokePath),
        permissionRows: [
          { label: "屏幕录制", state: "denied", stateText: "未授权" },
          { label: "辅助功能", state: "denied", stateText: "未授权" }
        ],
        permissionSettingTargets: [
          { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" },
          { label: "辅助功能", target: "accessibility", buttonLabel: "打开辅助功能设置" }
        ]
      },
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "passed",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "ui.permissionRows", ok: true }),
        expect.objectContaining({ id: "ui.permissionSettings", ok: true })
      ])
    });
  });

  it("fails UI evidence that omits the runtime stop-turn hotkey status", async () => {
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
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";
    const uiArtifact = createUiSmokeArtifact(uiSmokePath);

    delete (uiArtifact as { runtimeStatus?: unknown }).runtimeStatus;

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: uiArtifact,
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ui.stopTurnHotkey")
      ])
    });
  });

  it("fails UI evidence that omits stop-turn behavior evidence", async () => {
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
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";
    const uiArtifact = createUiSmokeArtifact(uiSmokePath);

    delete (uiArtifact as { stopTurnBehavior?: unknown }).stopTurnBehavior;

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: uiArtifact,
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ui.stopTurnBehavior")
      ])
    });
  });

  it("accepts Finder evidence that is blocked by packaged-app Computer Use permissions before actions run", async () => {
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
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";
    const permissionReason = "Finder Computer Use permission blocked: Screen Recording permission is denied; Accessibility permission is denied.";
    const finderArtifact = {
      ...createFinderSmokeArtifact(finderSmokePath),
      result: "blocked",
      permissions: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" }
      },
      finderObservation: {
        result: "blocked",
        reason: permissionReason
      },
      finderSemanticObservation: {
        result: "blocked",
        reason: `Skipped Finder semantic selection because ${permissionReason}`
      },
      finderPlanPreview: {
        result: "missing"
      },
      finderItemDragDrop: {
        result: "blocked",
        reason: `Skipped Finder item drag/drop because ${permissionReason}`
      },
      afterTree: ["notes.pdf", "photo.png", "script.ts"],
      events: [
        {
          status: "approval_required",
          message: "Approval required (app policy): Finder requires approval by app policy."
        },
        {
          status: "executing",
          message: "Risk medium: Finder organization moves files inside a user-approved folder."
        }
      ]
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: finderArtifact,
    }))).resolves.toMatchObject({
      result: "passed",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "finder.observation", ok: true }),
        expect.objectContaining({ id: "finder.semanticObservation", ok: true }),
        expect.objectContaining({ id: "finder.planPreview", ok: true }),
        expect.objectContaining({ id: "finder.actionVerification", ok: true }),
        expect.objectContaining({ id: "finder.itemDragDrop", ok: true }),
        expect.objectContaining({ id: "finder.afterTree", ok: true })
      ])
    });
  });

  it("fails when the alpha zip bytes match but the SHA256 does not", async () => {
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
        zip: { path: zipPath, bytes: 42, sha256: "b".repeat(64) },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("zip.sha256")
      ]),
      checks: expect.arrayContaining([
        expect.objectContaining({
          id: "zip.bytes",
          ok: true
        }),
        expect.objectContaining({
          id: "zip.sha256",
          ok: false,
          message: `zip sha256 must match manifest zip.sha256 (${empty42ByteZipSha256})`
        })
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
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
        petDrag: createUiPetDragEvidence(),
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
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
        runs: ghosttyMatrixRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: finderArtifact
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: finderArtifact,
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
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
        petDrag: createUiPetDragEvidence(),
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
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
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath)
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ghostty.clipboardApprovalRuns")
      ])
    });
  });

  it("fails Ghostty matrix evidence that omits non-Computer-Use route guards", async () => {
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: {
        ...createGhosttySmokeArtifact(ghosttySmokePath),
        runs: clipboardApprovalRuns
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ghostty.nonComputerUseRouteGuards")
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
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
        petDrag: createUiPetDragEvidence(),
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
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
        runs: ghosttyMatrixRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: finderArtifact
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: finderArtifact,
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
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
        petDrag: createUiPetDragEvidence(),
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
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
        runs: ghosttyMatrixRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: finderArtifact
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
    const dashboardSmokePath = "/repo/.skfiy-smoke/dashboard.json";
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        dashboardSmokeArtifactPath: dashboardSmokePath,
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
      [dashboardSmokePath]: {
        result: "failed",
        artifactPath: "/repo/.skfiy-smoke/other-dashboard.json",
        snapshot: {
          tokenLeak: true
        }
      }
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("manifest.requiredDogfoodEvidence.ui"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.stopTurnHotkey"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.stopTurnBehavior"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.actionVerification"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.appPolicy"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.clipboardApproval"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.nonComputerUseRouteGuards"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.chrome"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.issueSource"),
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
        expect.stringContaining("manifest.requiredDogfoodEvidence.dashboard"),
        expect.stringContaining("manifest.requiredDogfoodEvidence.dashboardReadiness"),
        expect.stringContaining("ui.runnerHasTmux"),
        expect.stringContaining("ui.productPath"),
        expect.stringContaining("ui.petClicked"),
        expect.stringContaining("ui.petDrag"),
        expect.stringContaining("ui.permissionRows"),
        expect.stringContaining("ui.processesAfterCleanup"),
        expect.stringContaining("ghostty.runnerHasTmux"),
        expect.stringContaining("ghostty.productPath"),
        expect.stringContaining("ghostty.appPolicySettings"),
        expect.stringContaining("ghostty.clipboardApprovalRuns"),
        expect.stringContaining("ghostty.nonComputerUseRouteGuards"),
        expect.stringContaining("ghostty.processesAfterCleanup"),
        expect.stringContaining("dashboard.artifactPath"),
        expect.stringContaining("dashboard.result"),
        expect.stringContaining("dashboard.tokenLeak"),
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
        expect.stringContaining("finder.processesAfterCleanup")
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: chromeArtifact,
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("chrome.fallbackSwitch")
      ])
    });
  });

  it("fails when Chrome smoke lacks packaged Native Messaging heartbeat evidence", async () => {
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
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";
    const chromeArtifact = createChromeSmokeArtifact(chromeSmokePath);
    delete (chromeArtifact as { nativeHostBridgeRun?: unknown }).nativeHostBridgeRun;

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: chromeArtifact,
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("chrome.nativeHostBridge")
      ])
    });
  });

  it("fails when Chrome smoke lacks installed-extension evidence", async () => {
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
    const zipPath = "/repo/.skfiy-alpha/skfiy.zip";
    const chromeArtifact = createChromeSmokeArtifact(chromeSmokePath);
    delete (chromeArtifact as { installedExtensionRun?: unknown }).installedExtensionRun;

    await expect(verifyDogfoodArtifacts({
      manifestPath,
      requirePassed: false
    }, createMemoryIo({
      [manifestPath]: {
        schemaVersion: 1,
        appName: "skfiy",
        commitSha: "abc123",
        bundleIdentifier: "com.sskift.skfiy",
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: chromeArtifact,
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("chrome.installedExtension")
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: createGhosttySmokeArtifact(ghosttySmokePath),
      [chromeSmokePath]: chromeArtifact,
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
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
        petDrag: createUiPetDragEvidence(),
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制", state: "denied", stateText: "未授权" },
          { label: "辅助功能", state: "denied", stateText: "未授权" },
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
        runs: ghosttyMatrixRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath)
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
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
        petDrag: createUiPetDragEvidence(),
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
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
        runs: ghosttyMatrixRuns,
        events: [
          { status: "completed", message: "Command completed in Ghostty." }
        ],
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath)
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ghostty.actionVerification")
      ])
    });
  });

  it("fails passed Ghostty evidence that lacks before and after screenshot proof", async () => {
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
        requiredDogfoodEvidence: requiredManifestEvidence
      },
      [zipPath]: Buffer.alloc(42),
      [uiSmokePath]: createUiSmokeArtifact(uiSmokePath),
      [ghosttySmokePath]: {
        result: "passed",
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        productPath: "renderer -> preload -> main -> helper -> Ghostty",
        artifactPath: ghosttySmokePath,
        appPolicySettings: ghosttyAppPolicySettings,
        runs: ghosttyMatrixRuns,
        screenshots: [],
        events: [
          { status: "executing", message: "Verified type_text: Helper accepted type_text." },
          { status: "executing", message: "Verified press_key: Helper accepted press_key." },
          { status: "completed", message: "Command completed in Ghostty." }
        ],
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath),
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("ghostty.screenshots")
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
        zip: { path: zipPath, bytes: 42, sha256: empty42ByteZipSha256 },
        uiSmokeArtifactPath: uiSmokePath,
        smokeArtifactPath: ghosttySmokePath,
        chromeSmokeArtifactPath: chromeSmokePath,
        finderSmokeArtifactPath: finderSmokePath,
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
        petDrag: createUiPetDragEvidence(),
        onboardingVisible: true,
        permissionRows: [
          { label: "屏幕录制" },
          { label: "辅助功能" },
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
        runs: ghosttyMatrixRuns,
        processesAfterCleanup: []
      },
      [chromeSmokePath]: createChromeSmokeArtifact(chromeSmokePath),
      [finderSmokePath]: createFinderSmokeArtifact(finderSmokePath)
    }))).resolves.toMatchObject({
      result: "failed",
      errors: expect.arrayContaining([
        expect.stringContaining("manifest.currentHead")
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
    },
    async readFile(filePath: string) {
      const value = files[filePath];
      if (!Buffer.isBuffer(value)) {
        throw new Error(`Missing file: ${filePath}`);
      }

      return value;
    }
  };
}
