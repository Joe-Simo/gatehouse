import type { CodeBlock, Span } from "./types";

// Fenced code blocks (``` or ~~~), with offsets into the source text so the
// evidence Clocked returns for a script can be drawn on the issue itself.
const FENCE = /^( {0,3})(`{3,}|~{3,})([^\n`]*)\n([\s\S]*?)\n {0,3}\2[`~]*[ \t]*$/gm;

export function codeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const m of text.matchAll(FENCE)) {
    const start = m.index ?? 0;
    const header = m[1].length + m[2].length + m[3].length + 1;
    const code = m[4];
    if (!code.trim()) continue;
    blocks.push({
      start,
      end: start + m[0].length,
      lang: m[3].trim().split(/\s+/)[0]?.toLowerCase() ?? "",
      code,
      codeStart: start + header,
    });
  }
  return blocks;
}

// Languages that are data, not something anyone runs. Logs and stack traces are
// the bulk of most bug reports and should not be sent to Inspect.
const NOT_SCRIPTS = new Set([
  "text", "txt", "log", "logs", "plaintext", "console-output", "output",
  "json", "yaml", "yml", "toml", "xml", "csv", "diff", "md", "markdown",
  "stacktrace", "traceback",
]);

const RUNNABLE_HINT = /(^|\n)\s*(\$ |sudo |curl |wget |npm |npx |pnpm |yarn |pip |python |node |bash |sh |powershell|iwr |iex |Invoke-|chmod |rm |git |docker |export |echo )/;

/** Blocks someone might be asked to run. Unlabelled blocks count when they look like commands. */
export function runnableBlocks(text: string): CodeBlock[] {
  return codeBlocks(text).filter((b) => {
    if (NOT_SCRIPTS.has(b.lang)) return false;
    if (b.lang) return true;
    return RUNNABLE_HINT.test(b.code);
  });
}

/** HTML comments: invisible on github.com, fully visible to an agent reading the raw body. */
export function hiddenComments(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(/<!--[\s\S]*?-->/g)) {
    const start = m.index ?? 0;
    spans.push({ start, end: start + m[0].length });
  }
  return spans;
}
