import test from "node:test";
import assert from "node:assert/strict";
import { findQuoteRange, getQuoteOccurrence } from "./materialsAnnotations";

test("getQuoteOccurrence returns the matching repeated occurrence for a selection", () => {
  const text = "第一段。重点句。第二段。重点句。";
  const quote = "重点句";
  const secondStart = text.lastIndexOf(quote);

  assert.equal(getQuoteOccurrence(text, quote, secondStart), 1);
});

test("findQuoteRange returns the requested occurrence range", () => {
  const text = "第一段。重点句。第二段。重点句。";
  assert.deepEqual(findQuoteRange(text, "重点句", 1), {
    start: text.lastIndexOf("重点句"),
    end: text.lastIndexOf("重点句") + "重点句".length,
  });
});

test("findQuoteRange falls back to the nearest available occurrence when occurrence is stale", () => {
  const text = "重点句。第二段。";
  assert.deepEqual(findQuoteRange(text, "重点句", 3), {
    start: 0,
    end: 3,
  });
});

test("findQuoteRange returns null when the quote no longer exists", () => {
  assert.equal(findQuoteRange("第一段。第二段。", "重点句", 0), null);
});
