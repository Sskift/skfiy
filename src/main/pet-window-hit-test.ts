export interface PetOverlayPoint {
  x: number;
  y: number;
}

export interface PetOverlayHitState {
  capsuleOpen: boolean;
  dragging: boolean;
}

interface PetOverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PET_HIT_RECT: PetOverlayRect = {
  x: 62,
  y: 126,
  width: 196,
  height: 224
};

const CAPSULE_HIT_RECT: PetOverlayRect = {
  x: 12,
  y: 42,
  width: 296,
  height: 122
};

export function shouldCaptureMouseForPetOverlay(
  point: PetOverlayPoint,
  state: PetOverlayHitState
): boolean {
  if (state.dragging) {
    return true;
  }

  if (isPointInsideRect(point, PET_HIT_RECT)) {
    return true;
  }

  return state.capsuleOpen && isPointInsideRect(point, CAPSULE_HIT_RECT);
}

function isPointInsideRect(point: PetOverlayPoint, rect: PetOverlayRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
