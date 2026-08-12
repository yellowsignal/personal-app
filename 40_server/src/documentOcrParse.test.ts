import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocumentOcrText } from "../../20_client/src/utils/documentOcrParse.ts";

test("parseDocumentOcrText extracts 保険証 fields", () => {
  const result = parseDocumentOcrText(`
    健康保険 被保険者証
    記号 1234
    番号 567890
    枝番 01
  `);
  assert.equal(result.typeLabel, "保険証");
  assert.equal(result.fields.find((f) => f.label === "記号")?.value, "1234");
  assert.equal(result.fields.find((f) => f.label === "番号")?.value, "567890");
  assert.equal(result.fields.find((f) => f.label === "枝番")?.value, "01");
});

test("parseDocumentOcrText extracts residence card number and expiry", () => {
  const result = parseDocumentOcrText(`
    在留カード
    AB12345678CD
    有効期限 2028.03.15
  `);
  assert.equal(result.typeLabel, "在留カード");
  assert.equal(result.fields.find((f) => f.label === "在留カード番号")?.value, "AB12345678CD");
  assert.equal(result.expiryDate, "2028-03-15");
});

test("parseDocumentOcrText extracts Korean driver license number", () => {
  const result = parseDocumentOcrText(`
    운전면허증
    면허번호 11-22-334455-60
    만료 2027-05-01
  `);
  assert.equal(result.typeLabel, "運転免許証");
  assert.equal(result.fields.some((f) => f.value === "11-22-334455-60"), true);
});
