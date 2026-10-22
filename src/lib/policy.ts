import type { Decision, GuardResult, Reason, ScriptCheck } from "./types";

/** Scores this close to the threshold are treated as "not sure", and a person looks. */
export const UNSURE_BAND = 0.15;

const SEVERE = new Set(["high", "critical"]);

const rankOf: Record<Decision, number> = { forward: 0, hold: 1, block: 2 };

export function worst(a: Decision, b: Decision): Decision {
  return rankOf[a] >= rankOf[b] ? a : b;
}

export function isFlagged(verdict: string | undefined): boolean {
  return !!verdict && verdict.toLowerCase() !== "benign";
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function nearThreshold(score: number, threshold: number): boolean {
  return Math.abs(score - threshold) < UNSURE_BAND;
}

export function guardDecision(g: GuardResult | null, error: string | null): { decision: Decision; reasons: Reason[] } {
  if (error || !g) {
    return { decision: "hold", reasons: [{ tone: "hold", text: `Injection check did not finish (${error ?? "no result"}). Held for a person.` }] };
  }
  const category = g.category ?? g.verdict;
  if (isFlagged(g.verdict)) {
    // Clocked re-scores the text with the evidence removed. If what remains is
    // clean, the cut copy is usable, but a maintainer should still see it.
    if (g.residual_verdict && !isFlagged(g.residual_verdict)) {
      return {
        decision: "hold",
        reasons: [{ tone: "hold", text: `Injection found (${category}, ${pct(g.injection)}). With the flagged text removed the rest reads clean (${pct(g.residual ?? 0)}).` }],
      };
    }
    return {
      decision: "block",
      reasons: [{ tone: "block", text: `Injection found (${category}, ${pct(g.injection)}${g.severity ? `, ${g.severity}` : ""}). Removing the evidence does not make it safe.` }],
    };
  }
  if (nearThreshold(g.injection, g.threshold)) {
    return { decision: "hold", reasons: [{ tone: "hold", text: `Injection score ${pct(g.injection)} is close to the ${pct(g.threshold)} line. Held for a person.` }] };
  }
  return { decision: "forward", reasons: [{ tone: "forward", text: `No injection (${pct(g.injection)}).` }] };
}

export function scriptDecision(checks: ScriptCheck[]): { decision: Decision; reasons: Reason[] } {
  let decision: Decision = "forward";
  const reasons: Reason[] = [];
  checks.forEach((c, i) => {
    const label = `Script ${i + 1}${c.block.lang ? ` (${c.block.lang})` : ""}`;
    if (c.error || !c.result) {
      decision = worst(decision, "hold");
      reasons.push({ tone: "hold", text: `${label}: check did not finish (${c.error ?? "no result"}).` });
      return;
    }
    const r = c.result;
    const category = r.category ?? r.verdict;
    if (r.verdict.toLowerCase() === "malicious") {
      const tone: Decision = !r.severity || SEVERE.has(r.severity) ? "block" : "hold";
      decision = worst(decision, tone);
      reasons.push({ tone, text: `${label}: ${category} (${pct(r.malicious)}${r.severity ? `, ${r.severity}` : ""}).` });
    } else if (isFlagged(r.verdict)) {
      decision = worst(decision, "hold");
      reasons.push({ tone: "hold", text: `${label}: ${r.verdict}, ${category}.` });
    } else if (nearThreshold(r.malicious, r.threshold)) {
      decision = worst(decision, "hold");
      reasons.push({ tone: "hold", text: `${label}: score ${pct(r.malicious)} is close to the line.` });
    }
  });
  if (checks.length && decision === "forward") {
    reasons.push({ tone: "forward", text: `${checks.length === 1 ? "The script" : `All ${checks.length} scripts`} read as routine.` });
  }
  return { decision, reasons };
}
