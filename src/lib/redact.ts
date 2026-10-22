import type { Span } from "./types";

export type Edit = Span & { with: string; rank: number };

/** Parts of `span` not covered by any of `taken`. */
function remainder(span: Span, taken: Span[]): Span[] {
  let pieces: Span[] = [span];
  for (const t of taken) {
    const next: Span[] = [];
    for (const p of pieces) {
      if (t.end <= p.start || t.start >= p.end) {
        next.push(p);
        continue;
      }
      if (t.start > p.start) next.push({ start: p.start, end: t.start });
      if (t.end < p.end) next.push({ start: t.end, end: p.end });
    }
    pieces = next;
  }
  return pieces.filter((p) => p.end > p.start);
}

/**
 * Apply replacements to `text`. Higher rank wins where edits overlap; a lower
 * ranked edit still covers whatever the winner left uncovered, so a phone
 * number that straddles a removed injection is never half exposed.
 */
export function applyEdits(text: string, edits: Edit[]): string {
  const ordered = edits
    .map((e, id) => ({ ...e, id, start: Math.max(0, e.start), end: Math.min(text.length, e.end) }))
    .filter((e) => e.end > e.start)
    .sort((a, b) => b.rank - a.rank || a.start - b.start);

  const placed: (Edit & { id: number })[] = [];
  for (const e of ordered) {
    for (const piece of remainder(e, placed)) placed.push({ ...e, ...piece });
  }
  placed.sort((a, b) => a.start - b.start);

  let out = "";
  let at = 0;
  const labelled = new Set<number>();
  for (const e of placed) {
    out += text.slice(at, e.start);
    // An edit split in two by a winner is labelled once.
    if (!labelled.has(e.id)) out += e.with;
    labelled.add(e.id);
    at = e.end;
  }
  return out + text.slice(at);
}

/** "credit_card" becomes "<CREDIT_CARD>". */
export function placeholder(type: string): string {
  return `<${type.trim().replace(/[^a-z0-9]+/gi, "_").toUpperCase()}>`;
}
