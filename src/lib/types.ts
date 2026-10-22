// Shapes Gatehouse reads from Clocked. Fields are optional where the docs say
// "may be absent": we never require diagnostic keys to consume a result.

export type Span = { start: number; end: number };

export type PiiEntity = Span & {
  type: string;
  value: string;
  confidence?: number;
};

export type PiiResult = {
  entities: PiiEntity[];
  counts?: Record<string, number>;
  threshold?: number;
};

export type GuardEvidence = Span & { quote: string; confidence?: number; without?: number };

export type GuardResult = {
  injection: number;
  verdict: string;
  threshold: number;
  category?: string;
  severity?: string;
  evidence?: GuardEvidence[];
  residual?: number;
  residual_verdict?: string;
};

export type ScriptEvidence = Span & { line: string; confidence?: number };

export type ScriptResult = {
  malicious: number;
  suspicious?: number;
  verdict: string;
  threshold: number;
  category?: string;
  severity?: string;
  evidence?: ScriptEvidence[];
};

export type PipelineStep = {
  step: number;
  endpoint: string;
  name?: string;
  status: number | null;
  ms?: number;
  result?: unknown;
  error?: unknown;
  skipped?: string;
};

export type PipelineResponse = {
  model?: string;
  steps: PipelineStep[];
  stopped: { step: number; endpoint: string; reason: string } | null;
  timing?: { total_ms?: number; model_ms?: number };
};

export type Cost = { credits: number | null; usd: number | null };

/** A fenced code block found in the issue, with offsets into the issue text. */
export type CodeBlock = Span & {
  lang: string;
  code: string;
  /** Offset of the first code character inside the issue text. */
  codeStart: number;
};

export type Issue = {
  source: string;
  title: string;
  body: string;
  /** The exact text Clocked reads: title, blank line, body. */
  text: string;
};

export type Decision = "forward" | "hold" | "block";

export type Reason = { tone: Decision; text: string };

export type ScriptCheck = {
  block: CodeBlock;
  result: ScriptResult | null;
  error: string | null;
};

export type Screening = {
  issue: Issue;
  decision: Decision;
  reasons: Reason[];
  guard: GuardResult | null;
  guardError: string | null;
  pii: PiiResult | null;
  piiError: string | null;
  scripts: ScriptCheck[];
  hidden: Span[];
  /** What Gatehouse would hand the agent. Null when the issue is blocked. */
  agentCopy: string | null;
  cost: Cost;
  ms: number | null;
  screenedAt: string;
};
