/*
 * 銀動方程式 — 後端 API（Netlify Functions v2）
 *
 *   GET    /api/health                 系統狀態
 *   POST   /api/admin/login            後台登入（Authorization: Bearer <ADMIN_PASSWORD>）
 *   GET    /api/records                列出全部紀錄（後台）
 *   GET    /api/records/:id            單筆紀錄（後台）
 *   POST   /api/records                新增一筆評估（長者端，回傳刪除憑證）
 *   POST   /api/records/bulk           批次匯入（後台）
 *   DELETE /api/records/:id            刪除（後台，或持有刪除憑證的本人）
 *   DELETE /api/records?demo=1|all=1   清除示範資料／全部資料（後台）
 *   POST   /api/lookup                 以長者編號＋年齡查詢過去紀錄（不回傳姓名）
 *   POST   /api/ai/narrative           以 Claude 撰寫個人化說明
 *
 * 環境變數：ADMIN_PASSWORD、ANTHROPIC_API_KEY、ANTHROPIC_MODEL（預設 claude-opus-5-5）
 * 資料儲存：Netlify Blobs（store：yindong），鍵值格式 rec/<長者編號>/<紀錄編號>。
 * 伺服器會用與前端相同的運動醫學引擎重新計算結果，不信任前端送來的計算值。
 */
import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import '../../public/assets/js/core/norms.js';
import '../../public/assets/js/core/screening.js';
import '../../public/assets/js/core/exercises.js';
import '../../public/assets/js/core/prescription.js';
import '../../public/assets/js/core/validate.js';
import '../../public/assets/js/core/narrative.js';
import '../../public/assets/js/core/assess.js';

const YD = globalThis.YD;
const STORE_NAME = 'yindong';
const MAX_BODY = 200 * 1024;
const DEFAULT_MODEL = 'claude-opus-5-5';

// 函式路徑優先於靜態檔：public/api/health 只在沒有部署函式（例如 Netlify Drop、GitHub Pages）時才會被讀到，
// 讓前端自動切換為本機模式。
export const config = { path: '/api/*', preferStatic: false };

/* ------------------------------------------------------------------ */
/* 工具                                                               */
/* ------------------------------------------------------------------ */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, '資料太大');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, '資料格式不正確');
  }
}

function sha256(s) {
  return createHash('sha256').update(String(s)).digest();
}

function adminConfigured() {
  return typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD.length >= 6;
}

function isAdmin(req) {
  if (!adminConfigured()) return false;
  const auth = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return false;
  return timingSafeEqual(sha256(m[1]), sha256(process.env.ADMIN_PASSWORD));
}

function requireAdmin(req) {
  if (!adminConfigured()) throw new HttpError(503, '尚未設定 ADMIN_PASSWORD');
  if (!isAdmin(req)) throw new HttpError(401, '密碼不正確');
}

function store() {
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

const ID_RE = /^[A-Za-z0-9-]{3,60}$/;
const CODE_RE = /^(YD|DM)-\d{1,6}$/; // DM- 為示範資料

// 列出全部鍵值後再依前綴篩選（資料量為社區規模，單次列表即可；也避免不同環境對 prefix 的差異）
async function listKeys(prefix = 'rec/') {
  const { blobs } = await store().list();
  return blobs.map((b) => b.key).filter((k) => k.startsWith(prefix));
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function allRecords() {
  const keys = await listKeys();
  const recs = await mapLimit(keys, 16, (k) => store().get(k, { type: 'json' }));
  return recs.filter(Boolean).map(publicRecord);
}

function publicRecord(r) {
  const { deleteTokenHash, ...rest } = r;
  return rest;
}

async function findKey(id) {
  const keys = await listKeys();
  return keys.find((k) => k.endsWith('/' + id)) || null;
}

/** 配發新的長者編號（使用條件寫入避免重複）。 */
async function allocateElderCode() {
  const s = store();
  const counter = (await s.get('meta/counter', { type: 'json' })) || { next: 1 };
  let n = Math.max(1, Number(counter.next) || 1);
  for (let tries = 0; tries < 200; tries++, n++) {
    const code = 'YD-' + String(n).padStart(4, '0');
    const res = await s.setJSON('elder/' + code, { createdAt: new Date().toISOString() }, { onlyIfNew: true });
    if (res.modified) {
      await s.setJSON('meta/counter', { next: n + 1 });
      return code;
    }
  }
  throw new HttpError(500, '無法配發長者編號');
}

async function elderExists(code) {
  if (!CODE_RE.test(code)) return false;
  const meta = await store().getMetadata('elder/' + code);
  if (meta) return true;
  const keys = await listKeys('rec/' + code + '/');
  return keys.length > 0;
}

/** 以引擎重新計算並組成要儲存的紀錄。 */
function buildRecord(raw, extra) {
  const ev = YD.assess.evaluate(raw);
  if (!ev.ok) throw new HttpError(400, ev.errors.join('、'));
  const ids = ev.rx.exercises.map((e) => e.id);
  let narrative = { source: 'local', data: YD.narrative.local(ev.summary) };
  const n = raw.narrative;
  if (n && n.source === 'ai' && n.data) {
    const clean = YD.narrative.sanitize(n.data, ids);
    if (clean) narrative = { source: 'ai', model: YD.validate.cleanText(n.model, 40) || null, data: clean };
  }
  return {
    id: extra.id,
    elderCode: extra.elderCode,
    createdAt: extra.createdAt,
    site: ev.input.site,
    demo: !!extra.demo,
    consent: ev.input.consent,
    profile: ev.input.profile,
    screening: ev.input.screening,
    sft: ev.input.sft,
    health: ev.input.health,
    result: YD.assess.snapshot(ev),
    narrative
  };
}

function validDate(s) {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/* ------------------------------------------------------------------ */
/* 簡易流量限制（每個執行個體各自計算，屬於基本防護）                 */
/* ------------------------------------------------------------------ */
const buckets = new Map();
function rateLimit(req, context, key, max, windowMs) {
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const k = key + ':' + ip;
  const now = Date.now();
  const b = buckets.get(k) || { n: 0, reset: now + windowMs };
  if (now > b.reset) {
    b.n = 0;
    b.reset = now + windowMs;
  }
  b.n++;
  buckets.set(k, b);
  if (b.n > max) throw new HttpError(429, '請求太頻繁，請稍後再試');
}

/* ------------------------------------------------------------------ */
/* AI                                                                 */
/* ------------------------------------------------------------------ */
let client = null;
function anthropic() {
  if (!client) client = new Anthropic({ maxRetries: 1, timeout: 25000 });
  return client;
}

async function aiNarrative(summary, ids) {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  let msg;
  try {
    msg = await anthropic().beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: YD.narrative.OUTPUT_SCHEMA } },
      system: YD.narrative.SYSTEM_PROMPT,
      messages: [{ role: 'user', content: YD.narrative.userMessage(summary) }]
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(502, 'AI 金鑰無效');
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(503, 'AI 使用量已達上限，請稍後再試');
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new HttpError(504, 'AI 回應逾時');
    if (err instanceof Anthropic.APIError) throw new HttpError(502, 'AI 服務暫時無法使用（' + (err.status || '連線') + '）');
    throw err;
  }
  if (msg.stop_reason === 'refusal') throw new HttpError(502, 'AI 未提供回應');
  if (msg.stop_reason === 'max_tokens') throw new HttpError(502, 'AI 回應不完整');
  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'AI 回應格式不正確');
  }
  const clean = YD.narrative.sanitize(parsed, ids);
  if (!clean) throw new HttpError(502, 'AI 回應格式不正確');
  return { narrative: clean, model: msg.model || model };
}

/* ------------------------------------------------------------------ */
/* 路由                                                               */
/* ------------------------------------------------------------------ */
async function route(req, context) {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = req.method;

  if (parts[0] === 'health' && method === 'GET') {
    let storage = false;
    try {
      await store().getMetadata('meta/counter');
      storage = true;
    } catch {
      storage = false;
    }
    const ai = !!process.env.ANTHROPIC_API_KEY;
    return json({ ok: true, storage, adminConfigured: adminConfigured(), ai, model: ai ? process.env.ANTHROPIC_MODEL || DEFAULT_MODEL : null });
  }

  if (parts[0] === 'admin' && parts[1] === 'login' && method === 'POST') {
    rateLimit(req, context, 'login', 20, 10 * 60 * 1000);
    requireAdmin(req);
    return json({ ok: true });
  }

  if (parts[0] === 'records') {
    const id = parts[1];
    if (!id && method === 'GET') {
      requireAdmin(req);
      return json({ records: await allRecords() });
    }
    if (!id && method === 'POST') {
      rateLimit(req, context, 'create', 60, 10 * 60 * 1000);
      const body = await readJson(req);
      let code = typeof body.elderCode === 'string' ? body.elderCode.toUpperCase() : null;
      if (!code || !(await elderExists(code))) code = await allocateElderCode();
      const createdAt = new Date().toISOString();
      const recId = YD.assess.newRecordId(createdAt);
      const rec = buildRecord(body, { id: recId, elderCode: code, createdAt, demo: false });
      const deleteToken = randomBytes(24).toString('hex');
      rec.deleteTokenHash = sha256(deleteToken).toString('hex');
      await store().setJSON(`rec/${code}/${recId}`, rec);
      return json({ id: recId, elderCode: code, createdAt, deleteToken }, 201);
    }
    if (id === 'bulk' && method === 'POST') {
      requireAdmin(req);
      const body = await readJson(req);
      const list = Array.isArray(body.records) ? body.records.slice(0, 500) : [];
      let saved = 0;
      const errors = [];
      const keyById = new Map((await listKeys()).map((k) => [k.slice(k.lastIndexOf('/') + 1), k]));
      for (const raw of list) {
        try {
          const recId = ID_RE.test(raw.id || '') ? raw.id : YD.assess.newRecordId();
          let code = typeof raw.elderCode === 'string' && CODE_RE.test(raw.elderCode.toUpperCase()) ? raw.elderCode.toUpperCase() : null;
          if (!code) code = await allocateElderCode();
          else await store().setJSON('elder/' + code, { createdAt: new Date().toISOString() }, { onlyIfNew: true });
          const rec = buildRecord(raw, { id: recId, elderCode: code, createdAt: validDate(raw.createdAt) || new Date().toISOString(), demo: !!raw.demo });
          const newKey = `rec/${code}/${recId}`;
          const old = keyById.get(recId);
          if (old && old !== newKey) await store().delete(old);
          await store().setJSON(newKey, rec);
          keyById.set(recId, newKey);
          saved++;
        } catch (e) {
          errors.push(String(e.message || e));
        }
      }
      // 讓配發編號的計數器跳過匯入的編號
      const codes = (await listKeys('elder/YD-')).map((k) => Number(k.split('-')[1]) || 0);
      if (codes.length) await store().setJSON('meta/counter', { next: Math.max(...codes) + 1 });
      return json({ saved, errors: errors.slice(0, 20) });
    }
    if (id && method === 'GET') {
      requireAdmin(req);
      if (!ID_RE.test(id)) throw new HttpError(400, '紀錄編號不正確');
      const key = await findKey(id);
      if (!key) throw new HttpError(404, '找不到這筆紀錄');
      return json({ record: publicRecord(await store().get(key, { type: 'json' })) });
    }
    if (id && method === 'DELETE') {
      if (!ID_RE.test(id)) throw new HttpError(400, '紀錄編號不正確');
      const key = await findKey(id);
      if (!key) throw new HttpError(404, '找不到這筆紀錄');
      if (!isAdmin(req)) {
        const token = req.headers.get('x-delete-token') || '';
        const rec = await store().get(key, { type: 'json' });
        const ok = token && rec && rec.deleteTokenHash && timingSafeEqual(sha256(token), Buffer.from(rec.deleteTokenHash, 'hex'));
        if (!ok) throw new HttpError(403, '沒有刪除這筆紀錄的權限');
      }
      await store().delete(key);
      return json({ ok: true });
    }
    if (!id && method === 'DELETE') {
      requireAdmin(req);
      const all = url.searchParams.get('all') === '1';
      const demoOnly = url.searchParams.get('demo') === '1';
      if (!all && !demoOnly) throw new HttpError(400, '請指定要刪除的範圍');
      const keys = await listKeys();
      let removed = 0;
      await mapLimit(keys, 16, async (k) => {
        if (!all) {
          const r = await store().get(k, { type: 'json' });
          if (!r || !r.demo) return;
        }
        await store().delete(k);
        removed++;
      });
      if (all) {
        const meta = await listKeys('elder/');
        await mapLimit(meta, 16, (k) => store().delete(k));
        await store().delete('meta/counter');
      }
      return json({ ok: true, removed });
    }
  }

  if (parts[0] === 'lookup' && method === 'POST') {
    rateLimit(req, context, 'lookup', 30, 10 * 60 * 1000);
    const body = await readJson(req);
    const code = String(body.elderCode || '').toUpperCase();
    const age = Number(body.age);
    if (!CODE_RE.test(code) || !(age >= 50 && age <= 110)) return json({ found: false });
    const keys = await listKeys('rec/' + code + '/');
    const recs = (await mapLimit(keys, 8, (k) => store().get(k, { type: 'json' }))).filter(Boolean);
    recs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!recs.length || Math.abs(Number(recs[0].profile.age) - age) > 1) return json({ found: false });
    return json({
      found: true,
      elderCode: code,
      profile: { name: '', sex: recs[0].profile.sex, age: recs[0].profile.age },
      history: recs.map((r) => ({ createdAt: r.createdAt, sft: r.sft, profile: { sex: r.profile.sex, age: r.profile.age } }))
    });
  }

  if (parts[0] === 'ai' && parts[1] === 'narrative' && method === 'POST') {
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, '尚未設定 ANTHROPIC_API_KEY');
    rateLimit(req, context, 'ai', 30, 10 * 60 * 1000);
    const body = await readJson(req);
    const raw = body.input || {};
    // 不把姓名、施測人員與醫師說明送給 AI
    raw.profile = { ...(raw.profile || {}), name: '', operator: '' };
    raw.health = { ...(raw.health || {}), doctorNote: '' };
    raw.consent = { agreed: true };
    const ev = YD.assess.evaluate(raw);
    if (!ev.ok) throw new HttpError(400, ev.errors.join('、'));
    const ids = ev.rx.exercises.map((e) => e.id);
    return json(await aiNarrative(ev.summary, ids));
  }

  throw new HttpError(404, '找不到這個 API');
}

export default async (req, context) => {
  try {
    return await route(req, context);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error('[yindong api]', err);
    return json({ error: '伺服器發生錯誤，請稍後再試' }, 500);
  }
};
