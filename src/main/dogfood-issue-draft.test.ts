import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("dogfood issue draft generator", () => {
  const modulePath = path.join(process.cwd(), "scripts", "create-dogfood-issue-draft.mjs");
  const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json";
  const alphaZipPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.zip";
  const uiSmokePath = "/repo/.skfiy-smoke/tester-a-ui.json";
  const ghosttySmokePath = "/repo/.skfiy-smoke/tester-a-ghostty.json";
  const chromeSmokePath = "/repo/.skfiy-smoke/tester-a-chrome.json";
  const finderSmokePath = "/repo/.skfiy-smoke/tester-a-finder.json";

  it("is exposed as an npm script for preparing real tester issue bodies", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:issue": "node scripts/create-dogfood-issue-draft.mjs"
    });
  });

  it("parses manifest, tester, workflow, output, and smoke artifact arguments", async () => {
    const {
      createDefaultDogfoodIssueDraftOptions,
      createDogfoodIssueDraftHelpText,
      parseDogfoodIssueDraftArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodIssueDraftOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodIssueDraftHelpText: () => string;
      parseDogfoodIssueDraftArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodIssueDraftOptions("/repo");

    expect(parseDogfoodIssueDraftArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "--tester-id",
      "tester-a",
      "--workflows",
      "coding-terminal,screenshot-inspection",
      "--check-report",
      "--ui-smoke-artifact",
      ".skfiy-smoke/tester-a-ui.json",
      "--smoke-artifact",
      ".skfiy-smoke/tester-a-ghostty.json",
      "--chrome-smoke-artifact",
      ".skfiy-smoke/tester-a-chrome.json",
      "--finder-smoke-artifact",
      ".skfiy-smoke/tester-a-finder.json",
      "--output",
      ".skfiy-dogfood/issues/tester-a.md"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      checkReport: true,
      uiSmokeArtifactPath: path.resolve(".skfiy-smoke/tester-a-ui.json"),
      smokeArtifactPath: path.resolve(".skfiy-smoke/tester-a-ghostty.json"),
      chromeSmokeArtifactPath: path.resolve(".skfiy-smoke/tester-a-chrome.json"),
      finderSmokeArtifactPath: path.resolve(".skfiy-smoke/tester-a-finder.json"),
      outputPath: path.resolve(".skfiy-dogfood/issues/tester-a.md")
    });
    expect(createDogfoodIssueDraftHelpText()).toContain("dogfood:issue");
    expect(createDogfoodIssueDraftHelpText()).toContain("--tester-id");
    expect(createDogfoodIssueDraftHelpText()).toContain("--workflows");
    expect(createDogfoodIssueDraftHelpText()).toContain("--check-report");
    expect(createDogfoodIssueDraftHelpText()).toContain("reportPreviewEligibility");
    expect(createDogfoodIssueDraftHelpText()).toContain("accepted GitHub dogfood issue");
    expect(createDogfoodIssueDraftHelpText()).toContain("app bundle preflight");
    expect(createDogfoodIssueDraftHelpText()).toContain("UI pet drag evidence");
    expect(createDogfoodIssueDraftHelpText()).toContain("panic stop evidence");
  });

  it("creates a GitHub issue body that dogfood:report can parse without manual alpha or artifact copying", async () => {
    const { createDogfoodIssueDraft } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodIssueDraft: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [manifestPath]: createManifest(),
      [uiSmokePath]: createSmoke(uiSmokePath, "passed", {
        appPath: "/repo/dist/skfiy.app",
        productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
        permissionStates: {
          screenRecording: { state: "granted" },
          accessibility: { state: "granted" }
        }
      }),
      [ghosttySmokePath]: createSmoke(ghosttySmokePath, "passed", {
        beforeScreenshotPath: "/tmp/skfiy/ghostty-before.png",
        afterScreenshotPath: "/tmp/skfiy/ghostty-after.png",
        taskEvents: [
          { type: "verified", message: "Verified type_text: type_text helper result accepted." },
          { type: "verified", message: "Verified press_key: press_key helper result accepted." }
        ],
        runs: [
          {
            id: "chat-question-route-guard",
            result: "answered-without-computer-use",
            events: [{ status: "completed", message: "我是 skfiy。" }]
          },
          {
            id: "unsupported-desktop-route-guard",
            result: "needs-clarification",
            events: [{ status: "needs_clarification", message: "No supported desktop control route matched this request." }]
          }
        ],
        appPolicySettings: [
          { name: "Ghostty", bundleId: "com.mitchellh.ghostty", policy: "allow" }
        ]
      }),
      [chromeSmokePath]: createSmoke(chromeSmokePath, "passed", {
        extractedText: "skfiy chrome smoke ready",
        currentPageRun: { result: "passed" },
        sensitiveFormRun: {
          result: "sensitive-paused",
          events: [
            {
              status: "needs_confirmation",
              message: "Verification failed (sensitive): Sensitive form input is not allowed for Chrome Computer Use."
            }
          ]
        },
        appPolicySettings: [
          { name: "Chrome", bundleId: "com.google.Chrome", policy: "ask" }
        ]
      }),
      [finderSmokePath]: createSmoke(finderSmokePath, "blocked", {
        finderPlanPreview: { result: "passed", destructiveOperationCount: 0 },
        appPolicySettings: [
          { name: "Finder", bundleId: "com.apple.finder", policy: "ask" }
        ]
      })
    });

    const result = await createDogfoodIssueDraft({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      uiSmokeArtifactPath: uiSmokePath,
      smokeArtifactPath: ghosttySmokePath,
      chromeSmokeArtifactPath: chromeSmokePath,
      finderSmokeArtifactPath: finderSmokePath,
      outputPath: "/repo/.skfiy-dogfood/issues/tester-a.md"
    }, io);

    expect(result).toMatchObject({
      result: "created",
      outputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      summary: {
        testerId: "tester-a",
        workflows: ["coding-terminal", "screenshot-inspection"],
        computerUseResult: "passed",
        runnerHasTmux: false
      }
    });
    const body = io.files["/repo/.skfiy-dogfood/issues/tester-a.md"] as string;
    expect(body).toContain("### alpha manifest");
    expect(body).toContain(path.basename(manifestPath));
    expect(body).toContain("### alpha zip");
    expect(body).toContain(path.basename(alphaZipPath));
    expect(body).toContain("### commit sha");
    expect(body).toContain("abc123");
    expect(body).toContain("### tester id");
    expect(body).toContain("tester-a");
    expect(body).toContain("- [x] coding-terminal");
    expect(body).toContain("- [x] screenshot-inspection");
    expect(body).toContain("- [ ] finder-file");
    expect(body).toContain("- [ ] browser-fallback");
    expect(body).toContain(uiSmokePath);
    expect(body).toContain(ghosttySmokePath);
    expect(body).toContain(chromeSmokePath);
    expect(body).toContain(finderSmokePath);
    expect(body).toContain("### runnerHasTmux");
    expect(body).toContain("false");
    expect(body).toContain("### app bundle preflight");
    expect(body).toContain("appPath: /repo/dist/skfiy.app");
    expect(body).toContain("appLaunchViaOpen: true");
    expect(body).toContain("runnerHasTmux: false");
    expect(body).toContain("productPath: LaunchServices -> renderer DOM -> React permission onboarding");
    expect(body).toContain("### UI pet drag evidence");
    expect(body).toContain("source: renderer-pointer-events-window-bounds");
    expect(body).toContain("totalDeltaY: -88");
    expect(body).toContain("upwardMovement: true");
    expect(body).toContain("suppressedClickAfterDrag: true");
    expect(body).toContain("### Screen Recording");
    expect(body).toContain("granted");
    expect(body).toContain("### action verification events");
    expect(body).toContain("Verified type_text");
    expect(body).toContain("Verified press_key");
    expect(body).toContain("### non-Computer-Use route guards");
    expect(body).toContain("chat-question-route-guard");
    expect(body).toContain("unsupported-desktop-route-guard");
    expect(body).toContain("### Chrome extracted text");
    expect(body).toContain("skfiy chrome smoke ready");
    expect(body).toContain("sensitiveFormRun");
    expect(body).toContain("Sensitive form input is not allowed for Chrome Computer Use.");
    expect(body).toContain("### Finder plan preview");
    expect(body).toContain("destructiveOperationCount: 0");
    expect(body).toContain("### panic stop");
    expect(body).toContain("accelerator: Control+Alt+Shift+Esc");
    expect(body).toContain("label: Ctrl Opt Shift Esc");
    expect(body).toContain("registered: true");
    expect(body).toContain("source: runtimeStatus.stopTurnHotkey");
    expect(body).toContain("behaviorResult: passed");
    expect(body).toContain("behaviorSource: renderer-escape-key-product-path");
    expect(body).toContain("behaviorBeforeStatus: approval_required");
    expect(body).toContain("behaviorAfterStatus: cancelled");
    expect(body).toContain("behaviorAfterMessage: Task stopped.");
  });

  it("summarizes Computer Use result from the artifacts that match selected workflows", async () => {
    const { createDogfoodIssueDraft } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodIssueDraft: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [manifestPath]: createManifest(),
      [uiSmokePath]: createSmoke(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmoke(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmoke(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmoke(finderSmokePath, "passed")
    });

    const result = await createDogfoodIssueDraft({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      uiSmokeArtifactPath: uiSmokePath,
      smokeArtifactPath: ghosttySmokePath,
      chromeSmokeArtifactPath: chromeSmokePath,
      finderSmokeArtifactPath: finderSmokePath,
      outputPath: "/repo/.skfiy-dogfood/issues/tester-a.md"
    }, io);

    expect(result).toMatchObject({
      summary: {
        computerUseResult: "blocked"
      }
    });
    expect(io.files["/repo/.skfiy-dogfood/issues/tester-a.md"]).toContain([
      "### Computer Use result",
      "",
      "blocked"
    ].join("\n"));
  });

  it("uses Chrome fallback sub-run status for browser-fallback workflow reports", async () => {
    const { createDogfoodIssueDraft } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodIssueDraft: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [manifestPath]: createManifest(),
      [uiSmokePath]: createSmoke(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmoke(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmoke(chromeSmokePath, "passed", {
        fallbackRun: {
          result: "fallback-blocked",
          reason: "Screen Recording permission is required for screenshot fallback."
        }
      }),
      [finderSmokePath]: createSmoke(finderSmokePath, "passed")
    });

    const result = await createDogfoodIssueDraft({
      manifestPath,
      testerId: "tester-a",
      workflows: ["browser-fallback"],
      uiSmokeArtifactPath: uiSmokePath,
      smokeArtifactPath: ghosttySmokePath,
      chromeSmokeArtifactPath: chromeSmokePath,
      finderSmokeArtifactPath: finderSmokePath,
      outputPath: "/repo/.skfiy-dogfood/issues/tester-a.md"
    }, io);

    expect(result).toMatchObject({
      summary: {
        computerUseResult: "blocked"
      }
    });
    expect(io.files["/repo/.skfiy-dogfood/issues/tester-a.md"]).toContain([
      "### Computer Use result",
      "",
      "blocked"
    ].join("\n"));
  });

  it("round-trips generated drafts through the dogfood:report parser when requested", async () => {
    const { createDogfoodIssueDraft } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodIssueDraft: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [manifestPath]: createManifest(),
      [uiSmokePath]: createSmoke(uiSmokePath, "passed"),
      [ghosttySmokePath]: createSmoke(ghosttySmokePath, "blocked"),
      [chromeSmokePath]: createSmoke(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmoke(finderSmokePath, "passed")
    });

    await expect(createDogfoodIssueDraft({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      uiSmokeArtifactPath: uiSmokePath,
      smokeArtifactPath: ghosttySmokePath,
      chromeSmokeArtifactPath: chromeSmokePath,
      finderSmokeArtifactPath: finderSmokePath,
      outputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      checkReport: true,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "created",
      reportPreview: {
        testerId: "tester-a",
        result: "blocked",
        manifestPath,
        workflows: ["coding-terminal", "screenshot-inspection"],
        appLaunchViaOpen: true,
        runnerHasTmux: false,
        source: {
          generatedBy: "dogfood:report",
          artifactSource: "github-issue-smoke-artifacts",
          issueAlphaManifest: path.basename(manifestPath),
          issueAlphaZip: path.basename(alphaZipPath),
          issueCommitSha: "abc123"
        },
        artifactResults: {
          ui: "passed",
          ghostty: "blocked",
          chrome: "passed",
          finder: "passed"
        }
      },
      reportPreviewEligibility: {
        eligible: true,
        blockingChecks: []
      }
    });
  });

  it("reports verifier blocking checks when the generated draft is not cohort-report eligible", async () => {
    const { createDogfoodIssueDraft } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodIssueDraft: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      [manifestPath]: createManifest(),
      [uiSmokePath]: createSmoke(uiSmokePath, "passed", { appLaunchViaOpen: false }),
      [ghosttySmokePath]: createSmoke(ghosttySmokePath, "passed"),
      [chromeSmokePath]: createSmoke(chromeSmokePath, "passed"),
      [finderSmokePath]: createSmoke(finderSmokePath, "passed")
    });

    await expect(createDogfoodIssueDraft({
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal"],
      uiSmokeArtifactPath: uiSmokePath,
      smokeArtifactPath: ghosttySmokePath,
      chromeSmokeArtifactPath: chromeSmokePath,
      finderSmokeArtifactPath: finderSmokePath,
      outputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      checkReport: true,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).rejects.toThrow("Issue app bundle preflight appLaunchViaOpen must be true and match the UI smoke artifact.");
  });

  function createManifest() {
    return {
      schemaVersion: 1,
      appName: "skfiy",
      commitSha: "abc123",
      zip: { path: alphaZipPath },
      uiSmokeArtifactPath: uiSmokePath,
      smokeArtifactPath: ghosttySmokePath,
      chromeSmokeArtifactPath: chromeSmokePath,
      finderSmokeArtifactPath: finderSmokePath
    };
  }

  function createSmoke(
    artifactPath: string,
    result: string,
    overrides: Record<string, unknown> = {}
  ) {
    return {
      artifactPath,
      result,
      appPath: "/repo/dist/skfiy.app",
      launch: "open -na /repo/dist/skfiy.app --args --remote-debugging-port=9310",
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main",
      permissionStates: {
        screenRecording: { state: "unknown" },
        accessibility: { state: "unknown" }
      },
      petDrag: {
        result: "passed",
        source: "renderer-pointer-events-window-bounds",
        beforeBounds: { x: 1200, y: 820, width: 320, height: 224 },
        afterBounds: { x: 1200, y: 732, width: 320, height: 224 },
        moveEvents: [{ type: "pointermove", clientX: 1260, clientY: 760 }],
        totalDeltaX: 0,
        totalDeltaY: -88,
        upwardMovement: true,
        suppressedClickAfterDrag: true
      },
      runtimeStatus: {
        stopTurnHotkey: {
          accelerator: "Control+Alt+Shift+Esc",
          label: "Ctrl Opt Shift Esc",
          registered: true
        }
      },
      stopTurnBehavior: {
        result: "passed",
        source: "renderer-escape-key-product-path",
        command: "mkdir skfiy-stop-smoke",
        beforeStatus: "approval_required",
        afterStatus: "cancelled",
        afterMessage: "Task stopped."
      },
      ...overrides
    };
  }
});

function createMemoryIo(files: Record<string, unknown>) {
  return {
    files,
    async readJson(filePath: string) {
      const value = files[filePath];
      if (value === undefined) {
        throw new Error(`Missing JSON: ${filePath}`);
      }

      return value;
    },
    async writeText(filePath: string, value: string) {
      files[filePath] = value;
    },
    async mkdir() {
      return undefined;
    }
  };
}
