import manifest from "./assets/skfiy-cloudbot.pet.json";
import type { CSSProperties } from "react";

export type TaskStatusName =
  | "idle"
  | "observing"
  | "executing"
  | "approval_required"
  | "completed"
  | "failed";

export type PetAtlasState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export interface PetAnimationState {
  row: number;
  frames: number;
  frameMs: number;
}

export interface PetAtlasManifest {
  displayName: string;
  slug: string;
  asset: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  states: Record<PetAtlasState, PetAnimationState>;
}

type PetSpriteStyle = CSSProperties & Record<`--${string}`, string>;

export const PET_ATLAS = manifest as PetAtlasManifest;

export const TASK_STATUS_TO_PET_STATE: Record<TaskStatusName, PetAtlasState> = {
  idle: "idle",
  observing: "review",
  executing: "running",
  approval_required: "waiting",
  completed: "waving",
  failed: "failed"
};

export function getPetStateForTask(status: TaskStatusName): PetAtlasState {
  return TASK_STATUS_TO_PET_STATE[status];
}

export function getPetSpriteStyle(state: PetAtlasState): PetSpriteStyle {
  const animation = PET_ATLAS.states[state];
  const lastColumn = PET_ATLAS.columns - 1;
  const lastRow = PET_ATLAS.rows - 1;
  const finalColumn = Math.max(0, Math.min(animation.frames - 1, lastColumn));

  return {
    "--pet-y": `${(animation.row / lastRow) * 100}%`,
    "--pet-x-end": `${(finalColumn / lastColumn) * 100}%`,
    "--pet-steps": String(Math.max(1, animation.frames - 1)),
    "--pet-duration": `${animation.frames * animation.frameMs}ms`
  };
}
