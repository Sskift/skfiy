import type { RiskDecision } from "../../shared/types.js";
import type { DesktopAppState } from "./types.js";

export type ComputerUseTurnEvent =
  | { type: "started"; command: string; risk: RiskDecision }
  | { type: "approval_required"; command: string; risk: RiskDecision }
  | { type: "locating_app"; appName: string }
  | { type: "session_opened"; appName: string; title: string; pid: number }
  | { type: "app_activated"; appName: string; bundleId: string; pid?: number }
  | { type: "session_initialized"; title: string; marker: string }
  | { type: "verification_failed"; stage: string; reason: string }
  | { type: "recovery_attempted"; stage: string; action: "activate" | "open"; reason: string }
  | { type: "screenshot_before"; path: string; observation: DesktopAppState }
  | { type: "typing"; command: string }
  | { type: "submitted"; key: "enter" }
  | { type: "screenshot_after"; path: string; observation: DesktopAppState }
  | { type: "completed"; command: string; summary: string };

export interface TurnTranscriptApp {
  name: string;
  bundleId?: string;
  pid?: number;
}

export interface TurnTranscriptScreenshot {
  stage: "before" | "after";
  path: string;
  bundleId: string;
  pid?: number;
  accessibilityTrusted?: boolean;
}

export type TurnTranscriptAction =
  | { type: "open_session"; appName: string; pid: number }
  | { type: "activate_app"; appName: string; bundleId: string; pid?: number }
  | { type: "type_text"; text: string }
  | { type: "press_key"; key: "enter" }
  | { type: "recover"; action: "activate" | "open"; stage: string; reason: string };

export type TurnTranscriptOutcome =
  | "completed"
  | "approval_required"
  | "verification_failed"
  | "failed"
  | "running";

export interface TurnTranscript {
  command?: string;
  risk?: RiskDecision;
  approvalRequired: boolean;
  apps: TurnTranscriptApp[];
  screenshots: TurnTranscriptScreenshot[];
  actions: TurnTranscriptAction[];
  outcome: TurnTranscriptOutcome;
}

export function createTurnTranscript(
  events: readonly ComputerUseTurnEvent[]
): TurnTranscript {
  const apps = new Map<string, TurnTranscriptApp>();
  const screenshots: TurnTranscriptScreenshot[] = [];
  const actions: TurnTranscriptAction[] = [];
  let command: string | undefined;
  let risk: RiskDecision | undefined;
  let approvalRequired = false;
  let outcome: TurnTranscriptOutcome = "running";

  for (const event of events) {
    switch (event.type) {
      case "started":
        command = event.command;
        risk = event.risk;
        break;
      case "approval_required":
        command = event.command;
        risk = event.risk;
        approvalRequired = true;
        outcome = "approval_required";
        break;
      case "session_opened":
        actions.push({ type: "open_session", appName: event.appName, pid: event.pid });
        mergeApp(apps, { name: event.appName, pid: event.pid });
        break;
      case "app_activated":
        actions.push({
          type: "activate_app",
          appName: event.appName,
          bundleId: event.bundleId,
          pid: event.pid
        });
        mergeApp(apps, {
          name: event.appName,
          bundleId: event.bundleId,
          pid: event.pid
        });
        break;
      case "recovery_attempted":
        actions.push({
          type: "recover",
          action: event.action,
          stage: event.stage,
          reason: event.reason
        });
        break;
      case "screenshot_before":
      case "screenshot_after":
        screenshots.push(createScreenshot(event));
        break;
      case "typing":
        actions.push({ type: "type_text", text: event.command });
        break;
      case "submitted":
        actions.push({ type: "press_key", key: event.key });
        break;
      case "verification_failed":
        outcome = "verification_failed";
        break;
      case "completed":
        command = event.command;
        outcome = "completed";
        break;
    }
  }

  return {
    command,
    risk,
    approvalRequired,
    apps: Array.from(apps.values()),
    screenshots,
    actions,
    outcome
  };
}

function mergeApp(apps: Map<string, TurnTranscriptApp>, next: TurnTranscriptApp): void {
  const key = `${next.name}:${next.pid ?? ""}`;
  apps.set(key, {
    ...apps.get(key),
    ...next
  });
}

function createScreenshot(
  event: Extract<ComputerUseTurnEvent, { type: "screenshot_before" | "screenshot_after" }>
): TurnTranscriptScreenshot {
  return {
    stage: event.type === "screenshot_before" ? "before" : "after",
    path: event.path,
    bundleId: event.observation.bundleId,
    pid: event.observation.pid,
    accessibilityTrusted: event.observation.accessibilityTrusted
  };
}
