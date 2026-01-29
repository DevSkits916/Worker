import { describe, expect, it } from "vitest";
import { isTooSimilar, jaccardSimilarity } from "../shared/similarity";

describe("similarity", () => {
  it("detects high similarity", () => {
    const score = jaccardSimilarity("hello world", "hello world");
    expect(score).toBe(1);
  });

  it("flags similar content", () => {
    const result = isTooSimilar("buy now", ["buy now"]);
    expect(result).toBe(true);
  });
});
