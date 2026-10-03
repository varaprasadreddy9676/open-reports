import type { RulerUnit } from "../store";
import { pointsPerRulerUnit } from "./ruler";

/** Canvas grid in points: `major` line spacing, split into `subdivisions` minor steps that snapping uses. */
export interface GridSettings {
  major: number;
  subdivisions: number;
}

/** What a dragged or resized object may snap to (the master switch and Alt still apply on top). */
export interface SnapTargets {
  grid: boolean;
  objects: boolean;
  bounds: boolean;
  guides: boolean;
  spacing: boolean;
  baseline: boolean;
}

export const SUBDIVISION_CHOICES = [1, 2, 4, 5, 8, 10] as const;
/** 25 pt in 5 steps keeps the historical 5 pt snapping step. */
export const DEFAULT_GRID: GridSettings = { major: 25, subdivisions: 5 };
export const DEFAULT_SNAP_TARGETS: SnapTargets = { grid: true, objects: true, bounds: true, guides: true, spacing: true, baseline: true };
const MIN_MAJOR = 1;
const MAX_MAJOR = 1000;

export const SNAP_TARGET_LABELS: Record<keyof SnapTargets, string> = {
  grid: "Grid",
  objects: "Other objects",
  bounds: "Band and page edges",
  guides: "Guides",
  spacing: "Equal spacing",
  baseline: "Text baselines",
};

export const minorStep = (grid: GridSettings): number => grid.major / grid.subdivisions;

export function snapToGrid(value: number, grid: GridSettings, origin = 0): number {
  const step = minorStep(grid);
  const snapped = origin + Math.round((value - origin) / step) * step;
  return Math.round(snapped * 1000) / 1000 || 0;
}

export const gridSpacingInUnit = (points: number, unit: RulerUnit, dpi: number): number => points / pointsPerRulerUnit(unit, dpi);
export const gridSpacingFromUnit = (value: number, unit: RulerUnit, dpi: number): number => value * pointsPerRulerUnit(unit, dpi);

function readJson(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Reads saved grid settings, clamping the spacing and falling back for anything invalid. */
export function parseGrid(raw: string | null): GridSettings {
  const value = readJson(raw);
  if (!value || typeof value.major !== "number" || !Number.isFinite(value.major) || value.major <= 0) return { ...DEFAULT_GRID };
  const subdivisions = SUBDIVISION_CHOICES.includes(value.subdivisions as never) ? (value.subdivisions as number) : DEFAULT_GRID.subdivisions;
  return { major: Math.min(MAX_MAJOR, Math.max(MIN_MAJOR, value.major)), subdivisions };
}

export function parseSnapTargets(raw: string | null): SnapTargets {
  const value = readJson(raw) ?? {};
  const out = { ...DEFAULT_SNAP_TARGETS };
  for (const key of Object.keys(out) as (keyof SnapTargets)[]) if (typeof value[key] === "boolean") out[key] = value[key] as boolean;
  return out;
}
