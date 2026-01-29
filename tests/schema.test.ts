import { describe, expect, it } from "vitest";
import { isMessage, makeMessage } from "../shared/schema";

describe("schema", () => {
  it("validates message shape", () => {
    const message = makeMessage("request-state", null);
    expect(isMessage(message)).toBe(true);
  });
});
