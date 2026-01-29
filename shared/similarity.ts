export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shingles(text: string, size = 3): Set<string> {
  const normalized = normalizeText(text);
  const tokens = normalized.split(" ").filter(Boolean);
  const result = new Set<string>();
  if (tokens.length === 0) {
    return result;
  }
  for (let i = 0; i <= tokens.length - size; i += 1) {
    result.add(tokens.slice(i, i + size).join(" "));
  }
  if (result.size === 0) {
    result.add(tokens.join(" "));
  }
  return result;
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = shingles(a);
  const setB = shingles(b);
  const union = new Set([...setA, ...setB]);
  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount += 1;
    }
  }
  return union.size === 0 ? 0 : intersectionCount / union.size;
}

export function isTooSimilar(candidate: string, recent: string[], threshold = 0.8): boolean {
  for (const text of recent) {
    if (jaccardSimilarity(candidate, text) >= threshold) {
      return true;
    }
  }
  return false;
}

export function chooseVariant(
  variants: string[],
  recent: string[],
  threshold = 0.8
): { text: string; reason: string } {
  for (const variant of variants) {
    if (!isTooSimilar(variant, recent, threshold)) {
      return { text: variant, reason: "selected" };
    }
  }
  return { text: variants[0] ?? "", reason: "fallback" };
}
