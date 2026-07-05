import test from "node:test";
import assert from "node:assert/strict";
import {
  createPendingAnnotationSelection,
  findQuoteRange,
  getQuoteOccurrence,
  normalizeSelectedQuote,
} from "./materialsAnnotations";

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

test("normalizeSelectedQuote collapses whitespace before annotating", () => {
  assert.equal(normalizeSelectedQuote("  第一段 \n\n  重点句  "), "第一段 重点句");
});

test("createPendingAnnotationSelection returns normalized quote and occurrence", () => {
  const text = "第一段。重点句。第二段。重点句。";
  const quote = "  重点句 \n ";
  const start = text.lastIndexOf("重点句");

  assert.deepEqual(createPendingAnnotationSelection(text, quote, start), {
    quote: "重点句",
    occurrence: 1,
  });
});

test("createPendingAnnotationSelection ignores empty selections", () => {
  assert.equal(createPendingAnnotationSelection("第一段", "   \n  ", 0), null);
});
