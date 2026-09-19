import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CORPUS_DIR, QUESTIONS_PATH } from '../src/config.ts';
import { computeMetrics, loadQuestions, parseQuestions, thresholdSweep, type EvalResult } from '../src/eval.ts';

test('eval/questions.json has 15 answerable and 5 unanswerable questions with real expected pages', async () => {
  const qs = await loadQuestions(QUESTIONS_PATH);
  assert.equal(qs.length, 20);
  assert.equal(qs.filter((q) => q.answerable).length, 15);
  assert.equal(qs.filter((q) => !q.answerable).length, 5);
  for (const q of qs.filter((x) => x.answerable)) {
    assert.ok(existsSync(join(CORPUS_DIR, q.expected_path!)), `missing corpus page ${q.expected_path}`);
  }
});

test('parseQuestions rejects malformed data', () => {
  assert.throws(() => parseQuestions({}), /must be an array/);
  assert.throws(() => parseQuestions({ questions: [{ id: 'a', question: 'q', answerable: true }] }), /expected_path/);
  assert.throws(() => parseQuestions({ questions: [{ id: 'a', question: ' ', answerable: false }] }), /question/);
  const dup = {
    questions: [
      { id: 'a', question: 'q', answerable: false },
      { id: 'a', question: 'q2', answerable: false },
    ],
  };
  assert.throws(() => parseQuestions(dup), /duplicate/);
});

test('computeMetrics and thresholdSweep', () => {
  const r = (id: string, answerable: boolean, paths: string[], topScore: number, grounded: boolean): EvalResult => ({
    q: { id, question: id, answerable, expected_path: answerable ? 'a.md' : undefined },
    retrievedPaths: paths,
    topScore,
    grounded,
  });
  const results = [
    r('1', true, ['a.md'], 0.8, true),
    r('2', true, ['b.md'], 0.6, false),
    r('3', false, ['a.md'], 0.3, false),
    r('4', false, ['a.md'], 0.7, true),
  ];
  assert.deepEqual(computeMetrics(results), { answerable: 2, unanswerable: 2, hitAt3: 0.5, refusalAccuracy: 0.5, answeredRate: 0.5 });
  assert.deepEqual(thresholdSweep(results, [0.5]), [{ threshold: 0.5, answered: 1, refused: 0.5 }]);
});
