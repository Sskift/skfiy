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
      requiredPermissionLabels: ["屏幕录制", "辅助功能", "麦克风", "语音识别"]
    });
    expect(parseUiSmokeArgs([
      "--output",
      "artifacts/ui.json",
      "--settle-ms",
      "1500",
      "--require-passed"
    ], defaults)).toMatchObject({
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
      onboardingVisible: true,
      permissionRows: [
        { label: "屏幕录制", stateText: "未授权" },
        { label: "辅助功能", stateText: "未授权" },
        { label: "麦克风", stateText: "待授权" },
        { label: "语音识别", stateText: "待授权" }
      ],
      requiredPermissionLabels: ["屏幕录制", "辅助功能", "麦克风", "语音识别"]
    };

    expect(classifyUiSmokeEvidence(passedEvidence)).toBe("passed");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      runnerHasTmux: true
    })).toBe("failed");
    expect(classifyUiSmokeEvidence({
      ...passedEvidence,
      permissionRows: [
        { label: "屏幕录制", stateText: "未授权" }
      ]
    })).toBe("missing-permission-rows");
  });

  it("drives the permission onboarding through the real renderer DOM rather than preload APIs alone", () => {
    const sourcePath = path.join(process.cwd(), "scripts", "smoke-ui-product.mjs");

    expect(existsSync(sourcePath)).toBe(true);

    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("acquireSmokeLock");
    expect(source).toContain("dispatchEvent(new MouseEvent(\"click\"");
    expect(source).toContain("aria-label=\"权限引导\"");
    expect(source).toContain("window.skfiy.getPermissions()");
  });
});
