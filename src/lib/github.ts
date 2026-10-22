export type IssueRef = { owner: string; repo: string; number: number };

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

/** Accepts github.com/owner/repo/issues/123 (or /pull/123), with or without https. */
export function parseIssueUrl(input: string): IssueRef | null {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/(\d+)(?:[/?#].*)?$/i);
  if (!m) return null;
  const [, owner, repo, num] = m;
  if (![owner, repo].every((n) => NAME.test(n) && n !== "." && n !== "..")) return null;
  const number = Number(num);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { owner, repo, number };
}

export class IssueFetchError extends Error {}

export async function fetchIssue(ref: IssueRef): Promise<{ title: string; body: string; url: string }> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gatehouse",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/issues/${ref.number}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 60 },
  });
  if (res.status === 404) throw new IssueFetchError("That issue was not found, or the repository is private.");
  if (res.status === 403 || res.status === 429) throw new IssueFetchError("GitHub is rate limiting requests. Paste the issue text instead.");
  if (!res.ok) throw new IssueFetchError(`GitHub answered ${res.status}.`);
  const json = (await res.json()) as { title?: string; body?: string | null; html_url?: string };
  return { title: json.title ?? "", body: json.body ?? "", url: json.html_url ?? `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}` };
}
