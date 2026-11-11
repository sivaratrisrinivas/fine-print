import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCard, renderCard, boardFunctionOf, isFounding, ageWords } from '../public/lib/card.js';
import { verdictLine, methodHtml } from '../public/lib/copy.js';
import { ctx, job, NOW } from './fixture.mjs';

const company = { total: 1, last24h: 0, last7d: 0, last30d: 1, over30: 0, over30Share: 0 };

test('silent role: pay answer names the floor split from the snapshot', () => {
  const c = buildCard(job(), ctx, company, NOW);
  assert.equal(c.pay.status, 'silent');
  assert.equal(c.pay.headline, 'Pay not posted.');
  // engineering $150k: base 400, kept 107, silent 288, posted below 5
  assert.match(c.pay.detail, /one of 288 engineering roles/);
  assert.match(c.pay.detail, /Just 5 vanish/);
});

test('silent role: market gives context at the right level, never a guessed number for the role', () => {
  const c = buildCard(job(), ctx, company, NOW);
  assert.equal(c.market.midpoint, null);
  assert.equal(c.market.position, null);
  assert.match(c.market.comparable.label, /mid-level engineering/);
  assert.match(c.market.headline, /\$201k median/);
  assert.match(c.market.detail, /not a guess/);
});

test('posted role: midpoint is placed in the band', () => {
  const c = buildCard(job({ comp_min: 185000, comp_max: 225000 }), ctx, company, NOW);
  assert.equal(c.pay.status, 'posted');
  assert.equal(c.pay.headline, 'Posted: $185k to $225k.');
  assert.equal(c.market.midpoint, 205000);
  assert.equal(c.market.position, 'median-p75');
});

test('hourly band is flagged as never matching the floor and kept out of market math', () => {
  const c = buildCard(job({ comp_min: 40, comp_max: 55, comp_period: 'hour', comp_summary: '$40 to $55 per hour' }), ctx, company, NOW);
  assert.equal(c.pay.status, 'non-annual');
  assert.match(c.pay.detail, /any floor hides this role/);
  assert.equal(c.market.midpoint, null);
});

test('small groups fall back to wider comparables', () => {
  const vp = buildCard(job({ labels: { function: 'engineering', seniority: 'VP' } }), ctx, company, NOW);
  assert.match(vp.market.comparable.label, /board's own stats/);
  const legal = buildCard(job({ function: 'legal', labels: { function: 'legal' } }), ctx, company, NOW);
  assert.equal(legal.market.comparable, null);
  assert.match(legal.market.headline, /Not enough posted bands/);
});

test('founding role gets founding comparables and sourced equity context', () => {
  const c = buildCard(job({ title: 'Founding Engineer', comp_min: 180000, comp_max: 260000 }), ctx, company, NOW);
  assert.equal(isFounding(job({ title: 'Founding Engineer' })), true);
  assert.equal(c.market.comparable.founding, true);
  assert.match(c.market.equity.text, /0\.5% to 3%/);
  assert.match(c.market.equity.text, /about 0\.51%/);
  assert.equal(buildCard(job(), ctx, company, NOW).market.equity, null);
});

test('freshness wording stays neutral', () => {
  const old = buildCard(job({ published_at: '2026-09-25T00:00:00Z', company: 'Anduril', company_slug: 'anduril-industries' }), ctx, { ...company, total: 2575, last30d: 300 }, NOW);
  assert.equal(old.fresh.headline, 'Posted 47 days ago, still open.');
  assert.equal(old.fresh.bucket, 'over-30');
  assert.match(old.fresh.detail, /#1 in Hiring in Volume/);
  assert.match(old.fresh.detail, /65% of live roles/);
  const html = renderCard(old).toLowerCase();
  for (const bad of ['gh' + 'ost', 'fake', 'scam', 'dead listing']) assert.ok(!html.includes(bad), `card must not say "${bad}"`);
  assert.equal(buildCard(job({ published_at: '2026-11-10T20:00:00Z' }), ctx, company, NOW).fresh.headline, 'Posted today.');
  assert.equal(ageWords(1565), '1,565 days (about 4.3 years)');
});

test('board function falls back sensibly', () => {
  assert.equal(boardFunctionOf({ labels: { function: 'data' } }), 'data');
  assert.equal(boardFunctionOf({ function: 'sales' }), 'sales');
  assert.equal(boardFunctionOf({ function: 'other' }), 'all');
});

test('renderCard: three answers, canonical link, escaped text', () => {
  const html = renderCard(buildCard(job({ title: 'Eng <script>alert(1)</script>' }), ctx, company, NOW));
  assert.equal((html.match(/class="answer/g) || []).length, 3);
  assert.match(html, /data-q="pay"[\s\S]*data-q="market"[\s\S]*data-q="fresh"/);
  assert.match(html, /href="https:\/\/speedrun-talent-network\.com\/jobs\/product-engineer-speedrun-5c268fc2"/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /answer vivid/, 'silent pay is the one vivid answer');
  assert.match(html, /speedrun-talent-network\.com\/layoffs/);
});

test('closed role renders a quiet notice', () => {
  const html = renderCard(buildCard(job({ status: 'closed' }), ctx, company, NOW));
  assert.match(html, /Role closed/);
});

test('verdict copy follows the numbers', () => {
  assert.match(verdictLine(ctx.payTrap.engineering.floors[150000]), /mostly hid silence/);
  assert.match(verdictLine({ hidden: 10, mostlySilence: false, silentShareOfHidden: 0.2 }), /mostly hid lower posted pay: 80%/);
  assert.match(verdictLine({ hidden: 0 }), /hides nothing/);
});

test('no em dashes in user-facing copy', () => {
  const card = renderCard(buildCard(job({ title: 'Founding Engineer' }), ctx, company, NOW));
  const method = methodHtml({ api: 'x', requests: 1, payTrap: ctx.payTrap, crossCheck: { compAnyTotal: 1, impliedPostedBelow: 5, ok: true }, market: ctx.market });
  for (const s of [card, method, verdictLine(ctx.payTrap.all.floors[150000])]) assert.ok(!s.includes('\u2014'));
});
