import { int, pct, usd } from './lib/math.js';
import { renderCard } from './lib/card.js';
import { verdictLine, methodHtml, stampLine } from './lib/copy.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const snap = await fetch('/data/snapshot.json').then((r) => r.json());

$('stamp').textContent = stampLine(snap);
$('method').innerHTML = methodHtml(snap);

const fnSel = $('fn');
const fns = Object.keys(snap.payTrap);
fnSel.innerHTML = fns.map((f) => `<option value="${f}">${f === 'all' ? 'all functions' : f}</option>`).join('');
const floors = Object.keys(snap.payTrap.all.floors).map(Number);
let state = {
  fn: fns.includes(params.get('fn')) ? params.get('fn') : 'engineering',
  floor: floors.includes(Number(params.get('floor'))) ? Number(params.get('floor')) : 150000,
};
fnSel.value = state.fn;
$('floors').innerHTML = floors.map((f) => `<button type="button" role="radio" data-floor="${f}">${usd(f)}</button>`).join('');

function count(el, to) {
  const from = Number(el.dataset.v ?? 0);
  el.dataset.v = to;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = int(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 700);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = int(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function paintHero() {
  const slice = snap.payTrap[state.fn];
  const s = slice.floors[state.floor];
  $('floor-label').textContent = usd(state.floor);
  $('fn-label').textContent = state.fn === 'all' ? 'all' : state.fn;
  for (const b of $('floors').children) b.setAttribute('aria-checked', String(Number(b.dataset.floor) === state.floor));
  const w = (x) => (s.base ? (x / s.base) * 100 : 0) + '%';
  $('seg-kept').style.flexBasis = w(s.kept);
  $('seg-silent').style.flexBasis = w(s.silentHidden);
  $('seg-below').style.flexBasis = w(s.postedBelow);
  $('bar').setAttribute('aria-label', `${int(s.kept)} stay, ${int(s.silentHidden)} hidden for posting no pay, ${int(s.postedBelow)} hidden for lower posted pay, out of ${int(s.base)}`);
  count($('n-kept'), s.kept);
  count($('n-silent'), s.silentHidden);
  count($('n-below'), s.postedBelow);
  $('verdict').textContent = verdictLine(s);
  const e = snap.early;
  $('aside').textContent =
    `Out of ${int(s.base)} ${state.fn === 'all' ? '' : state.fn + ' '}roles, ${pct(slice.postedShare)} post a pay band at all. ` +
    `Of the ${int(e.intern.total)} roles the board labels intern, ${int(e.intern.posted)} post one.`;
  const q = new URLSearchParams(location.search);
  q.set('fn', state.fn); q.set('floor', state.floor);
  history.replaceState(null, '', '?' + q.toString());
}

fnSel.addEventListener('change', () => { state.fn = fnSel.value; paintHero(); });
$('floors').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-floor]');
  if (b) { state.floor = Number(b.dataset.floor); paintHero(); }
});
paintHero();

// Role card
const slot = $('card-slot');
$('presets').innerHTML = snap.presets
  .map((p, i) => `<button type="button" data-i="${i}" aria-pressed="false">${esc(p.card.role.title)}<small>${esc(p.why)}</small></button>`)
  .join('');

function showCard(card, pressed = -1) {
  slot.innerHTML = renderCard(card);
  [...$('presets').children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === pressed)));
}

$('presets').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-i]');
  if (!b) return;
  const i = Number(b.dataset.i);
  showCard(snap.presets[i].card, i);
  const q = new URLSearchParams(location.search); q.set('pick', i); q.delete('role');
  history.replaceState(null, '', '?' + q.toString());
});

async function lookup(ref) {
  slot.innerHTML = '<p class="muted">Reading the listing…</p>';
  try {
    const r = await fetch('/api/role?ref=' + encodeURIComponent(ref));
    const body = await r.json();
    if (!r.ok) throw new Error(body.error || 'Something went wrong.');
    showCard(body.card);
    const q = new URLSearchParams(location.search); q.set('role', ref); q.delete('pick');
    history.replaceState(null, '', '?' + q.toString());
  } catch (e) {
    slot.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = $('ref').value.trim();
  if (v) lookup(v);
});

if (params.get('role')) { $('ref').value = params.get('role'); lookup(params.get('role')); }
else if (params.has('pick') && snap.presets[Number(params.get('pick'))]) showCard(snap.presets[Number(params.get('pick'))].card, Number(params.get('pick')));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
