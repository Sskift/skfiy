import type { DesktopExecutableAction } from "./types.js";
import {
  resolveClickTarget,
  type ObservedElement
} from "./observed-elements.js";

export interface ClickCoordinates {
  x: number;
  y: number;
}

export interface ClickTargetRequest {
  elementId?: string;
  coordinates?: ClickCoordinates;
  allowCoordinateFallback?: boolean;
}

export function createClickActionForTarget(
  elements: readonly ObservedElement[],
  target: ClickTargetRequest
): DesktopExecutableAction {
  if (target.elementId) {
    const resolved = resolveClickTarget(elements, target.elementId);
    return {
      type: "click",
      x: resolved.x,
      y: resolved.y
    };
  }

  if (target.coordinates) {
    if (!target.allowCoordinateFallback) {
      throw new Error("Coordinate click fallback must be explicitly allowed.");
    }

    return {
      type: "click",
      x: target.coordinates.x,
      y: target.coordinates.y
    };
  }

  throw new Error("Click target requires an observed element id or explicit coordinate fallback.");
}
