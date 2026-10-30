// miles.6nyn5.com: serves the tracker, plus a small API that keeps each person's settings
// (registration, vehicle, saved places, rates) so they follow them to any browser.
// Every /api request must carry a valid Cloudflare Access login token; identity comes from that token.

const TEAM = 'https://old-bonus-9557.cloudflareaccess.com';
const AUD = '4d00e103674ed98bbdb17f646ef5b64c94960dcbe808d57724b4085dde1caccb';   // the "Mileage Tracker" Access app

// Everyone allowed through Access works on the same claimant's log, so there is one shared profile.
const PROFILE = 'jess';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (!await accessEmail(req)) return json({ error: 'Not signed in' }, 401);
    const profile = PROFILE;

    // Browser keys for the address and route services, held as Worker secrets (OS_KEY, ORS_KEY) so they're
    // never in the code. Only signed-in users get them.
    if (url.pathname === '/api/config' && req.method === 'GET') {
      return json({ osKey: env.OS_KEY || '', orsKey: env.ORS_KEY || '' });
    }

    // Trips: the client sends everything it has (including deletions); the server merges trip by trip,
    // keeping whichever copy changed last, and returns the merged log for the client to adopt.
    if (url.pathname === '/api/trips') {
      const key = `trips:${profile}`;
      const stored = JSON.parse(await env.DATA.get(key) || '[]');
      if (req.method === 'GET') return json({ trips: stored });
      if (req.method === 'PUT') {
        const incoming = cleanTrips((await req.json().catch(() => null))?.trips);
        if (!incoming) return json({ error: 'Trips not understood' }, 400);
        const merged = new Map(stored.map(t => [t.id, t]));
        for (const t of incoming) {
          const have = merged.get(t.id);
          if (!have || t.updated >= have.updated) merged.set(t.id, t);
        }
        const out = [...merged.values()];
        await env.DATA.put(key, JSON.stringify(out));
        return json({ trips: out });
      }
    }

    if (url.pathname === '/api/settings') {
      const key = `settings:${profile}`;
      if (req.method === 'GET') return json({ settings: JSON.parse(await env.DATA.get(key) || 'null') });
      if (req.method === 'PUT') {
        const clean = cleanSettings(await req.json().catch(() => null));
        if (!clean) return json({ error: 'Settings not understood' }, 400);
        await env.DATA.put(key, JSON.stringify(clean));
        return json({ settings: clean });
      }
    }
    return json({ error: 'Not found' }, 404);
  },
};

// Only the fields the tracker uses, with sane limits, so the store can't be filled with junk
function cleanSettings(s) {
  if (!s || typeof s !== 'object') return null;
  const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
  const num = (v, d) => Number.isFinite(+v) ? +v : d;
  const places = Array.isArray(s.places) ? s.places.slice(0, 50).map(p => ({
    name: str(p?.name, 60), addr: str(p?.addr, 200),
    ...(Array.isArray(p?.coord) && p.coord.length === 2 && p.coord.every(Number.isFinite) ? { coord: p.coord } : {}),
  })).filter(p => p.name && p.addr) : [];
  return {
    reg: str(s.reg, 20), vehicle: s.vehicle === 'moto' ? 'moto' : 'car', places,
    r1: num(s.r1, 45), r2: num(s.r2, 25), r3: num(s.r3, 24), thresh: num(s.thresh, 10000),
    updated: new Date().toISOString(),
  };
}

// Trips as the tracker stores them. A deleted trip stays as {id, deleted: true, updated} so the deletion syncs too.
function cleanTrips(list) {
  if (!Array.isArray(list) || list.length > 10000) return null;
  const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
  const out = [];
  for (const t of list) {
    if (!t || !Number.isFinite(t.id)) continue;
    const updated = Number.isFinite(t.updated) ? t.updated : 0;
    if (t.deleted) { out.push({ id: t.id, deleted: true, updated }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(+t.miles)) continue;
    out.push({
      id: t.id, updated, date: t.date, type: str(t.type, 40), from: str(t.from, 200),
      stops: Array.isArray(t.stops) ? t.stops.slice(0, 20).map(s => str(s, 200)) : [],
      rt: !!t.rt, miles: Math.max(0, Math.min(+t.miles, 2000)), passengers: Math.max(0, Math.min(+t.passengers || 0, 20)),
      reason: str(t.reason, 150), route: str(t.route, 300), vehicle: t.vehicle === 'moto' ? 'moto' : 'car',
      status: t.status === 'sent' ? 'sent' : 'pending',
    });
  }
  return out;
}

// Verify the Access token (RS256, signed by the team's keys, for this app, not expired) and return its email
let certs = null, certsAt = 0;
async function accessEmail(req) {
  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    const [h, p, sig] = token.split('.');
    const dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const header = JSON.parse(new TextDecoder().decode(dec(h)));
    const claims = JSON.parse(new TextDecoder().decode(dec(p)));
    if (Date.now() - certsAt > 3600e3) { certs = (await (await fetch(`${TEAM}/cdn-cgi/access/certs`)).json()).keys; certsAt = Date.now(); }
    const jwk = certs.find(k => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, dec(sig), new TextEncoder().encode(`${h}.${p}`));
    const aud = [].concat(claims.aud);
    if (!ok || !aud.includes(AUD) || claims.iss !== TEAM || claims.exp * 1000 < Date.now()) return null;
    return String(claims.email || '').toLowerCase() || null;
  } catch { return null; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
