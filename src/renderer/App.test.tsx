import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { type SkfiyApi, type TaskEvent } from "./App";

let emitTaskEvent: (event: TaskEvent) => void;

beforeEach(() => {
  emitTaskEvent = () => undefined;

  window.skfiy = {
    runCommand: vi.fn<SkfiyApi["runCommand"]>().mockResolvedValue(undefined),
    prepareDictation: vi.fn<SkfiyApi["prepareDictation"]>().mockResolvedValue(undefined),
    stopDictation: vi.fn<SkfiyApi["stopDictation"]>().mockResolvedValue(undefined),
    approveTask: vi.fn<SkfiyApi["approveTask"]>().mockResolvedValue(undefined),
    denyTask: vi.fn<SkfiyApi["denyTask"]>().mockResolvedValue(undefined),
    takeScreenshot: vi.fn<SkfiyApi["takeScreenshot"]>().mockResolvedValue(undefined),
    stopTask: vi.fn<SkfiyApi["stopTask"]>().mockResolvedValue(undefined),
    moveWindowBy: vi.fn<SkfiyApi["moveWindowBy"]>(),
    setWindowMode: vi.fn<SkfiyApi["setWindowMode"]>(),
    onTaskEvent: vi.fn((callback: (event: TaskEvent) => void) => {
      emitTaskEvent = callback;
      return vi.fn();
    })
  } satisfies SkfiyApi;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("starts as a Codex-style pet overlay with controls tucked away", () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    expect(pet).toBeInTheDocument();
    expect(pet).toHaveAttribute("data-atlas-state", "idle");
    expect(pet).toHaveAttribute("data-frame-count", "6");
    expect(pet).toHaveAttribute("data-voice-entry", "left-click");
    expect(pet).toHaveAttribute("data-settings-entry", "right-click");
    expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent("Idle");
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "执行" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
  });

  it("starts dictation from a plain left click on the pet", async () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    fireEvent.click(pet);

    expect(pet).toHaveAttribute("data-drag-mode", "manual");
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "执行" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });
    expect((window.skfiy as SkfiyApi).prepareDictation).toHaveBeenCalledTimes(1);
  });

  it("opens settings details from a right click on the pet without starting dictation", () => {
    render(<App />);

    fireEvent.contextMenu(screen.getByLabelText(/skfiy codex-style pet/i));

    expect(screen.getByLabelText(/skfiy settings/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("语音转写")).not.toBeInTheDocument();
    expect((window.skfiy as SkfiyApi).prepareDictation).not.toHaveBeenCalled();
  });

  it("switches from listening to settings on right click without sending a native stop key", async () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    fireEvent.click(pet);
    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });

    fireEvent.contextMenu(pet);

    expect(screen.getByLabelText(/skfiy settings/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("语音转写")).not.toBeInTheDocument();
    expect((window.skfiy as SkfiyApi).stopDictation).not.toHaveBeenCalled();
  });

  it("renders each task status and switches pet animation from task events", () => {
    render(<App />);

    expect(screen.getByRole("status", { name: /task status/i })).toHaveTextContent("Idle");

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
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

  it("does not show a focusable box around the pet", () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    expect(pet.tagName.toLowerCase()).not.toBe("button");
    expect(pet).not.toHaveAttribute("tabindex");
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
  });

  it("moves the window from pet pointer dragging, including upward movement", () => {
    render(<App />);

    const pet = screen.getByLabelText(/skfiy codex-style pet/i);
    const api = window.skfiy as SkfiyApi;

    fireEvent.pointerDown(pet, { button: 0, pointerId: 7, screenX: 100, screenY: 100 });
    fireEvent.pointerMove(pet, { pointerId: 7, screenX: 112, screenY: 42 });
    fireEvent.pointerMove(pet, { pointerId: 7, screenX: 112, screenY: 12 });
    fireEvent.pointerUp(pet, { pointerId: 7, screenX: 112, screenY: 12 });
    fireEvent.click(pet);

    expect(pet).toHaveAttribute("data-drag-mode", "manual");
    expect(api.moveWindowBy).toHaveBeenNthCalledWith(1, 12, -58);
    expect(api.moveWindowBy).toHaveBeenNthCalledWith(2, 0, -30);
    expect(api.prepareDictation).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/skfiy command capsule/i)).not.toBeInTheDocument();
  });

  it("uses a compact transparent window until a voice or task bubble is visible", async () => {
    render(<App />);

    const api = window.skfiy as SkfiyApi;
    expect(screen.getByLabelText(/skfiy desktop pet/i)).not.toHaveClass("panel-open");
    expect(api.setWindowMode).toHaveBeenLastCalledWith("compact");

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(api.setWindowMode).toHaveBeenLastCalledWith("expanded");
    });
    expect(screen.getByLabelText(/skfiy desktop pet/i)).toHaveClass("panel-open");

    fireEvent.click(screen.getByRole("button", { name: "停止" }));

    await waitFor(() => {
      expect(api.setWindowMode).toHaveBeenLastCalledWith("compact");
    });
    expect(screen.getByLabelText(/skfiy desktop pet/i)).not.toHaveClass("panel-open");
  });

  it("focuses a visible Doubao transcript area without showing a command input", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));

    await waitFor(() => {
      expect(screen.getByLabelText("语音转写")).toHaveFocus();
    });
    expect(screen.queryByRole("textbox", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "执行" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
    expect((window.skfiy as SkfiyApi).prepareDictation).toHaveBeenCalledTimes(1);
  });

  it("can manually stop dictation without submitting the current transcript", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    const transcript = screen.getByLabelText("语音转写");
    fireEvent.change(transcript, {
      target: { value: "不要提交这句话" }
    });
    fireEvent.click(screen.getByRole("button", { name: "停止" }));

    expect((window.skfiy as SkfiyApi).runCommand).not.toHaveBeenCalled();
    expect((window.skfiy as SkfiyApi).stopDictation).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("语音转写")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
  });

  it("auto-submits settled Doubao dictation text", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByLabelText(/skfiy codex-style pet/i));
    fireEvent.change(screen.getByLabelText("语音转写"), {
      target: { value: "打开 Ghostty 并截图" }
    });

    expect(screen.getByDisplayValue("打开 Ghostty 并截图")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(899);
    });

    const api = window.skfiy as SkfiyApi;
    expect(api.runCommand).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(api.runCommand).toHaveBeenCalledWith("打开 Ghostty 并截图", { mode: "active" });
    expect(screen.queryByRole("button", { name: "语音" })).not.toBeInTheDocument();
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
