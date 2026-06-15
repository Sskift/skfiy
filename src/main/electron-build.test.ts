import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("Electron build wiring", () => {
  it("loads the preload script as CommonJS so contextBridge is exposed in sandboxed windows", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const tsconfig = readFileSync(path.join(process.cwd(), "tsconfig.electron.json"), "utf8");

    expect(mainSource).toContain('"preload.cjs"');
    expect(tsconfig).toContain('"src/main/**/*.cts"');
  });

  it("defines a real macOS app bundle package plan for user-facing testing", async () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    const packagingModuleUrl = pathToFileURL(
      path.join(process.cwd(), "scripts/package-macos-app.mjs")
    ).href;
    const packaging = await import(packagingModuleUrl) as {
      ELECTRON_APP_COPY_OPTIONS: {
        recursive: boolean;
        verbatimSymlinks: boolean;
      };
      createPackagePlan: (options: {
        rootDir: string;
        electronAppPath: string;
      }) => {
        appBundlePath: string;
        bundleIdentifier: string;
        bundledAppPath: string;
        bundledHelperPath: string;
      };
    };

    expect(packageJson.scripts["package:mac"]).toBe("node scripts/package-macos-app.mjs");
    expect(packageJson.scripts.build).toContain("npm run package:mac");
    expect(packaging.ELECTRON_APP_COPY_OPTIONS).toMatchObject({
      recursive: true,
      verbatimSymlinks: true
    });
    expect(
      packaging.createPackagePlan({
        rootDir: "/repo",
        electronAppPath: "/repo/node_modules/electron/dist/Electron.app"
      })
    ).toMatchObject({
      appBundlePath: "/repo/dist/skfiy.app",
      bundleIdentifier: "com.sskift.skfiy",
      bundledAppPath: "/repo/dist/skfiy.app/Contents/Resources/app",
      bundledHelperPath: "/repo/dist/skfiy.app/Contents/Resources/skfiy-helper"
    });
  });
});
