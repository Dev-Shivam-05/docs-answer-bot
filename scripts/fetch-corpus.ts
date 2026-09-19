// Downloads a small subset of GitHub Docs (GitHub Actions basics) into corpus/.
//
// Source: https://github.com/github/docs, content licensed CC BY 4.0.
// We pin a commit so the corpus (and therefore the index and eval numbers) is reproducible.
// Override with DOCS_COMMIT=<sha> to refresh, then re-run `npm run index` and `npm run eval`.
//
// Usage: npm run fetch-corpus

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { renderLiquid, type Resolver } from './liquid.ts';

const DOCS_COMMIT = process.env.DOCS_COMMIT ?? '27965d1687907bf5f365166999eea249ac88c088';
const RAW_BASE = `https://raw.githubusercontent.com/github/docs/${DOCS_COMMIT}`;

// Paths are relative to content/actions/ in github/docs.
const PAGES = [
  'get-started/understand-github-actions.md',
  'get-started/quickstart.md',
  'get-started/continuous-integration.md',
  'concepts/workflows-and-actions/workflows.md',
  'concepts/workflows-and-actions/concurrency.md',
  'concepts/workflows-and-actions/dependency-caching.md',
  'concepts/workflows-and-actions/variables.md',
  'concepts/workflows-and-actions/expressions.md',
  'concepts/workflows-and-actions/contexts.md',
  'concepts/workflows-and-actions/workflow-artifacts.md',
  'concepts/security/secrets.md',
  'concepts/security/github_token.md',
  'how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow.md',
  'how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency.md',
  'how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions.md',
  'how-tos/write-workflows/choose-what-workflows-do/use-secrets.md',
  'how-tos/write-workflows/choose-what-workflows-do/pass-job-outputs.md',
  'how-tos/write-workflows/choose-what-workflows-do/run-job-variations.md',
  'how-tos/manage-workflow-runs/manually-run-a-workflow.md',
  'how-tos/manage-workflow-runs/manage-caches.md',
  'how-tos/manage-workflow-runs/cancel-a-workflow-run.md',
  'how-tos/manage-workflow-runs/skip-workflow-runs.md',
  'reference/workflows-and-actions/workflow-syntax.md',
  'reference/workflows-and-actions/events-that-trigger-workflows.md',
  'reference/workflows-and-actions/dependency-caching.md',
  'reference/workflows-and-actions/workflow-cancellation.md',
  'reference/security/secrets.md',
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_DIR = join(ROOT, 'corpus');

const fileCache = new Map<string, Promise<string | null>>();

/** Fetches a file from the pinned commit. Returns null on 404 (some references point at removed files). */
function fetchRaw(path: string): Promise<string | null> {
  let p = fileCache.get(path);
  if (!p) {
    p = (async () => {
      const res = await fetch(`${RAW_BASE}/${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
      return res.text();
    })();
    fileCache.set(path, p);
  }
  return p;
}

const yamlCache = new Map<string, Promise<unknown>>();
function fetchYaml(path: string): Promise<unknown> {
  let p = yamlCache.get(path);
  if (!p) {
    p = fetchRaw(path).then((t) => (t === null ? null : parseYaml(t)));
    yamlCache.set(path, p);
  }
  return p;
}

const missing = new Set<string>();

const resolver: Resolver = {
  async reusable(path) {
    const file = `data/reusables/${path.replace(/\./g, '/')}.md`;
    const text = await fetchRaw(file);
    if (text === null) missing.add(file);
    return text;
  },
  async variable(path) {
    // "product.prodname_actions" -> data/variables/product.yml, key path ["prodname_actions"]
    const [file, ...keys] = path.split('.');
    let node = await fetchYaml(`data/variables/${file}.yml`);
    for (const k of keys) {
      node = node && typeof node === 'object' ? (node as Record<string, unknown>)[k] : undefined;
    }
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    missing.add(`variables.${path}`);
    return null;
  },
  async feature(name) {
    const doc = (await fetchYaml(`data/features/${name}.yml`)) as { versions?: Record<string, unknown> } | null;
    return Boolean(doc?.versions && 'fpt' in doc.versions);
  },
};

type Page = { rel: string; title: string; intro: string; body: string };

function splitFrontmatter(src: string): { fm: Record<string, unknown>; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: src };
  return { fm: (parseYaml(m[1]) as Record<string, unknown>) ?? {}, body: src.slice(m[0].length) };
}

function docsUrl(rel: string): string {
  return `https://docs.github.com/en/actions/${rel.replace(/\.md$/, '').replace(/\/index$/, '')}`;
}

/** Cleans markdown that only makes sense on docs.github.com. */
function cleanMarkdown(body: string, titles: Map<string, string>): string {
  return (
    body
      // Screenshots are not part of the corpus.
      .replace(/^[ \t]*!\[[^\]]*\]\([^)]*\)[ \t]*$/gm, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // [AUTOTITLE](/actions/...) is filled in by the docs site; use the real title when we know it.
      .replace(/\[AUTOTITLE\]\(([^)#]+)(#[^)]*)?\)/g, (_m, path: string, hash = '') => {
        const title = titles.get(path.replace(/^\/en/, ''));
        const url = `https://docs.github.com/en${path.replace(/^\/en/, '')}${hash}`;
        return title ? `[${title}](${url})` : `[${url}](${url})`;
      })
      // Other site-relative links become absolute so they still work outside the docs site.
      .replace(/\]\((\/[^)]+)\)/g, (_m, path: string) => `](https://docs.github.com/en${path.replace(/^\/en/, '')})`)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

async function main() {
  console.log(`Fetching ${PAGES.length} pages from github/docs@${DOCS_COMMIT.slice(0, 7)}`);
  const pages: Page[] = [];
  for (const rel of PAGES) {
    const src = await fetchRaw(`content/actions/${rel}`);
    if (src === null) throw new Error(`Page not found at pinned commit: ${rel}`);
    const { fm, body } = splitFrontmatter(src);
    const title = (await renderLiquid(String(fm.title ?? rel), resolver)).trim();
    const intro = (await renderLiquid(String(fm.intro ?? ''), resolver)).trim();
    pages.push({ rel, title, intro, body: await renderLiquid(body, resolver) });
    console.log(`  ok  ${rel}`);
  }

  const titles = new Map(pages.map((p) => [`/actions/${p.rel.replace(/\.md$/, '')}`, p.title]));

  await rm(CORPUS_DIR, { recursive: true, force: true });
  for (const p of pages) {
    const out = join(CORPUS_DIR, p.rel);
    await mkdir(dirname(out), { recursive: true });
    // Values are JSON-quoted so the frontmatter is valid YAML and trivial to parse back.
    const fm = [
      '---',
      `title: ${JSON.stringify(p.title)}`,
      `intro: ${JSON.stringify(p.intro)}`,
      `url: ${JSON.stringify(docsUrl(p.rel))}`,
      `source: ${JSON.stringify(`https://github.com/github/docs/blob/${DOCS_COMMIT}/content/actions/${p.rel}`)}`,
      '---',
      '',
    ].join('\n');
    await writeFile(out, fm + cleanMarkdown(p.body, titles) + '\n', 'utf8');
  }

  const attribution = [
    '# Corpus attribution',
    '',
    'The markdown files in this folder are adapted from [GitHub Docs](https://github.com/github/docs),',
    `commit [\`${DOCS_COMMIT}\`](https://github.com/github/docs/tree/${DOCS_COMMIT}),`,
    'by GitHub, Inc. and contributors, licensed under',
    '[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).',
    '',
    'Changes made by `scripts/fetch-corpus.ts`: Liquid templating was rendered for the Free/Pro/Team',
    '(`fpt`) version of the docs, screenshots were removed, site-relative links were made absolute, and',
    'each file got a short frontmatter block (title, intro, url, source). The text is otherwise unchanged.',
    '',
    'GitHub Docs is not affiliated with and does not endorse this project.',
    '',
    '## Pages',
    '',
    ...pages.map((p) => `- [${p.title}](${docsUrl(p.rel)}) — \`${p.rel}\``),
    '',
  ].join('\n');
  await writeFile(join(CORPUS_DIR, 'ATTRIBUTION.md'), attribution, 'utf8');

  if (missing.size) {
    console.warn(`Missing references rendered as empty (${missing.size}):`);
    for (const m of missing) console.warn(`  ${m}`);
  }
  console.log(`Wrote ${pages.length} pages to corpus/`);
}

await main();
