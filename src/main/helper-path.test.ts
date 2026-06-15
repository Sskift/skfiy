import { describe, expect, it } from "vitest";
import { resolveHelperPath } from "./helper-path";

describe("resolveHelperPath", () => {
  it("uses an explicit helper override first", () => {
    expect(
      resolveHelperPath({
        env: { SKFIY_HELPER_PATH: "/tmp/custom-helper" },
        appPath: "/repo",
        isPackaged: false,
        resourcesPath: "/repo/dist/skfiy.app/Contents/Resources",
        exists: () => false
      })
    ).toBe("/tmp/custom-helper");
  });

  it("uses the helper embedded beside Resources/app even when Electron reports unpackaged", () => {
    expect(
      resolveHelperPath({
        env: {},
        appPath: "/repo/dist/skfiy.app/Contents/Resources/app",
        isPackaged: false,
        resourcesPath: "/repo/dist/skfiy.app/Contents/Resources",
        exists: (candidate) => candidate.endsWith("/Resources/skfiy-helper")
      })
    ).toBe("/repo/dist/skfiy.app/Contents/Resources/skfiy-helper");
  });

  it("falls back to the development dist helper", () => {
    expect(
      resolveHelperPath({
        env: {},
        appPath: "/repo",
        isPackaged: false,
        resourcesPath: "/repo/node_modules/electron/dist/Electron.app/Contents/Resources",
        exists: () => false
      })
    ).toBe("/repo/dist/skfiy-helper");
  });
});
