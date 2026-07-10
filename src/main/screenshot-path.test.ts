import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createScreenshotPath,
  createScreenshotPathFactory,
  formatScreenshotTimestamp
} from "./screenshot-path";

describe("screenshot path", () => {
  it("formats filesystem-safe ISO timestamps", () => {
    expect(formatScreenshotTimestamp(new Date("2026-07-09T01:02:03.004Z")))
      .toBe("2026-07-09T01-02-03-004Z");
  });

  it("builds scoped screenshot paths under the skfiy temp directory", () => {
    expect(createScreenshotPath({
      scope: "ghostty-before",
      serial: 7,
      tempDir: "/tmp",
      timestamp: new Date("2026-07-09T01:02:03.004Z")
    })).toBe(path.join("/tmp", "skfiy", "ghostty-before-2026-07-09T01-02-03-004Z-7.png"));
  });

  it("increments serials while reading temp directory lazily", () => {
    let tempDir = "/tmp/first";
    const nextScreenshotPath = createScreenshotPathFactory({
      now: () => new Date("2026-07-09T01:02:03.004Z"),
      readTempDir: () => tempDir
    });

    expect(nextScreenshotPath("manual")).toBe(
      path.join("/tmp/first", "skfiy", "manual-2026-07-09T01-02-03-004Z-1.png")
    );

    tempDir = "/tmp/second";
    expect(nextScreenshotPath("manual")).toBe(
      path.join("/tmp/second", "skfiy", "manual-2026-07-09T01-02-03-004Z-2.png")
    );
  });
});
