import { describe, expect, it } from "vitest";
import { normalizeCliCommand } from "./cli-command-normalization";
import {
  createCliOutputSkeleton,
  type CliChromeExtensionInfoOutputFactory
} from "./cli-output-skeleton";

function expectInvocation(argv: string[]) {
  const result = normalizeCliCommand(argv, { rootDir: "/repo" });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.invocation;
}

function createOutput(argv: string[], extensionInfoFactory?: CliChromeExtensionInfoOutputFactory) {
  return createCliOutputSkeleton(expectInvocation(argv), {
    generatedAt: "2026-07-07T00:00:00.000Z",
    createChromeExtensionInfoOutput: extensionInfoFactory ?? (() => ({
      schemaVersion: 1,
      command: "chrome extension-info",
      generatedAt: "2026-07-07T00:00:00.000Z",
      result: "available"
    }))
  });
}

describe("CLI output skeleton", () => {
  it("creates status and operator skeletons with unknown readiness", () => {
    const status = createOutput([
      "status",
      "--json",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop",
      "--dashboard-url",
      "http://127.0.0.1:8787/"
    ]);

    expect(status).toEqual(expect.objectContaining({
      schemaVersion: 1,
      command: "status",
      generatedAt: "2026-07-07T00:00:00.000Z",
      app: { state: "unknown" },
      dashboard: {
        state: "unknown",
        url: "http://127.0.0.1:8787/"
      },
      readiness: expect.objectContaining({
        state: "needs-action",
        ready: false
      })
    }));

    expect(createOutput([
      "operator",
      "status",
      "--json",
      "--require-ready",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop"
    ])).toEqual(expect.objectContaining({
      command: "operator status",
      result: "not-run",
      ready: false,
      requireReady: true,
      executesSystemMutation: false
    }));
  });

  it("delegates chrome extension-info to the injected manifest-aware factory", () => {
    const output = createOutput([
      "chrome",
      "extension-info",
      "--json",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop"
    ], ({ invocation, generatedAt }) => ({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt,
      result: "needs-action",
      source: "injected"
    }));

    expect(output).toEqual({
      schemaVersion: 1,
      command: "chrome extension-info",
      generatedAt: "2026-07-07T00:00:00.000Z",
      result: "needs-action",
      source: "injected"
    });
  });

  it("creates Chrome page-control skeletons without executing browser actions", () => {
    expect(createOutput([
      "chrome",
      "click",
      "--json",
      "--extension-id",
      "abcdefghijklmnopabcdefghijklmnop",
      "--target-tab-id",
      "42",
      "--selector",
      "#submit"
    ])).toEqual(expect.objectContaining({
      schemaVersion: 1,
      command: "chrome click",
      generatedAt: "2026-07-07T00:00:00.000Z",
      plannedMutation: true,
      executesSystemMutation: true,
      result: "not-run",
      action: "click",
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      targetTabId: 42,
      selector: "#submit",
      actionPlan: expect.arrayContaining([
        "route the page-control request to the requested target tab"
      ])
    }));
  });
});
