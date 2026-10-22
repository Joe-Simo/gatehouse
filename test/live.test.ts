import { describe, expect, it } from "vitest";
import honest from "./fixtures/live-honest.json";
import hidden from "./fixtures/live-hidden.json";
import repro from "./fixtures/live-repro.json";
import { SAMPLES } from "../src/lib/samples";
import { interpret, issueText, mergeSpans } from "../src/lib/screen";
import { recordedScreening } from "../src/lib/recorded";
import type { PipelineResponse } from "../src/lib/types";

// Real Clocked /pipeline answers for the three examples, recorded on key day
// (Oct 22, 2026). These are not mocks: they pin how Gatehouse reads them.

function run(id: string, rec: { response: unknown; credits: number; usd: number }) {
  const s = SAMPLES.find((x) => x.id === id)!;
  const text = issueText(s.title, s.body);
  return interpret({ source: "pasted", title: s.title, body: s.body, text }, rec.response as PipelineResponse, { credits: rec.credits, usd: rec.usd });
}

describe("live Clocked recordings", () => {
  it("forwards the honest bug report with the token, email, phone and name masked", () => {
    const s = run("honest", honest);
    expect(s.decision).toBe("forward");
    expect(s.guard?.verdict).toBe("benign");
    expect(s.scripts).toHaveLength(1);
    expect(s.scripts[0].result?.verdict).toBe("benign");
    expect(s.pii?.entities.map((e) => e.type).sort()).toEqual(["email", "person", "phone", "secret"]);
    expect(s.agentCopy).toContain("PARCEL_KIT_TOKEN=<SECRET>");
    expect(s.agentCopy).not.toContain("pkt_9f3a71c2e8b44d0e9a15");
    expect(s.agentCopy).not.toContain("mara.okafor@example.com");
    expect(s.agentCopy).toContain("pnpm build");
  });

  it("holds the hidden instruction and cuts it from the copy in one piece", () => {
    const s = run("hidden", hidden);
    expect(s.decision).toBe("hold");
    expect(s.guard?.verdict).toBe("injection");
    expect(s.guard?.residual_verdict).toBe("benign");
    expect(s.reasons[0].text).toContain("A cut copy is ready for review.");
    expect(s.agentCopy).not.toContain("GITHUB_TOKEN");
    expect(s.agentCopy).not.toContain("hooks.example.net");
    expect(s.agentCopy?.match(/\[removed by Gatehouse/g)).toHaveLength(1);
    expect(s.agentCopy).toContain("Download PDF");
  });

  it("blocks the poisoned repro script on Inspect's critical exfiltration verdict", () => {
    const s = run("repro", repro);
    expect(s.decision).toBe("block");
    expect(s.scripts[0].result?.verdict).toBe("malicious");
    expect(s.scripts[0].result?.severity).toBe("critical");
    expect(s.scripts[0].result?.evidence?.map((e) => e.line)).toContain("tar czf /tmp/diag.tgz ~/.npmrc ~/.ssh ~/.config/gh 2>/dev/null");
    expect(s.agentCopy).toBeNull();
    expect(s.reasons.some((r) => r.text.includes("cut copy is ready"))).toBe(false);
  });

  it("serves a recording only for the exact example text", () => {
    const s = SAMPLES[2];
    const text = issueText(s.title, s.body);
    expect(recordedScreening({ source: "pasted", title: s.title, body: s.body, text })?.decision).toBe("block");
    expect(recordedScreening({ source: "pasted", title: s.title, body: s.body + " ", text: text + " " })).toBeNull();
  });
});

describe("mergeSpans", () => {
  it("joins spans separated only by whitespace and keeps distant ones apart", () => {
    const text = "aaa bbb\nccc xx ddd";
    expect(mergeSpans(text, [{ start: 4, end: 7 }, { start: 0, end: 3 }, { start: 8, end: 11 }, { start: 15, end: 18 }]))
      .toEqual([{ start: 0, end: 11 }, { start: 15, end: 18 }]);
  });
});
