import assert from "node:assert/strict";
import { test } from "node:test";
import { settleSheetDismiss, sheetDragResistance } from "./sheetDismiss";

test("settleSheetDismiss restores small pulls", () => {
  assert.equal(settleSheetDismiss(40, 0), "restore");
  assert.equal(settleSheetDismiss(0, 2), "restore");
  assert.equal(settleSheetDismiss(-20, 1), "restore");
});

test("settleSheetDismiss dismisses long or fast pulls", () => {
  assert.equal(settleSheetDismiss(120, 0), "dismiss");
  assert.equal(settleSheetDismiss(60, 0.8), "dismiss");
});

test("sheetDragResistance softens upward drag", () => {
  assert.equal(sheetDragResistance(80), 80);
  assert.ok(sheetDragResistance(-40) > -40);
});
