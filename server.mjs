// Local preview: serves public/ and /api/role exactly like the deployed app. `npm run snapshot` first.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeClient } from './public/lib/upstream.js';
import { lookupCard } from './public/lib/lookup.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const snapPath = join(root, 'data', 'snapshot.json');
if (!existsSync(snapPath)) {
  console.error('No snapshot yet. Run `npm run snapshot` first.');
  process.exit(1);
}
const snapshot = JSON.parse(readFileSync(snapPath, 'utf8'));
const api = makeClient({ gapMs: 250 });
const cache = new Map();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('x-robots-tag', 'noindex, nofollow');
  if (url.pathname === '/api/role') {
    const ref = url.searchParams.get('ref') ?? '';
    try {
      const hit = cache.get(ref);
      const out = hit && Date.now() - hit.at < 1_800_000 ? hit.out : await lookupCard(ref, { api, snapshot });
      if (out.status === 200) cache.set(ref, { at: Date.now(), out });
      res.writeHead(out.status, { 'content-type': 'application/json' }).end(JSON.stringify(out.body));
    } catch {
      res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'The board did not answer just now.' }));
    }
    return;
  }
  const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(root, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(Number(process.env.PORT ?? 4173), () => console.log(`fine-print on http://localhost:${process.env.PORT ?? 4173}`));
