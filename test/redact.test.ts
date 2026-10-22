import { describe, expect, it } from "vitest";
import { applyEdits, placeholder } from "@/lib/redact";

describe("applyEdits", () => {
  it("replaces spans in order", () => {
    expect(applyEdits("call 555 or mail a@b.c", [
      { start: 5, end: 8, with: "<PHONE>", rank: 1 },
      { start: 17, end: 22, with: "<EMAIL>", rank: 1 },
    ])).toBe("call <PHONE> or mail <EMAIL>");
  });

  it("lets the higher rank win and still covers what is left", () => {
    const text = "0123456789";
    // rank 2 covers 3..6, rank 1 covers 1..9: its leftovers stay hidden, labelled once.
    expect(applyEdits(text, [
      { start: 1, end: 9, with: "P", rank: 1 },
      { start: 3, end: 6, with: "X", rank: 2 },
    ])).toBe("0PX9");
  });

  it("ignores out of range edits", () => {
    expect(applyEdits("abc", [{ start: 5, end: 9, with: "Z", rank: 1 }])).toBe("abc");
  });

  it("makes placeholders like Clocked does", () => {
    expect(placeholder("date_of_birth")).toBe("<DATE_OF_BIRTH>");
    expect(placeholder("person name")).toBe("<PERSON_NAME>");
  });
});
