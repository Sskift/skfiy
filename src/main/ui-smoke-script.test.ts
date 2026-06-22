import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("packaged UI product smoke script", () => {
  it("is exposed as an npm script for packaged-app UI evidence", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "smoke:ui": "node scripts/smoke-ui-product.mjs"
    });
  });

  it("parses product-path UI smoke options", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ui-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      createDefaultUiSmokeOptions,
      parseUiSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultUiSmokeOptions: (rootDir: string) => Record<string, unknown>;
      parseUiSmokeArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultUiSmokeOptions("/repo");

    expect(defaults).toMatchObject({
      appPath: path.join("/repo", "dist", "skfiy.app"),
      productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
      requiredPermissionLabels: ["屏幕录制", "辅助功能"]
    });
    expect(parseUiSmokeArgs([
      "--app",
      "dist/skfiy.app",
      "--output",
      "artifacts/ui.json",
      "--settle-ms",
      "1500",
      "--require-passed"
    ], defaults)).toMatchObject({
      appPath: path.resolve("dist/skfiy.app"),
      outputPath: path.resolve("artifacts/ui.json"),
      settleMs: 1500,
      requirePassed: true
    });
  });

  it("classifies a real permission onboarding click as passed only with product-path evidence", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ui-plan.mjs");
    const {
      classifyUiSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyUiSmokeEvidence: (input: Record<string, unknown>) => string;
    };
    const passedEvidence = {
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
      petClicked: true,
      petDrag: {
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
      },
      onboardingVisible: true,
      permissionRows: [
        { label: "屏幕录制", stateText: "未授权" },
        { label: "辅助功能", stateText: "未授权" }
      ],
      permissionSettingTargets: [
        { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" },
        { label: "辅助功能", target: "accessibility", buttonLabel: "打开辅助功能设置" }
      ],
      requiredPermissionLabels: ["屏幕录制", "辅助功能"],
      stopTurnBehavior: {
        result: "passed",
        source: "renderer-escape-key-product-path",
        command: "在 Ghostty 执行 mkdir skfiy-stop-smoke",
        beforeStatus: "approval_required",
        afterStatus: "idle",
        afterMessage: "Task stopped."
      }
    };

    expect(classifyUiSmokeEvidence(passedEvidence)).toBe("passed");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      runnerHasTmux: true
    })).toBe("failed");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      petDrag: undefined
    })).toBe("missing-pet-drag");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      stopTurnBehavior: undefined
    })).toBe("missing-stop-turn-behavior");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      petDrag: {
        result: "passed",
        source: "renderer-pointer-events-window-bounds",
        beforeBounds: { x: 1200, y: 820, width: 320, height: 224 },
        afterBounds: { x: 1212, y: 844, width: 320, height: 224 },
        moveEvents: [{ deltaX: 12, deltaY: 24 }],
        totalDeltaX: 12,
        totalDeltaY: 24,
        upwardMovement: false,
        suppressedClickAfterDrag: true
      }
    })).toBe("missing-pet-drag");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      permissionRows: [
        { label: "屏幕录制", stateText: "未授权" }
      ]
    })).toBe("missing-permission-rows");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      permissionSettingTargets: [
        { label: "屏幕录制", target: "screen-recording", buttonLabel: "打开屏幕录制设置" }
      ]
    })).toBe("missing-permission-settings");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      onboardingVisible: false,
      permissions: {
        screenRecording: { state: "granted" },
        accessibility: { state: "granted" }
      }
    })).toBe("no-onboarding");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      onboardingVisible: false,
      permissions: {
        screenRecording: { state: "granted" },
        accessibility: { state: "denied" }
      }
    })).toBe("missing-onboarding");
  });

  it("drives the permission onboarding through the real renderer DOM rather than preload APIs alone", () => {
    const sourcePath = path.join(process.cwd(), "scripts", "smoke-ui-product.mjs");

    expect(existsSync(sourcePath)).toBe(true);

    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("acquireSmokeLock");
    expect(source).toContain("dispatchEvent(new MouseEvent(\"click\"");
    expect(source).toContain("aria-label=\"权限引导\"");
    expect(source).toContain("permissionSettingTargets");
    expect(source).toContain("window.skfiy.getPermissions()");
    expect(source).toContain("window.skfiy.getPermissionDiagnostics()");
    expect(source).toContain("window.skfiy.getDesktopSessionDiagnostics()");
    expect(source).toContain("getWindowBounds");
    expect(source).toContain("dispatchPetPointerEvent(pet, \"pointerdown\"");
    expect(source).toContain("dispatchPetPointerEvent(pet, \"pointermove\"");
    expect(source).toContain("pet.dispatchEvent(new PointerEvent(type");
    expect(source).toContain("petDrag");
    expect(source).toContain("suppressedClickAfterDrag");
    expect(source).toContain("stopTurnBehavior");
    expect(source).toContain("exerciseStopTurnBehavior.toString()");
    expect(source).toContain("new KeyboardEvent(\"keydown\"");
    expect(source).toContain("Page.captureScreenshot");
    expect(source).toContain("rendererScreenshot");
    expect(source).toContain("layoutDiagnostics");
    expect(source).toContain("readButtonIconAlignmentDiagnostics");
    expect(source).toContain("scrollIntoView");
    expect(source).toContain("createInspectPermissionOnboardingExpression");
    expect(source).toContain("createInspectSettingsLayoutExpression");
    expect(source).toContain("roundMetric.toString()");
    expect(source).toContain("exercisePetDrag.toString()");
    expect(source).toContain("dispatchPetPointerEvent.toString()");
    expect(source).toContain("hasWindowBounds.toString()");
    expect(source).toContain("formatRuntimeExceptionDetails");
    expect(source).toContain("exceptionDetails.exception?.description");
  });
});
