import "server-only";
import { randomUUID } from "node:crypto";
import type { Cost, PipelineResponse } from "./types";

const BASE = process.env.CLOCKED_BASE_URL ?? "https://clocked.rezolve.ai/clocked";

export class ClockedError extends Error {
  constructor(message: string, readonly status: number, readonly publicMessage: string) {
    super(message);
  }
}

export function clockedConfigured(): boolean {
  return !!process.env.CLOCKED_API_KEY;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function friendly(status: number): string {
  if (status === 401 || status === 403) return "Gatehouse could not authenticate with Clocked.";
  if (status === 402) return "The Clocked credits for this demo have run out.";
  if (status === 413) return "This issue is too large to screen in one request.";
  if (status === 429) return "Clocked is busy. Try again in a moment.";
  if (status === 400 || status === 422) return "Clocked could not read this request.";
  return "Clocked did not answer. Try again in a moment.";
}

/** A screening normally takes under a second. These bound the slow cases so the
 * route always answers before the function's own limit (maxDuration). */
export const ATTEMPT_MS = 30_000;
export const DEADLINE_MS = 75_000;

/**
 * POST one pipeline. Retries 429 and 5xx with the same Idempotency-Key (the
 * docs ask for exactly that) and honours Retry-After when it is given. Gives
 * up once `deadlineMs` has passed, so a Clocked outage becomes a clear answer
 * rather than a function timeout.
 */
export async function runPipeline(
  body: unknown,
  { attemptMs = ATTEMPT_MS, deadlineMs = DEADLINE_MS }: { attemptMs?: number; deadlineMs?: number } = {},
): Promise<{ data: PipelineResponse; cost: Cost }> {
  const key = process.env.CLOCKED_API_KEY;
  if (!key) throw new ClockedError("CLOCKED_API_KEY is not set", 503, "Gatehouse is not connected to Clocked yet.");

  const deadline = Date.now() + deadlineMs;
  const left = () => deadline - Date.now();
  let idempotencyKey = randomUUID();
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (left() <= 0) break;
    let res: Response;
    try {
      res = await fetch(`${BASE}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(1, Math.min(attemptMs, left()))),
        cache: "no-store",
      });
    } catch (err) {
      lastStatus = 0;
      const wait = 800 * 2 ** attempt;
      if (attempt < 2 && left() > wait) { await sleep(wait); continue; }
      throw new ClockedError(`network: ${(err as Error).message}`, 502, friendly(502));
    }

    if (res.ok) {
      const num = (h: string) => {
        const v = res.headers.get(h);
        return v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
      };
      let data: PipelineResponse;
      try {
        data = (await res.json()) as PipelineResponse;
      } catch (err) {
        throw new ClockedError(`unreadable 200: ${(err as Error).message}`, 502, friendly(502));
      }
      return {
        data,
        cost: { credits: num("x-clocked-credits"), usd: num("x-clocked-cost-usd") },
      };
    }

    lastStatus = res.status;
    const text = await res.text().catch(() => "");
    let retryAsNew = false;
    try { retryAsNew = (JSON.parse(text) as { retryAsNew?: unknown }).retryAsNew === true; } catch { /* not JSON */ }
    const transient = res.status === 409 || res.status === 429 || res.status >= 500;
    if (transient && attempt < 2) {
      // retryAsNew means the attempt under this key has ended. Screening only
      // reads text, so a fresh attempt is safe; we make that choice explicitly.
      if (retryAsNew) idempotencyKey = randomUUID();
      else if (res.status === 409) break;
      const after = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(after) && after > 0 ? Math.min(after, 10) * 1000 : 1000 * 2 ** attempt;
      if (left() > wait) { await sleep(wait); continue; }
    }
    throw new ClockedError(`clocked ${res.status}: ${text.slice(0, 300)}`, res.status, friendly(res.status));
  }
  throw new ClockedError(`clocked gave up after retries (${lastStatus})`, lastStatus || 502, friendly(lastStatus || 502));
}
