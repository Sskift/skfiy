import type { RiskDecision } from "../../shared/types.js";
import type { DesktopAppState } from "../computer-use/types.js";

export type GhosttyTaskEvent =
  | {
      type: "started";
      command: string;
      risk: RiskDecision;
    }
  | {
      type: "approval_required";
      command: string;
      risk: RiskDecision;
    }
  | {
      type: "locating_app";
      appName: string;
    }
  | {
      type: "app_activated";
      appName: string;
      bundleId: string;
    }
  | {
      type: "screenshot_before";
      path: string;
      observation: DesktopAppState;
    }
  | {
      type: "typing";
      command: string;
    }
  | {
      type: "submitted";
      key: "enter";
    }
  | {
      type: "screenshot_after";
      path: string;
      observation: DesktopAppState;
    }
  | {
      type: "completed";
      command: string;
      summary: string;
    };
