// Chunks every page in corpus/ and embeds the chunks locally into data/index.json.
// Usage: npm run index

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { chunkMarkdown, embeddingText, parseFrontmatter } from '../src/chunker.ts';
import { CORPUS_DIR, EMBEDDING_MODEL, INDEX_PATH, MAX_CHUNK_CHARS } from '../src/config.ts';
import { embed } from '../src/embedder.ts';
import type { IndexedChunk, VectorIndex } from '../src/search.ts';

const BATCH = 32;

async function listMarkdown(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'ATTRIBUTION.md')
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

async function main() {
  const files = await listMarkdown(CORPUS_DIR);
  const chunks: Omit<IndexedChunk, 'vector'>[] = [];
  for (const file of files) {
    const path = relative(CORPUS_DIR, file).replace(/\\/g, '/');
    const { meta, body } = parseFrontmatter(await readFile(file, 'utf8'));
    chunkMarkdown(body, MAX_CHUNK_CHARS, meta.intro).forEach((c, i) => {
      chunks.push({ id: `${path}#${i}`, path, title: meta.title, heading: c.heading, text: c.text });
    });
  }
  console.log(`${files.length} pages -> ${chunks.length} chunks. Embedding with ${EMBEDDING_MODEL}...`);

  const vectors: number[][] = [];
  const t0 = Date.now();
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    vectors.push(...(await embed(batch.map((c) => embeddingText(c.title, c.heading, c.text)))));
    process.stdout.write(`\r  ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }
  console.log(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const index: VectorIndex = {
    model: EMBEDDING_MODEL,
    dims: vectors[0]?.length ?? 0,
    maxChunkChars: MAX_CHUNK_CHARS,
    // 6 decimals keeps the committed file small; the effect on cosine scores is below 1e-5.
    chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i].map((v) => Math.round(v * 1e6) / 1e6) })),
  };
  await mkdir(dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index) + '\n', 'utf8');
  console.log(`Wrote ${relative(process.cwd(), INDEX_PATH)} (${index.chunks.length} chunks, ${index.dims} dims)`);
}

await main();
