import type { Screening } from "./types";

export type Mark = "inject" | "pii" | "script" | "hidden";
export type Segment = { text: string; marks: Mark[]; title?: string };

type Range = { start: number; end: number; mark: Mark; title: string };

/** Every finding as a range on the original issue text. */
export function ranges(s: Screening): Range[] {
  const out: Range[] = [];
  for (const h of s.hidden) out.push({ ...h, mark: "hidden", title: "Hidden HTML comment: invisible on GitHub, read by agents" });
  for (const e of s.pii?.entities ?? []) out.push({ start: e.start, end: e.end, mark: "pii", title: `Personal data: ${e.type}` });
  if (s.guard && s.guard.verdict.toLowerCase() !== "benign") {
    for (const e of s.guard.evidence ?? []) out.push({ start: e.start, end: e.end, mark: "inject", title: `Injection: ${s.guard.category ?? "flagged"}` });
  }
  for (const c of s.scripts) {
    if (!c.result || c.result.verdict.toLowerCase() === "benign") continue;
    for (const e of c.result.evidence ?? []) {
      out.push({ start: c.block.codeStart + e.start, end: c.block.codeStart + e.end, mark: "script", title: `Script: ${c.result.category ?? c.result.verdict}` });
    }
  }
  return out;
}

/** Split text at every range edge so overlapping findings can share a segment. */
export function segments(text: string, list: Range[]): Segment[] {
  const valid = list
    .map((r) => ({ ...r, start: Math.max(0, r.start), end: Math.min(text.length, r.end) }))
    .filter((r) => r.end > r.start);
  const cuts = new Set<number>([0, text.length]);
  for (const r of valid) { cuts.add(r.start); cuts.add(r.end); }
  const points = [...cuts].sort((a, b) => a - b);
  const segs: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const over = valid.filter((r) => r.start <= a && r.end >= b);
    const marks = [...new Set(over.map((r) => r.mark))];
    const prev = segs[segs.length - 1];
    if (prev && prev.marks.join() === marks.join() && !marks.length) prev.text += text.slice(a, b);
    else segs.push({ text: text.slice(a, b), marks, title: over.map((r) => r.title).join("\n") || undefined });
  }
  return segs;
}
