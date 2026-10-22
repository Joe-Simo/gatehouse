import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ClockedError, clockedConfigured, runPipeline } from "@/lib/clocked";
import { IssueFetchError, fetchIssue, parseIssueUrl } from "@/lib/github";
import { allow, cacheKey, cached, remember } from "@/lib/limits";
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

export async function GET() {
  return NextResponse.json({ connected: clockedConfigured() });
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, "Send { url } for a GitHub issue, or { title, body } with the issue text.");

  let issue: Issue;
  if ("url" in parsed.data) {
    const ref = parseIssueUrl(parsed.data.url);
    if (!ref) return fail(400, "That does not look like a GitHub issue link.");
    try {
      const got = await fetchIssue(ref);
      issue = { source: got.url, title: got.title, body: got.body, text: issueText(got.title, got.body) };
    } catch (err) {
      return fail(502, err instanceof IssueFetchError ? err.message : "Could not reach GitHub.");
    }
  } else {
    issue = { source: "pasted", title: parsed.data.title, body: parsed.data.body, text: issueText(parsed.data.title, parsed.data.body) };
  }
  if (!issue.text.trim()) return fail(400, "This issue has no text to screen.");
  if (issue.text.length > MAX_CHARS) return fail(413, `Gatehouse screens issues up to ${MAX_CHARS.toLocaleString("en-US")} characters.`);

  const key = cacheKey(issue.text);
  const hit = cached<Screening>(key);
  if (hit) return NextResponse.json({ ...hit, issue: { ...hit.issue, source: issue.source }, cached: true });

  if (!clockedConfigured()) return fail(503, "Gatehouse is not connected to Clocked yet.");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!allow(ip)) return fail(429, "That is a lot of screening. Try again in a few minutes.");

  try {
    const { body } = buildPipeline(issue);
    const { data, cost } = await runPipeline(body);
    const screening = interpret(issue, data, cost);
    remember(key, screening);
    return NextResponse.json(screening);
  } catch (err) {
    if (err instanceof ClockedError) {
      console.error(err.message);
      const status = err.status === 429 ? 429 : err.status === 402 || err.status === 503 ? 503 : err.status === 413 ? 413 : 502;
      return fail(status, err.publicMessage);
    }
    console.error(err);
    return fail(500, "Something went wrong while screening.");
  }
}
