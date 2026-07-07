import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("money-run supervision app integration", () => {
  it("wires tmux supervision into the compiled app command path", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const taskEventSource = readFileSync(path.join(process.cwd(), "src/main/task-event-view.ts"), "utf8");

    expect(mainSource).toContain("runTmuxSupervisionTask");
    expect(mainSource).toContain("createTmuxSupervisionClient");
    expect(mainSource).toContain("route.kind === \"tmux_supervision\"");
    expect(taskEventSource).toContain("tmuxSupervisionReport");
    expect(taskEventSource).toContain("\"report\" in event");
    expect(mainSource).not.toContain("send-keys");
    expect(mainSource).not.toContain("kill-pane");
    expect(taskEventSource).not.toContain("send-keys");
    expect(taskEventSource).not.toContain("kill-pane");
  });
});
