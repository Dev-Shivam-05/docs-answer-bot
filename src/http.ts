// Request handling for the HTTP API, kept free of sockets so it can be unit tested.
import { MAX_BODY_BYTES, MAX_QUESTION_CHARS } from './config.ts';
import type { Answer } from './answer.ts';

export type Validation = { ok: true; question: string } | { ok: false; error: string };

/** Validates the parsed JSON body of POST /ask at the boundary. */
export function validateAskBody(body: unknown): Validation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Body must be a JSON object like {"question": "..."}' };
  }
  const q = (body as { question?: unknown }).question;
  if (typeof q !== 'string') return { ok: false, error: '"question" must be a string' };
  const question = q.trim();
  if (!question) return { ok: false, error: '"question" must not be empty' };
  if (question.length > MAX_QUESTION_CHARS) {
    return { ok: false, error: `"question" must be at most ${MAX_QUESTION_CHARS} characters` };
  }
  return { ok: true, question };
}

export type HttpResult = { status: number; body: unknown };

export type HandlerDeps = { ask: (question: string) => Promise<Answer> };

/**
 * Routes one request. `rawBody` is the request body as text (already size-limited by the server).
 * Returns the status code and the JSON body to send.
 */
export async function handle(method: string, url: string, rawBody: string, deps: HandlerDeps): Promise<HttpResult> {
  const path = new URL(url, 'http://localhost').pathname;

  if (path === '/health') {
    if (method !== 'GET') return { status: 405, body: { error: 'Method not allowed' } };
    return { status: 200, body: { ok: true } };
  }

  if (path === '/ask') {
    if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } };
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return { status: 413, body: { error: 'Body too large' } };
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: { error: 'Body must be valid JSON' } };
    }
    const v = validateAskBody(parsed);
    if (!v.ok) return { status: 400, body: { error: v.error } };
    try {
      return { status: 200, body: await deps.ask(v.question) };
    } catch (err) {
      // Log the detail server-side; do not leak internals (or upstream error text) to clients.
      console.error('ask failed:', err);
      return { status: 500, body: { error: 'Internal error' } };
    }
  }

  return { status: 404, body: { error: 'Not found' } };
}
