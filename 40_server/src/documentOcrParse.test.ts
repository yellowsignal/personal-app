import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocumentOcrText } from "./documentOcrParse.js";

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

test("parseDocumentOcrText extracts credit card number, type, and MM/YY expiry", () => {
  const visa = parseDocumentOcrText(`
    VISA
    1234 5678 9012 3456
    VALID THRU 12/28
    HONG GILDONG
  `);
  assert.equal(visa.typeLabel, "신용카드");
  assert.equal(visa.fields.find((f) => f.label === "카드번호")?.value, "1234567890123456");
  assert.equal(visa.expiryDate, "2028-12-31");

  const shinhan = parseDocumentOcrText(`
    신한카드
    4567-8901-2345-6789
    유효기간 03/27
  `);
  assert.equal(shinhan.typeLabel, "신용카드");
  assert.equal(shinhan.fields.filter((f) => f.label === "카드번호").length, 1);
  assert.equal(shinhan.fields.find((f) => f.label === "카드번호")?.value, "4567890123456789");
  assert.equal(shinhan.expiryDate, "2027-03-31");
});

test("parseDocumentOcrText extracts Japanese credit card expiry YY/MM", () => {
  const result = parseDocumentOcrText(`
    クレジット
    1234 5678 9012 3456
    有効期限 28/03
  `);
  assert.equal(result.typeLabel, "신용카드");
  assert.equal(result.expiryDate, "2028-03-31");
});

test("parseDocumentOcrText extracts CVC from card back OCR", () => {
  const result = parseDocumentOcrText(`
    CVV 123
    Authorized signature
  `);
  assert.equal(result.fields.find((f) => f.label === "CVC")?.value, "123");
});

test("parseDocumentOcrText extracts 診察券 hospital and patient number", () => {
  const result = parseDocumentOcrText(`
    さくらクリニック
    診察券
    患者番号：123456
    氏名 山田太郎
  `);
  assert.equal(result.typeLabel, "さくらクリニック 診察券");
  assert.equal(result.fields.find((f) => f.label === "患者番号")?.value, "123456");
  assert.equal(result.fields.find((f) => f.label === "患者番号")?.isSecret, false);
});
