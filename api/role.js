// GET /api/role?ref=<job url or id>  ->  { card, snapshotAt }
// Cached at the CDN for 30 minutes per ref, plus a per-instance cap on upstream reads.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeClient } from '../public/lib/upstream.js';
import { lookupCard } from '../public/lib/lookup.js';

let snapshot;
const api = makeClient({ gapMs: 250 });
const recent = [];
const CAP_PER_MIN = 20;

export default async function handler(req, res) {
  snapshot ??= JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'snapshot.json'), 'utf8'));
  const url = new URL(req.url, 'http://x');
  const ref = url.searchParams.get('ref') ?? '';
  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= CAP_PER_MIN) {
    res.status(429).json({ error: 'Easy there. This tool keeps its reads of the board slow on purpose. Try again in a minute.' });
    return;
  }
  recent.push(now);
  try {
    const out = await lookupCard(ref, { api, snapshot, now });
    if (out.status === 200) res.setHeader('cache-control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(502).json({ error: 'The board did not answer just now. Try again shortly.' });
  }
}
