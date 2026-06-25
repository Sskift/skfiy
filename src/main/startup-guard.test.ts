import { describe, expect, it } from "vitest";
import { readStartupWarnings } from "./startup-guard";

describe("readStartupWarnings", () => {
  it("does not warn for the local app bundle path even when Electron is not formally packaged", () => {
    expect(
      readStartupWarnings({
        appPath: "/repo/dist/skfiy.app/Contents/Resources/app",
        devServerUrl: undefined,
        env: {},
        isPackaged: false,
        resourcesPath: "/repo/dist/skfiy.app/Contents/Resources",
        exists: (candidate) => candidate.endsWith("/Contents/MacOS/skfiy-helper")
      })
    ).toEqual([]);
  });

  it("warns when launched from tmux because permission attribution can be wrong", () => {
    expect(
      readStartupWarnings({
        appPath: "/repo",
        devServerUrl: undefined,
        env: { TMUX: "/tmp/tmux-501/default,1,0" },
        isPackaged: false,
        resourcesPath: "/repo/node_modules/electron/dist/Electron.app/Contents/Resources",
        exists: () => false
      })
    ).toContainEqual(
      expect.objectContaining({
        id: "tmux-launch",
        title: "tmux 启动会影响权限归属"
      })
    );
  });

  it("warns when using the Vite/Electron development entry", () => {
    expect(
      readStartupWarnings({
        appPath: "/repo",
        devServerUrl: "http://127.0.0.1:5173",
        env: {},
        isPackaged: false,
        resourcesPath: "/repo/node_modules/electron/dist/Electron.app/Contents/Resources",
        exists: () => false
      })
    ).toContainEqual(
      expect.objectContaining({
        id: "dev-server",
        title: "正在使用开发入口"
      })
    );
  });

  it("does not accept the obsolete Resources helper location as a bundled app", () => {
    expect(
      readStartupWarnings({
        appPath: "/repo/dist/skfiy.app/Contents/Resources/app",
        devServerUrl: undefined,
        env: {},
        isPackaged: false,
        resourcesPath: "/repo/dist/skfiy.app/Contents/Resources",
        exists: (candidate) => candidate.endsWith("/Contents/Resources/skfiy-helper")
      })
    ).toContainEqual(
      expect.objectContaining({
        id: "unbundled-electron"
      })
    );
  });
});
