// Screens the three example issues through a running Gatehouse and prints the
// result. Usage: pnpm smoke [base-url]   (default http://localhost:3000)
import { SAMPLES } from "../src/lib/samples";

const base = process.argv[2] ?? "http://localhost:3000";
const expected: Record<string, string> = { honest: "forward", hidden: "hold or block", repro: "block" };

for (const s of SAMPLES) {
  const t = Date.now();
  const res = await fetch(`${base}/api/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: s.title, body: s.body }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.log(`${s.id}: HTTP ${res.status} ${json.error}`);
    continue;
  }
  console.log(`\n${s.id}: ${json.decision} (expected ${expected[s.id]}) in ${Date.now() - t} ms, ${json.cost?.credits ?? "?"} credits`);
  for (const r of json.reasons) console.log(`  [${r.tone}] ${r.text}`);
}
