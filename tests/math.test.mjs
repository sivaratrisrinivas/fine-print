import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ageBucket, ageDays, annualUsdMidpoint, bandStats, dilutedGrant, floorSplit, levelKey, parseJobRef, positionInBand, postedMix, quantile, usd,
} from '../public/lib/math.js';

test('floorSplit separates silence from lower pay (the research example)', () => {
  const s = floorSplit({ base: 4794, kept: 1277, silentHidden: 3458 });
  assert.equal(s.postedBelow, 59);
  assert.equal(s.hidden, 3517);
  assert.equal(s.mostlySilence, true);
  assert.ok(Math.abs(s.silentShareOfHidden - 3458 / 3517) < 1e-12);
});

test('floorSplit flips when lower pay dominates', () => {
  const s = floorSplit({ base: 100, kept: 20, silentHidden: 10 });
  assert.equal(s.postedBelow, 70);
  assert.equal(s.mostlySilence, false);
});

test('floorSplit with nothing hidden', () => {
  const s = floorSplit({ base: 10, kept: 10, silentHidden: 0 });
  assert.equal(s.hidden, 0);
  assert.equal(s.silentShareOfHidden, 0);
});

test('floorSplit rejects counts that do not add up', () => {
  assert.throws(() => floorSplit({ base: 10, kept: 8, silentHidden: 5 }), /do not add up/);
  assert.throws(() => floorSplit({ base: -1, kept: 0, silentHidden: 0 }), /bad base/);
  assert.throws(() => floorSplit({ base: 1, kept: NaN, silentHidden: 0 }), /bad kept/);
});

test('annualUsdMidpoint only reads annual USD bands', () => {
  assert.equal(annualUsdMidpoint({ comp_min: 150000, comp_max: 250000 }), 200000);
  assert.equal(annualUsdMidpoint({ comp_min: 150000, comp_max: 250000, comp_period: 'year', comp_currency: 'USD' }), 200000);
  assert.equal(annualUsdMidpoint({ comp_min: null, comp_max: 180000 }), 180000);
  assert.equal(annualUsdMidpoint({ comp_min: 90000, comp_max: null }), 90000);
  assert.equal(annualUsdMidpoint({ comp_min: 40, comp_max: 60, comp_period: 'hour' }), null);
  assert.equal(annualUsdMidpoint({ comp_min: 100000, comp_max: 120000, comp_currency: 'EUR' }), null);
  assert.equal(annualUsdMidpoint({ comp_min: null, comp_max: null }), null);
  assert.equal(annualUsdMidpoint({ comp_min: 0, comp_max: 0 }), null);
});

test('quantile interpolates like numpy', () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([7], 0.25), 7);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(quantile([10, 20, 30, 40, 50], 0.75), 40);
});

test('bandStats sorts and ignores junk', () => {
  assert.deepEqual(bandStats([300, 100, 200, NaN]), { n: 3, p25: 150, median: 200, p75: 250 });
  assert.deepEqual(bandStats([]), { n: 0, p25: null, median: null, p75: null });
});

test('positionInBand edges', () => {
  const b = { p25: 100, median: 200, p75: 300 };
  assert.equal(positionInBand(99, b), 'below-p25');
  assert.equal(positionInBand(100, b), 'p25-median');
  assert.equal(positionInBand(200, b), 'median-p75');
  assert.equal(positionInBand(300, b), 'median-p75');
  assert.equal(positionInBand(301, b), 'above-p75');
  assert.equal(positionInBand(null, b), null);
});

test('age buckets follow the board presets', () => {
  const now = Date.parse('2026-11-11T00:00:00Z');
  assert.equal(ageDays('2026-11-10T12:00:00Z', now), 0);
  assert.equal(ageDays('2026-09-25T00:00:00Z', now), 47);
  assert.equal(ageDays(null, now), null);
  assert.equal(ageDays('2026-12-01T00:00:00Z', now), 0, 'future dates clamp to 0');
  assert.equal(ageBucket(0), 'this-week');
  assert.equal(ageBucket(7), 'this-week');
  assert.equal(ageBucket(8), 'this-month');
  assert.equal(ageBucket(30), 'this-month');
  assert.equal(ageBucket(31), 'over-30');
  assert.equal(ageBucket(null), 'unknown');
});

test('postedMix computes the 30+ day share and checks nesting', () => {
  const m = postedMix(23149, { '24h': 139, '7d': 2097, '30d': 8085 });
  assert.equal(m.over30, 15064);
  assert.equal(Math.round(m.over30Share * 100), 65);
  assert.throws(() => postedMix(10, { '24h': 5, '7d': 3, '30d': 9 }), /nested/);
});

test('dilution math', () => {
  assert.ok(Math.abs(dilutedGrant(1, 3, 0.2) - 0.512) < 1e-12);
  assert.equal(dilutedGrant(2, 0, 0.2), 2);
});

test('levelKey maps board labels', () => {
  assert.equal(levelKey('mid-level'), 'mid');
  assert.equal(levelKey('Staff/Principal'), 'staff_principal');
  assert.equal(levelKey('new grad'), 'new_grad');
  assert.equal(levelKey('Lead / Manager'), 'lead_manager');
  assert.equal(levelKey('Senior'), 'senior');
  assert.equal(levelKey('Intern'), 'intern');
  assert.equal(levelKey('VP'), 'vp');
  assert.equal(levelKey(null), null);
  assert.equal(levelKey('wizard'), null);
});

test('parseJobRef handles links, ids and junk', () => {
  assert.equal(parseJobRef('https://speedrun-talent-network.com/jobs/product-engineer-speedrun-5c268fc2'), '5c268fc2');
  assert.equal(parseJobRef('https://speedrun-talent-network.com/jobs/product-engineer-speedrun-5c268fc2/?utm_source=x'), '5c268fc2');
  assert.equal(parseJobRef('5C268FC2'), '5c268fc2');
  assert.equal(parseJobRef('5c268fc2-0299-37a9-64ae-969cdec37358'), '5c268fc2-0299-37a9-64ae-969cdec37358');
  assert.equal(parseJobRef('https://example.com/jobs/hello'), null);
  assert.equal(parseJobRef(''), null);
});

test('usd formatting', () => {
  assert.equal(usd(204000), '$204k');
  assert.equal(usd(150000), '$150k');
  assert.equal(usd(NaN), 'n/a');
});
