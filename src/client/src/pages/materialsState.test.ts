import test from "node:test";
import assert from "node:assert/strict";
import type { Material } from "../api";
import {
  clampPaneWidth,
  getInitialEditorMode,
  getPreferredMaterialId,
  normalizeMaterialsLayout,
} from "./materialsState";

const materials: Material[] = [
  {
    id: 11,
    day: "2026-07-03",
    title: "Alpha",
    content: "First",
    created_at: "2026-07-03 09:00:00",
    updated_at: "2026-07-03 09:00:00",
  },
  {
    id: 12,
    day: "2026-07-03",
    title: "Beta",
    content: "Second",
    created_at: "2026-07-03 09:10:00",
    updated_at: "2026-07-03 09:10:00",
  },
];

test("getPreferredMaterialId prefers the explicitly requested material", () => {
  assert.equal(getPreferredMaterialId(materials, 11, 12), 12);
});

test("getPreferredMaterialId keeps the current material when it still exists", () => {
  assert.equal(getPreferredMaterialId(materials, 12, 99), 12);
});

test("getPreferredMaterialId falls back to the first material when needed", () => {
  assert.equal(getPreferredMaterialId(materials, 99, 100), 11);
  assert.equal(getPreferredMaterialId([], 99, 100), null);
});

test("normalizeMaterialsLayout clamps widths and falls back to defaults", () => {
  assert.deepEqual(
    normalizeMaterialsLayout({
      dayWidth: 120,
      listWidth: 999,
      detailWidth: Number.NaN,
      collapsed: { day: true, list: "no", detail: false },
    }),
    {
      dayWidth: 180,
      listWidth: 520,
      detailWidth: 560,
      collapsed: { day: true, list: false, detail: false },
    }
  );
});

test("clampPaneWidth keeps values inside the allowed range", () => {
  assert.equal(clampPaneWidth(50, 180, 360), 180);
  assert.equal(clampPaneWidth(420, 180, 360), 360);
  assert.equal(clampPaneWidth(240, 180, 360), 240);
});

test("getInitialEditorMode opens newly created material in edit mode", () => {
  assert.equal(getInitialEditorMode(12, 12), "edit");
  assert.equal(getInitialEditorMode(11, 12), "read");
  assert.equal(getInitialEditorMode(12, null), "read");
});
