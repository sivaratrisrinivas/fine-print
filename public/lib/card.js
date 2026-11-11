// One role, three answers. buildCard() turns a live job + the snapshot into a plain model;
// renderCard() turns the model into HTML. Both are pure so they run in the browser, the API route and the tests.
import {
  ageBucket, ageDays, annualUsdMidpoint, dilutedGrant, int, levelKey, LEVEL_NAMES, pct, positionInBand, postedMix, usd,
} from './math.js';

export const BOARD_FUNCTIONS = ['engineering', 'product', 'design', 'research', 'data', 'sales', 'marketing', 'operations'];
export const DEFAULT_FLOOR = 150000;
const MIN_N = 15;
const LAYOFFS_URL = 'https://speedrun-talent-network.com/layoffs';
const NEW_THIS_WEEK_URL = 'https://speedrun-talent-network.com/collections/new-this-week';
const FOUNDING_URL = 'https://speedrun-talent-network.com/founding-engineer-salary';

export function companyFreshness(res) {
  if (!res || !Number.isFinite(res.total)) return null;
  return postedMix(res.total, res.facets?.posted);
}

export function boardFunctionOf(job) {
  const a = job?.labels?.function;
  if (a && BOARD_FUNCTIONS.includes(a)) return a;
  if (job?.function && BOARD_FUNCTIONS.includes(job.function)) return job.function;
  return 'all';
}

export function isFounding(job) {
  if (job?.labels?.founding_role === true) return true;
  return /\bfounding\b/i.test(job?.title ?? '');
}

function fnName(fn) {
  return fn === 'all' ? 'all' : fn;
}

function inSlice(job, fn) {
  return fn === 'all' || job?.labels?.function === fn;
}

function payAnswer(job, ctx, fn, floor) {
  const slice = ctx.payTrap[fn] ?? ctx.payTrap.all;
  const split = slice.floors[floor];
  const label = fn === 'all' ? 'roles' : `${fnName(fn)} roles`;
  const hasBand = job.comp_min != null || job.comp_max != null;
  const period = job.comp_period ?? null;
  const summary = job.comp_summary || null;
  if (!hasBand) {
    return {
      status: 'silent',
      headline: 'Pay not posted.',
      detail: inSlice(job, fn)
        ? `A ${usd(floor)} floor hides this role. It is one of ${int(split.silentHidden)} ${label} that vanish under that floor only because they post no pay. Just ${int(split.postedBelow)} vanish because their posted band is lower.`
        : `A ${usd(floor)} floor hides this role, along with ${int(split.silentHidden)} ${label} that post no pay. Just ${int(split.postedBelow)} vanish because their posted band is lower.`,
      split,
    };
  }
  if (period !== null && period !== 'year') {
    return {
      status: 'non-annual',
      headline: `Posted: ${summary ?? `${int(job.comp_min)} to ${int(job.comp_max)} per ${period}`}.`,
      detail: `The band is per ${period}. The board's pay floor only reads annual bands, so any floor hides this role.`,
      split,
    };
  }
  const top = job.comp_max ?? job.comp_min;
  const band = job.comp_min != null && job.comp_max != null && job.comp_min !== job.comp_max
    ? `${usd(job.comp_min)} to ${usd(job.comp_max)}` : usd(top);
  const nonUsd = job.comp_currency && job.comp_currency !== 'USD';
  return {
    status: 'posted',
    headline: `Posted: ${nonUsd ? summary ?? band + ' ' + job.comp_currency : band}.`,
    detail: nonUsd
      ? `Posted in ${job.comp_currency}, so it is left out of the USD market math.`
      : `It stays visible under any floor up to ${usd(top)}. It is one of the ${pct(slice.postedShare)} of ${label} that post pay at all.`,
    split,
  };
}

function pickComparable(job, ctx, fn) {
  const m = ctx.market;
  if (isFounding(job)) {
    if (fn === 'engineering' && m.foundingEngineering.n >= MIN_N)
      return { ...m.foundingEngineering, label: 'founding engineering roles with posted bands', founding: true };
    if (m.founding.n >= MIN_N) return { ...m.founding, label: 'founding roles with posted bands', founding: true };
  }
  const lvl = levelKey(job?.labels?.seniority);
  if (fn === 'engineering' && lvl && m.engineering.byLevel[lvl]?.n >= MIN_N)
    return { ...m.engineering.byLevel[lvl], label: `${LEVEL_NAMES[lvl]} engineering roles with posted bands` };
  const sf = m.statsFunctions[job.function];
  if (sf && sf.n >= MIN_N) return { ...sf, label: `${job.function} roles with posted bands (the board's own stats)` };
  if (m.engineering.n >= MIN_N && fn === 'engineering')
    return { ...m.engineering, label: 'engineering roles with posted bands' };
  return null;
}

const POSITION_WORDS = {
  'below-p25': 'below the 25th percentile of',
  'p25-median': 'between the 25th percentile and the median of',
  'median-p75': 'between the median and the 75th percentile of',
  'above-p75': 'above the 75th percentile of',
};

function marketAnswer(job, ctx, fn) {
  const cmp = pickComparable(job, ctx, fn);
  const mid = annualUsdMidpoint(job);
  const out = { comparable: cmp, midpoint: mid, position: null, equity: null };
  if (!cmp) {
    out.headline = 'Not enough posted bands to compare.';
    out.detail = 'Fewer than 15 comparable roles post an annual USD band today.';
  } else {
    const range = `${usd(cmp.p25)} to ${usd(cmp.p75)}`;
    if (mid !== null) {
      out.position = positionInBand(mid, cmp);
      out.headline = `Midpoint ${usd(mid)} vs a ${usd(cmp.median)} market median.`;
      out.detail = `That sits ${POSITION_WORDS[out.position]} ${int(cmp.n)} ${cmp.label} (middle half ${range}).`;
    } else {
      out.headline = `Comparable roles: ${usd(cmp.median)} median midpoint.`;
      out.detail = `From ${int(cmp.n)} ${cmp.label}; the middle half runs ${range}. This role has no band, so this is context, not a guess at its pay.`;
    }
  }
  if (isFounding(job)) {
    const e = ctx.market.equity;
    const ex = e.example;
    const left = dilutedGrant(ex.grantPct, ex.rounds, ex.dilutionPerRound);
    out.equity = {
      text: `Equity is not posted, as it almost never is. The board's founding salary page cites ${e.marketPracticePct[0]}% to ${e.marketPracticePct[1]}% as market practice; a ${ex.grantPct}% grant after ${ex.rounds} rounds at ${ex.dilutionPerRound * 100}% dilution each is about ${left.toFixed(2)}%.`,
      source: e.source,
      after: left,
    };
  }
  return out;
}

function volumeMember(job, ctx) {
  return ctx.volume.members.find((m) => m.slug && m.slug === job.company_slug) ?? null;
}

export function ageWords(days) {
  if (days < 365) return `${int(days)} day${days === 1 ? '' : 's'}`;
  const years = days / 365;
  return `${int(days)} days (about ${years.toFixed(1)} years)`;
}

function freshAnswer(job, ctx, company, now) {
  const days = ageDays(job.published_at, now);
  const bucket = ageBucket(days);
  const vol = volumeMember(job, ctx);
  const out = { days, bucket, company, volume: vol };
  if (days == null) out.headline = 'No posting date listed.';
  else if (days === 0) out.headline = 'Posted today.';
  else out.headline = `Posted ${ageWords(days)} ago${bucket === 'over-30' ? ', still open' : ''}.`;
  const bits = [];
  if (company && !job.stealth) {
    bits.push(`${job.company} has ${int(company.total)} open role${company.total === 1 ? '' : 's'} here; ${int(company.last30d)} first posted in the last 30 days.`);
  }
  if (vol) bits.push(`${vol.name} is #${vol.rank} in Hiring in Volume (${int(vol.open_roles)} open roles). Long-open listings are normal for companies hiring at that scale.`);
  bits.push(`Board-wide, ${pct(ctx.board.fresh.over30Share)} of live roles were first posted more than 30 days ago.`);
  out.detail = bits.join(' ');
  out.links = [
    { label: 'Layoff tracker', href: LAYOFFS_URL },
    { label: 'New this week', href: NEW_THIS_WEEK_URL },
    ...(vol ? [{ label: 'Hiring in Volume', href: ctx.volume.url }] : []),
  ];
  return out;
}

export function buildCard(job, ctx, company, now, floor = DEFAULT_FLOOR) {
  if (!job || job.status === 'closed') return { closed: true, role: job ? pickRole(job) : null };
  const fn = boardFunctionOf(job);
  return {
    role: pickRole(job),
    fn,
    floor,
    pay: payAnswer(job, ctx, fn, floor),
    market: marketAnswer(job, ctx, fn),
    fresh: freshAnswer(job, ctx, company, now),
  };
}

function pickRole(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    url: job.url,
    location: job.location ?? null,
    companyUrl: job.company_url ?? null,
    published_at: job.published_at ?? null,
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PAY_TONE = { silent: 'vivid', 'non-annual': 'quiet', posted: 'ink' };

export function renderCard(card) {
  if (!card || card.closed) {
    return `<article class="card closed"><p class="eyebrow">Role closed</p><h2>${esc(card?.role?.title ?? 'This role')}</h2><p class="muted">The board lists this role as closed, so there is nothing to read.</p></article>`;
  }
  const { role, pay, market, fresh } = card;
  const where = [role.company, role.location].filter(Boolean).map(esc).join(' · ');
  const links = fresh.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('');
  const equity = market.equity
    ? `<p class="equity">${esc(market.equity.text)} <a href="${esc(market.equity.source)}" target="_blank" rel="noopener">Source ↗</a></p>` : '';
  return `<article class="card" data-pay="${esc(pay.status)}" data-fresh="${esc(fresh.bucket)}">
  <header class="card-head">
    <p class="eyebrow">${where}</p>
    <h2>${esc(role.title)}</h2>
    <a class="canon" href="${esc(role.url)}" target="_blank" rel="noopener">Open on speedrun ↗</a>
  </header>
  <section class="answer ${PAY_TONE[pay.status] ?? 'ink'}" data-q="pay">
    <p class="q">01 · Pay</p>
    <p class="a">${esc(pay.headline)}</p>
    <p class="d">${esc(pay.detail)}</p>
  </section>
  <section class="answer" data-q="market">
    <p class="q">02 · Market</p>
    <p class="a">${esc(market.headline)}</p>
    <p class="d">${esc(market.detail)}</p>
    ${equity}
  </section>
  <section class="answer" data-q="fresh">
    <p class="q">03 · Freshness</p>
    <p class="a">${esc(fresh.headline)}</p>
    <p class="d">${esc(fresh.detail)}</p>
    <p class="links">${links}</p>
  </section>
</article>`;
}
