import assert from "node:assert/strict";
import { test } from "node:test";
import {
  looksLikePhoneNumber,
  parseDocumentOcrText,
  scoreOcrTextForDocuments,
} from "./documentOcrParse.js";

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

test("parseDocumentOcrText extracts 記号・番号 on following line (paper 保険証 layout)", () => {
  const result = parseDocumentOcrText(`
    健康保険 被保険者証
    令和 4年 9月20日交付
    記号・番号
    606  54156
    (枝番) 45
    氏名 崔 民虎
    保険者番号 06135396
    Tel 03-3833-6141
  `);
  assert.equal(result.typeLabel, "保険証");
  assert.equal(result.fields.find((f) => f.label === "記号")?.value, "606");
  assert.equal(result.fields.find((f) => f.label === "番号")?.value, "54156");
  assert.equal(result.fields.find((f) => f.label === "枝番")?.value, "45");
  assert.equal(result.fields.find((f) => f.label === "保険者番号")?.value, "06135396");
  assert.equal(
    result.fields.some((f) => f.value.includes("3833") || f.value.includes("03-")),
    false,
    "must not treat Tel as 番号",
  );
  assert.equal(result.expiryDate, null, "交付日 must not become expiry");
  assert.equal(
    result.fields.some((f) => f.label === "카드번호"),
    false,
    "must not treat 保険証 digits as credit-card PAN",
  );
});

test("parseDocumentOcrText detects 保険証 from 記号・番号 layout without title", () => {
  const result = parseDocumentOcrText(`
    記号・番号
    2222 000200040222
    保険者番号 06135396
    交付年月日 2024年04月01日
  `);
  assert.equal(result.typeLabel, "保険証");
  assert.equal(result.category, "insurance");
  assert.equal(result.fields.some((f) => f.label === "카드번호"), false);
  assert.equal(result.expiryDate, null);
  assert.equal(result.fields.find((f) => f.label === "保険者番号")?.value, "06135396");
});

test("jp_hoken does not put 保険者番号 into 番号 when OCR spaces the label", () => {
  const spaced = parseDocumentOcrText(
    `
    健康保険 被保険者証
    保険者 番号 06135396
    記号・番号
    606 54156
    枝番 01
  `,
    { kind: "jp_hoken" },
  );
  assert.equal(spaced.fields.find((f) => f.label === "保険者番号")?.value, "06135396");
  assert.equal(spaced.fields.find((f) => f.label === "記号")?.value, "606");
  assert.equal(spaced.fields.find((f) => f.label === "番号")?.value, "54156");
  assert.equal(spaced.fields.find((f) => f.label === "枝番")?.value, "01");
});

test("jp_hoken maps lone 番号 8桁 to 保険者番号 when 記号 missing", () => {
  const result = parseDocumentOcrText(
    `
    健康保険被保険者証
    番号 06135396
  `,
    { kind: "jp_hoken" },
  );
  assert.equal(result.fields.find((f) => f.label === "保険者番号")?.value, "06135396");
  assert.equal(result.fields.find((f) => f.label === "番号")?.value, "");
});

test("jp_hoken reads 被保険者記号・番号 with fullwidth digits", () => {
  const result = parseDocumentOcrText(
    `
    資格確認書
    保険者番号
    06135396
    被保険者記号・番号
    １２３４　５６７８９０
    枝番 ００
  `,
    { kind: "jp_hoken" },
  );
  assert.equal(result.fields.find((f) => f.label === "保険者番号")?.value, "06135396");
  assert.equal(result.fields.find((f) => f.label === "記号")?.value, "1234");
  assert.equal(result.fields.find((f) => f.label === "番号")?.value, "567890");
  assert.equal(result.fields.find((f) => f.label === "枝番")?.value, "00");
});

test("parseDocumentOcrText does not use phone as fallback number", () => {
  const result = parseDocumentOcrText(`
    Tel 03-3833-6141
    03-3833-6141
  `);
  assert.equal(result.fields.some((f) => looksLikePhoneNumber(f.value)), false);
  assert.equal(result.fields.length, 0);
});

test("scoreOcrTextForDocuments prefers 保険証 keywords over Tel-only junk", () => {
  const good = scoreOcrTextForDocuments(`健康保険 被保険者証\n記号・番号\n606 54156\n保険者番号 06135396`);
  const bad = scoreOcrTextForDocuments(`Tel 03-3833-6141`);
  assert.ok(good > bad);
  assert.ok(good >= 110);
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

test("parseDocumentOcrText with hoken hint ignores credit-card digits and 交付日", () => {
  const result = parseDocumentOcrText(
    `
    2222 0002 0004 0222
    記号・番号
    606 54156
    保険者番号 06135396
    交付年月日 2024年04月01日
    VISA
  `,
    { kind: "jp_hoken" },
  );
  assert.equal(result.typeLabel, "保険証");
  assert.equal(result.category, "insurance");
  assert.equal(result.fields.find((f) => f.label === "記号")?.value, "606");
  assert.equal(result.fields.find((f) => f.label === "番号")?.value, "54156");
  assert.equal(result.fields.some((f) => f.label === "카드번호"), false);
  assert.equal(result.expiryDate, null);
  assert.equal(result.fields.map((f) => f.label).join(","), "保険者番号,記号,番号,枝番");
});

test("parseDocumentOcrText with zairyu hint keeps residence expiry not 交付", () => {
  const result = parseDocumentOcrText(
    `
    UH30600371NA
    交付年月日 2025年10月21日まで有効
    このカードは 2028年11月12日まで有効
  `,
    { kind: "jp_zairyu" },
  );
  assert.equal(result.typeLabel, "在留カード");
  assert.equal(result.expiryDate, "2028-11-12");
  assert.equal(result.fields.find((f) => f.label === "在留カード番号")?.value, "UH30600371NA");
  assert.equal(result.fields.some((f) => f.label === "카드번호"), false);
});

test("parseDocumentOcrText with card hint extracts PAN", () => {
  const result = parseDocumentOcrText(
    `
    1234 5678 9012 3456
    VALID THRU 12/28
  `,
    { kind: "jp_credit" },
  );
  assert.equal(result.typeLabel, "신용카드");
  assert.equal(result.category, "card");
  assert.equal(result.fields.find((f) => f.label === "카드번호")?.value, "1234567890123456");
  assert.equal(result.expiryDate, "2028-12-31");
});

test("parseDocumentOcrText with jp_cash hint extracts bank account fields", () => {
  const result = parseDocumentOcrText(
    `
    三菱UFJ銀行
    店番号 123
    口座番号 1234567
  `,
    { kind: "jp_cash" },
  );
  assert.equal(result.typeLabel, "キャッシュカード");
  assert.equal(result.fields.find((f) => f.label === "金融機関")?.value, "三菱UFJ銀行");
  assert.equal(result.fields.find((f) => f.label === "店番号")?.value, "123");
  assert.equal(result.fields.find((f) => f.label === "口座番号")?.value, "1234567");
  assert.equal(result.expiryDate, null);
});

test("parseDocumentOcrText uses まで有効 not 交付年月日 on residence cards", () => {
  const glued = parseDocumentOcrText(`
    在留カード RESIDENCE CARD
    UH30600371NA
    CHOI MINHO
    生年月日 1991年07月02日
    在留期間（満了日） 3年 2028年11月12日
    許可年月日 2025年10月21日
    交付年月日 2025年10月21日まで有効
  `);
  assert.equal(glued.typeLabel, "在留カード");
  assert.equal(glued.expiryDate, "2028-11-12");
  assert.equal(glued.fields.find((f) => f.label === "在留カード番号")?.value, "UH30600371NA");

  const footer = parseDocumentOcrText(`
    在留カード
    UH30600371NA
    交付年月日 2025年10月21日
    このカードは 2028年11月12日まで有効
  `);
  assert.equal(footer.expiryDate, "2028-11-12");

  // OCR often lists the glued 交付 line before the real footer expiry.
  const gluedFirst = parseDocumentOcrText(`
    在留カード
    UH30600371NA
    交付年月日 2025年10月21日まで有効
    このカードは 2028年11月12日まで有効
  `);
  assert.equal(gluedFirst.expiryDate, "2028-11-12");
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
  assert.equal(result.typeLabel, "さくらクリニック");
  assert.equal(result.category, "medical");
  assert.equal(result.fields.find((f) => f.label === "患者番号")?.value, "123456");
  assert.equal(result.fields.find((f) => f.label === "患者番号")?.isSecret, false);
});
