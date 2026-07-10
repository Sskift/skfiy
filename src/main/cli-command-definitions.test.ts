import { describe, expect, it } from "vitest";
import {
  CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY,
  CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY,
  createCliCommandSurface
} from "./cli-command-definitions";

describe("CLI command definitions", () => {
  it("returns a defensive command surface copy with Chrome capabilities", () => {
    const first = createCliCommandSurface();
    const second = createCliCommandSurface();

    first.commands[0].path = "mutated";

    expect(second).toMatchObject({
      schemaVersion: 1,
      commands: expect.arrayContaining([
        expect.objectContaining({
          path: "status",
          capabilities: [
            CHROME_EXTENSION_PAGE_SAFETY_CAPABILITY,
            CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY
          ]
        }),
        expect.objectContaining({
          path: "chrome observe",
          plannedMutation: true,
          executesSystemMutation: true,
          capabilities: [CHROME_EXTENSION_PAGE_CONTROL_CAPABILITY]
        }),
        expect.objectContaining({
          path: "chrome policy show",
          plannedMutation: false,
          executesSystemMutation: false
        })
      ])
    });
    expect(second.commands[0].path).toBe("commands");
  });

  it("includes every product smoke target in the command surface", () => {
    expect(createCliCommandSurface().commands.filter((command) =>
      command.path.startsWith("smoke ")
    )).toEqual([
      expect.objectContaining({ path: "smoke ui", outputShape: "smoke" }),
      expect.objectContaining({ path: "smoke desktop-session", outputShape: "smoke" }),
      expect.objectContaining({ path: "smoke ghostty", outputShape: "smoke" }),
      expect.objectContaining({ path: "smoke chrome", outputShape: "smoke" }),
      expect.objectContaining({ path: "smoke dashboard", outputShape: "smoke" }),
      expect.objectContaining({ path: "smoke codex-plugin", outputShape: "smoke" }),
      expect.objectContaining({ path: "smoke finder", outputShape: "smoke" }),
      expect.objectContaining({ path: "smoke money-run", outputShape: "smoke" })
    ]);
  });
});
