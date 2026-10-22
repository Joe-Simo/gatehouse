# Gatehouse

Screen a GitHub issue before your coding agent reads it.

Coding agents now triage issues, reproduce bugs and open pull requests on their own. Issues are written by anyone on the internet, and an agent acts on what it reads, including text that is hidden from people (HTML comments do not render on github.com) and scripts that "fix" a bug by shipping your keys somewhere else.

Gatehouse sits between the two. Give it an issue link or the issue text and it answers with one of three words:

- **Forward**: safe to hand to the agent. Personal data and secrets are masked.
- **Hold**: a maintainer should read it first. When the problem can be cut out, a cut copy is ready.
- **Block**: no agent should read it.

Every answer shows its evidence on the original text, and the exact copy the agent would get.

## How it uses Clocked

One request to Clocked [`/pipeline`](https://clocked.rezolve.ai/docs/pipeline) runs every check, so an issue costs one round trip and one bill.

| Step | Endpoint | What its output changes in Gatehouse |
| --- | --- | --- |
| `guard` | Guard, `/injection` with `source: "content"` and a maintainer policy | A flagged verdict sets Hold or Block. Its `evidence` spans are cut from the agent copy and drawn on the issue. `residual_verdict` (the text re-read without the evidence) decides between the two: clean remainder means Hold with a cut copy, unsafe remainder means Block. |
| `inspect-n` | Inspect, `/script`, one step per runnable code block (up to 6) | A malicious verdict with high or critical severity blocks the issue; suspicious holds it. `evidence` lines are drawn on the issue and listed per script; flagged blocks are withheld from the copy. |
| `protect` | Protect, `/pii` with issue-specific kinds, including a custom `secret` kind | Every entity is masked in the agent copy as `<EMAIL>`, `<SECRET>` and so on, and highlighted on the issue. |

Uncertainty is explicit. A score within 0.15 of its threshold, or any step that fails, holds the issue for a person instead of guessing. Gatehouse never forwards an issue whose checks did not all finish.

The policies Clocked reads are in [`src/lib/screen.ts`](src/lib/screen.ts). The decision rules are in [`src/lib/policy.ts`](src/lib/policy.ts).

## JSON API

```sh
curl -X POST https://<your-deployment>/api/screen \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com/owner/repo/issues/123"}'
```

Or send `{"title": "...", "body": "..."}`. The answer includes `decision`, `reasons`, the raw Clocked results, and `agentCopy` (null when blocked). A workflow that lets an agent pick up issues can call this first and only pass `agentCopy` along.

## Run it

Requires Node 20 or newer and pnpm.

```sh
pnpm install
cp .env.example .env.local   # add CLOCKED_API_KEY
pnpm dev
```

Without a key the app runs and says it is not connected. `pnpm test` runs the unit tests, which use the recorded responses published in the Clocked docs. `node scripts/mock-clocked.mjs` starts a crude local stand-in for checking the interface without spending credits (set `CLOCKED_BASE_URL=http://localhost:4010/clocked`); its answers are string matches, not Clocked results.

The Clocked key stays on the server. The public demo limits each visitor to 10 screenings per 10 minutes and caches identical issues for an hour.

## Limits

- Issues up to 20,000 characters; up to 6 scripts per issue, 8,000 characters each.
- Public issues only when fetching by link. Comments are not screened yet, only the title and body.
- The example issues in the app are fictional.

## AI use

This project was built with the help of an AI coding assistant, which wrote much of the code and copy under human direction. Screening decisions in the running app come from Clocked's models plus the plain rules in `src/lib/policy.ts`; Gatehouse uses no other AI model.

## License

MIT. See [LICENSE](LICENSE).
