// Polite client for the public speedrun talent network API.
// One request at a time, a pause between requests, retries with backoff, an honest User-Agent and ?source= attribution.

export const API = 'https://speedrun-talent-network.com/api/v1';
export const SOURCE = 'fine-print-gift';
export const USER_AGENT =
  'fine-print/0.1 (unofficial research prototype; https://github.com/sivaratrisrinivas; low-rate, cached)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeClient({ gapMs = 450, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  let last = 0;
  let count = 0;
  async function get(path, params = {}) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    url.searchParams.set('source', SOURCE);
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      count++;
      let res;
      try {
        res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
      } catch (e) {
        log(`network error on ${url.pathname}: ${e.message}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`upstream ${res.status} for ${url.pathname}${url.search}`);
      return res.json();
    }
    throw new Error(`upstream kept failing for ${url.pathname}${url.search}`);
  }
  return { get, requests: () => count };
}
