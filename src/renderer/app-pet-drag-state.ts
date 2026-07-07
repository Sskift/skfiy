import type { VisiblePetRect } from "./App";

export interface PetDragState {
  pointerId: number;
  lastScreenX: number;
  lastScreenY: number;
  moved: boolean;
  visibleRect: VisiblePetRect;
}

export interface PetDragPointer {
  pointerId: number;
  screenX: number;
  screenY: number;
}

export interface PetDragMove {
  deltaX: number;
  deltaY: number;
  nextDrag: PetDragState;
  startedMoving: boolean;
}

export function readVisiblePetRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): VisiblePetRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

export function createPetDragState(
  pointer: PetDragPointer,
  visibleRect: VisiblePetRect
): PetDragState {
  return {
    pointerId: pointer.pointerId,
    lastScreenX: pointer.screenX,
    lastScreenY: pointer.screenY,
    moved: false,
    visibleRect
  };
}

export function updatePetDragStateForPointerMove(
  drag: PetDragState,
  pointer: PetDragPointer
): PetDragMove | null {
  if (drag.pointerId !== pointer.pointerId) {
    return null;
  }

  const deltaX = pointer.screenX - drag.lastScreenX;
  const deltaY = pointer.screenY - drag.lastScreenY;

  if (deltaX === 0 && deltaY === 0) {
    return null;
  }

  return {
    deltaX,
    deltaY,
    nextDrag: {
      pointerId: drag.pointerId,
      lastScreenX: pointer.screenX,
      lastScreenY: pointer.screenY,
      moved: true,
      visibleRect: drag.visibleRect
    },
    startedMoving: !drag.moved
  };
}

export function shouldSuppressPetClickAfterDrag(drag: PetDragState): boolean {
  return drag.moved;
}
