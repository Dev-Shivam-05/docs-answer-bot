// Splits a markdown page into retrieval chunks.
//
// Strategy (deliberately simple):
// 1. Split the page into sections at headings, ignoring "#" lines inside code fences.
// 2. Split each section into blocks: paragraphs, list/table runs, and whole code fences.
// 3. Greedily pack blocks into chunks of at most maxChars. A block that is too big on its
//    own is split by lines, then by sentences, then cut hard as a last resort.
// Every chunk remembers its heading path so the embedding sees "Page > Section" context.

export type PageMeta = { title: string; intro: string; url: string };
export type Section = { heading: string; text: string };

/** Parses the small JSON-quoted frontmatter written by scripts/fetch-corpus.ts. */
export function parseFrontmatter(src: string): { meta: PageMeta; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta: PageMeta = { title: '', intro: '', url: '' };
  if (!m) return { meta, body: src };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1] as keyof PageMeta;
    if (key in meta) {
      // Values are JSON strings; fall back to the raw text for hand-written files.
      try {
        meta[key] = JSON.parse(kv[2]);
      } catch {
        meta[key] = kv[2];
      }
    }
  }
  return { meta, body: src.slice(m[0].length) };
}

function isFence(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

/** Splits markdown into sections at headings; heading is "H2 > H3" style. */
export function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  const stack: { level: number; text: string }[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = current.join('\n').trim();
    if (text) sections.push({ heading: stack.map((h) => h.text).join(' > '), text });
    current = [];
  };

  for (const line of body.split(/\r?\n/)) {
    if (isFence(line)) inFence = !inFence;
    const h = !inFence ? line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/) : null;
    if (h) {
      flush();
      const level = h[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: h[2].replace(/`/g, '') });
    } else {
      current.push(line);
    }
  }
  flush();
  return sections;
}

/** Splits section text into blocks separated by blank lines; code fences stay whole. */
export function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  const flush = () => {
    const b = current.join('\n').trim();
    if (b) blocks.push(b);
    current = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (isFence(line)) {
      if (!inFence) flush();
      inFence = !inFence;
      current.push(line);
      if (!inFence) flush();
      continue;
    }
    if (!inFence && line.trim() === '') flush();
    else current.push(line);
  }
  flush();
  return blocks;
}

/** Splits prose into sentences. Good enough for documentation English, not a general tokenizer. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9`*[(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Breaks one oversized block into pieces of at most maxChars. */
function splitOversized(block: string, maxChars: number): string[] {
  const units: string[] = [];
  for (const line of block.split('\n')) {
    if (line.length <= maxChars) units.push(line);
    else
      for (const s of splitSentences(line)) {
        for (let i = 0; i < s.length; i += maxChars) units.push(s.slice(i, i + maxChars));
      }
  }
  return pack(units, maxChars, '\n');
}

function pack(units: string[], maxChars: number, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const u of units) {
    if (!cur) cur = u;
    else if (cur.length + sep.length + u.length <= maxChars) cur += sep + u;
    else {
      out.push(cur);
      cur = u;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Chunks one section's text into strings of at most maxChars. */
export function chunkText(text: string, maxChars: number): string[] {
  const units = splitBlocks(text).flatMap((b) => (b.length <= maxChars ? [b] : splitOversized(b, maxChars)));
  return pack(units, maxChars, '\n\n');
}

export type RawChunk = { heading: string; text: string };

/** Chunks a whole page body. The intro becomes part of the first section so it is searchable. */
export function chunkMarkdown(body: string, maxChars: number, intro = ''): RawChunk[] {
  const withIntro = intro ? `${intro}\n\n${body}` : body;
  return splitSections(withIntro).flatMap((s) =>
    chunkText(s.text, maxChars).map((text) => ({ heading: s.heading, text })),
  );
}

/** The text that is embedded: page title and heading path give the chunk its context. */
export function embeddingText(title: string, heading: string, text: string): string {
  return `${heading ? `${title} > ${heading}` : title}\n${text}`;
}
