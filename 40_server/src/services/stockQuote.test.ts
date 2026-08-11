import assert from "node:assert/strict";
import { test } from "node:test";
import { currencyForMarket, toYahooSymbol } from "./stockQuote.js";

test("toYahooSymbol maps KR/JP/US tickers", () => {
  assert.equal(toYahooSymbol("US", "aapl"), "AAPL");
  assert.equal(toYahooSymbol("JP", "7203"), "7203.T");
  assert.equal(toYahooSymbol("KR", "005930"), "005930.KS");
  assert.equal(toYahooSymbol("KR", "5930"), "005930.KS");
  assert.equal(toYahooSymbol("KR", "035420.KQ"), "035420.KQ");
});

test("currencyForMarket", () => {
  assert.equal(currencyForMarket("KR"), "KRW");
  assert.equal(currencyForMarket("JP"), "JPY");
  assert.equal(currencyForMarket("US"), "USD");
});
