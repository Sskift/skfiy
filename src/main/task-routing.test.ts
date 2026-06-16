import { describe, expect, it } from "vitest";
import { selectCommandRoute } from "./task-routing";

describe("selectCommandRoute", () => {
  it("routes explicit Chrome test-page commands to Chrome", () => {
    expect(selectCommandRoute("打开 Chrome 测试页面 file:///tmp/skfiy-chrome.html 并提取正文")).toEqual({
      kind: "chrome",
      bundleId: "com.google.Chrome"
    });
  });

  it("routes explicit Chrome test-form commands to Chrome", () => {
    expect(selectCommandRoute(
      "填写 Chrome 测试表单 file:///tmp/skfiy-form.html 字段 #name=skfiy 点击 #submit 并提取正文"
    )).toEqual({
      kind: "chrome",
      bundleId: "com.google.Chrome"
    });
  });

  it("routes explicit Finder test-folder organization commands to Finder", () => {
    expect(selectCommandRoute("整理 Finder 测试文件夹 /tmp/skfiy-demo")).toEqual({
      kind: "finder",
      bundleId: "com.apple.finder"
    });
  });

  it("routes current Finder folder organization commands to Finder", () => {
    expect(selectCommandRoute("整理 Finder 当前文件夹")).toEqual({
      kind: "finder",
      bundleId: "com.apple.finder"
    });
  });

  it("routes selected Finder folder organization commands to Finder", () => {
    expect(selectCommandRoute("整理 Finder 选中文件夹")).toEqual({
      kind: "finder",
      bundleId: "com.apple.finder"
    });
  });

  it("routes Finder drag probe commands to Finder", () => {
    expect(selectCommandRoute("探测 Finder 拖拽测试文件夹 /tmp/skfiy-demo")).toEqual({
      kind: "finder",
      bundleId: "com.apple.finder"
    });
  });

  it("routes Finder item drag/drop commands to Finder", () => {
    expect(selectCommandRoute("拖放 Finder 测试文件夹 /tmp/skfiy-demo")).toEqual({
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
