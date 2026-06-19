import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("macOS helper activate-app diagnostics", () => {
  it("waits for the requested process to become frontmost and reports frontmost pid diagnostics", () => {
    const helperPath = path.join(
      process.cwd(),
      "macos-helper",
      "Sources",
      "skfiy-helper",
      "main.swift"
    );
    const source = readFileSync(helperPath, "utf8");

    expect(source).toContain("struct FrontmostApplicationSnapshot");
    expect(source).toContain("func readFrontmostApplication()");
    expect(source).toMatch(/func waitForFrontmost\(\s*bundleId: String,\s*processIdentifier: Int\?/);
    expect(source).toContain("frontmostProcessIdentifier");
    expect(source).toContain("frontmost.matches(bundleId: bundleId, processIdentifier: processIdentifier)");
  });

  it("exposes a non-activating desktop-session-status preflight command", () => {
    const helperPath = path.join(
      process.cwd(),
      "macos-helper",
      "Sources",
      "skfiy-helper",
      "main.swift"
    );
    const source = readFileSync(helperPath, "utf8");

    expect(source).toContain("desktop-session-status");
    expect(source).toContain("struct DesktopSessionStatusPayload");
    expect(source).toContain("func handleDesktopSessionStatus");
    expect(source).toContain("frontmostLocalizedName");
    expect(source).toContain("frontmostBundleId: frontmost.bundleId");
  });

  it("reports console lock diagnostics in desktop-session-status", () => {
    const helperPath = path.join(
      process.cwd(),
      "macos-helper",
      "Sources",
      "skfiy-helper",
      "main.swift"
    );
    const source = readFileSync(helperPath, "utf8");

    expect(source).toContain("import IOKit");
    expect(source).toContain("ioConsoleLocked");
    expect(source).toContain("cgSessionScreenIsLocked");
    expect(source).toContain("IOConsoleLocked");
    expect(source).toContain("CGSSessionScreenIsLocked");
  });
});
