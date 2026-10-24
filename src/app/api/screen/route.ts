import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ClockedError, clockedConfigured, runPipeline } from "@/lib/clocked";
import { IssueFetchError, fetchIssue, parseIssueUrl } from "@/lib/github";
import { canSpend, record } from "@/lib/budget";
import { allow, cacheKey, cached, remember } from "@/lib/limits";
import { recordedScreening } from "@/lib/recorded";
import { MAX_CHARS, buildPipeline, interpret, issueText } from "@/lib/screen";
import type { Issue, Screening } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.union([
  z.object({ url: z.string().min(1).max(500) }),
  z.object({ title: z.string().max(500).default(""), body: z.string().min(1).max(MAX_CHARS) }),
]);

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const TOO_LONG = `Gatehouse screens issues up to ${MAX_CHARS.toLocaleString("en-US")} characters.`;

// Whether today's budget has room is read from the shared counter at most once
// a minute per instance, so opening the page does not cost a blob read each time.
let budgetSeen: { at: number; open: boolean } | null = null;
async function budgetOpen(): Promise<boolean> {
  if (budgetSeen && Date.now() - budgetSeen.at < 60_000) return budgetSeen.open;
  const open = await canSpend();
  budgetSeen = { at: Date.now(), open };
  return open;
}

/** { connected, budget }: budget is false once today's live screening credits are spent. */
export async function GET() {
  const connected = clockedConfigured();
  return NextResponse.json({ connected, budget: connected ? await budgetOpen() : false });
}

export async function POST(req: NextRequest) {
  const raw: unknown = await req.json().catch(() => null);
  const rawBody = (raw as { body?: unknown } | null)?.body;
  if (typeof rawBody === "string" && rawBody.length > MAX_CHARS) return fail(413, TOO_LONG);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return fail(400, "Send { url } for a GitHub issue, or { title, body } with the issue text.");

  let issue: Issue;
  if ("url" in parsed.data) {
    const ref = parseIssueUrl(parsed.data.url);
    if (!ref) return fail(400, "That is not a GitHub issue link. Use one like https://github.com/owner/repo/issues/123.");
    try {
      const got = await fetchIssue(ref);
      issue = { source: got.url, title: got.title, body: got.body, text: issueText(got.title, got.body) };
    } catch (err) {
      if (err instanceof IssueFetchError) return fail(502, err.message);
      console.error(err);
      return fail(502, "GitHub did not answer in time. Paste the issue text instead.");
    }
  } else {
    issue = { source: "pasted", title: parsed.data.title, body: parsed.data.body, text: issueText(parsed.data.title, parsed.data.body) };
  }
  if (!issue.text.trim()) return fail(400, "This issue has no text to screen.");
  if (issue.text.length > MAX_CHARS) return fail(413, TOO_LONG);

  const key = cacheKey(issue.text);
  const hit = cached<Screening>(key);
  if (hit) return NextResponse.json({ ...hit, issue: { ...hit.issue, source: issue.source }, cached: true });

  if (!clockedConfigured()) return fail(503, "Gatehouse is not connected to Clocked yet.");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!allow(ip)) return fail(429, "That is a lot of screening. Try again in a few minutes.");

  if (!(await canSpend())) {
    budgetSeen = { at: Date.now(), open: false };
    // The examples still work from their recorded Clocked answers, labelled as such.
    const rec = recordedScreening(issue, "budget");
    if (rec) return NextResponse.json({ ...rec, issue: { ...rec.issue, source: issue.source } });
    return fail(503, "Today's screening budget for this public demo is used up. It resets at midnight UTC. The three examples still show their recorded Clocked results.");
  }

  try {
    const { body } = buildPipeline(issue);
    const { data, cost } = await runPipeline(body);
    await record(cost.credits);
    const screening = interpret(issue, data, cost);
    remember(key, screening);
    return NextResponse.json(screening);
  } catch (err) {
    if (err instanceof ClockedError) {
      console.error(err.message);
      // If Clocked is down or out of credits, the examples still show their
      // recorded answers, labelled as such. Anything else gets a plain error.
      const outage = err.status === 0 || err.status === 402 || err.status === 429 || err.status >= 500;
      const rec = outage ? recordedScreening(issue, "unavailable") : null;
      if (rec) return NextResponse.json({ ...rec, issue: { ...rec.issue, source: issue.source } });
      const status = err.status === 429 ? 429 : err.status === 402 || err.status === 503 ? 503 : err.status === 413 ? 413 : 502;
      return fail(status, err.publicMessage);
    }
    console.error(err);
    return fail(500, "Something went wrong while screening.");
  }
}
