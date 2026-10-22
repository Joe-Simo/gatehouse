import { describe, expect, it } from "vitest";
import { parseIssueUrl } from "@/lib/github";

describe("parseIssueUrl", () => {
  it("reads issue and pull links", () => {
    expect(parseIssueUrl("https://github.com/vercel/next.js/issues/123")).toEqual({ owner: "vercel", repo: "next.js", number: 123 });
    expect(parseIssueUrl("github.com/a/b/pull/7#issuecomment-1")).toEqual({ owner: "a", repo: "b", number: 7 });
  });
  it("rejects everything else", () => {
    expect(parseIssueUrl("https://gitlab.com/a/b/issues/1")).toBeNull();
    expect(parseIssueUrl("https://github.com/a/b")).toBeNull();
    expect(parseIssueUrl("https://github.com/a/b/issues/0")).toBeNull();
    expect(parseIssueUrl("https://github.com/../b/issues/1")).toBeNull();
  });
});
