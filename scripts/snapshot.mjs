// Builds public/data/snapshot.json from live API reads. Run at build time (Vercel) or locally.
// Stores aggregates plus a handful of preset role cards. It does not re-host listings: every role links to its canonical URL.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeClient } from '../public/lib/upstream.js';
import { annualUsdMidpoint, bandStats, floorSplit, postedMix } from '../public/lib/math.js';
import { buildCard, companyFreshness } from '../public/lib/card.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', 'data', 'snapshot.json');

export const FUNCTIONS = ['all', 'engineering', 'product', 'design', 'research', 'data', 'sales', 'marketing', 'operations'];
export const FLOORS = [100000, 150000, 200000, 250000];
export const LEVELS = ['intern', 'new_grad', 'junior', 'mid', 'senior', 'staff_principal', 'lead_manager', 'director', 'vp', '_'];
export const PE_ROLE = '5c268fc2';

async function allPages(api, params, maxPages = 60) {
  const first = await api.get('/jobs', { ...params, page: 0 });
  const jobs = [...first.jobs];
  const pages = Math.min(first.total_pages ?? 1, maxPages);
  for (let p = 1; p < pages; p++) jobs.push(...(await api.get('/jobs', { ...params, page: p })).jobs);
  return { total: first.total, jobs, truncated: (first.total_pages ?? 1) > maxPages };
}

function midpoints(jobs) {
  const mids = [];
  let skipped = 0;
  for (const j of jobs) {
    const m = annualUsdMidpoint(j);
    if (m === null) skipped++;
    else mids.push(m);
  }
  return { mids, skipped };
}

export async function buildSnapshot({ api, now = Date.now(), log = console.log }) {
  const startedAt = new Date(now).toISOString();
  const stats = await api.get('/stats/hiring');
  const hiv = (await api.get('/collections/hiring-in-volume')).collection;

  // 1. Pay Trap: base slice + one floored query per (function, floor).
  const payTrap = {};
  for (const fn of FUNCTIONS) {
    const fnParam = fn === 'all' ? undefined : fn;
    const base = await api.get('/jobs', { fn: fnParam });
    const floors = {};
    for (const floor of FLOORS) {
      const r = await api.get('/jobs', { fn: fnParam, comp: floor });
      floors[floor] = floorSplit({ base: base.total, kept: r.total, silentHidden: r.facets.compHidden });
    }
    payTrap[fn] = {
      total: base.total,
      posted: base.facets.compAvailable,
      postedShare: base.total ? base.facets.compAvailable / base.total : 0,
      fresh: postedMix(base.total, base.facets.posted),
      floors,
    };
    log(`pay trap ${fn}: ${base.total} roles, ${base.facets.compAvailable} posted`);
  }
  // Cross-check the subtraction against comp_any=1 once (engineering, $150k).
  const anyCheck = await api.get('/jobs', { fn: 'engineering', comp: 150000, comp_any: 1 });
  const eng150 = payTrap.engineering.floors[150000];
  const crossCheck = {
    query: 'fn=engineering&comp=150000&comp_any=1',
    compAnyTotal: anyCheck.total,
    impliedPostedBelow: payTrap.engineering.total - anyCheck.total,
    computedPostedBelow: eng150.postedBelow,
    ok: payTrap.engineering.total - anyCheck.total === eng150.postedBelow,
  };

  // 2. Early-career slices the board labels intern / new grad.
  const early = {};
  for (const lvl of ['intern', 'new_grad']) {
    const r = await api.get('/jobs', { lvl });
    early[lvl] = { total: r.total, posted: r.facets.compAvailable };
  }

  // 3. Market: engineering midpoints by classified level, from every posted annual USD band.
  const engLevels = {};
  const engAll = [];
  let engSkipped = 0;
  const engJobsSeen = [];
  for (const lvl of LEVELS) {
    const { jobs, total, truncated } = await allPages(api, { fn: 'engineering', lvl, comp: 1 });
    const { mids, skipped } = midpoints(jobs);
    engAll.push(...mids);
    engSkipped += skipped;
    engLevels[lvl] = { ...bandStats(mids), listed: total, truncated };
    for (const j of jobs) engJobsSeen.push({ ...j, _lvl: lvl });
  }
  const founding = midpoints((await allPages(api, { founding: 1, comp: 1 })).jobs);
  const foundingEngJobs = (await allPages(api, { fn: 'engineering', founding: 1, comp: 1 })).jobs;
  const foundingEng = midpoints(foundingEngJobs);
  const foundingTotals = await api.get('/jobs', { founding: 1 });

  const market = {
    statsFunctions: Object.fromEntries(stats.comp_bands.map((b) => [b.function, { n: b.n, p25: b.p25, median: b.median, p75: b.p75 }])),
    statsNote: stats.notes,
    engineering: { ...bandStats(engAll), skippedNonAnnualOrNonUsd: engSkipped, byLevel: engLevels },
    founding: { ...bandStats(founding.mids), roles: foundingTotals.total },
    foundingEngineering: bandStats(foundingEng.mids),
    equity: {
      source: 'https://speedrun-talent-network.com/founding-engineer-salary',
      marketPracticePct: [0.5, 3],
      dilutionPerRoundRange: [0.15, 0.25],
      example: { grantPct: 1, rounds: 3, dilutionPerRound: 0.2 },
    },
  };

  const volume = {
    url: hiv.url,
    companies: hiv.companies,
    roles: hiv.roles,
    members: hiv.members.map((m) => ({ rank: m.rank, name: m.name, slug: m.slug, open_roles: m.open_roles, url: m.url })),
  };

  const board = {
    liveJobs: stats.live_jobs,
    hiringCompanies: stats.hiring_companies,
    compPosted: stats.comp_posted,
    fresh: payTrap.all.fresh,
  };

  // 4. Preset roles for the "pick a role" row: picked by rule from today's data, then built into full cards.
  const ctx = { payTrap, market, volume, board, early };
  const byNewest = (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at);
  const hivSlugs = new Set(volume.members.map((m) => m.slug));
  const picks = [];
  picks.push({ why: 'This role (the one this gift is for)', ref: PE_ROLE });
  const postedMid = engJobsSeen.filter((j) => j._lvl === 'senior' && !j.stealth).sort(byNewest)[0];
  if (postedMid) picks.push({ why: 'New, pay posted', ref: postedMid.id });
  const fEng = foundingEngJobs.filter((j) => !j.stealth).sort(byNewest)[0];
  if (fEng) picks.push({ why: 'Founding seat', ref: fEng.id });
  // Closest to 60 days old at a Hiring in Volume company: long open, but not an outlier picked to embarrass anyone.
  const target = now - 60 * 86_400_000;
  const oldVolume = engJobsSeen
    .filter((j) => hivSlugs.has(j.company_slug) && !j.stealth && Date.parse(j.published_at) < now - 31 * 86_400_000)
    .sort((a, b) => Math.abs(Date.parse(a.published_at) - target) - Math.abs(Date.parse(b.published_at) - target))[0];
  if (oldVolume) picks.push({ why: 'Long open, high-volume company', ref: oldVolume.id });
  const internSilent = (await api.get('/jobs', { fn: 'engineering', lvl: 'intern', sort: 'new' })).jobs.find(
    (j) => j.comp_min == null && j.comp_max == null && !j.stealth,
  );
  if (internSilent) picks.push({ why: 'Intern, pay silent', ref: internSilent.id });

  const presets = [];
  for (const p of picks) {
    const job = (await api.get(`/jobs/${p.ref}`)).job;
    if (!job || job.status !== 'open') continue;
    const companyRes = job.stealth ? null : await api.get('/jobs', { company: job.company });
    presets.push({ why: p.why, card: buildCard(job, ctx, companyFreshness(companyRes), now) });
  }

  return {
    version: 1,
    snapshotAt: startedAt,
    finishedAt: new Date().toISOString(),
    api: 'https://speedrun-talent-network.com/api/v1',
    requests: api.requests(),
    board,
    payTrap,
    crossCheck,
    early,
    market,
    volume,
    presets,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const api = makeClient({ log: console.error });
  const snap = await buildSnapshot({ api });
  if (!snap.crossCheck.ok) console.error('warning: comp_any cross-check did not match', snap.crossCheck);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(snap, null, 1));
  const e = snap.payTrap.engineering;
  console.log(
    `snapshot ${snap.snapshotAt}: ${snap.requests} requests; board ${snap.board.liveJobs} roles; ` +
      `eng $150k floor keeps ${e.floors[150000].kept}, hides ${e.floors[150000].silentHidden} silent + ${e.floors[150000].postedBelow} posted below`,
  );
}
