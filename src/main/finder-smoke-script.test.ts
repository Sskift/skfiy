import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

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
    expect(source).toContain("window.skfiy.getAppPolicySettings()");
    expect(source).toContain("整理 Finder 当前文件夹");
    expect(source).toContain("整理 Finder 选中文件夹");
    expect(source).toContain("openFinderFolder");
    expect(source).toContain("selectFinderFolder");
  });

  it("defines a Finder product path and output option", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-finder-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      PRODUCT_PATH,
      createDefaultFinderSmokeOptions,
      createHelpText,
      parseFinderSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      PRODUCT_PATH: string;
      createDefaultFinderSmokeOptions: (rootDir: string) => Record<string, unknown>;
      createHelpText: (defaults: Record<string, unknown>) => string;
      parseFinderSmokeArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };

    expect(PRODUCT_PATH).toBe("renderer -> preload -> main -> helper observe_app -> fs -> Finder");
    expect(parseFinderSmokeArgs(
      ["--output", ".skfiy-smoke/finder.json"],
      createDefaultFinderSmokeOptions("/repo")
    )).toMatchObject({
      outputPath: path.resolve(".skfiy-smoke/finder.json"),
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
    expect(createHelpText(createDefaultFinderSmokeOptions("/repo"))).toContain("smoke:finder");
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
      events: [{ status: "completed", message: "Finder test folder organized." }],
      afterTree: [
        "Code/script.ts",
        "Documents/notes.pdf",
        "Images/photo.png"
      ]
    })).toBe("passed");
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
