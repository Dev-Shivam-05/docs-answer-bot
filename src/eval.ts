import { readFile } from 'node:fs/promises';

export type EvalQuestion = {
  id: string;
  question: string;
  answerable: boolean;
  /** Required when answerable: page path relative to corpus/. */
  expected_path?: string;
};

export type EvalResult = {
  q: EvalQuestion;
  retrievedPaths: string[];
  topScore: number;
  grounded: boolean;
};

/** Parses and validates eval/questions.json. Throws with a clear message on bad data. */
export function parseQuestions(raw: unknown): EvalQuestion[] {
  const list = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) throw new Error('questions.json: "questions" must be an array');
  const seen = new Set<string>();
  return list.map((item, i) => {
    const q = item as Partial<EvalQuestion>;
    const where = `questions[${i}]`;
    if (typeof q.id !== 'string' || !q.id) throw new Error(`${where}: id must be a non-empty string`);
    if (seen.has(q.id)) throw new Error(`${where}: duplicate id "${q.id}"`);
    seen.add(q.id);
    if (typeof q.question !== 'string' || !q.question.trim()) throw new Error(`${where}: question must be a non-empty string`);
    if (typeof q.answerable !== 'boolean') throw new Error(`${where}: answerable must be a boolean`);
    if (q.answerable && (typeof q.expected_path !== 'string' || !q.expected_path.endsWith('.md'))) {
      throw new Error(`${where}: answerable questions need expected_path ending in .md`);
    }
    return { id: q.id, question: q.question, answerable: q.answerable, expected_path: q.expected_path };
  });
}

export async function loadQuestions(path: string): Promise<EvalQuestion[]> {
  return parseQuestions(JSON.parse(await readFile(path, 'utf8')));
}

export type Metrics = {
  answerable: number;
  unanswerable: number;
  /** Share of answerable questions whose expected page is in the top-k retrieved chunks. */
  hitAt3: number;
  /** Share of unanswerable questions answered with grounded=false. */
  refusalAccuracy: number;
  /** Share of answerable questions answered with grounded=true (false refusals lower this). */
  answeredRate: number;
};

export function computeMetrics(results: EvalResult[]): Metrics {
  const ans = results.filter((r) => r.q.answerable);
  const unans = results.filter((r) => !r.q.answerable);
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  return {
    answerable: ans.length,
    unanswerable: unans.length,
    hitAt3: share(ans.filter((r) => r.retrievedPaths.includes(r.q.expected_path!)).length, ans.length),
    refusalAccuracy: share(unans.filter((r) => !r.grounded).length, unans.length),
    answeredRate: share(ans.filter((r) => r.grounded).length, ans.length),
  };
}

/** For each threshold: what share of answerable questions would be answered, and unanswerable refused. */
export function thresholdSweep(results: EvalResult[], thresholds: number[]) {
  const ans = results.filter((r) => r.q.answerable);
  const unans = results.filter((r) => !r.q.answerable);
  return thresholds.map((t) => ({
    threshold: t,
    answered: ans.filter((r) => r.topScore >= t).length / (ans.length || 1),
    refused: unans.filter((r) => r.topScore < t).length / (unans.length || 1),
  }));
}
