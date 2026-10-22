import { describe, expect, it } from "vitest";
import { DAILY_CREDITS, RESERVE_PER_SCREENING, canSpend, record } from "../src/lib/budget";

describe("daily credit budget (in memory, no blob store)", () => {
  it("stops spending once the day's credits are used and resets the next day", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const day = "2026-01-01";
    expect(await canSpend(day)).toBe(true);
    await record(DAILY_CREDITS - RESERVE_PER_SCREENING, day);
    expect(await canSpend(day)).toBe(true);
    await record(1, day);
    expect(await canSpend(day)).toBe(false);
    expect(await canSpend("2026-01-02")).toBe(true);
  });
});
