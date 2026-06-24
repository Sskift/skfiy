import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

function createFinderPlanPreviewEvidence(rootPath = "/tmp/skfiy-finder-smoke") {
  return {
    result: "passed",
    rootPath,
    operationCount: 6,
    destructiveOperationCount: 0,
    createFolders: [
      path.join(rootPath, "Images"),
      path.join(rootPath, "Documents"),
      path.join(rootPath, "Code")
    ],
    moveFiles: [
      {
        from: path.join(rootPath, "photo.png"),
        to: path.join(rootPath, "Images", "photo.png")
      },
      {
        from: path.join(rootPath, "notes.pdf"),
        to: path.join(rootPath, "Documents", "notes.pdf")
      },
      {
        from: path.join(rootPath, "script.ts"),
        to: path.join(rootPath, "Code", "script.ts")
      }
    ]
  };
}

describe("Finder product smoke script", () => {
  it("is exposed as an npm script and uses the product preload API", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-finder-product.mjs"),
      "utf8"
    );

    expect(packageJson.scripts).toMatchObject({
      "smoke:finder": "node scripts/smoke-finder-product.mjs"
    });
    expect(source).toContain("window.skfiy.runCommand");
    expect(source).toContain("window.skfiy.approveTask()");
    expect(source).toContain("awaitPromise: false");
    expect(source).toContain("approvePendingFinderTasks");
    expect(source).toContain("window.skfiy.getAppPolicySettings()");
    expect(source).toContain("整理 Finder 当前文件夹");
    expect(source).toContain("整理 Finder 选中文件夹");
    expect(source).toContain("探测 Finder 拖拽测试文件夹");
    expect(source).toContain("拖放 Finder 测试文件夹");
    expect(source).toContain("openFinderFolder");
    expect(source).toContain("selectFinderFolder");
    expect(source).toContain("readFinderDragProbe");
    expect(source).toContain("readFinderItemDragDrop");
    expect(source).toContain("readFinderPlanPreview");
    expect(source).toContain("readFinderPlanConfirmation");
    expect(source).toContain(
      'event.message.includes("Verification failed (selection):")\n'
      + '      || event.message.includes("Verification failed (layout):")'
    );
  });

  it("wires Finder item layout through the packaged app main process", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");

    expect(source).toContain("function createFinderDesktopClient");
    expect(source).toContain("getFinderItemLayout: async");
    expect(source).toContain("helper.getFinderItemLayout");
    expect(source).toContain("plan_confirmation_required");
    expect(source).toContain("planApproved: true");
  });

  it("defines Finder product paths and output options", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      DRAG_PROBE_PRODUCT_PATH,
      ITEM_DRAG_DROP_PRODUCT_PATH,
      PRODUCT_PATH,
      createDefaultFinderSmokeOptions,
      createHelpText,
      DEFAULT_TIMEOUT_MS,
      parseFinderSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      DRAG_PROBE_PRODUCT_PATH: string;
      ITEM_DRAG_DROP_PRODUCT_PATH: string;
      PRODUCT_PATH: string;
      DEFAULT_TIMEOUT_MS: number;
      createDefaultFinderSmokeOptions: (rootDir: string) => Record<string, unknown>;
      createHelpText: (defaults: Record<string, unknown>) => string;
      parseFinderSmokeArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };

    expect(PRODUCT_PATH).toBe("renderer -> preload -> main -> helper observe_app -> fs -> Finder");
    expect(DRAG_PROBE_PRODUCT_PATH)
      .toBe("renderer -> preload -> main -> helper observe_app -> helper drag -> fs -> Finder");
    expect(ITEM_DRAG_DROP_PRODUCT_PATH)
      .toBe("renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder");
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(createDefaultFinderSmokeOptions("/repo")).toMatchObject({
      timeoutMs: DEFAULT_TIMEOUT_MS
    });
    expect(parseFinderSmokeArgs(
      ["--output", ".skfiy-smoke/finder.json"],
      createDefaultFinderSmokeOptions("/repo")
    )).toMatchObject({
      outputPath: path.resolve(".skfiy-smoke/finder.json"),
      targetMode: "explicit-path"
    });
    expect(parseFinderSmokeArgs(
      ["--target-dir", "real-finder-area"],
      createDefaultFinderSmokeOptions("/repo")
    )).toMatchObject({
      targetDir: path.resolve("real-finder-area"),
      targetMode: "explicit-path"
    });
    expect(parseFinderSmokeArgs(
      ["--current-folder"],
      createDefaultFinderSmokeOptions("/repo")
    )).toMatchObject({
      targetMode: "current-finder-folder"
    });
    expect(parseFinderSmokeArgs(
      ["--selected-folder"],
      createDefaultFinderSmokeOptions("/repo")
    )).toMatchObject({
      targetMode: "selected-finder-folder"
    });
    expect(parseFinderSmokeArgs(
      ["--drag-probe"],
      createDefaultFinderSmokeOptions("/repo")
    )).toMatchObject({
      targetMode: "drag-probe"
    });
    expect(parseFinderSmokeArgs(
      ["--item-drag-drop"],
      createDefaultFinderSmokeOptions("/repo")
    )).toMatchObject({
      targetMode: "item-drag-drop"
    });
    expect(createHelpText(createDefaultFinderSmokeOptions("/repo"))).toContain("smoke:finder");
    expect(createHelpText(createDefaultFinderSmokeOptions("/repo"))).toContain("--target-dir <path>");
  });

  it("requires target-dir Finder evidence to use an isolated fixture inside the requested directory", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence,
      createFinderTargetDirSafetyEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
      createFinderTargetDirSafetyEvidence: (input: {
        fixtureRoot?: string;
        targetDir?: string;
      }) => Record<string, unknown>;
    };

    const baseEvidence = {
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      targetMode: "explicit-path",
      targetDir: "/Users/test/Documents/skfiy-smoke-target",
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
        targetPath: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123",
        selectedCount: 0
      },
      finderPlanPreview: {
        result: "passed",
        rootPath: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123",
        operationCount: 6,
        destructiveOperationCount: 0,
        createFolders: [
          "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/Images",
          "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/Documents",
          "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/Code"
        ],
        moveFiles: [
          {
            from: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/photo.png",
            to: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/Images/photo.png"
          },
          {
            from: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/notes.pdf",
            to: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/Documents/notes.pdf"
          },
          {
            from: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/script.ts",
            to: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123/Code/script.ts"
          }
        ]
      },
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    };

    expect(createFinderTargetDirSafetyEvidence({
      targetDir: "/Users/test/Documents/skfiy-smoke-target",
      fixtureRoot: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123"
    })).toMatchObject({
      result: "passed",
      fixtureInsideTargetDir: true
    });

    expect(classifyFinderSmokeEvidence({
      ...baseEvidence,
      fixtureRoot: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123",
      targetDirSafety: {
        result: "passed",
        fixtureInsideTargetDir: true
      }
    })).toBe("passed");

    expect(createFinderTargetDirSafetyEvidence({
      targetDir: "/Users/test/Documents/skfiy-smoke-target",
      fixtureRoot: "/Users/test/Documents/skfiy-smoke-target"
    })).toMatchObject({
      result: "failed",
      fixtureInsideTargetDir: false
    });

    expect(classifyFinderSmokeEvidence({
      ...baseEvidence,
      fixtureRoot: "/Users/test/Documents/skfiy-smoke-target",
      targetDirSafety: {
        result: "failed",
        fixtureInsideTargetDir: false
      }
    })).toBe("failed");

    expect(classifyFinderSmokeEvidence({
      ...baseEvidence,
      fixtureRoot: "/Users/test/Documents/skfiy-smoke-target/skfiy-finder-smoke-abc123",
      targetDirSafety: {
        result: "passed",
        fixtureInsideTargetDir: true
      },
      finderPlanPreview: undefined
    })).toBe("failed");
  });

  it("classifies an executing Finder task with denied Computer Use permissions as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence,
      createPermissionBlockedFinderEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
      createPermissionBlockedFinderEvidence: (permissions: Record<string, unknown>) => Record<string, unknown> | undefined;
    };

    expect(classifyFinderSmokeEvidence({
      events: [
        {
          status: "executing",
          message: "Risk medium: Finder organization moves files inside a user-approved folder."
        }
      ],
      permissions: {
        screenRecording: { state: "denied" },
        accessibility: { state: "denied" }
      }
    })).toBe("blocked");
    expect(createPermissionBlockedFinderEvidence({
      screenRecording: { state: "denied" },
      accessibility: { state: "denied" }
    })).toMatchObject({
      result: "blocked",
      reason: expect.stringContaining("Screen Recording permission is denied")
    });
  });

  it("creates blocked Finder evidence when loginwindow prevents desktop control", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      createBlockedEnvironmentFinderEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      createBlockedEnvironmentFinderEvidence: (events: Array<Record<string, unknown>>) => Record<string, unknown> | undefined;
    };

    expect(createBlockedEnvironmentFinderEvidence([
      {
        status: "needs_confirmation",
        message: "Verification failed (activate): Desktop session is not controllable because loginwindow is frontmost. Unlock the Mac and keep the display awake, then try again."
      }
    ])).toMatchObject({
      result: "blocked",
      reason: expect.stringContaining("loginwindow is frontmost")
    });
  });

  it("lets desktop preflight block Finder smoke classification before target GUI setup", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      desktopPreflight: {
        result: "blocked",
        reason: "Desktop session is not controllable because loginwindow is frontmost."
      },
      events: []
    })).toBe("blocked");
  });

  it("times out stalled Finder smoke async operations with a labelled error", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      withSmokeTimeout
    } = await import(pathToFileURL(modulePath).href) as {
      withSmokeTimeout: <T>(promise: Promise<T>, timeoutMs: number, label: string) => Promise<T>;
    };

    await expect(withSmokeTimeout(
      new Promise(() => undefined),
      1,
      "Finder runCommand"
    )).rejects.toThrow("Finder runCommand timed out after 1ms");

    await expect(withSmokeTimeout(
      Promise.resolve("ok"),
      1_000,
      "Finder quick command"
    )).resolves.toBe("ok");
  });

  it("parses process ids from pgrep output for smoke cleanup", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      parseProcessIds
    } = await import(pathToFileURL(modulePath).href) as {
      parseProcessIds: (lines: string[]) => number[];
    };

    expect(parseProcessIds([
      "65362 /Users/bytedance/Desktop/test/skfiy/dist/skfiy.app/Contents/MacOS/skfiy --remote-debugging-port=9244",
      "65373 /Users/bytedance/Desktop/test/skfiy/dist/skfiy.app/Contents/Frameworks/Electron Helper (GPU).app/Contents/MacOS/Electron Helper (GPU)",
      "not-a-pid /bin/zsh"
    ])).toEqual([65362, 65373]);
  });

  it("classifies a completed Finder organization with expected after tree as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
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
      finderPlanPreview: createFinderPlanPreviewEvidence(),
      finderPlanConfirmation: {
        result: "passed",
        reason: "Finder current-folder organization needs confirmation after plan preview.",
        confirmedAfterPreview: true
      },
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("passed");
  });

  it("classifies completed Finder filesystem work as blocked when lockscreen prevents UI evidence", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      targetMode: "explicit-path",
      finderObservation: { result: "missing" },
      finderSemanticObservation: { result: "missing" },
      finderPlanPreview: createFinderPlanPreviewEvidence(),
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (activate): Desktop session is not controllable because loginwindow is frontmost. Unlock the Mac and keep the display awake, then try again."
        },
        { status: "completed", message: "Finder test folder organized." }
      ],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("blocked");
  });

  it("classifies a current Finder folder organization only when semantic target matches the fixture", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    const baseEvidence = {
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      targetMode: "current-finder-folder",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
      finderObservation: {
        result: "passed",
        screenshotPath: "/tmp/skfiy/finder-before.png",
        frontmostBundleId: "com.apple.finder",
        windowCount: 1
      },
      finderPlanPreview: createFinderPlanPreviewEvidence(),
      finderPlanConfirmation: {
        result: "passed",
        reason: "Finder current-folder organization needs confirmation after plan preview.",
        confirmedAfterPreview: true
      },
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    };

    expect(classifyFinderSmokeEvidence({
      ...baseEvidence,
      finderSemanticObservation: {
        result: "passed",
        source: "finder-applescript",
        frontmostBundleId: "com.apple.finder",
        targetPath: "/tmp/skfiy-finder-smoke",
        selectedCount: 0
      }
    })).toBe("passed");

    expect(classifyFinderSmokeEvidence({
      ...baseEvidence,
      finderSemanticObservation: {
        result: "passed",
        source: "finder-applescript",
        frontmostBundleId: "com.apple.finder",
        targetPath: "/tmp/skfiy-finder-smoke",
        selectedCount: 0
      },
      finderPlanConfirmation: undefined
    })).toBe("failed");

    expect(classifyFinderSmokeEvidence({
      ...baseEvidence,
      finderSemanticObservation: {
        result: "passed",
        source: "finder-applescript",
        frontmostBundleId: "com.apple.finder",
        targetPath: "/tmp/other-folder",
        selectedCount: 0
      }
    })).toBe("failed");
  });

  it("classifies a selected Finder folder organization only when semantic selection contains the fixture directory", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    const baseEvidence = {
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      targetMode: "selected-finder-folder",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
      finderObservation: {
        result: "passed",
        screenshotPath: "/tmp/skfiy/finder-before.png",
        frontmostBundleId: "com.apple.finder",
        windowCount: 1
      },
      finderPlanPreview: createFinderPlanPreviewEvidence(),
      finderPlanConfirmation: {
        result: "passed",
        reason: "Finder selected-folder organization needs confirmation after plan preview.",
        confirmedAfterPreview: true
      },
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    };

    expect(classifyFinderSmokeEvidence({
      ...baseEvidence,
      finderSemanticObservation: {
        result: "passed",
        source: "finder-applescript",
        frontmostBundleId: "com.apple.finder",
        targetPath: "/tmp",
        selectedCount: 1,
        selectedItems: [
          {
            path: "/tmp/skfiy-finder-smoke",
            name: "skfiy-finder-smoke",
            kind: "directory"
          }
        ]
      }
    })).toBe("passed");

    expect(classifyFinderSmokeEvidence({
      ...baseEvidence,
      finderSemanticObservation: {
        result: "passed",
        source: "finder-applescript",
        frontmostBundleId: "com.apple.finder",
        targetPath: "/tmp",
        selectedCount: 1,
        selectedItems: [
          {
            path: "/tmp/other-folder",
            name: "other-folder",
            kind: "directory"
          }
        ]
      }
    })).toBe("failed");
  });

  it("classifies a Finder drag probe with drag evidence and expected after tree as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> helper drag -> fs -> Finder",
      targetMode: "drag-probe",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
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
        selectedCount: 0
      },
      finderPlanPreview: createFinderPlanPreviewEvidence(),
      finderDragProbe: {
        result: "passed",
        source: "finder-hid-drag",
        frontmostBundleId: "com.apple.finder",
        message: "Verified drag: Finder drag probe from 260,360 to 580,360 over 300ms."
      },
      events: [
        {
          status: "executing",
          message: "Verified drag: Finder drag probe from 260,360 to 580,360 over 300ms."
        },
        { status: "completed", message: "Finder test folder organized." }
      ],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("passed");
  });

  it("classifies a Finder drag probe without drag evidence as failed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> helper drag -> fs -> Finder",
      targetMode: "drag-probe",
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
        selectedCount: 0
      },
      finderDragProbe: {
        result: "missing"
      },
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("failed");
  });

  it("classifies a Finder item drag/drop with layout and filesystem evidence as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder",
      targetMode: "item-drag-drop",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
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
        selectedCount: 0
      },
      finderPlanPreview: createFinderPlanPreviewEvidence(),
      finderItemDragDrop: {
        result: "passed",
        source: "finder-applescript-layout+hid-drag",
        frontmostBundleId: "com.apple.finder",
        folderPath: "/tmp/skfiy-finder-smoke",
        movedItem: "photo.png",
        targetItem: "Images",
        from: { x: 160, y: 220 },
        to: { x: 360, y: 220 }
      },
      events: [
        {
          status: "executing",
          message: "Verified item_drag_drop: Dragged Finder item: /tmp/skfiy-finder-smoke/photo.png -> /tmp/skfiy-finder-smoke/Images/photo.png"
        },
        { status: "completed", message: "Finder test folder organized." }
      ],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("passed");
  });

  it("classifies a permission-blocked Finder item drag/drop as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> helper finder item layout -> helper drag -> fs -> Finder",
      targetMode: "item-drag-drop",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
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
        selectedCount: 0
      },
      finderItemDragDrop: {
        result: "blocked",
        reason: "Verification failed (drag): Accessibility permission is required for skfiy."
      },
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (drag): Accessibility permission is required for skfiy."
        },
        { status: "completed", message: "Finder test folder organized." }
      ],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("blocked");
  });

  it("classifies an Accessibility-blocked Finder drag probe as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> helper drag -> fs -> Finder",
      targetMode: "drag-probe",
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
        selectedCount: 0
      },
      finderDragProbe: {
        result: "blocked",
        reason: "Verification failed (drag): Accessibility permission is required for skfiy."
      },
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (drag): Accessibility permission is required for skfiy."
        },
        { status: "completed", message: "Finder test folder organized." }
      ],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("blocked");
  });

  it("classifies a permission-blocked current Finder folder observation as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      targetMode: "current-finder-folder",
      fixtureRoot: "/tmp/skfiy-finder-smoke",
      finderObservation: {
        result: "blocked",
        reason: "Accessibility permission is required for skfiy."
      },
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (activate): Accessibility permission is required for skfiy."
        }
      ],
      afterTree: [
        "notes.pdf",
        "photo.png",
        "script.ts"
      ]
    })).toBe("blocked");
  });

  it("classifies a completed Finder organization without observe_app evidence as failed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("failed");
  });

  it("classifies a completed Finder organization without semantic selection evidence as failed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      finderObservation: {
        result: "passed",
        screenshotPath: "/tmp/skfiy/finder-before.png",
        frontmostBundleId: "com.apple.finder"
      },
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("failed");
  });

  it("classifies a completed Finder organization with permission-blocked observation as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      finderObservation: {
        result: "blocked",
        reason: "Screen Recording permission is required for skfiy."
      },
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("blocked");
  });

  it("classifies a completed Finder organization with Automation-blocked semantic observation as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");
    const {
      classifyFinderSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyFinderSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyFinderSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper observe_app -> fs -> Finder",
      finderObservation: {
        result: "passed",
        screenshotPath: "/tmp/skfiy/finder-before.png",
        frontmostBundleId: "com.apple.finder"
      },
      finderSemanticObservation: {
        result: "blocked",
        reason: "Automation permission is required to read Finder selection."
      },
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("blocked");
  });
});
