import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../shared/csv";

describe("csv", () => {
  it("parses quoted values", () => {
    const input = "target,text,file_url,schedule_time\n\"group\",\"hello, world\",\"https://x/y.png\",\"2025-01-01T00:00:00Z\"\n";
    const rows = parseCsv(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("hello, world");
  });

  it("serializes round-trip", () => {
    const csv = toCsv([
      {
        target: "group",
        text: "hello",
        file_url: "",
        schedule_time: ""
      }
    ]);
    const rows = parseCsv(csv);
    expect(rows[0].target).toBe("group");
  });
});
