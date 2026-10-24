import { afterEach, describe, expect, it, vi } from "vitest";
import { ClockedError, runPipeline } from "@/lib/clocked";
import { IssueFetchError, fetchIssue } from "@/lib/github";
import { recordedScreening } from "@/lib/recorded";
import { SAMPLES } from "@/lib/samples";
import { issueText } from "@/lib/screen";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CLOCKED_API_KEY;
});

describe("when Clocked is down", () => {
  it("gives up with a plain message before the deadline instead of hanging", async () => {
    process.env.CLOCKED_API_KEY = "test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 503 })));
    const t = Date.now();
    const err = await runPipeline({}, { attemptMs: 50, deadlineMs: 1_500 }).catch((e) => e);
    expect(err).toBeInstanceOf(ClockedError);
    expect((err as ClockedError).publicMessage).toBe("Clocked did not answer. Try again in a moment.");
    expect(Date.now() - t).toBeLessThan(3_000);
  });

  it("turns an unreadable answer into a Clocked error, not a crash", async () => {
    process.env.CLOCKED_API_KEY = "test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 200 })));
    const err = await runPipeline({}, { attemptMs: 50, deadlineMs: 500 }).catch((e) => e);
    expect(err).toBeInstanceOf(ClockedError);
    expect((err as ClockedError).status).toBe(502);
  });

  it("labels a recorded example answer with the reason it is shown", () => {
    const s = SAMPLES.find((x) => x.id === "hidden")!;
    const text = issueText(s.title, s.body);
    const rec = recordedScreening({ source: "pasted", title: s.title, body: s.body, text }, "unavailable");
    expect(rec?.recordedBecause).toBe("unavailable");
    expect(rec?.decision).toBe("hold");
  });
});

describe("when GitHub cannot return the issue", () => {
  it.each([
    [404, "not found"],
    [410, "deleted"],
    [403, "rate limiting"],
    [500, "Paste the issue text instead"],
  ])("explains a %i in words", async (status, words) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
    const err = await fetchIssue({ owner: "a", repo: "b", number: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(IssueFetchError);
    expect((err as Error).message).toContain(words);
  });
});
