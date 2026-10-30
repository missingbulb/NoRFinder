// What the previous host left behind, evaluated rather than listed.
//
// A repo moving onto Cloudflare inherits whatever was already answering for its
// hostnames — most often records the zone import copied from the old host. Two of
// them matter, and both are invisible in the repo:
//
//   - a CNAME on a claimed hostname: a custom domain cannot be attached over one
//     (https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
//     so the deploy fails on that route;
//   - GitHub Pages' apex addresses: the attach succeeds, and visitors keep reaching
//     the old host until the records go.
//
// So the release asks public DNS what each claimed hostname currently answers, and
// parks naming the record it found. The alternative — an adoption checklist saying
// "delete any inherited records, if there are any" — is a step that is a no-op for
// most adopters, which is how a checklist teaches its reader to skim it.
//
// The probe carries no credential: the Workers API token this task holds grants no
// DNS read, and public resolution answers the question that matters anyway — what a
// visitor's resolver returns. An unreachable resolver is INCONCLUSIVE, never a
// verdict: the release proceeds and says the probe did not run.

// GitHub Pages' four apex addresses, published in
// https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site
export const PAGES_ADDRESSES = new Set([
  '185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153',
]);

const DOH = 'https://dns.google/resolve';

// One hostname's current answers, or null when the resolver could not be reached.
export async function probeHostname(hostname, fetchImpl = fetch) {
  const ask = async (type) => {
    const res = await fetchImpl(`${DOH}?name=${encodeURIComponent(hostname)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) throw new Error(`${DOH} answered ${res.status}`);
    return (await res.json())?.Answer ?? [];
  };
  try {
    const answers = [...await ask('CNAME'), ...await ask('A')];
    return {
      cname: answers.filter((a) => a?.type === 5).map((a) => String(a.data).replace(/\.$/, '')),
      a: answers.filter((a) => a?.type === 1).map((a) => String(a.data)),
    };
  } catch { return null; }
}

// The verdict on one hostname's answers: null when nothing inherited stands in the
// way, otherwise the record found and what to do about it.
export function judgeHostname(hostname, answers) {
  if (!answers) return null;
  const [cname] = answers.cname;
  if (cname) {
    return {
      what: `${hostname} is a CNAME to ${cname}`,
      fix: `delete the ${hostname} CNAME record in the zone's DNS — a Cloudflare custom domain cannot be attached over an existing CNAME, so this route fails until it is gone`,
    };
  }
  const stale = answers.a.filter((ip) => PAGES_ADDRESSES.has(ip));
  if (stale.length) {
    return {
      what: `${hostname} still resolves to GitHub Pages (${stale.join(', ')})`,
      fix: `delete those A records in the zone's DNS — the deploy attaches the custom domain either way, but visitors keep reaching the old host while they stand`,
    };
  }
  return null;
}

// Every claimed hostname's verdict, plus the ones the probe could not reach.
export async function preflight(hostnames, { fetchImpl = fetch } = {}) {
  const blocked = [];
  const unprobed = [];
  for (const hostname of hostnames) {
    const answers = await probeHostname(hostname, fetchImpl);
    if (answers === null) { unprobed.push(hostname); continue; }
    const verdict = judgeHostname(hostname, answers);
    if (verdict) blocked.push(verdict);
  }
  return { blocked, unprobed };
}
