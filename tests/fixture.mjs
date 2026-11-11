import { floorSplit, postedMix } from '../public/lib/math.js';

const floors = (base, posted, keptBy) =>
  Object.fromEntries([100000, 150000, 200000, 250000].map((f) => [f, floorSplit({ base, kept: keptBy[f], silentHidden: base - posted })]));

export const NOW = Date.parse('2026-11-11T00:00:00Z');

export const ctx = {
  board: { liveJobs: 1000, fresh: postedMix(1000, { '24h': 10, '7d': 100, '30d': 350 }) },
  early: { intern: { total: 300, posted: 2 }, new_grad: { total: 50, posted: 3 } },
  payTrap: {
    all: { total: 1000, posted: 200, postedShare: 0.2, fresh: postedMix(1000, { '24h': 10, '7d': 100, '30d': 350 }), floors: floors(1000, 200, { 100000: 190, 150000: 150, 200000: 90, 250000: 30 }) },
    engineering: { total: 400, posted: 112, postedShare: 0.28, fresh: postedMix(400, { '24h': 4, '7d': 40, '30d': 150 }), floors: floors(400, 112, { 100000: 110, 150000: 107, 200000: 70, 250000: 20 }) },
  },
  market: {
    statsFunctions: { engineering: { n: 2091, p25: 167500, median: 204000, p75: 250000 }, sales: { n: 400, p25: 145000, median: 189500, p75: 250000 }, legal: { n: 4, p25: 1, median: 2, p75: 3 } },
    engineering: { n: 100, p25: 185000, median: 220000, p75: 267500, byLevel: { mid: { n: 40, p25: 172875, median: 200800, p75: 237500 }, vp: { n: 3, p25: 1, median: 2, p75: 3 } } },
    founding: { n: 60, p25: 175000, median: 210000, p75: 250000 },
    foundingEngineering: { n: 31, p25: 182500, median: 220000, p75: 250000 },
    equity: { source: 'https://speedrun-talent-network.com/founding-engineer-salary', marketPracticePct: [0.5, 3], example: { grantPct: 1, rounds: 3, dilutionPerRound: 0.2 } },
  },
  volume: { url: 'https://speedrun-talent-network.com/collections/hiring-in-volume', members: [{ rank: 1, name: 'Anduril', slug: 'anduril-industries', open_roles: 2575 }] },
};

export const job = (over = {}) => ({
  id: '5c268fc2-0299-37a9-64ae-969cdec37358', status: 'open', url: 'https://speedrun-talent-network.com/jobs/product-engineer-speedrun-5c268fc2',
  title: 'Product Engineer', company: 'speedrun', company_slug: 'speedrun', company_url: null, stealth: false, location: null,
  function: 'engineering', comp_min: null, comp_max: null, comp_currency: null, comp_period: null, comp_summary: null,
  published_at: '2026-11-02T16:47:03.629Z', labels: { function: 'engineering', seniority: 'mid-level', founding_role: false },
  ...over,
});
