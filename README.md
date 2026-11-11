# Fine Print

Paste any role from the [speedrun talent network](https://speedrun-talent-network.com/jobs) board and get one card with three answers:

1. **Pay.** Is a band posted, or is the listing silent? And what would a pay floor hide?
2. **Market.** What do comparable roles that do post pay look like right now?
3. **Freshness.** How long has it been open, and what's the context around the company?

Above the card is the board-wide version of the first answer. Pick a function and a floor, and you'll see how many roles stay, how many vanish because they never posted pay, and how many vanish because the posted pay really is lower.

> Unofficial. Not affiliated with or endorsed by a16z, a16z speedrun, or the speedrun talent network. It reads their public, documented API and links every role back to its listing on speedrun-talent-network.com.

## Why

The board's pay filter matches roles whose posted annual band reaches your floor. Most roles post no band at all, so by default a floor quietly drops them too. The API documents this, and `comp_any=1` brings them back. A seeker using the normal search can't see it, though, and ends up thinking the market is smaller and lower paid than it is.

Example from the 11 Nov 2026 snapshot: a $150k floor on engineering kept about 1,278 of 4,795 roles. About 3,458 of the rest vanished because they never posted pay. Only 59 vanished because their posted band was lower. The app recomputes these numbers on every build and never shows hardcoded ones.

## How the numbers are computed

Everything comes from `https://speedrun-talent-network.com/api/v1`, in one snapshot taken at build time. The snapshot time shows at the top of the page.

- **Pay Trap.** For each function (and all functions) the app reads the role count with no floor. It then reads the count with `comp=<floor>` for $100k, $150k, $200k and $250k. The floored response reports `facets.compHidden`, which counts roles hidden only because they post no pay. Everything else that disappeared posted a band under the floor, or an hourly or monthly band, which the floor never matches. The snapshot also cross-checks the subtraction once against `comp_any=1` (engineering, $150k) and records whether the two agree.
- **Market.**
  - Engineering roles are compared with roles at the same level. The app pulls every posted annual USD band for engineering, grouped by the board's own classified level (`lvl`), and works out p25, median and p75 of the band midpoints.
  - Other functions use the board's published `/stats/hiring` bands. That endpoint uses a wider definition of "engineering", so its engineering median differs from the level-grouped one.
  - Founding roles use posted founding bands (`founding=1`).
  - Groups with fewer than 15 bands aren't used.
  - A role without a band gets context. It never gets a guessed salary.
  - Equity context for founding roles quotes the board's own founding salary page (0.5% to 3% market practice, 15% to 25% dilution per round). It shows one worked example: 1% after three 20% rounds.
- **Freshness.**
  - Age is the number of days since `published_at`.
  - The company line uses the board's posted-date facets for that company.
  - Companies in the board's Hiring in Volume collection are called out, because long-open seats are normal at that scale.
  - Board-wide, it shows the share of live roles first posted more than 30 days ago.
  - It links to the board's layoff tracker and New This Week collection instead of scraping them.

The wording is descriptive on purpose. A long-open listing is described as "posted N days ago, still open". The app makes no claim about whether a seat is real.

## Being a polite API client

- The board is read once per build: about 110 sequential requests, at least 450 ms apart, with backoff on 429 or 5xx.
- Every request sends a `User-Agent` that names the project, plus `?source=fine-print-gift` attribution.
- Pasted-role lookups make two reads: the job, and its company's posted-date facets. The CDN caches them for 30 minutes per role, and each instance caps upstream reads at 20 a minute.
- Listings aren't re-hosted. The app keeps aggregates and a handful of preset cards, and every role links to its canonical URL.
- The deployment is noindex, so nothing here competes with the board.

## Run it locally

```bash
npm run snapshot   # about 2 minutes of slow, live reads; writes public/data/snapshot.json
npm run dev        # http://localhost:4173
npm test           # node --test, no network
```

There are no dependencies, and Node 20 or newer works. Deep links: `?fn=engineering&floor=150000`, `?pick=0` (preset role), and `?role=<job url or id>`.

## Honest caveats

- `published_at` may reset when a company re-posts or its source board refreshes. Age is what the board reports, not a verified first-posted date.
- Function and level are the board's own classifiers, and they can be wrong. "Intern" means "roles the board labels intern".
- Market midpoints come only from roles that chose to post pay, about 20% of the board. Silent roles may pay differently.
- Non-USD and non-annual bands are left out of the market math.
- The comparison is by function and level, not by city or company stage.
- Numbers lag the live board by however long it has been since the last build.
- The equity example is a simple upper bound. It ignores strike price, preferences and taxes, as the board's own calculator notes.

## Stack

Plain HTML, CSS and ES modules, with one Vercel function (`api/role.js`) and a Node snapshot script. The number crunching and the card renderer are pure modules (`public/lib/`), shared by the browser, the function and the tests.
