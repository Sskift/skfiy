import { describe, expect, it } from "vitest";
import { selectCommandRoute } from "./task-routing";

describe("selectCommandRoute", () => {
  it("routes explicit Finder test-folder organization commands to Finder", () => {
    expect(selectCommandRoute("整理 Finder 测试文件夹 /tmp/skfiy-demo")).toEqual({
      kind: "finder",
      bundleId: "com.apple.finder"
    });
  });

  it("keeps terminal commands on the Ghostty route", () => {
    expect(selectCommandRoute("打开 Ghostty 执行 pwd 并截图")).toEqual({
      kind: "ghostty",
      bundleId: "com.mitchellh.ghostty"
    });
  });
});
