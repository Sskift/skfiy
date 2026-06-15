import { describe, expect, it } from "vitest";
import { parseTerminalIntent } from "./terminal-intent";

describe("parseTerminalIntent", () => {
  it.each([
    ["打开 Ghostty 执行 pwd 并截图", "pwd"],
    ["打开终端运行 date", "date"],
    ["在 ghostty 里执行 `ls -la`", "ls -la"],
    ["执行命令 whoami", "whoami"]
  ])("extracts a terminal command from voice intent %j", (input, command) => {
    expect(parseTerminalIntent(input)).toEqual({
      ok: true,
      command,
      source: "voice-intent"
    });
  });

  it.each(["pwd", "ls -la", "mkdir skfiy-demo", "rm -rf ~/Desktop"])(
    "keeps direct terminal command %j unchanged",
    (input) => {
      expect(parseTerminalIntent(input)).toEqual({
        ok: true,
        command: input,
        source: "direct-command"
      });
    }
  );

  it("translates a narrow folder creation voice intent into mkdir", () => {
    expect(parseTerminalIntent("创建 skfiy-demo 文件夹")).toEqual({
      ok: true,
      command: "mkdir skfiy-demo",
      source: "voice-intent"
    });
  });

  it("blocks unrecognized natural language instead of typing it into Ghostty", () => {
    expect(parseTerminalIntent("帮我整理一下桌面")).toEqual({
      ok: false,
      reason: "Could not identify a terminal command in the voice request."
    });
  });
});
