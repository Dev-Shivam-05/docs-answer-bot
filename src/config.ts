import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CORPUS_DIR = join(ROOT, 'corpus');
export const INDEX_PATH = join(ROOT, 'data', 'index.json');
export const QUESTIONS_PATH = join(ROOT, 'eval', 'questions.json');

/** Sentence-embedding model run locally by transformers.js (384 dimensions, Apache-2.0). */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

/** Model files are cached here after the first download (also cached in CI). */
export const MODEL_CACHE_DIR = process.env.HF_CACHE_DIR ?? join(ROOT, '.cache', 'huggingface');

/** Number of chunks retrieved per question. */
export const TOP_K = 3;

/**
 * Chunks are at most this many characters. all-MiniLM-L6-v2 was trained on inputs of up to
 * 256 word pieces; ~1000 characters of English prose stays near that limit.
 */
export const MAX_CHUNK_CHARS = 1000;

/**
 * If the best cosine similarity is below this, the bot answers "Not in the documents."
 * Calibrated on eval/questions.json (see the threshold sweep in eval/results.md): the lowest
 * answerable top score was 0.638 and the highest unanswerable one 0.626, so 0.63 sits in that gap.
 * The gap is small and the set is small; expect some off-topic but GitHub-flavoured questions
 * to pass this gate on new data.
 */
export const REFUSAL_THRESHOLD = 0.63;

export const NOT_IN_DOCS = 'Not in the documents.';

/** Input limits for POST /ask. */
export const MAX_QUESTION_CHARS = 500;
export const MAX_BODY_BYTES = 8 * 1024;
