export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface WorkArea extends Point, Size {}

export interface DisplayLike {
  workArea: WorkArea;
}

export interface CalculatePetWindowBoundsOptions {
  cursorPoint: Point;
  displays: readonly DisplayLike[];
  windowSize: Size;
  margin: number;
  positionOverride?: Point;
}

export interface PetWindowBounds extends Point, Size {}

export function calculatePetWindowBounds({
  cursorPoint,
  displays,
  windowSize,
  margin,
  positionOverride
}: CalculatePetWindowBoundsOptions): PetWindowBounds {
  if (positionOverride) {
    return {
      ...positionOverride,
      ...windowSize
    };
  }

  const display = findDisplayContainingPoint(displays, cursorPoint) ?? findNearestDisplay(displays, cursorPoint);
  const workArea = display?.workArea ?? { x: 0, y: 0, width: windowSize.width, height: windowSize.height };

  return {
    x: workArea.x + Math.max(margin, workArea.width - windowSize.width - margin),
    y: workArea.y + Math.max(margin, workArea.height - windowSize.height - margin),
    ...windowSize
  };
}

export function readWindowPositionOverride(env: Record<string, string | undefined>): Point | undefined {
  const x = readFiniteEnvNumber(env.SKFIY_WINDOW_X);
  const y = readFiniteEnvNumber(env.SKFIY_WINDOW_Y);

  return x === undefined || y === undefined ? undefined : { x, y };
}

function findDisplayContainingPoint(
  displays: readonly DisplayLike[],
  point: Point
): DisplayLike | undefined {
  return displays.find(({ workArea }) => {
    return (
      point.x >= workArea.x
      && point.x < workArea.x + workArea.width
      && point.y >= workArea.y
      && point.y < workArea.y + workArea.height
    );
  });
}

function findNearestDisplay(
  displays: readonly DisplayLike[],
  point: Point
): DisplayLike | undefined {
  return displays.reduce<DisplayLike | undefined>((nearest, display) => {
    if (!nearest) {
      return display;
    }

    return distanceToCenter(display.workArea, point) < distanceToCenter(nearest.workArea, point)
      ? display
      : nearest;
  }, undefined);
}

function distanceToCenter(workArea: WorkArea, point: Point): number {
  const centerX = workArea.x + workArea.width / 2;
  const centerY = workArea.y + workArea.height / 2;
  return Math.hypot(point.x - centerX, point.y - centerY);
}

function readFiniteEnvNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
