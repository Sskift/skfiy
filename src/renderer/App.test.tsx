import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { type SkfiyApi, type TaskEvent } from "./App";

let emitTaskEvent: (event: TaskEvent) => void;

beforeEach(() => {
  emitTaskEvent = () => undefined;

  window.skfiy = {
    runCommand: vi.fn<SkfiyApi["runCommand"]>().mockResolvedValue(undefined),
    approveTask: vi.fn<SkfiyApi["approveTask"]>().mockResolvedValue(undefined),
    denyTask: vi.fn<SkfiyApi["denyTask"]>().mockResolvedValue(undefined),
    takeScreenshot: vi.fn<SkfiyApi["takeScreenshot"]>().mockResolvedValue(undefined),
    stopTask: vi.fn<SkfiyApi["stopTask"]>().mockResolvedValue(undefined),
    onTaskEvent: vi.fn((callback: (event: TaskEvent) => void) => {
      emitTaskEvent = callback;
      return vi.fn();
    })
  } satisfies SkfiyApi;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders each task status from task events", () => {
    render(<App />);

    expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent("Idle");

    const cases: Array<[TaskEvent["status"], string, string]> = [
      ["observing", "Observing", "Reading the screen"],
      ["executing", "Executing", "Typing in Ghostty"],
      ["approval_required", "Approval required", "Needs a human check"],
      ["completed", "Completed", "Task finished"],
      ["failed", "Failed", "Could not complete"]
    ];

    for (const [status, label, message] of cases) {
      act(() => emitTaskEvent({ status, message }));

      expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent(label);
      expect(screen.getByText(message)).toBeInTheDocument();
    }
  });

  it("toggles manual mode between active and quiet", () => {
    render(<App />);

    const toggle = screen.getByRole("switch", { name: /manual mode/i });
    expect(toggle).toBeChecked();
    expect(screen.getByText("Active")).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Quiet")).toBeInTheDocument();
  });

  it("can automatically switch between quiet idle and active task states", () => {
    render(<App />);

    const switchingToggle = screen.getByRole("switch", { name: /switching mode/i });
    fireEvent.click(switchingToggle);

    expect(switchingToggle).toBeChecked();
    expect(screen.getByText("Auto")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /manual mode/i })).not.toBeChecked();
    expect(screen.getByText("auto/quiet")).toBeInTheDocument();

    act(() => emitTaskEvent({ status: "executing", message: "Typing in Ghostty" }));

    expect(screen.getByRole("switch", { name: /manual mode/i })).toBeChecked();
    expect(screen.getByText("auto/active")).toBeInTheDocument();
  });

  it("exposes command, screenshot, run, and stop controls", () => {
    render(<App />);

    const input = screen.getByRole("textbox", { name: /command/i });
    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.click(screen.getByRole("button", { name: /run command/i }));
    fireEvent.click(screen.getByRole("button", { name: /take screenshot/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop task/i }));

    const api = window.skfiy as SkfiyApi;
    expect(api.runCommand).toHaveBeenCalledWith("pwd", { mode: "active" });
    expect(api.takeScreenshot).toHaveBeenCalledTimes(1);
    expect(api.stopTask).toHaveBeenCalledTimes(1);
  });

  it("exposes approval controls when a command is waiting for approval", () => {
    render(<App />);

    act(() => emitTaskEvent({ status: "approval_required", message: "Needs a human check" }));
    fireEvent.click(screen.getByRole("button", { name: /approve task/i }));
    fireEvent.click(screen.getByRole("button", { name: /deny task/i }));

    const api = window.skfiy as SkfiyApi;
    expect(api.approveTask).toHaveBeenCalledTimes(1);
    expect(api.denyTask).toHaveBeenCalledTimes(1);
  });
});
