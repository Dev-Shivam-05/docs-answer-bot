export type IndexedChunk = {
  id: string;
  /** Page path relative to corpus/, e.g. "concepts/security/secrets.md". */
  path: string;
  title: string;
  heading: string;
  text: string;
  vector: number[];
};

export type VectorIndex = {
  model: string;
  dims: number;
  maxChunkChars: number;
  chunks: IndexedChunk[];
};

export type Hit = { chunk: IndexedChunk; score: number };

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Brute-force top-k by cosine similarity. Fine for a few thousand chunks; no ANN index needed. */
export function topK(index: Pick<VectorIndex, 'chunks'>, query: ArrayLike<number>, k: number): Hit[] {
  return index.chunks
    .map((chunk) => ({ chunk, score: cosine(query, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
