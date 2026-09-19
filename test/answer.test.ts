import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerUnits, createAsker, geminiFromEnv } from '../src/answer.ts';
import { NOT_IN_DOCS } from '../src/config.ts';
import type { Embed } from '../src/embedder.ts';
import type { VectorIndex } from '../src/search.ts';

// A fake embedder: known strings map to fixed vectors, everything else to [0, 0, 1].
// This keeps the tests fast and independent of the real model.
const VECS: Record<string, number[]> = {
  'cache question': [1, 0, 0],
  'off-topic question': [0, 0.2, 1],
  'Caches expire after 7 days.': [1, 0, 0],
  'Unrelated sentence here.': [0, 1, 0],
};
const fakeEmbed: Embed = async (texts) => texts.map((t) => VECS[t] ?? [0, 0, 1]);

const index: VectorIndex = {
  model: 'fake',
  dims: 3,
  maxChunkChars: 1000,
  chunks: [
    { id: 'c#0', path: 'cache.md', title: 'Caching', heading: 'Limits', text: 'Unrelated sentence here. Caches expire after 7 days.', vector: [1, 0, 0] },
    { id: 's#0', path: 'secrets.md', title: 'Secrets', heading: '', text: 'Secrets text.', vector: [0, 1, 0] },
  ],
};

test('grounded answer: extractive text from the top chunk plus sources', async () => {
  const { ask } = createAsker({ index, embed: fakeEmbed, threshold: 0.5 });
  const a = await ask('cache question');
  assert.equal(a.grounded, true);
  assert.equal(a.answer, 'Caches expire after 7 days.');
  assert.deepEqual(a.sources[0], { title: 'Caching', path: 'cache.md', score: 1 });
  assert.equal(a.sources.length, 2);
});

test('threshold refusal: best score below threshold returns "Not in the documents."', async () => {
  const { ask } = createAsker({ index, embed: fakeEmbed, threshold: 0.5 });
  const a = await ask('off-topic question');
  assert.deepEqual(a, { grounded: false, answer: NOT_IN_DOCS, sources: [] });
});

test('threshold refusal happens before Gemini is called', async () => {
  let called = false;
  const fetchStub = (async () => {
    called = true;
    throw new Error('should not be called');
  }) as unknown as typeof fetch;
  const { ask } = createAsker({ index, embed: fakeEmbed, threshold: 0.5, gemini: { apiKey: 'k', model: 'm', fetch: fetchStub } });
  assert.equal((await ask('off-topic question')).grounded, false);
  assert.equal(called, false);
});

const geminiReply = (text: string, capture?: (url: string, init: RequestInit) => void) =>
  (async (url: string, init: RequestInit) => {
    capture?.(url, init);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;

test('Gemini path: uses only retrieved chunks, sends the key in a header, returns its answer', async () => {
  let seenUrl = '';
  let seenBody = '';
  let seenKey = '';
  const fetchStub = geminiReply('Caches are evicted after 7 days.', (url, init) => {
    seenUrl = url;
    seenBody = String(init.body);
    seenKey = (init.headers as Record<string, string>)['x-goog-api-key'];
  });
  const { ask } = createAsker({
    index,
    embed: fakeEmbed,
    threshold: 0.5,
    gemini: { apiKey: 'test-key', model: 'some-model', fetch: fetchStub },
  });
  const a = await ask('cache question');
  assert.equal(a.grounded, true);
  assert.equal(a.answer, 'Caches are evicted after 7 days.');
  assert.match(seenUrl, /models\/some-model:generateContent$/);
  assert.ok(!seenUrl.includes('test-key'));
  assert.equal(seenKey, 'test-key');
  assert.match(seenBody, /Caches expire after 7 days/);
  assert.match(seenBody, /Not in the documents\./);
});

test('Gemini saying "Not in the documents." becomes grounded=false', async () => {
  const { ask } = createAsker({ index, embed: fakeEmbed, threshold: 0.5, gemini: { apiKey: 'k', model: 'm', fetch: geminiReply(NOT_IN_DOCS) } });
  assert.deepEqual(await ask('cache question'), { grounded: false, answer: NOT_IN_DOCS, sources: [] });
});

test('Gemini failure falls back to the extractive answer', async () => {
  const failing = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch;
  const warnings: string[] = [];
  const { ask } = createAsker({
    index,
    embed: fakeEmbed,
    threshold: 0.5,
    gemini: { apiKey: 'k', model: 'm', fetch: failing },
    warn: (m) => warnings.push(m),
  });
  const a = await ask('cache question');
  assert.equal(a.grounded, true);
  assert.equal(a.answer, 'Caches expire after 7 days.');
  assert.match(warnings[0], /429/);
});

test('geminiFromEnv: no key -> undefined; key without model -> error', () => {
  assert.equal(geminiFromEnv({}), undefined);
  assert.equal(geminiFromEnv({ GEMINI_API_KEY: '  ' }), undefined);
  assert.throws(() => geminiFromEnv({ GEMINI_API_KEY: 'k' }), /GEMINI_MODEL is required/);
  assert.deepEqual(geminiFromEnv({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' }), { apiKey: 'k', model: 'm' });
});

test('answerUnits keeps code fences whole and skips table separators', () => {
  const units = answerUnits('First sentence. Second one.\n\n```yaml\na: 1\n\nb: 2\n```\n\n| x | y |\n|---|---|\n| 1 | 2 |');
  assert.deepEqual(units, ['First sentence.', 'Second one.', '```yaml\na: 1\n\nb: 2\n```', '| x | y |', '| 1 | 2 |']);
});
