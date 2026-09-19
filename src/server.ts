// HTTP server: POST /ask {"question": "..."} and GET /health.
// Usage: npm start   (PORT defaults to 8787)
import { createServer } from 'node:http';
import { ask, geminiFromEnv, warmUp } from './answer.ts';
import { MAX_BODY_BYTES } from './config.ts';
import { handle } from './http.ts';

// Fail at startup, not on the first request, if GEMINI_API_KEY is set without GEMINI_MODEL.
const gemini = geminiFromEnv();
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid PORT: ${process.env.PORT}`);

const server = createServer((req, res) => {
  const parts: Buffer[] = [];
  let size = 0;
  let tooBig = false;

  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    // Stop buffering once over the limit so a huge body cannot exhaust memory.
    if (size > MAX_BODY_BYTES) tooBig = true;
    else parts.push(chunk);
  });

  req.on('end', async () => {
    const result = tooBig
      ? { status: 413, body: { error: 'Body too large' } }
      : await handle(req.method ?? 'GET', req.url ?? '/', Buffer.concat(parts).toString('utf8'), { ask });
    res.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result.body));
  });
});

server.listen(port, () => {
  console.log(`docs-answer-bot listening on http://localhost:${port} (answers: ${gemini ? `Gemini ${gemini.model}` : 'extractive, offline'})`);
});

// Load the model and index in the background so the first request is not slow.
warmUp().catch((err) => console.error('warm-up failed:', err));
