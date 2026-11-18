import type { DashboardData, Snapshot, Stream, Group, Point } from './types.ts';

interface Result<T = Record<string, unknown>> { results: T[]; meta: { changes?: number } }
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<Result<T>>;
  run(): Promise<Result>;
}
export interface Database { prepare(sql: string): Statement; batch(stmts: Statement[]): Promise<Result[]> }
export interface Env {
  DB: Database; TWITCH_CLIENT_ID?: string; TWITCH_CLIENT_SECRET?: string;
  TWITCH_GAME_ID?: string; ADMIN_TOKEN?: string; CRON_TOKEN?: string;
  POLL_INTERVAL_SECONDS?: string; COLLECTION_BUDGET_SECONDS?: string;
  MAX_STREAM_PAGES?: string; HISTORY_RETENTION_DAYS?: string;
}
interface Context { waitUntil(promise: Promise<unknown>): void }
interface CollectorState {
  next_attempt_at: number; lease_until: number; last_attempt_at: number | null;
  last_error: string | null; last_status: DashboardData['status'];
}
interface SnapshotRow {
  id: number; captured_at: number; started_at: number; game_id: string;
  viewers: number; channels: number; complete: number; reason: string | null; payload: string;
}
interface HelixStream {
  id: string; user_id: string; user_login: string; user_name: string; title: string;
  viewer_count: number; language: string; thumbnail_url: string; started_at: string;
}
interface HelixPage<T> { data: T[]; pagination?: { cursor?: string } }
interface Token { value: string; expires: number; validated: number; client: string }
let token: Token | null = null;
let tokenPromise: Promise<string> | null = null;
let rateUntil = 0;
const number = (v: string | undefined, fallback: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(Number(v)) && v?.trim() ? Number(v) : fallback));
export const interval = (env: Env) => number(env.POLL_INTERVAL_SECONDS, 60, 30, 3600) * 1000;
const budget = (env: Env) => number(env.COLLECTION_BUDGET_SECONDS, 40, 5, 50) * 1000;
const configured = (env: Env) => !!(env.TWITCH_CLIENT_ID?.trim() && env.TWITCH_CLIENT_SECRET?.trim());
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
class ApiError extends Error {
  constructor(message: string, public retryAt = 0) { super(message); }
}
function timeout(deadline: number): AbortSignal {
  const left = deadline - Date.now();
  if (left <= 0) throw new ApiError('Zeitbudget der Erfassung erreicht.');
  return AbortSignal.timeout(Math.min(8000, left));
}
async function pause(ms: number, deadline: number) {
  if (Date.now() + ms >= deadline) throw new ApiError('Twitch-Limit: Erfassung wird später fortgesetzt.', Date.now() + ms);
  await new Promise(resolve => setTimeout(resolve, ms));
}
async function appToken(env: Env, deadline: number): Promise<string> {
  if (token && token.client === env.TWITCH_CLIENT_ID && token.expires > Date.now() + 60000) {
    if (Date.now() - token.validated < 3600000) return token.value;
    const validation = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token.value}` }, signal: timeout(deadline),
    });
    if (validation.ok) { token.validated = Date.now(); return token.value; }
    if (validation.status !== 401) throw new ApiError('Twitch-Tokenprüfung momentan nicht verfügbar.');
    token = null;
  }
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST', signal: timeout(deadline),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID!, client_secret: env.TWITCH_CLIENT_SECRET!, grant_type: 'client_credentials' }),
    });
    if (!res.ok) throw new ApiError('Twitch-Authentifizierung fehlgeschlagen. Server-Konfiguration prüfen.');
    const body = await res.json() as { access_token: string; expires_in: number };
    if (!body.access_token || !Number.isFinite(body.expires_in)) throw new ApiError('Ungültige Twitch-Tokenantwort.');
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000, validated: Date.now(), client: env.TWITCH_CLIENT_ID! };
    return token.value;
  })();
  try { return await tokenPromise; } finally { tokenPromise = null; }
}
async function helix<T>(env: Env, endpoint: string, params: URLSearchParams, deadline: number): Promise<HelixPage<T>> {
  let renewed = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (rateUntil > Date.now()) await pause(rateUntil - Date.now(), deadline);
      const access = await appToken(env, deadline);
      const response = await fetch(`https://api.twitch.tv/helix/${endpoint}?${params}`, {
        headers: { 'Client-Id': env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${access}` }, signal: timeout(deadline),
      });
      if (response.status === 401 && !renewed) { token = null; renewed = true; continue; }
      if (response.status === 429) {
        const reset = Number(response.headers.get('Ratelimit-Reset')) * 1000;
        const retry = Number(response.headers.get('Retry-After')) * 1000;
        const retryAt = Math.max(Date.now() + 1000, reset || Date.now() + (retry || 60000));
        rateUntil = retryAt + 500;
        if (retryAt + 500 >= deadline || attempt === 3) throw new ApiError('Twitch-Rate-Limit erreicht.', retryAt + 500);
        await pause(retryAt - Date.now() + 500, deadline); continue;
      }
      if (response.status >= 500 && attempt < 3) { await pause(750 * 2 ** attempt, deadline); continue; }
      if (!response.ok) throw new ApiError(`Twitch-Abfrage fehlgeschlagen (HTTP ${response.status}).`);
      const body = await response.json() as HelixPage<T>;
      if (!Array.isArray(body.data)) throw new ApiError('Ungültige Antwort der Twitch-API.');
      // Respect a depleted bucket before the next page, even when this response succeeded.
      if (response.headers.get('Ratelimit-Remaining') === '0' && body.pagination?.cursor) {
        const reset = Number(response.headers.get('Ratelimit-Reset')) * 1000;
        if (reset > Date.now()) rateUntil = reset + 500;
      }
      return body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (attempt === 3 || Date.now() + 1500 >= deadline) throw new ApiError('Twitch ist momentan nicht erreichbar.');
      await pause(500 * 2 ** attempt, deadline);
    }
  }
  throw new ApiError('Twitch konnte nicht abgefragt werden.');
}
async function gameId(env: Env, deadline: number): Promise<string | null> {
  const games = await helix<{ id: string; name: string }>(env, 'games', new URLSearchParams({ name: 'Grand Theft Auto VI' }), deadline);
  const exact = games.data.find(g => g.name.toLowerCase() === 'grand theft auto vi');
  if (exact) return exact.id;
  if (env.TWITCH_GAME_ID && /^\d+$/.test(env.TWITCH_GAME_ID)) {
    const fallback = await helix<{ id: string; name: string }>(env, 'games', new URLSearchParams({ id: env.TWITCH_GAME_ID }), deadline);
    if (fallback.data.length) return fallback.data[0].id;
  }
  return null;
}
function unpack(row: SnapshotRow): Snapshot {
  return { id: row.id, capturedAt: row.captured_at, startedAt: row.started_at, gameId: row.game_id,
    viewers: row.viewers, channels: row.channels, complete: !!row.complete, reason: row.reason, streams: JSON.parse(row.payload) };
}
export async function latest(env: Env): Promise<Snapshot[]> {
  const rows = await env.DB.prepare('SELECT * FROM snapshots ORDER BY id DESC LIMIT 2').all<SnapshotRow>();
  return Promise.all(rows.results.map(async row => {
    const snap = unpack(row);
    const chunks = await env.DB.prepare('SELECT payload FROM snapshot_chunks WHERE snapshot_id=? ORDER BY chunk_index').bind(row.id).all<{payload:string}>();
    if(chunks.results.length) snap.streams = chunks.results.flatMap(c => JSON.parse(c.payload) as Stream[]);
    return snap;
  }));
}
export async function collect(env: Env): Promise<void> {
  if (!configured(env)) return;
  await env.DB.prepare('INSERT OR IGNORE INTO collector_state(id) VALUES (1)').run();
  const now = Date.now(), owner = crypto.randomUUID(), deadline = now + budget(env);
  const acquired = await env.DB.prepare(`UPDATE collector_state SET lease_owner = ?, lease_until = ?, last_attempt_at = ?, next_attempt_at = ?
    WHERE id = 1 AND lease_until < ? AND next_attempt_at <= ?`).bind(owner, deadline + 10000, now, now + interval(env), now, now).run();
  if (!acquired.meta.changes) return;
  let retryAt = now + interval(env);
  try {
    const game = await gameId(env, deadline);
    if (!game) {
      await env.DB.prepare("UPDATE collector_state SET last_status = 'no-category', last_error = ? WHERE id = 1 AND lease_owner = ?")
        .bind('Die GTA-VI-Kategorie wurde auf Twitch noch nicht gefunden. Optional TWITCH_GAME_ID konfigurieren.', owner).run();
      return;
    }
    const unique = new Map<string, HelixStream>();
    const cursors = new Set<string>();
    let cursor: string | undefined, complete = true, reason: string | null = null, capturedAt = now;
    const maxPages = number(env.MAX_STREAM_PAGES, 400, 1, 1000);
    for (let page = 0; ; page++) {
      if (page >= maxPages || Date.now() + 1500 >= deadline) {
        complete = false; reason = 'Seiten- oder Zeitlimit erreicht. Angezeigt wird die Summe der erfassten Streams.'; break;
      }
      try {
        const params = new URLSearchParams({ game_id: game, first: '100', type: 'live' });
        if (cursor) params.set('after', cursor);
        const response = await helix<HelixStream>(env, 'streams', params, deadline);
        capturedAt = Date.now();
        for (const stream of response.data) {
          if (!stream.id || !stream.user_id || !Number.isSafeInteger(stream.viewer_count) || stream.viewer_count < 0) continue;
          unique.set(stream.id, stream);
        }
        cursor = response.pagination?.cursor;
        if (!cursor) break;
        if (cursors.has(cursor)) { complete = false; reason = 'Twitch hat einen wiederholten Cursor geliefert. Teilerfassung.'; break; }
        cursors.add(cursor);
      } catch (error) {
        if (page === 0) throw error;
        complete = false; reason = error instanceof ApiError ? error.message : 'Die Erfassung wurde unterbrochen.';
        if (error instanceof ApiError) retryAt = Math.max(retryAt, error.retryAt);
        break;
      }
    }
    const profiles = await env.DB.prepare('SELECT user_id, image_url, fetched_at FROM profiles').all<{ user_id: string; image_url: string; fetched_at: number }>();
    const avatars = new Map(profiles.results.map(p => [p.user_id, p]));
    const missing = [...new Set([...unique.values()].map(s => s.user_id))].filter(id => !avatars.has(id) || avatars.get(id)!.fetched_at < now - 86400000);
    for (let i = 0; i < missing.length && Date.now() + 2500 < deadline; i += 100) {
      try {
        const params = new URLSearchParams(); missing.slice(i, i + 100).forEach(id => params.append('id', id));
        const users = await helix<{ id: string; profile_image_url: string }>(env, 'users', params, deadline);
        const statements = users.data.map(u => {
          const image = /^https:\/\/[^\s]+$/.test(u.profile_image_url) ? u.profile_image_url : '';
          avatars.set(u.id, { user_id: u.id, image_url: image, fetched_at: now });
          return env.DB.prepare('INSERT INTO profiles(user_id,image_url,fetched_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET image_url=excluded.image_url,fetched_at=excluded.fetched_at').bind(u.id, image, now);
        });
        if (statements.length) await env.DB.batch(statements);
      } catch { break; } // Optional images must never discard viewer measurements.
    }
    const prior = (await latest(env))[0];
    const comparable = !!prior && prior.gameId === game && prior.complete && complete;
    const previous = new Map(prior?.streams.map(s => [s.id, s.viewers]));
    const streams: Stream[] = [...unique.values()].map(s => ({
      id: s.id, userId: s.user_id, login: s.user_login, name: s.user_name,
      title: s.title, viewers: s.viewer_count, language: s.language || 'other', country: 'ZZ',
      avatar: avatars.get(s.user_id)?.image_url || '', thumbnail: s.thumbnail_url.replace('{width}', '440').replace('{height}', '248'),
      startedAt: s.started_at, delta: comparable && previous.has(s.id) ? s.viewer_count - previous.get(s.id)! : null,
    })).sort((a, b) => b.viewers - a.viewers || a.id.localeCompare(b.id));
    const total = streams.reduce((sum, s) => sum + s.viewers, 0);
    const chunks: Statement[] = [];
    for(let i=0;i<streams.length;i+=256) chunks.push(env.DB.prepare('INSERT INTO snapshot_chunks(snapshot_id,chunk_index,payload) VALUES ((SELECT id FROM snapshots WHERE started_at=? ORDER BY id DESC LIMIT 1),?,?)').bind(now, i/256, JSON.stringify(streams.slice(i,i+256))));
    await env.DB.batch([
      env.DB.prepare('INSERT INTO snapshots(captured_at,started_at,game_id,viewers,channels,complete,reason,payload) VALUES (?,?,?,?,?,?,?,?)')
        .bind(capturedAt, now, game, total, streams.length, Number(complete), reason, '[]'),
      ...chunks,
      env.DB.prepare('UPDATE collector_state SET last_status = ?, last_error = ? WHERE id = 1 AND lease_owner = ?').bind(complete ? 'live' : 'partial', reason, owner),
      env.DB.prepare('DELETE FROM snapshots WHERE captured_at < ?').bind(now - number(env.HISTORY_RETENTION_DAYS, 30, 1, 365) * 86400000),
      env.DB.prepare('DELETE FROM profiles WHERE fetched_at < ?').bind(now - 30 * 86400000),
      env.DB.prepare('DELETE FROM admin_attempts WHERE expires_at < ?').bind(now),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Die Datenabfrage ist fehlgeschlagen. Letzte Messung bleibt erhalten.';
    if (error instanceof ApiError) retryAt = Math.max(retryAt, error.retryAt);
    await env.DB.prepare("UPDATE collector_state SET last_status = 'error', last_error = ? WHERE id = 1 AND lease_owner = ?").bind(message, owner).run();
  } finally {
    await env.DB.prepare('UPDATE collector_state SET lease_until = 0, lease_owner = NULL, next_attempt_at = ? WHERE id = 1 AND lease_owner = ?').bind(retryAt, owner).run();
  }
}
export function groupStreams(streams: Stream[], key: 'country' | 'language', previous?: Stream[], comparable = false): Group[] {
  const old = new Map<string, number>();
  for (const s of previous || []) old.set(s[key], (old.get(s[key]) || 0) + s.viewers);
  const groups = new Map<string, Group>();
  for (const s of streams) {
    const code = s[key] || (key === 'country' ? 'ZZ' : 'other');
    const group = groups.get(code) || { code, viewers: 0, channels: 0, delta: null };
    group.viewers += s.viewers; group.channels++; groups.set(code, group);
  }
  return [...groups.values()].map(g => ({ ...g, delta: comparable ? g.viewers - (old.get(g.code) || 0) : null }))
    .sort((a, b) => b.viewers - a.viewers || a.code.localeCompare(b.code));
}
export async function dashboard(env: Env, range = '24h'): Promise<DashboardData> {
  const state = await env.DB.prepare('SELECT * FROM collector_state WHERE id = 1').first<CollectorState>();
  const [snapshot, previous] = await latest(env);
  const mappings = await env.DB.prepare('SELECT user_id, country_code FROM country_mappings').all<{user_id: string; country_code: string}>();
  const countries = new Map(mappings.results.map(m => [m.user_id, m.country_code]));
  for (const snap of [snapshot, previous]) if (snap) snap.streams = snap.streams.map(s => ({ ...s, country: countries.get(s.userId) || 'ZZ' }));
  const hours = range === '1h' ? 1 : range === '7d' ? 168 : 24;
  // Return at most 240 genuine sample points; never manufacture chart values.
  const history = snapshot ? await env.DB.prepare(`SELECT captured_at AS at,viewers,channels,complete FROM snapshots
    WHERE captured_at >= ? AND game_id = ? AND id IN (
      SELECT MAX(id) FROM snapshots WHERE captured_at >= ? AND game_id = ? GROUP BY CAST(captured_at / ? AS INTEGER)
    ) ORDER BY captured_at`).bind(Date.now() - hours * 3600000, snapshot.gameId, Date.now() - hours * 3600000, snapshot.gameId, Math.max(60000, hours * 3600000 / 240)).all<Point>() : { results: [] };
  let status: DashboardData['status'] = !configured(env) ? 'unconfigured' : state?.last_status || 'pending';
  if (snapshot && configured(env) && (status === 'error' || Date.now() - snapshot.capturedAt > interval(env) * 2.5)) status = 'stale';
  const comparable = !!snapshot?.complete && !!previous?.complete && snapshot.gameId === previous.gameId;
  return {
    status, message: status === 'unconfigured' ? 'Twitch-Verbindung einrichten, um echte Live-Messungen zu empfangen.' : state?.last_error || null,
    intervalMs: interval(env), nextAttemptAt: state?.next_attempt_at || 0, lastAttemptAt: state?.last_attempt_at || null,
    snapshot: snapshot || null, previous: previous || null,
    countries: groupStreams(snapshot?.streams || [], 'country', previous?.streams, comparable),
    languages: groupStreams(snapshot?.streams || [], 'language', previous?.streams, comparable),
    mappedViewers: snapshot?.streams.filter(s => s.country !== 'ZZ').reduce((a, s) => a + s.viewers, 0) || 0,
    mappedChannels: snapshot?.streams.filter(s => s.country !== 'ZZ').length || 0,
    history: history.results.map(p => ({ ...p, complete: !!p.complete })),
  };
}
// Validate against the ISO 3166-1 set rather than accepting arbitrary two-letter text.
const ISO = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
async function authorized(req: Request, env: Env, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const supplied = req.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  // Digest comparison fixes length and avoids an early-return string comparison.
  const [a, b] = await Promise.all([supplied, secret].map(t => crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))));
  let diff = 0; const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  if (!diff) return true;
  const bucket = req.headers.get('CF-Connecting-IP') || 'local';
  await env.DB.prepare(`INSERT INTO admin_attempts(bucket,attempts,expires_at) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET attempts = CASE WHEN expires_at < ? THEN 1 ELSE attempts + 1 END,
    expires_at = CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END`).bind(bucket, Date.now() + 900000, Date.now(), Date.now()).run();
  return false;
}
export async function api(req: Request, env: Env, ctx: Context): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/api/dashboard' && req.method === 'GET') {
    ctx.waitUntil(collect(env));
    return json(await dashboard(env, url.searchParams.get('range') || '24h'));
  }
  if (url.pathname === '/api/health' && req.method === 'GET') {
    await env.DB.prepare('SELECT id FROM collector_state WHERE id=1').first();
    return json({ ok: true, configured: configured(env) });
  }
  if (url.pathname === '/api/collect' && req.method === 'POST') {
    if (!await authorized(req, env, env.CRON_TOKEN)) return json({ error: 'Nicht autorisiert.' }, 401);
    await collect(env); return json({ ok: true });
  }
  if (url.pathname.startsWith('/api/admin/')) {
    const bucket = req.headers.get('CF-Connecting-IP') || 'local';
    const attempts = await env.DB.prepare('SELECT attempts,expires_at FROM admin_attempts WHERE bucket=?').bind(bucket).first<{attempts: number; expires_at: number}>();
    if (attempts && attempts.expires_at > Date.now() && attempts.attempts >= 20) return json({ error: 'Zu viele Anmeldeversuche. In 15 Minuten erneut versuchen.' }, 429);
    if (!await authorized(req, env, env.ADMIN_TOKEN)) return json({ error: 'Admin-Token ungültig oder serverseitig nicht eingerichtet (mindestens 32 Zeichen).' }, 401);
    if (url.pathname !== '/api/admin/mappings') return json({ error: 'Nicht gefunden.' }, 404);
    if (req.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM country_mappings ORDER BY updated_at DESC').all();
      return json({ mappings: rows.results });
    }
    if (req.method !== 'PUT' && req.method !== 'DELETE') return json({ error: 'Methode nicht erlaubt.' }, 405);
    if (req.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'Cross-Site-Anfrage abgewiesen.' }, 403);
    if (Number(req.headers.get('Content-Length')) > 200000) return json({ error: 'Datei zu groß.' }, 413);
    const text = await req.text();
    if (text.length > 200000) return json({ error: 'Maximal 200 KB pro Import.' }, 413);
    let body: { mappings?: { userId: string; countryCode: string; note?: string }[]; userId?: string };
    try { body = JSON.parse(text); if (!body || typeof body !== 'object') throw new Error(); } catch { return json({ error: 'Ungültiges JSON.' }, 400); }
    if (req.method === 'DELETE') {
      if (!body.userId || !/^\d{1,30}$/.test(body.userId)) return json({ error: 'Ungültige Twitch-User-ID.' }, 400);
      await env.DB.prepare('DELETE FROM country_mappings WHERE user_id=?').bind(body.userId).run(); return json({ ok: true });
    }
    if (!Array.isArray(body.mappings) || !body.mappings.length || body.mappings.length > 500) return json({ error: '1 bis 500 Zuordnungen pro Import erforderlich.' }, 400);
    for (const m of body.mappings) {
      if (!m || typeof m !== 'object' || typeof m.userId !== 'string' || !/^\d{1,30}$/.test(m.userId) || !ISO.has(m.countryCode) || (m.note != null && (typeof m.note !== 'string' || m.note.length > 500)))
        return json({ error: 'Jeder Eintrag benötigt userId (Ziffern), countryCode (ISO 3166-1 alpha-2) und optional note (max. 500 Zeichen).' }, 400);
    }
    await env.DB.batch(body.mappings.map(m => env.DB.prepare(`INSERT INTO country_mappings(user_id,country_code,note,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET country_code=excluded.country_code,note=excluded.note,updated_at=excluded.updated_at`).bind(m.userId, m.countryCode, m.note || '', Date.now())));
    return json({ ok: true, count: body.mappings.length });
  }
  return json({ error: 'Nicht gefunden.' }, 404);
}
