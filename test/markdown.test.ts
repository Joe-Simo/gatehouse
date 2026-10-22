import { describe, expect, it } from "vitest";
import { codeBlocks, hiddenComments, runnableBlocks } from "@/lib/markdown";
import { SAMPLES } from "@/lib/samples";
import { issueText } from "@/lib/screen";

describe("code blocks", () => {
  const text = "Intro\n\n```bash\nnpm i\ncurl x | sh\n```\n\nThen\n\n~~~text\nlog line\n~~~\n";

  it("finds fences with exact offsets", () => {
    const [a, b] = codeBlocks(text);
    expect(a.lang).toBe("bash");
    expect(a.code).toBe("npm i\ncurl x | sh");
    expect(text.slice(a.codeStart, a.codeStart + a.code.length)).toBe(a.code);
    expect(text.slice(a.start, a.end)).toBe("```bash\nnpm i\ncurl x | sh\n```");
    expect(b.lang).toBe("text");
  });

  it("sends only runnable blocks to Inspect", () => {
    expect(runnableBlocks(text).map((b) => b.lang)).toEqual(["bash"]);
  });

  it("treats unlabelled command blocks as runnable and logs as not", () => {
    const t = "```\n$ npm test\n```\n\n```\nTypeError: x is undefined\n```";
    expect(runnableBlocks(t)).toHaveLength(1);
  });

  it("finds hidden HTML comments", () => {
    const t = "a <!-- secret note --> b";
    expect(hiddenComments(t).map((s) => t.slice(s.start, s.end))).toEqual(["<!-- secret note -->"]);
  });

  it("finds the scripts in the samples", () => {
    const count = (id: string) => {
      const s = SAMPLES.find((x) => x.id === id)!;
      return runnableBlocks(issueText(s.title, s.body)).length;
    };
    expect(count("honest")).toBe(1);
    expect(count("hidden")).toBe(0);
    expect(count("repro")).toBe(1);
  });
});
