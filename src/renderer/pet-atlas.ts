import blackCatManifest from "./assets/skfiy-black-cat.pet.json";
import cloudbotManifest from "./assets/skfiy-cloudbot.pet.json";
import type { CSSProperties } from "react";

export type TaskStatusName =
  | "idle"
  | "observing"
  | "executing"
  | "approval_required"
  | "needs_confirmation"
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
  source?: "bundled-original" | "bundled-legacy" | "custom-user";
  notes?: string;
  states: Record<PetAtlasState, PetAnimationState>;
}

export interface PetAtlas extends PetAtlasManifest {
  assetUrl: string;
}

type PetSpriteStyle = CSSProperties & Record<`--${string}`, string>;

export type BuiltInPetSkinId = "skfiy-black-cat" | "skfiy-cloudbot";

export const DEFAULT_PET_SKIN_ID: BuiltInPetSkinId = "skfiy-black-cat";
export const SELECTED_PET_SKIN_STORAGE_KEY = "skfiy.petSkin.selectedId";
export const CUSTOM_PET_SKIN_STORAGE_KEY = "skfiy.petSkin.customManifest";

const PET_STATE_NAMES: PetAtlasState[] = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review"
];

function createBundledPetAtlas(manifest: PetAtlasManifest, assetUrl: string): PetAtlas {
  return {
    ...manifest,
    assetUrl
  };
}

export const BUILT_IN_PET_SKINS: Record<BuiltInPetSkinId, PetAtlas> = {
  "skfiy-black-cat": createBundledPetAtlas(
    blackCatManifest as PetAtlasManifest,
    new URL("./assets/skfiy-black-cat-atlas.svg", import.meta.url).href
  ),
  "skfiy-cloudbot": createBundledPetAtlas(
    {
      ...(cloudbotManifest as PetAtlasManifest),
      source: "bundled-legacy"
    },
    new URL("./assets/skfiy-cloudbot-atlas.svg", import.meta.url).href
  )
};

export const PET_ATLAS = BUILT_IN_PET_SKINS[DEFAULT_PET_SKIN_ID];

export const TASK_STATUS_TO_PET_STATE: Record<TaskStatusName, PetAtlasState> = {
  idle: "idle",
  observing: "review",
  executing: "running",
  approval_required: "waiting",
  needs_confirmation: "waiting",
  completed: "waving",
  failed: "failed"
};

export function getPetStateForTask(status: TaskStatusName): PetAtlasState {
  return TASK_STATUS_TO_PET_STATE[status];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPetAnimationState(value: unknown): value is PetAnimationState {
  return (
    isRecord(value)
    && isNonNegativeInteger(value.row)
    && isPositiveInteger(value.frames)
    && isPositiveInteger(value.frameMs)
  );
}

function hasCompleteStateMap(value: unknown): value is Record<PetAtlasState, PetAnimationState> {
  if (!isRecord(value)) {
    return false;
  }

  return PET_STATE_NAMES.every((state) => isPetAnimationState(value[state]));
}

export function isPetAtlasManifest(value: unknown): value is PetAtlasManifest {
  return (
    isRecord(value)
    && typeof value.displayName === "string"
    && value.displayName.trim().length > 0
    && typeof value.slug === "string"
    && value.slug.trim().length > 0
    && typeof value.asset === "string"
    && value.asset.trim().length > 0
    && isPositiveInteger(value.frameWidth)
    && isPositiveInteger(value.frameHeight)
    && isPositiveInteger(value.columns)
    && isPositiveInteger(value.rows)
    && hasCompleteStateMap(value.states)
  );
}

export function resolvePetAtlas(input?: {
  selectedSkinId?: string | null;
  customManifest?: PetAtlasManifest | null;
}): PetAtlas {
  const selectedSkinId = input?.selectedSkinId ?? DEFAULT_PET_SKIN_ID;
  const customManifest = input?.customManifest;

  if (customManifest && selectedSkinId === customManifest.slug) {
    return {
      ...customManifest,
      assetUrl: customManifest.asset,
      source: "custom-user"
    };
  }

  if (selectedSkinId in BUILT_IN_PET_SKINS) {
    return BUILT_IN_PET_SKINS[selectedSkinId as BuiltInPetSkinId];
  }

  return PET_ATLAS;
}

function readJsonStorageValue(storage: Storage, key: string): unknown {
  const rawValue = storage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function hasStorageApi(value: unknown): value is Storage {
  return (
    isRecord(value)
    && typeof value.getItem === "function"
    && typeof value.setItem === "function"
    && typeof value.removeItem === "function"
  );
}

export function getConfiguredPetAtlas(storage?: Storage): PetAtlas {
  const targetStorage =
    storage ?? (typeof window === "undefined" ? undefined : window.localStorage);

  if (!hasStorageApi(targetStorage)) {
    return PET_ATLAS;
  }

  const selectedSkinId = targetStorage.getItem(SELECTED_PET_SKIN_STORAGE_KEY);
  const customValue = readJsonStorageValue(targetStorage, CUSTOM_PET_SKIN_STORAGE_KEY);
  const customManifest = isPetAtlasManifest(customValue) ? customValue : null;

  return resolvePetAtlas({ selectedSkinId, customManifest });
}

export function getPetSpriteStyle(
  state: PetAtlasState,
  atlas: PetAtlas = PET_ATLAS
): PetSpriteStyle {
  const animation = atlas.states[state];
  const lastColumn = Math.max(1, atlas.columns - 1);
  const lastRow = Math.max(1, atlas.rows - 1);
  const finalColumn = Math.max(0, Math.min(animation.frames - 1, lastColumn));

  return {
    "--pet-atlas-url": `url(${atlas.assetUrl})`,
    "--pet-frame-width": `${atlas.frameWidth}px`,
    "--pet-frame-height": `${atlas.frameHeight}px`,
    "--pet-bg-width": `${atlas.columns * 100}%`,
    "--pet-bg-height": `${atlas.rows * 100}%`,
    "--pet-y": `${(animation.row / lastRow) * 100}%`,
    "--pet-x-end": `${(finalColumn / lastColumn) * 100}%`,
    "--pet-steps": String(Math.max(1, animation.frames - 1)),
    "--pet-duration": `${animation.frames * animation.frameMs}ms`
  };
}
