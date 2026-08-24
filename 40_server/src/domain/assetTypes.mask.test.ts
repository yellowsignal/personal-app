import assert from "node:assert/strict";
import { test } from "node:test";
import { maskAccountNumber } from "../domain/assetTypes.ts";

test("maskAccountNumber keeps only the last four characters", () => {
  assert.equal(maskAccountNumber("1234567"), "****4567");
  assert.equal(maskAccountNumber("12 34 56 7890"), "****7890");
  assert.equal(maskAccountNumber("12"), "****");
  assert.equal(maskAccountNumber(""), null);
  assert.equal(maskAccountNumber(null), null);
});
