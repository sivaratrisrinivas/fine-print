// Live lookup for one pasted role. Two upstream reads (the job, then its company's posting dates).
import { buildCard, companyFreshness } from './card.js';
import { parseJobRef } from './math.js';

export async function lookupCard(input, { api, snapshot, now = Date.now() }) {
  const ref = parseJobRef(input);
  if (!ref) return { status: 400, body: { error: 'Paste a speedrun-talent-network.com job link or job id.' } };
  let job;
  try {
    job = (await api.get(`/jobs/${ref}`)).job;
  } catch (e) {
    if (/upstream 404/.test(e.message)) return { status: 404, body: { error: 'No role with that id on the board.' } };
    throw e;
  }
  const company = job && !job.stealth && job.status !== 'closed' ? companyFreshness(await api.get('/jobs', { company: job.company })) : null;
  return { status: 200, body: { card: buildCard(job, snapshot, company, now), snapshotAt: snapshot.snapshotAt } };
}
