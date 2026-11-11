// Pure number crunching. No network, no DOM. Shared by the browser, the API route and the tests.

export const DAY_MS = 86_400_000;

/** What a pay floor does to one slice of the board.
 *  base: roles in the slice with no floor. kept: roles returned with the floor.
 *  silentHidden: facets.compHidden from the floored query (roles that posted no pay). */
export function floorSplit({ base, kept, silentHidden }) {
  for (const [k, v] of Object.entries({ base, kept, silentHidden })) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`floorSplit: bad ${k}`);
  }
  const postedBelow = base - kept - silentHidden;
  if (postedBelow < 0) throw new Error('floorSplit: counts do not add up');
  const hidden = silentHidden + postedBelow;
  return {
    base,
    kept,
    silentHidden,
    postedBelow,
    hidden,
    silentShareOfHidden: hidden === 0 ? 0 : silentHidden / hidden,
    mostlySilence: silentHidden > postedBelow,
  };
}

/** Midpoint of a posted band, annual USD only. Returns null for anything else. */
export function annualUsdMidpoint(job) {
  if (!job) return null;
  const period = job.comp_period ?? null;
  if (period !== null && period !== 'year') return null;
  const cur = job.comp_currency ?? null;
  if (cur !== null && cur !== 'USD') return null;
  const lo = num(job.comp_min);
  const hi = num(job.comp_max);
  if (lo === null && hi === null) return null;
  if (lo === null) return hi;
  if (hi === null) return lo;
  return (lo + hi) / 2;
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** Linear-interpolated quantile (same as numpy's default). */
export function quantile(sortedAsc, q) {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/** p25 / median / p75 of a list of midpoints. */
export function bandStats(values) {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return { n: 0, p25: null, median: null, p75: null };
  return { n: s.length, p25: quantile(s, 0.25), median: quantile(s, 0.5), p75: quantile(s, 0.75) };
}

/** Where a midpoint sits against a p25/median/p75 band. */
export function positionInBand(mid, band) {
  if (!Number.isFinite(mid) || !band || band.median == null) return null;
  if (mid < band.p25) return 'below-p25';
  if (mid < band.median) return 'p25-median';
  if (mid <= band.p75) return 'median-p75';
  return 'above-p75';
}

export function ageDays(publishedAt, now) {
  const t = Date.parse(publishedAt ?? '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** Freshness buckets, matching the board's own 7d / 30d presets. */
export function ageBucket(days) {
  if (days == null) return 'unknown';
  if (days <= 7) return 'this-week';
  if (days <= 30) return 'this-month';
  return 'over-30';
}

/** Board-level freshness from facets.posted ({24h, 7d, 30d}) and the total. */
export function postedMix(total, posted) {
  const d1 = posted?.['24h'] ?? 0;
  const d7 = posted?.['7d'] ?? 0;
  const d30 = posted?.['30d'] ?? 0;
  if (!(d1 <= d7 && d7 <= d30 && d30 <= total)) throw new Error('postedMix: facets not nested');
  const over30 = total - d30;
  return { total, last24h: d1, last7d: d7, last30d: d30, over30, over30Share: total ? over30 / total : 0 };
}

/** Equity left after priced rounds: grant% * (1 - dilution)^rounds. */
export function dilutedGrant(grantPct, rounds, dilutionPerRound) {
  return grantPct * Math.pow(1 - dilutionPerRound, rounds);
}

/** Map the board's classified seniority label ("mid-level", "Staff/Principal"...) to the lvl vocabulary. */
export function levelKey(label) {
  if (!label) return null;
  const s = String(label).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  const table = [
    ['intern', 'intern'],
    ['new grad', 'new_grad'],
    ['junior', 'junior'],
    ['mid', 'mid'],
    ['senior', 'senior'],
    ['staff', 'staff_principal'],
    ['principal', 'staff_principal'],
    ['lead', 'lead_manager'],
    ['manager', 'lead_manager'],
    ['director', 'director'],
    ['vp', 'vp'],
    ['vice president', 'vp'],
    ['c level', 'c_level'],
    ['founder', 'founder'],
  ];
  for (const [needle, key] of table) if (s === needle || s.startsWith(needle + ' ') || s === needle.replace(' ', '')) return key;
  for (const [needle, key] of table) if (s.includes(needle)) return key;
  return null;
}

export const LEVEL_NAMES = {
  intern: 'intern',
  new_grad: 'new grad',
  junior: 'junior',
  mid: 'mid-level',
  senior: 'senior',
  staff_principal: 'staff / principal',
  lead_manager: 'lead / manager',
  director: 'director',
  vp: 'VP',
  c_level: 'C-level',
  founder: 'founder',
};

/** Pull a job id (full UUID or the 8-hex prefix) out of a pasted URL or string. */
export function parseJobRef(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  const uuid = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (uuid) return uuid[0];
  let path = s;
  try { path = new URL(s).pathname; } catch { /* not a URL */ }
  const tail = path.replace(/\/+$/, '').split('/').pop() ?? '';
  const m = tail.match(/(?:^|-)([0-9a-f]{8})$/);
  return m ? m[1] : null;
}

export function usd(n) {
  if (!Number.isFinite(n)) return 'n/a';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'k';
  return '$' + Math.round(n);
}

export function int(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : 'n/a';
}

export function pct(x, digits = 0) {
  return Number.isFinite(x) ? (x * 100).toFixed(digits) + '%' : 'n/a';
}
