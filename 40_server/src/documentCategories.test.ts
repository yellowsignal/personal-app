import assert from "node:assert/strict";
import { test } from "node:test";
import { inferCategoryFromTypeLabel, parseDocumentCategory } from "./documentCategories.js";

test("inferCategoryFromTypeLabel detects medical and card types", () => {
  assert.equal(inferCategoryFromTypeLabel("さくらクリニック 診察券"), "medical");
  assert.equal(inferCategoryFromTypeLabel("신한 Visa"), "card");
  assert.equal(inferCategoryFromTypeLabel("保険証"), "insurance");
  assert.equal(inferCategoryFromTypeLabel("在留カード"), "id");
});

test("parseDocumentCategory validates known categories", () => {
  assert.equal(parseDocumentCategory("medical"), "medical");
  assert.equal(parseDocumentCategory("invalid"), "other");
});
