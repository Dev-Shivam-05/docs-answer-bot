import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cosine, topK, type IndexedChunk } from '../src/search.ts';

const chunk = (id: string, vector: number[]): IndexedChunk => ({ id, path: `${id}.md`, title: id, heading: '', text: id, vector });

test('cosine: identical, orthogonal, opposite and scale-invariant', () => {
  assert.equal(cosine([1, 2, 3], [1, 2, 3]).toFixed(6), '1.000000');
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 0], [-1, 0]), -1);
  assert.equal(cosine([1, 1], [10, 10]).toFixed(6), '1.000000');
});

test('cosine: zero vector gives 0 and length mismatch throws', () => {
  assert.equal(cosine([0, 0], [1, 1]), 0);
  assert.throws(() => cosine([1], [1, 2]), /mismatch/);
});

test('topK returns the k most similar chunks in descending order', () => {
  const index = { chunks: [chunk('a', [1, 0]), chunk('b', [0.7, 0.7]), chunk('c', [0, 1]), chunk('d', [-1, 0])] };
  const hits = topK(index, [1, 0.1], 3);
  assert.deepEqual(
    hits.map((h) => h.chunk.id),
    ['a', 'b', 'c'],
  );
  assert.ok(hits[0].score >= hits[1].score && hits[1].score >= hits[2].score);
});
