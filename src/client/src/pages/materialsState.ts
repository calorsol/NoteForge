import type { Material } from "../api";

export const MATERIALS_VIEW_KEY = "nf_materials_view";

export const DAY_WIDTH_MIN = 180;
export const DAY_WIDTH_MAX = 360;
export const DAY_WIDTH_DEFAULT = 220;

export const LIST_WIDTH_MIN = 260;
export const LIST_WIDTH_MAX = 520;
export const LIST_WIDTH_DEFAULT = 320;

export const DETAIL_WIDTH_MIN = 380;
export const DETAIL_WIDTH_MAX = 960;
export const DETAIL_WIDTH_DEFAULT = 560;

export type PaneKey = "day" | "list" | "detail";

export type MaterialsLayout = {
  dayWidth: number;
  listWidth: number;
  detailWidth: number;
  collapsed: Record<PaneKey, boolean>;
};

export type MaterialsViewState = {
  year: number | null;
  month: number | null;
  selectedDay: string | null;
  selectedId: number | null;
  query: string;
  layout: MaterialsLayout;
};

export const DEFAULT_MATERIALS_LAYOUT: MaterialsLayout = {
  dayWidth: DAY_WIDTH_DEFAULT,
  listWidth: LIST_WIDTH_DEFAULT,
  detailWidth: DETAIL_WIDTH_DEFAULT,
  collapsed: {
    day: false,
    list: false,
    detail: false,
  },
};

export function clampPaneWidth(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizePaneWidth(value: number | null | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return clampPaneWidth(Number(value), min, max);
}

export function normalizeMaterialsLayout(raw: unknown): MaterialsLayout {
  const value = typeof raw === "object" && raw !== null ? (raw as Partial<MaterialsLayout>) : {};
  const collapsed: Partial<Record<PaneKey, boolean>> =
    typeof value.collapsed === "object" && value.collapsed !== null
      ? (value.collapsed as Partial<Record<PaneKey, boolean>>)
      : {};

  return {
    dayWidth: normalizePaneWidth(value.dayWidth, DAY_WIDTH_DEFAULT, DAY_WIDTH_MIN, DAY_WIDTH_MAX),
    listWidth: normalizePaneWidth(value.listWidth, LIST_WIDTH_DEFAULT, LIST_WIDTH_MIN, LIST_WIDTH_MAX),
    detailWidth: normalizePaneWidth(value.detailWidth, DETAIL_WIDTH_DEFAULT, DETAIL_WIDTH_MIN, DETAIL_WIDTH_MAX),
    collapsed: {
      day: collapsed.day === true,
      list: collapsed.list === true,
      detail: collapsed.detail === true,
    },
  };
}

export function getPreferredMaterialId(
  materials: Material[],
  currentId: number | null,
  preferId?: number | null
) {
  if (preferId && materials.some((material) => material.id === preferId)) {
    return preferId;
  }
  if (currentId && materials.some((material) => material.id === currentId)) {
    return currentId;
  }
  return materials[0]?.id ?? null;
}

export function getInitialEditorMode(selectedId: number, pendingEditId: number | null) {
  return selectedId === pendingEditId ? "edit" : "read";
}

function readInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function readMaterialsViewState(): MaterialsViewState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(MATERIALS_VIEW_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MaterialsViewState>;
    return {
      year: readInteger(value.year),
      month: readInteger(value.month),
      selectedDay: typeof value.selectedDay === "string" ? value.selectedDay : null,
      selectedId: readInteger(value.selectedId),
      query: typeof value.query === "string" ? value.query : "",
      layout: normalizeMaterialsLayout(value.layout),
    };
  } catch {
    return null;
  }
}

export function writeMaterialsViewState(state: Omit<MaterialsViewState, "layout"> & { layout: MaterialsLayout }) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MATERIALS_VIEW_KEY, JSON.stringify(state));
}
