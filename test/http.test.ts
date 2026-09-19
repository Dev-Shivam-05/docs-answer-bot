import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Answer } from '../src/answer.ts';
import { handle, validateAskBody } from '../src/http.ts';

const answer: Answer = { grounded: true, answer: 'yes', sources: [{ title: 'T', path: 'p.md', score: 0.9 }] };
const deps = { ask: async (q: string): Promise<Answer> => ({ ...answer, answer: `echo: ${q}` }) };

test('validateAskBody accepts a trimmed non-empty string up to 500 chars', () => {
  assert.deepEqual(validateAskBody({ question: '  hi  ' }), { ok: true, question: 'hi' });
  assert.equal(validateAskBody({ question: 'x'.repeat(500) }).ok, true);
});

test('validateAskBody rejects bad input', () => {
  const bad = [null, [], 'str', 42, {}, { question: 5 }, { question: '' }, { question: '   ' }, { question: 'x'.repeat(501) }];
  for (const body of bad) assert.equal(validateAskBody(body).ok, false, JSON.stringify(body));
});

test('GET /health -> 200 {ok:true}', async () => {
  assert.deepEqual(await handle('GET', '/health', '', deps), { status: 200, body: { ok: true } });
});

test('POST /ask with a valid question -> 200 and the answer shape', async () => {
  const r = await handle('POST', '/ask', JSON.stringify({ question: ' What is a runner? ' }), deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ...answer, answer: 'echo: What is a runner?' });
});

test('POST /ask error cases', async () => {
  assert.equal((await handle('POST', '/ask', '{not json', deps)).status, 400);
  assert.equal((await handle('POST', '/ask', JSON.stringify({ question: '' }), deps)).status, 400);
  assert.equal((await handle('POST', '/ask', JSON.stringify({ question: 'x'.repeat(501) }), deps)).status, 400);
  assert.equal((await handle('POST', '/ask', 'x'.repeat(9000), deps)).status, 413);
  assert.equal((await handle('GET', '/ask', '', deps)).status, 405);
  assert.equal((await handle('POST', '/health', '', deps)).status, 405);
  assert.equal((await handle('GET', '/nope', '', deps)).status, 404);
});

test('POST /ask hides internal errors behind a 500', async () => {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const r = await handle('POST', '/ask', JSON.stringify({ question: 'q' }), {
      ask: async () => {
        throw new Error('internal detail');
      },
    });
    assert.deepEqual(r, { status: 500, body: { error: 'Internal error' } });
    assert.equal(logged.length, 1);
  } finally {
    console.error = original;
  }
});
