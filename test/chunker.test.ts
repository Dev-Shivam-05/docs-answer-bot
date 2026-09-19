import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkMarkdown, chunkText, embeddingText, parseFrontmatter, splitSections } from '../src/chunker.ts';

test('parseFrontmatter reads JSON-quoted values and returns the body', () => {
  const src = '---\ntitle: "A: title"\nintro: "Intro"\nurl: "https://x"\n---\n## H\n\nBody';
  const { meta, body } = parseFrontmatter(src);
  assert.deepEqual(meta, { title: 'A: title', intro: 'Intro', url: 'https://x' });
  assert.equal(body, '## H\n\nBody');
});

test('splitSections builds heading paths and ignores # inside code fences', () => {
  const md = ['Lead text', '## Setup', 'a', '### Cache', 'b', '```yaml', '# not a heading', '```', '## Next', 'c'].join('\n');
  const s = splitSections(md);
  assert.deepEqual(
    s.map((x) => x.heading),
    ['', 'Setup', 'Setup > Cache', 'Next'],
  );
  assert.match(s[2].text, /# not a heading/);
});

test('chunkText never exceeds maxChars and keeps all words', () => {
  const para = (n: number) => `Sentence number ${n} talks about workflows and jobs.`;
  const text = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n');
  const chunks = chunkText(text, 200);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 200, `chunk of ${c.length} chars`);
  assert.equal(chunks.join(' ').split(/\s+/).length, text.split(/\s+/).length);
});

test('chunkText splits one oversized paragraph by sentences', () => {
  const long = Array.from({ length: 30 }, (_, i) => `This is sentence ${i}.`).join(' ');
  const chunks = chunkText(long, 100);
  assert.ok(chunks.length >= 6);
  for (const c of chunks) assert.ok(c.length <= 100);
});

test('chunkText keeps a small code fence in one piece', () => {
  const md = 'Intro line.\n\n```yaml\non:\n  push:\n\n    branches: [main]\n```\n\nAfter.';
  const chunks = chunkText(md, 1000);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /on:\n {2}push:\n\n {4}branches/);
});

test('chunkMarkdown puts the intro in the first chunk', () => {
  const chunks = chunkMarkdown('## A\n\nText a', 1000, 'The intro.');
  assert.equal(chunks[0].heading, '');
  assert.equal(chunks[0].text, 'The intro.');
  assert.deepEqual(chunks[1], { heading: 'A', text: 'Text a' });
});

test('embeddingText prefixes title and heading', () => {
  assert.equal(embeddingText('Page', 'Sec', 'body'), 'Page > Sec\nbody');
  assert.equal(embeddingText('Page', '', 'body'), 'Page\nbody');
});
