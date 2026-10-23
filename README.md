# Gatehouse

Screen a GitHub issue before your coding agent reads it. Live at [gatehouse-sand.vercel.app](https://gatehouse-sand.vercel.app).

Demo video (85 seconds): [vimeo.com/1238589955](https://vimeo.com/1238589955). The narration is a synthetic voice.

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

## Real results

These are real Clocked answers, recorded on Thu Oct 22, 2026 with the live key. The full requests and responses are in [`test/fixtures/live-*.json`](test/fixtures) and the live site run is in [`docs/transcripts/live-smoke.txt`](docs/transcripts/live-smoke.txt).

| Example (fictional) | Decision | What Clocked found | Cost |
| --- | --- | --- | --- |
| An honest bug report | **Forward** | Guard: no injection (5%). Inspect: the repro script is routine. Protect masked a token, an email, a phone number and a name. | 9 to 11 credits, about $0.002 |
| A hidden instruction | **Hold** | Guard: injection, tool misuse or data exfiltration, 99.6%, critical, with the hidden HTML comment as evidence. Re-read without it, the rest is benign (7%), so a cut copy is ready. | 6 to 8 credits, about $0.0016 |
| A poisoned repro script | **Block** | Guard: injection, 99.5%. Inspect: data exfiltration, 99.6% malicious, critical, pointing at `curl ... \| bash`, the `tar` of `~/.npmrc ~/.ssh ~/.config/gh` and the upload. | 7 to 10 credits, about $0.002 |

A real public issue, [vercel/next.js#48748](https://github.com/vercel/next.js/issues/48748) (9,165 characters), was forwarded with no injection (5%) for 35 credits ($0.007). The Clocked pipeline itself took 0.2 to 0.3 s; full round trips from a browser were 0.5 to 1.1 s.

Screenshots: [hold](docs/screenshots/hold.png), [block](docs/screenshots/block.png), [forward](docs/screenshots/forward.png).

What the real answers changed in Gatehouse:

- Guard returns evidence sentence by sentence. Neighbouring spans are merged, so the agent copy shows one removal note instead of three.
- "A cut copy is ready" is only said when the issue is held, never when it is blocked.
- A routine script no longer shows a severity next to it.
- Protect declined to mask `GITHUB_TOKEN` as a secret, which is right: it is a variable name, not a value.

## JSON API

```sh
curl -X POST https://gatehouse-sand.vercel.app/api/screen \
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

Without a key the app runs and says it is not connected. `pnpm test` runs the unit tests, which use the live responses recorded above and the example responses published in the Clocked docs. `node scripts/mock-clocked.mjs` starts a crude local stand-in for checking the interface without spending credits (set `CLOCKED_BASE_URL=http://localhost:4010/clocked`); its answers are string matches, not Clocked results.

The Clocked key stays on the server. The public demo limits each visitor to 10 screenings per 10 minutes, caches identical issues for an hour, and shares one daily budget of Clocked credits across all visitors (600 by default, `GATEHOUSE_DAILY_CREDITS`). The counter lives in a private Vercel Blob (`BLOB_READ_WRITE_TOKEN`) and is updated with conditional writes; without a token it falls back to memory. When the day's budget is spent, the three examples show their recorded Clocked results, marked as recorded, and anything else is refused until midnight UTC. If the counter cannot be read, Gatehouse refuses rather than spends.

## Limits

- Issues up to 20,000 characters; up to 6 scripts per issue, 8,000 characters each.
- Public issues only when fetching by link. Comments are not screened yet, only the title and body.
- The example issues in the app are fictional.
- Protect can over-mask. On the Next.js issue it masked a maintainer's GitHub handle as a person and `0.0.0.0` as an IP address. It also left the user name inside a Windows path (`C:\Users\mara\...`) unmasked. Masking errs in both directions, so treat the copy as reduced risk, not zero.

## Credits

`test/fixtures/live-*.json` are real responses from our own Clocked account. The other files in `test/fixtures` are example responses published in the [Clocked documentation](https://clocked.rezolve.ai/docs/pipeline). Built with Next.js, React, zod and Vitest.

## AI use

This project was built with the help of an AI coding assistant, which wrote much of the code and copy under human direction. Screening decisions in the running app come from Clocked's models plus the plain rules in `src/lib/policy.ts`; Gatehouse uses no other AI model.

## License

MIT. See [LICENSE](LICENSE).
