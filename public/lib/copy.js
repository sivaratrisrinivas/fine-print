// Words that depend on the numbers. Kept pure and tested, so the copy can never contradict the data.
import { int, pct, usd } from './math.js';

export function verdictLine(split) {
  if (split.hidden === 0) return 'This floor hides nothing here.';
  if (split.mostlySilence) {
    return `This floor mostly hid silence, not low pay: ${pct(split.silentShareOfHidden)} of what vanished never posted a number.`;
  }
  return `Here the floor mostly hid lower posted pay: ${pct(1 - split.silentShareOfHidden)} of what vanished posted a band under the floor.`;
}

export function stampLine(snap) {
  const d = new Date(snap.snapshotAt);
  const ist = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `Live snapshot · ${ist} IST · ${int(snap.board.liveJobs)} roles`;
}

export function methodHtml(snap) {
  const e = snap.payTrap.engineering.floors[150000];
  const m = snap.market;
  return `
<p>Everything here is read from the board's public API (<code>${snap.api}</code>) in one snapshot of ${int(snap.requests)} slow, attributed requests, then recomputed. Nothing is typed in by hand.</p>
<p><b>Pay.</b> For each function and floor: the role count with no floor, then with <code>comp=&lt;floor&gt;</code>. The floored response reports <code>facets.compHidden</code>, the roles hidden only because they post no pay. Whatever else disappeared posted a band below the floor (or an hourly or monthly band, which the floor never matches). Cross-check: engineering at ${usd(150000)} with <code>comp_any=1</code> returned ${int(snap.crossCheck.compAnyTotal)}, implying ${int(snap.crossCheck.impliedPostedBelow)} posted-below roles; the subtraction gave ${int(e.postedBelow)}${snap.crossCheck.ok ? '. They match.' : '. They do not match; treat these numbers with care.'}</p>
<p><b>Market.</b> Engineering comparisons use every posted annual USD band on the board, grouped by the board's own level labels (${int(m.engineering.n)} bands; median midpoint ${usd(m.engineering.median)}). Other functions use the board's published stats (<code>/stats/hiring</code>; engineering there is ${usd(m.statsFunctions.engineering?.median)} from ${int(m.statsFunctions.engineering?.n)} bands, a wider definition of engineering). Founding roles use ${int(m.founding.n)} posted founding bands (median ${usd(m.founding.median)}). A role with no band gets context, never a guessed number. Groups under 15 bands are not used.</p>
<p><b>Freshness.</b> Age is days since <code>published_at</code>. Company counts come from the board's posted-date facets. Long-open is described, not judged: companies hiring in volume keep many seats open for a long time, and some boards refresh dates.</p>`;
}
