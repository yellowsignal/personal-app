import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currencyForMarket,
  resolveCreateStockLabel,
  resolveUpdateStockLabel,
  toYahooSymbol,
} from "./stockQuote.js";

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

test("resolveCreateStockLabel uses quote name when label is the ticker", () => {
  assert.equal(resolveCreateStockLabel("MSFT", "MSFT", "Microsoft Corporation"), "Microsoft Corporation");
  assert.equal(resolveCreateStockLabel("구글", "GOOGL", "Alphabet Inc."), "구글");
  assert.equal(resolveCreateStockLabel("  ", "AAPL", "Apple Inc."), "Apple Inc.");
});

test("resolveUpdateStockLabel follows quote when ticker changes unless user renamed", () => {
  assert.equal(
    resolveUpdateStockLabel({
      existingLabel: "구글",
      incomingLabel: "구글",
      previousCode: "GOOGL",
      nextCode: "MSFT",
      quoteName: "Microsoft Corporation",
      tickerChanged: true,
    }),
    "Microsoft Corporation",
  );

  assert.equal(
    resolveUpdateStockLabel({
      existingLabel: "구글",
      incomingLabel: "마이크로소프트",
      previousCode: "GOOGL",
      nextCode: "MSFT",
      quoteName: "Microsoft Corporation",
      tickerChanged: true,
    }),
    "마이크로소프트",
  );

  assert.equal(
    resolveUpdateStockLabel({
      existingLabel: "구글",
      incomingLabel: "구글",
      previousCode: "MSFT",
      nextCode: "MSFT",
      quoteName: "Microsoft Corporation",
      tickerChanged: false,
    }),
    "구글",
  );
});
