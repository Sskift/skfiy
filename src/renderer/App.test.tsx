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
    moveWindowBy: vi.fn<SkfiyApi["moveWindowBy"]>(),
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
  it("starts as a Codex-style pet overlay with controls tucked away", () => {
    render(<App />);

    const pet = screen.getByRole("button", { name: /skfiy codex-style pet/i });
    expect(pet).toBeInTheDocument();
    expect(pet).toHaveAttribute("data-atlas-state", "idle");
    expect(pet).toHaveAttribute("data-frame-count", "6");
    expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent("Idle");
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run command/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
  });

  it("opens a simple command capsule from the pet", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /skfiy codex-style pet/i }));

    expect(screen.getByLabelText(/skfiy command capsule/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /command/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "执行" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "截图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("renders each task status and switches pet animation from task events", () => {
    render(<App />);

    expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent("Idle");

    const pet = screen.getByRole("button", { name: /skfiy codex-style pet/i });
    expect(pet).toHaveAttribute("data-atlas-state", "idle");

    const cases: Array<[TaskEvent["status"], string, string, string]> = [
      ["observing", "Observing", "Reading the screen", "review"],
      ["executing", "Executing", "Typing in Ghostty", "running"],
      ["approval_required", "Approval required", "Needs a human check", "waiting"],
      ["completed", "Completed", "Task finished", "waving"],
      ["failed", "Failed", "Could not complete", "failed"]
    ];

    for (const [status, label, message, animation] of cases) {
      act(() => emitTaskEvent({ status, message }));

      expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent(label);
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(pet).toHaveAttribute("data-atlas-state", animation);
    }
  });

  it("closes the command capsule by clicking the pet again", () => {
    render(<App />);

    const pet = screen.getByRole("button", { name: /skfiy codex-style pet/i });
    fireEvent.click(pet);
    expect(screen.getByLabelText(/skfiy command capsule/i)).toBeInTheDocument();

    fireEvent.click(pet);
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
  });

  it("drags the pet window without opening the command capsule", () => {
    render(<App />);

    const pet = screen.getByRole("button", { name: /skfiy codex-style pet/i });
    const api = window.skfiy as SkfiyApi;

    fireEvent.pointerDown(pet, { button: 0, pointerId: 7, screenX: 100, screenY: 100 });
    fireEvent.pointerMove(pet, { pointerId: 7, screenX: 112, screenY: 117 });
    fireEvent.pointerUp(pet, { pointerId: 7, screenX: 112, screenY: 117 });
    fireEvent.click(pet);

    expect(api.moveWindowBy).toHaveBeenCalledWith(12, 17);
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
  });

  it("toggles manual mode between active and quiet", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /skfiy codex-style pet/i }));

    const toggle = screen.getByRole("switch", { name: /manual mode/i });
    expect(toggle).toBeChecked();
    expect(screen.getAllByText("主动").length).toBeGreaterThan(0);

    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(screen.getAllByText("安静").length).toBeGreaterThan(0);
  });

  it("can automatically switch between quiet idle and active task states", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /skfiy codex-style pet/i }));

    const switchingToggle = screen.getByRole("switch", { name: /switching mode/i });
    fireEvent.click(switchingToggle);

    expect(switchingToggle).toBeChecked();
    expect(screen.getByText("自动")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /manual mode/i })).not.toBeChecked();
    expect(screen.getByText("自动/安静")).toBeInTheDocument();

    act(() => emitTaskEvent({ status: "executing", message: "Typing in Ghostty" }));

    expect(screen.getByRole("switch", { name: /manual mode/i })).toBeChecked();
    expect(screen.getByText("自动/主动")).toBeInTheDocument();
  });

  it("exposes command, screenshot, run, and stop controls", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /skfiy codex-style pet/i }));

    const input = screen.getByRole("textbox", { name: /command/i });
    fireEvent.change(input, { target: { value: "pwd" } });
    fireEvent.click(screen.getByRole("button", { name: "执行" }));
    fireEvent.click(screen.getByRole("button", { name: "截图" }));
    fireEvent.click(screen.getByRole("button", { name: "停止" }));

    const api = window.skfiy as SkfiyApi;
    expect(api.runCommand).toHaveBeenCalledWith("pwd", { mode: "active" });
    expect(api.takeScreenshot).toHaveBeenCalledTimes(1);
    expect(api.stopTask).toHaveBeenCalledTimes(1);
  });

  it("exposes approval controls when a command is waiting for approval", () => {
    render(<App />);

    act(() => emitTaskEvent({ status: "approval_required", message: "Needs a human check" }));
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));

    const api = window.skfiy as SkfiyApi;
    expect(api.approveTask).toHaveBeenCalledTimes(1);
    expect(api.denyTask).toHaveBeenCalledTimes(1);
  });
});
