import type { DesktopExecutableAction } from "./types.js";
import {
  findObservedElementsByLabel,
  resolveClickTarget,
  type ObservedElement
} from "./observed-elements.js";

export interface ClickCoordinates {
  x: number;
  y: number;
}

export interface ClickTargetRequest {
  elementId?: string;
  label?: string;
  coordinates?: ClickCoordinates;
  allowCoordinateFallback?: boolean;
}

export type ClickActionPlanDecision =
  | { type: "action"; action: DesktopExecutableAction }
  | { type: "needs_user_confirmation"; reason: string; candidates: ObservedElement[] };

export function createClickActionForTarget(
  elements: readonly ObservedElement[],
  target: ClickTargetRequest
): DesktopExecutableAction {
  const plan = planClickActionForTarget(elements, target);

  if (plan.type === "action") {
    return plan.action;
  }

  throw new Error(`Click target needs user confirmation: ${plan.reason}`);
}

export function planClickActionForTarget(
  elements: readonly ObservedElement[],
  target: ClickTargetRequest
): ClickActionPlanDecision {
  if (target.elementId) {
    const resolved = resolveClickTarget(elements, target.elementId);
    return {
      type: "action",
      action: {
        type: "click",
        x: resolved.x,
        y: resolved.y
      }
    };
  }

  if (target.label) {
    const candidates = findObservedElementsByLabel(elements, target.label);

    if (candidates.length === 0) {
      throw new Error(`Observed element label was not found: ${target.label}`);
    }

    if (candidates.length > 1) {
      return {
        type: "needs_user_confirmation",
        reason: `Multiple observed elements matched label: ${target.label}`,
        candidates
      };
    }

    const resolved = resolveClickTarget(elements, candidates[0].id);
    return {
      type: "action",
      action: {
        type: "click",
        x: resolved.x,
        y: resolved.y
      }
    };
  }

  if (target.coordinates) {
    if (!target.allowCoordinateFallback) {
      throw new Error("Coordinate click fallback must be explicitly allowed.");
    }

    return {
      type: "action",
      action: {
        type: "click",
        x: target.coordinates.x,
        y: target.coordinates.y
      }
    };
  }

  throw new Error("Click target requires an observed element id or explicit coordinate fallback.");
}
