import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("window bounds product API", () => {
  it("exposes read-only pet window bounds through main, preload, and renderer types", () => {
    const mainPath = path.join(process.cwd(), "src", "main", "main.ts");
    const preloadPath = path.join(process.cwd(), "src", "main", "preload.cts");
    const appPath = path.join(process.cwd(), "src", "renderer", "App.tsx");

    expect(existsSync(mainPath)).toBe(true);
    expect(existsSync(preloadPath)).toBe(true);
    expect(existsSync(appPath)).toBe(true);

    const mainSource = readFileSync(mainPath, "utf8");
    const preloadSource = readFileSync(preloadPath, "utf8");
    const appSource = readFileSync(appPath, "utf8");

    expect(mainSource).toContain("skfiy:get-window-bounds");
    expect(mainSource).toContain("return window.getBounds();");
    expect(preloadSource).toContain("getWindowBounds");
    expect(preloadSource).toContain("isWindowBounds");
    expect(preloadSource).toContain('ipcRenderer.invoke("skfiy:get-window-bounds")');
    expect(appSource).toContain("getWindowBounds: () => Promise<WindowBounds | null>");
  });
});
