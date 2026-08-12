import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBankStatementCsv } from "./services/bankCsvParser.js";

test("parseBankStatementCsv skips Shinhan title row before header", () => {
  const csv = `신한은행 입출금거래내역
조회기간,2026-01-01 ~ 2026-01-31

No,거래일,거래시간,적요,출금(원),입금(원),잔액(원)
1,20260105,143000,급여,,3500000,3500000
2,20260110,090000,카드,120000,,3380000`;
  const rows = parseBankStatementCsv("SHINHAN", csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.amount, 3500000);
  assert.equal(rows[1]?.category, "debit");
});

test("parseBankStatementCsv parses Shinhan deposit CSV", () => {
  const csv = `거래일자,적요,입금액,출금액,잔액
2026-01-05,급여,3500000,,3500000
2026-01-10,카드결제,,120000,3380000`;
  const rows = parseBankStatementCsv("SHINHAN", csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.category, "credit");
  assert.equal(rows[0]?.amount, 3500000);
  assert.equal(rows[1]?.category, "debit");
  assert.equal(rows[1]?.amount, 120000);
  assert.equal(rows[1]?.balanceAfter, 3380000);
});

test("parseBankStatementCsv parses MUFG deposit CSV", () => {
  const csv = `日付,摘要,お預入れ,お引出し,残高
2026/02/01,給与,280000,,280000
2026/02/03,コンビニ,,1500,278500`;
  const rows = parseBankStatementCsv("MUFG", csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.date, "2026-02-01");
  assert.equal(rows[0]?.category, "credit");
  assert.equal(rows[1]?.category, "debit");
});

test("parseBankStatementCsv parses Yucho deposit CSV", () => {
  const csv = `年月日,摘要,お預入れ,お引出し,残高
2026年3月1日,振込,50000,,150000
2026年3月5日,ATM,,10000,140000`;
  const rows = parseBankStatementCsv("YUCHO", csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[1]?.balanceAfter, 140000);
});
