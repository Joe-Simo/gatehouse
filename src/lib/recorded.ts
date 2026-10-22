import honest from "../../test/fixtures/live-honest.json";
import hidden from "../../test/fixtures/live-hidden.json";
import repro from "../../test/fixtures/live-repro.json";
import { SAMPLES } from "./samples";
import { interpret, issueText } from "./screen";
import type { Issue, PipelineResponse, Screening } from "./types";

// Real Clocked answers for the three examples, recorded on Oct 22, 2026. The
// demo shows them, clearly labelled, only when today's credit budget is spent.

type Recording = { recordedAt: string; credits: number; usd: number; response: unknown };

const BY_ID: Record<string, Recording> = { honest, hidden, repro };

export function recordedScreening(issue: Issue): (Screening & { recordedAt: string }) | null {
  const sample = SAMPLES.find((s) => issueText(s.title, s.body) === issue.text);
  const rec = sample && BY_ID[sample.id];
  if (!rec) return null;
  const s = interpret(issue, rec.response as PipelineResponse, { credits: rec.credits, usd: rec.usd });
  return { ...s, screenedAt: rec.recordedAt, recordedAt: rec.recordedAt };
}
