"use client";

import { useEffect, useMemo, useState } from "react";
import { ranges, segments, type Mark } from "@/lib/highlight";
import { SAMPLES } from "@/lib/samples";
import type { Decision, Screening } from "@/lib/types";

type Mode = "link" | "paste";

const VERDICT: Record<Decision, { word: string; line: string }> = {
  forward: { word: "Forward", line: "Safe to hand to your agent. Personal data is masked." },
  hold: { word: "Hold", line: "A maintainer should read this before any agent does." },
  block: { word: "Block", line: "Do not let an agent read this issue." },
};

const LEGEND: { mark: Mark; label: string }[] = [
  { mark: "inject", label: "Injection" },
  { mark: "script", label: "Dangerous line" },
  { mark: "pii", label: "Personal data" },
  { mark: "hidden", label: "Hidden from people" },
];

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function Gatehouse() {
  const [mode, setMode] = useState<Mode>("paste");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState(SAMPLES[1].title);
  const [body, setBody] = useState(SAMPLES[1].body);
  const [active, setActive] = useState<string | null>(SAMPLES[1].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Screening | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/screen").then((r) => r.json()).then((j) => setConnected(!!j.connected)).catch(() => setConnected(null));
  }, []);

  function pick(id: string) {
    const s = SAMPLES.find((x) => x.id === id);
    if (!s) return;
    setMode("paste");
    setTitle(s.title);
    setBody(s.body);
    setActive(id);
    setResult(null);
    setError(null);
  }

  async function screen(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "link" ? { url } : { title, body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Screening failed.");
      setResult(json as Screening);
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !busy && (mode === "link" ? url.trim().length > 0 : body.trim().length > 0);

  return (
    <main className="page">
      <header className="intro">
        <p className="wordmark">Gatehouse</p>
        <h1>Screen a GitHub issue before your coding agent reads it.</h1>
        <p className="lede">
          Issues are written by anyone. Agents act on what they read. Gatehouse checks the issue for injected
          instructions, runs every script in it past a security read, masks personal data, and tells you whether
          to forward it, hold it, or block it.
        </p>
      </header>

      {connected === false && (
        <p className="notice" role="status">Gatehouse is not connected to Clocked yet, so screening is paused.</p>
      )}

      <form className="panel" onSubmit={screen}>
        <div className="samples" role="group" aria-label="Examples">
          {SAMPLES.map((s) => (
            <button key={s.id} type="button" className={`sample${active === s.id && mode === "paste" ? " on" : ""}`} onClick={() => pick(s.id)}>
              <span className="sample-label">{s.label}</span>
              <span className="sample-note">{s.note}</span>
            </button>
          ))}
        </div>

        <div className="modes" role="tablist" aria-label="Input">
          <button type="button" role="tab" aria-selected={mode === "paste"} className={mode === "paste" ? "on" : ""} onClick={() => setMode("paste")}>Paste the issue</button>
          <button type="button" role="tab" aria-selected={mode === "link"} className={mode === "link" ? "on" : ""} onClick={() => setMode("link")}>Issue link</button>
        </div>

        {mode === "link" ? (
          <label className="field">
            <span>Public GitHub issue</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/issues/123" inputMode="url" autoComplete="off" spellCheck={false} />
          </label>
        ) : (
          <>
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setActive(null); }} />
            </label>
            <label className="field">
              <span>Body, as written in Markdown</span>
              <textarea value={body} onChange={(e) => { setBody(e.target.value); setActive(null); }} rows={12} spellCheck={false} />
            </label>
          </>
        )}

        <div className="actions">
          <button className="primary" type="submit" disabled={!canSubmit}>{busy ? "Screening" : "Screen issue"}</button>
          {busy && <span className="quiet">Protect, Guard and Inspect are reading it.</span>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>

      {result && <Result s={result} copied={copied} onCopy={async () => {
        if (!result.agentCopy) return;
        await navigator.clipboard.writeText(result.agentCopy);
        setCopied(true);
      }} />}

      <section className="how">
        <h2>How it decides</h2>
        <ol>
          <li><strong>Guard</strong> reads the issue as untrusted content against a maintainer policy. Its evidence is cut from the copy. If the rest is still unsafe, the issue is blocked.</li>
          <li><strong>Inspect</strong> reads each script someone is asked to run, as if on a laptop or CI runner holding your credentials. A malicious script blocks the issue.</li>
          <li><strong>Protect</strong> finds personal data and secrets. They are masked before anything leaves.</li>
          <li>Anything close to a threshold is held for a person, not guessed.</li>
        </ol>
        <p className="quiet">All three run in one Clocked pipeline request. For agents and CI there is a JSON API:</p>
        <pre className="code">{`curl -X POST https://gatehouse-sand.vercel.app/api/screen \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://github.com/owner/repo/issues/123"}'`}</pre>
      </section>

      <footer className="foot">
        <span>Built on <a href="https://clocked.rezolve.ai">Clocked</a> by Rezolve.ai.</span>
        <a href="https://github.com/Joe-Simo/gatehouse">Source</a>
      </footer>
    </main>
  );
}

function Result({ s, copied, onCopy }: { s: Screening; copied: boolean; onCopy: () => void }) {
  const segs = useMemo(() => segments(s.issue.text, ranges(s)), [s]);
  const present = new Set(segs.flatMap((x) => x.marks));
  const v = VERDICT[s.decision];
  const cost = [
    s.ms != null ? `${s.ms.toLocaleString("en-US")} ms` : null,
    s.cost.credits != null ? `${s.cost.credits} credits` : null,
    s.cost.usd != null ? `$${s.cost.usd.toFixed(4)}` : null,
  ].filter(Boolean).join(", ");

  return (
    <section id="result" className="result" aria-live="polite">
      <div className={`verdict ${s.decision}`}>
        <p className="verdict-word">{v.word}</p>
        <p className="verdict-line">{v.line}</p>
      </div>

      <ul className="reasons">
        {s.reasons.map((r, i) => (
          <li key={i} className={r.tone}><span className="dot" aria-hidden />{r.text}</li>
        ))}
      </ul>

      <div className="columns">
        <div className="column">
          <h3>What the agent would read</h3>
          {present.size > 0 && (
            <ul className="legend">
              {LEGEND.filter((l) => present.has(l.mark)).map((l) => (
                <li key={l.mark}><span className={`swatch m-${l.mark}`} aria-hidden />{l.label}</li>
              ))}
            </ul>
          )}
          <pre className="issue">
            {segs.map((seg, i) =>
              seg.marks.length ? (
                <mark key={i} className={seg.marks.map((m) => `m-${m}`).join(" ")} title={seg.title}>{seg.text}</mark>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </pre>
        </div>

        <div className="column">
          <h3>What Gatehouse hands it</h3>
          {s.agentCopy != null ? (
            <>
              <pre className="issue copy">{s.agentCopy}</pre>
              <button type="button" className="secondary" onClick={onCopy}>{copied ? "Copied" : "Copy safe text"}</button>
            </>
          ) : (
            <p className="withheld">Nothing. This issue stays with the maintainers.</p>
          )}
        </div>
      </div>

      {s.scripts.length > 0 && (
        <div className="scripts">
          <h3>Scripts in this issue</h3>
          {s.scripts.map((c, i) => {
            const r = c.result;
            const tone = !r ? "hold" : r.verdict.toLowerCase() === "malicious" ? "block" : r.verdict.toLowerCase() === "benign" ? "forward" : "hold";
            return (
              <article key={i} className={`script ${tone}`}>
                <header>
                  <span>Script {i + 1}{c.block.lang ? `, ${c.block.lang}` : ""}</span>
                  <span>{r ? `${tone === "forward" ? "Routine" : r.verdict}${r.category && tone !== "forward" ? `: ${r.category}` : ""}${r.severity && r.severity !== "none" ? `, ${r.severity}` : ""} (${pct(r.malicious)} malicious)` : c.error}</span>
                </header>
                {r?.evidence?.length ? (
                  <ul>{r.evidence.map((e, j) => <li key={j}><code>{e.line}</code></li>)}</ul>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {cost && <p className="quiet meta">One Clocked pipeline: {cost}.</p>}
    </section>
  );
}
