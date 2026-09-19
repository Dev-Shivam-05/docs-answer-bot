import { readFile } from 'node:fs/promises';
import { INDEX_PATH, NOT_IN_DOCS, REFUSAL_THRESHOLD, TOP_K } from './config.ts';
import type { Embed } from './embedder.ts';
import { generateAnswer, type GeminiConfig } from './gemini.ts';
import { splitBlocks, splitSentences } from './chunker.ts';
import { cosine, topK, type Hit, type VectorIndex } from './search.ts';

export type Source = { title: string; path: string; score: number };
export type Answer = { grounded: boolean; answer: string; sources: Source[] };

export type AskerDeps = {
  index: VectorIndex;
  embed: Embed;
  threshold?: number;
  topK?: number;
  gemini?: GeminiConfig;
  /** Where to report a failed Gemini call before falling back. Defaults to console.warn. */
  warn?: (msg: string) => void;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Splits a chunk into candidate answer units: sentences of prose, list items, whole code blocks. */
export function answerUnits(text: string): string[] {
  const units: string[] = [];
  for (const block of splitBlocks(text)) {
    if (/^\s*(```|~~~)/.test(block)) {
      units.push(block);
      continue;
    }
    for (const line of block.split('\n')) {
      // Table separator rows and empty lines carry no content.
      if (!line.trim() || /^[\s|:-]+$/.test(line)) continue;
      units.push(...splitSentences(line));
    }
  }
  return units;
}

/**
 * Extractive answer: the 1-3 units of the top chunk that are most similar to the question,
 * kept in their original order so the text still reads naturally.
 */
export async function extractiveAnswer(questionVec: number[], text: string, embed: Embed): Promise<string> {
  const units = answerUnits(text);
  if (units.length <= 1) return text.trim();
  const vecs = await embed(units);
  const scored = units.map((u, i) => ({ i, u, s: cosine(questionVec, vecs[i]) }));
  const best = [...scored].sort((a, b) => b.s - a.s);
  // Keep the best unit, plus up to two more that are nearly as relevant.
  const picked = best.slice(0, 3).filter((x, rank) => rank === 0 || x.s >= best[0].s - 0.1);
  return picked
    .sort((a, b) => a.i - b.i)
    .map((x) => x.u)
    .join('\n');
}

export function createAsker(deps: AskerDeps) {
  const threshold = deps.threshold ?? REFUSAL_THRESHOLD;
  const k = deps.topK ?? TOP_K;
  const warn = deps.warn ?? ((m: string) => console.warn(m));

  async function retrieve(question: string): Promise<{ vec: number[]; hits: Hit[] }> {
    const [vec] = await deps.embed([question]);
    return { vec, hits: topK(deps.index, vec, k) };
  }

  async function ask(question: string): Promise<Answer> {
    const { vec, hits } = await retrieve(question);
    const refusal: Answer = { grounded: false, answer: NOT_IN_DOCS, sources: [] };
    // Never guess: if nothing in the corpus is similar enough, refuse before generating anything.
    if (hits.length === 0 || hits[0].score < threshold) return refusal;

    const sources = hits.map((h) => ({ title: h.chunk.title, path: h.chunk.path, score: round(h.score) }));

    if (deps.gemini) {
      try {
        const text = await generateAnswer(question, hits, deps.gemini);
        if (text.includes(NOT_IN_DOCS)) return refusal;
        return { grounded: true, answer: text, sources };
      } catch (err) {
        // A quota or network failure should not take the bot down; the extractive answer
        // is still grounded in the same retrieved chunks.
        warn(`Gemini failed, using extractive answer: ${(err as Error).message}`);
      }
    }
    return { grounded: true, answer: await extractiveAnswer(vec, hits[0].chunk.text, deps.embed), sources };
  }

  return { ask, retrieve };
}

/** Reads GEMINI_API_KEY / GEMINI_MODEL. Throws if a key is set without a model. */
export function geminiFromEnv(env: NodeJS.ProcessEnv = process.env): GeminiConfig | undefined {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return undefined;
  const model = env.GEMINI_MODEL?.trim();
  if (!model) throw new Error('GEMINI_MODEL is required when GEMINI_API_KEY is set');
  return { apiKey, model };
}

export async function loadIndex(path = INDEX_PATH): Promise<VectorIndex> {
  return JSON.parse(await readFile(path, 'utf8')) as VectorIndex;
}

let defaultAsker: Promise<ReturnType<typeof createAsker>> | undefined;

function getDefaultAsker() {
  defaultAsker ??= (async () => {
    const { embed } = await import('./embedder.ts');
    return createAsker({ index: await loadIndex(), embed, gemini: geminiFromEnv() });
  })();
  return defaultAsker;
}

/** ask(question) with the committed index, the local embedder and optional Gemini from env. */
export async function ask(question: string): Promise<Answer> {
  return (await getDefaultAsker()).ask(question);
}

/** Loads the index and the embedding model without generating an answer (no Gemini call). */
export async function warmUp(): Promise<void> {
  await (await getDefaultAsker()).retrieve('warm up');
}
