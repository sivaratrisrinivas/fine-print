// End to end through buildSnapshot with a fake API: checks the request shapes, the floor math and the politeness rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, FUNCTIONS, FLOORS } from '../scripts/snapshot.mjs';
import { makeClient, USER_AGENT, SOURCE } from '../public/lib/upstream.js';

const posted = { '24h': 1, '7d': 5, '30d': 20 };
function fakeFetch(log) {
  return async (url, init) => {
    log.push({ url: new URL(url), ua: init.headers['user-agent'] });
    const u = new URL(url);
    const p = u.pathname.replace('/api/v1', '');
    const q = Object.fromEntries(u.searchParams);
    const json = (b) => ({ ok: true, status: 200, headers: new Map(), json: async () => b });
    if (p === '/stats/hiring') return json({ live_jobs: 100, hiring_companies: 3, comp_posted: 20, comp_bands: [{ function: 'engineering', n: 50, p25: 1, median: 2, p75: 3 }], notes: 'x' });
    if (p === '/collections/hiring-in-volume') return json({ collection: { url: 'u', companies: 1, roles: 10, members: [{ rank: 1, name: 'Big', slug: 'big', open_roles: 10 }] } });
    if (p.startsWith('/jobs/')) return json({ job: { id: 'abcd1234', status: 'open', url: 'https://speedrun-talent-network.com/jobs/x-abcd1234', title: 'T', company: 'Big', company_slug: 'big', function: 'engineering', labels: { function: 'engineering', seniority: 'senior' }, published_at: '2026-09-01T00:00:00Z', stealth: false } });
    if (p === '/jobs') {
      const base = 100;
      const silent = 80;
      if (q.comp && q.comp_any) return json({ total: base - 3, jobs: [], facets: { posted } });
      if (q.comp && q.lvl) {
        const jobs = q.page === '0' ? [{ id: 'j1', company_slug: 'big', comp_min: 150000, comp_max: 250000, published_at: '2026-09-10T00:00:00Z', stealth: false }] : [];
        return json({ total: 1, total_pages: 1, jobs, facets: { posted } });
      }
      if (q.comp && q.founding) return json({ total: 1, total_pages: 1, jobs: [{ id: 'f1', comp_min: 180000, comp_max: 220000, published_at: '2026-11-01T00:00:00Z', stealth: false }], facets: { posted } });
      if (q.comp) return json({ total: q.comp === '150000' ? 17 : 20 - 2 * Math.floor(Number(q.comp) / 100000), jobs: [], facets: { compHidden: silent, posted } });
      return json({ total: base, total_pages: 2, jobs: [{ id: 'i1', comp_min: null, comp_max: null, stealth: false }], facets: { compAvailable: 20, posted } });
    }
    return { ok: false, status: 404, headers: new Map(), json: async () => ({}) };
  };
}

test('buildSnapshot recomputes everything from API reads', async () => {
  const log = [];
  const api = makeClient({ gapMs: 0, fetchImpl: fakeFetch(log) });
  const s = await buildSnapshot({ api, now: Date.parse('2026-11-11T00:00:00Z'), log: () => {} });
  assert.deepEqual(Object.keys(s.payTrap), FUNCTIONS);
  for (const fn of FUNCTIONS) for (const f of FLOORS) {
    const x = s.payTrap[fn].floors[f];
    assert.equal(x.kept + x.silentHidden + x.postedBelow, 100);
    assert.equal(x.silentHidden, 80);
  }
  assert.equal(s.payTrap.engineering.floors[150000].postedBelow, 3);
  assert.equal(s.crossCheck.ok, true);
  assert.equal(s.board.fresh.over30, 80);
  assert.ok(s.presets.length >= 1);
  assert.equal(s.requests, log.length);
  for (const r of log) {
    assert.equal(r.ua, USER_AGENT);
    assert.equal(r.url.searchParams.get('source'), SOURCE);
    assert.equal(r.url.host, 'speedrun-talent-network.com');
  }
  assert.ok(log.length < 200, 'stays a small, bounded number of reads');
});

test('client spaces requests out', async () => {
  const log = [];
  const api = makeClient({ gapMs: 60, fetchImpl: fakeFetch(log) });
  const t0 = Date.now();
  await api.get('/stats/hiring');
  await api.get('/stats/hiring');
  await api.get('/stats/hiring');
  assert.ok(Date.now() - t0 >= 110);
});

test('client retries on 429 and then succeeds', async () => {
  let n = 0;
  const api = makeClient({
    gapMs: 0,
    fetchImpl: async () => (++n === 1
      ? { ok: false, status: 429, headers: new Map([['retry-after', '0']]), json: async () => ({}) }
      : { ok: true, status: 200, headers: new Map(), json: async () => ({ fine: true }) }),
  });
  assert.deepEqual(await api.get('/x'), { fine: true });
  assert.equal(n, 2);
});
