import { describe, expect, it } from "vitest";
import { createTmuxSupervisionClient } from "./tmux-supervision-client";

describe("createTmuxSupervisionClient", () => {
  it("observes a tmux session through read-only tmux commands", async () => {
    const calls: string[][] = [];
    const client = createTmuxSupervisionClient({
      tailLines: 80,
      runTmux: async (args) => {
        calls.push(args);

        if (args[0] === "has-session") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }

        if (args[0] === "list-windows") {
          return { exitCode: 0, stdout: "@11\t1\tnode\t1\t1", stderr: "" };
        }

        if (args[0] === "list-panes") {
          return {
            exitCode: 0,
            stdout: "money-run\t@11\t1\tnode\t%11\t1\t1\t0\tnode\tmoney-run-d1246",
            stderr: ""
          };
        }

        if (args[0] === "capture-pane") {
          return { exitCode: 0, stdout: "latest account equity +0.9%", stderr: "" };
        }

        throw new Error(`unexpected tmux args: ${args.join(" ")}`);
      }
    });

    await expect(client.observeSession("money-run")).resolves.toMatchObject({
      sessionName: "money-run",
      status: "observing",
      summary: {
        windowCount: 1,
        paneCount: 1,
        activePaneIds: ["%11"],
        deadPaneIds: []
      },
      panes: [
        {
          id: "%11",
          recentTail: "latest account equity +0.9%"
        }
      ],
      recommendation: {
        mutatesSession: false
      }
    });
    expect(calls).toEqual([
      ["has-session", "-t", "money-run"],
      [
        "list-windows",
        "-t",
        "money-run",
        "-F",
        "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}"
      ],
      [
        "list-panes",
        "-t",
        "money-run",
        "-s",
        "-F",
        "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_active}\t#{pane_dead}\t#{pane_current_command}\t#{pane_title}"
      ],
      ["capture-pane", "-p", "-t", "%11", "-S", "-80"]
    ]);
  });
});
