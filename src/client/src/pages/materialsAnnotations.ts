export type QuoteRange = {
  start: number;
  end: number;
};

export function getQuoteOccurrence(text: string, quote: string, start: number) {
  if (!quote) return 0;

  let occurrence = 0;
  let searchFrom = 0;
  while (true) {
    const index = text.indexOf(quote, searchFrom);
    if (index === -1 || index >= start) {
      return occurrence;
    }
    occurrence += 1;
    searchFrom = index + quote.length;
  }
}

export function findQuoteRange(text: string, quote: string, occurrence: number): QuoteRange | null {
  if (!quote) return null;

  const matches: QuoteRange[] = [];
  let searchFrom = 0;
  while (true) {
    const index = text.indexOf(quote, searchFrom);
    if (index === -1) break;
    matches.push({ start: index, end: index + quote.length });
    searchFrom = index + quote.length;
  }

  if (matches.length === 0) {
    return null;
  }

  return matches[Math.min(occurrence, matches.length - 1)];
}
