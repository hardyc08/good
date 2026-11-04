// 銀動方程式 — 後端 API 測試（本機 Netlify Blobs 模擬 + 模擬的 Claude API 伺服器）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';

let blobs;
let mock;
let handler;
let lastAiRequest = null;
let aiReply = null;
const PW = 'test-admin-secret';

function mockMessage(text) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 }
  };
}

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yd-api-test-'));
  blobs = new BlobsServer({ directory: dir, token: 'tok' });
  const { port } = await blobs.start();
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
    JSON.stringify({ edgeURL: `http://127.0.0.1:${port}`, uncachedEdgeURL: `http://127.0.0.1:${port}`, token: 'tok', siteID: 'test-site' })
  ).toString('base64');
  // 模擬 Claude Messages API
  mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    lastAiRequest = { url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(aiReply));
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${mock.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.ADMIN_PASSWORD = PW;
  handler = (await import('../../netlify/functions/api.mjs')).default;
});

after(async () => {
  await blobs.stop();
  await new Promise((r) => mock.close(r));
});

async function call(method, p, body, headers = {}) {
  const req = new Request('http://localhost' + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const res = await handler(req, { ip: '127.0.0.1' });
  return { status: res.status, data: await res.json() };
}
const admin = { Authorization: 'Bearer ' + PW };

const assessment = {
  consent: { agreed: true, research: true },
  profile: { name: '測試奶奶', sex: 'F', age: 80, operator: '小明' },
  screening: { q1: true, q2: true, q3: true, q4: true, q5: true },
  sft: {
    chairStand: { value: 9 },
    armCurl: { value: 12 },
    stepTest: { value: 62 },
    sitReach: { value: 0 },
    backScratch: { value: -10 },
    upAndGo: { value: 7.5 }
  },
  health: { conditions: ['diabetes'], symptoms: [], active: false, falls: 0, doctorNote: '醫師說不要跑步' }
};

test('health 回報儲存、後台與 AI 狀態', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.storage, r.data.adminConfigured, r.data.ai], [true, true, true]);
  assert.equal(r.data.model, 'claude-opus-5-5');
});

test('新增評估：伺服器重新計算結果並配發長者編號', async () => {
  const r = await call('POST', '/api/records', { ...assessment, result: { risk: 'low' } });
  assert.equal(r.status, 201);
  assert.match(r.data.elderCode, /^YD-\d{4}$/);
  assert.match(r.data.deleteToken, /^[0-9a-f]{48}$/);
  const list = await call('GET', '/api/records', undefined, admin);
  const rec = list.data.records.find((x) => x.id === r.data.id);
  assert.equal(rec.result.risk, 'moderate', '應以伺服器計算為準，而非前端送來的 low');
  assert.equal(rec.deleteTokenHash, undefined, '不可外洩刪除憑證雜湊');
});

test('後台權限：未登入或密碼錯誤皆拒絕', async () => {
  assert.equal((await call('GET', '/api/records')).status, 401);
  assert.equal((await call('GET', '/api/records', undefined, { Authorization: 'Bearer nope' })).status, 401);
  assert.equal((await call('POST', '/api/admin/login', undefined, admin)).status, 200);
});

test('查詢舊紀錄：需正確年齡且不回傳姓名', async () => {
  const c = await call('POST', '/api/records', assessment);
  const bad = await call('POST', '/api/lookup', { elderCode: c.data.elderCode, age: 60 });
  assert.equal(bad.data.found, false);
  const ok = await call('POST', '/api/lookup', { elderCode: c.data.elderCode, age: 80 });
  assert.equal(ok.data.found, true);
  assert.equal(ok.data.profile.name, '');
  assert.equal(ok.data.history.length, 1);
  const again = await call('POST', '/api/records', { ...assessment, elderCode: c.data.elderCode });
  assert.equal(again.data.elderCode, c.data.elderCode, '回診長者沿用原編號');
});

test('刪除：本人需持有憑證，後台可直接刪除', async () => {
  const c = await call('POST', '/api/records', assessment);
  assert.equal((await call('DELETE', '/api/records/' + c.data.id, undefined, { 'X-Delete-Token': 'x'.repeat(48) })).status, 403);
  assert.equal((await call('DELETE', '/api/records/' + c.data.id, undefined, { 'X-Delete-Token': c.data.deleteToken })).status, 200);
  assert.equal((await call('GET', '/api/records/' + c.data.id, undefined, admin)).status, 404);
});

test('輸入驗證：缺少必要欄位回 400', async () => {
  const r = await call('POST', '/api/records', { profile: { sex: 'F' } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /年齡/);
});

test('AI 說明：送出去識別化摘要、使用結構化輸出與 fallbacks，並清理回應', async () => {
  aiReply = mockMessage(
    JSON.stringify({
      greeting: '{稱呼}您好<img src=x onerror=alert(1)>',
      summary: '您的腿力需要加強。',
      focus: ['一', '二', '三', '四'],
      exerciseTips: [
        { id: 'chair-squat', tip: '慢慢做' },
        { id: 'made-up', tip: '不存在的動作' }
      ],
      safety: ['不要空腹運動'],
      motivation: '加油！'
    })
  );
  const r = await call('POST', '/api/ai/narrative', { input: assessment });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const sent = JSON.stringify(lastAiRequest.body);
  assert.ok(!sent.includes('測試奶奶'), '不可送出姓名');
  assert.ok(!sent.includes('醫師說不要跑步'), '不可送出醫師備註');
  assert.ok(!sent.includes('小明'), '不可送出施測人員');
  assert.equal(lastAiRequest.body.model, 'claude-opus-5-5');
  assert.equal(lastAiRequest.body.fallbacks, 'default');
  assert.equal(lastAiRequest.body.output_config.format.type, 'json_schema');
  assert.equal(lastAiRequest.body.output_config.effort, 'low');
  assert.match(String(lastAiRequest.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
  assert.equal(r.data.narrative.greeting, '{稱呼}您好');
  assert.equal(r.data.narrative.focus.length, 3);
  assert.ok(r.data.narrative.exerciseTips.every((t) => t.id !== 'made-up'));
});

test('AI 拒答或格式錯誤時回傳錯誤（前端會改用本機說明）', async () => {
  aiReply = { ...mockMessage(''), stop_reason: 'refusal', content: [] };
  assert.equal((await call('POST', '/api/ai/narrative', { input: assessment })).status, 502);
  aiReply = mockMessage('這不是 JSON');
  assert.equal((await call('POST', '/api/ai/narrative', { input: assessment })).status, 502);
});

test('批次匯入與清除示範資料', async () => {
  const demo = { ...assessment, id: 'demo-x1', elderCode: 'DM-0001', demo: true, createdAt: '2026-10-01T10:00:00+08:00' };
  const r = await call('POST', '/api/records/bulk', { records: [demo, { ...demo, id: 'demo-x2' }] }, admin);
  assert.equal(r.data.saved, 2);
  const before = (await call('GET', '/api/records', undefined, admin)).data.records.length;
  const cleared = await call('DELETE', '/api/records?demo=1', undefined, admin);
  assert.equal(cleared.data.removed, 2);
  const afterCount = (await call('GET', '/api/records', undefined, admin)).data.records.length;
  assert.equal(afterCount, before - 2);
  // 新長者編號不受示範編號影響
  const c = await call('POST', '/api/records', assessment);
  assert.match(c.data.elderCode, /^YD-/);
});
