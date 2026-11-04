// 銀動方程式 — 端對端測試（Playwright）
// 依序測試：本機模式完整評估流程、計時器、後台（統計、列表、詳細、CSV）、雲端模式 API 流程、無障礙檢查。
// 用法：npm run test:e2e   （截圖輸出到 tests/e2e/screenshots/）
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
function load(name) {
  try {
    return require(name);
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), name));
  }
}
const { chromium } = load('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, 'screenshots');
mkdirSync(shotDir, { recursive: true });

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log('✓', name);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('✗', name, '\n   ', e.message.split('\n').slice(0, 6).join('\n    '));
  }
}

function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    // 資源載入失敗改由 response 事件記錄（含網址）
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && u.hostname === '127.0.0.1') errors.push(r.status() + ' ' + u.pathname);
  });
  return errors;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotDir, name + '.png'), fullPage: true });
}

async function noHorizontalScroll(page) {
  const d = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(d.sw <= d.cw + 1, `頁面出現水平捲動：${d.sw} > ${d.cw}`);
}

/** 走完六步驟（標準版或坐姿版）。 */
async function runWizard(page, base, opts = {}) {
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /開始評估/ }).click();
  await page.waitForURL(/#\/assess\/1/);
  // Step 1
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.getByText('請勾選「同意參加評估」才能繼續').waitFor();
  await page.getByLabel(/我已了解上述說明/).check();
  await page.getByLabel(/去識別化/).check();
  if (opts.shots) await shot(page, opts.prefix + '1-consent');
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.waitForURL(/#\/assess\/2/);
  // Step 2
  await page.getByLabel('怎麼稱呼您？').fill(opts.name || '王奶奶');
  await page.getByRole('radio', { name: opts.sex === 'M' ? /男性/ : /女性/ }).click();
  const age = page.locator('#f-age');
  await age.fill(String(opts.age || 76));
  await age.press('Tab');
  if (opts.shots) await shot(page, opts.prefix + '2-basic');
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.waitForURL(/#\/assess\/3/);
  // Step 3
  const answers = opts.screening || [true, true, true, true, true];
  const cards = page.locator('.q-card');
  for (let i = 0; i < 5; i++) {
    await cards.nth(i).getByRole('radio', { name: answers[i] ? '可以' : '有困難', exact: true }).click();
  }
  await page.locator('.route-result').waitFor();
  if (opts.shots) await shot(page, opts.prefix + '3-screen');
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.waitForURL(/#\/assess\/4/);
  // Step 4
  const v = opts.sft || { chairStand: 12, armCurl: 14, stepTest: 80, sitReach: 2.5, backScratch: -6, upAndGo: 6.2 };
  for (const [k, val] of Object.entries(v)) {
    if (val === 'x') {
      await page.locator('#test-' + k).getByLabel('無法完成或不適合施測').check();
    } else {
      const inp = page.locator('#in-' + k);
      await inp.fill(String(val));
      await inp.press('Tab');
    }
  }
  if (opts.shots) await shot(page, opts.prefix + '4-sft');
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.waitForURL(/#\/assess\/5/);
  // Step 5
  await page.getByRole('button', { name: /產生我的運動處方/ }).click();
  await page.getByText('還有資料需要填寫').waitFor();
  const conditions = opts.conditions || ['高血壓'];
  if (conditions.length) {
    for (const c of conditions) await page.getByRole('button', { name: c, exact: true }).click();
  } else await page.getByRole('button', { name: '以上皆無' }).click();
  await page.getByRole('button', { name: '以上都沒有' }).click();
  await page.getByRole('radio', { name: opts.active === false ? /否，沒有/ : /是，有規律運動/ }).click();
  await page.getByRole('radio', { name: opts.falls === 1 ? '1 次' : '沒有跌倒' }).click();
  await page.getByRole('button', { name: /預防跌倒/ }).click();
  if (opts.shots) await shot(page, opts.prefix + '5-health');
  await page.getByRole('button', { name: /產生我的運動處方/ }).click();
  await page.waitForURL(/#\/assess\/6/);
  await page.locator('#report-title').waitFor({ timeout: 30000 });
}

const server = await startServer({ port: 0, api: false });
const browser = await chromium.launch();

try {
  /* ---------------- 本機模式：手機 ---------------- */
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const phoneErrors = watch(phone);

  await step('首頁載入（手機寬度、無水平捲動）', async () => {
    await phone.goto(server.url + '/#/', { waitUntil: 'networkidle' });
    await phone.getByRole('heading', { name: '銀動方程式', level: 1 }).waitFor();
    await noHorizontalScroll(phone);
    await shot(phone, 'phone-landing');
  });

  await step('六步驟流程：標準版（低風險）', async () => {
    await runWizard(phone, server.url, { shots: true, prefix: 'phone-' });
    await noHorizontalScroll(phone);
    const title = await phone.locator('#report-title').textContent();
    assert.match(title, /王奶奶 的專屬運動處方/);
    assert.ok(await phone.getByText('已儲存。長者編號 YD-').isVisible());
    assert.ok(await phone.locator('.badge.low').first().isVisible(), '應為低風險');
    assert.ok(await phone.locator('.badge.std').first().isVisible(), '應為標準版');
    // 一週計畫 7 天、總時數 150
    assert.equal(await phone.locator('.week .day').count(), 7);
    assert.match(await phone.locator('.week-total').textContent(), /150/);
    // 展開第一個動作 → 示範動畫與步驟
    const first = phone.locator('details.ex-card').first();
    await first.locator('summary').click();
    await first.locator('.fig-box svg').waitFor();
    assert.ok((await first.locator('.ex-body ol li').count()) >= 2);
    await shot(phone, 'phone-6-report');
  });

  await step('重新整理後保留處方（不重新呼叫 AI）', async () => {
    await phone.reload({ waitUntil: 'networkidle' });
    await phone.locator('#report-title').waitFor();
  });

  await step('列印版面：展開全部動作', async () => {
    await phone.emulateMedia({ media: 'print' });
    await phone.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const closed = await phone.locator('details.ex-card:not([open])').count();
    assert.equal(closed, 0);
    await phone.pdf ? null : null;
    await phone.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await phone.emulateMedia({ media: 'screen' });
  });

  await step('六步驟流程：坐姿適應版（高風險、無法完成項目）', async () => {
    await phone.goto(server.url + '/#/', { waitUntil: 'networkidle' });
    await phone.getByRole('button', { name: /完成，回到首頁/ }).click().catch(() => {});
    await runWizard(phone, server.url, {
      name: '陳伯伯',
      sex: 'M',
      age: 70,
      screening: [true, true, false, false, true],
      sft: { chairStand: 8, armCurl: 11, stepTest: 58, sitReach: -10, backScratch: -22, upAndGo: 'x' },
      conditions: ['糖尿病'],
      active: false,
      falls: 1
    });
    assert.ok(await phone.locator('.badge.high').first().isVisible(), '應為高風險');
    assert.ok(await phone.locator('.badge.seated').first().isVisible(), '應為坐姿適應版');
    assert.ok(await phone.locator('.alert.clearance').first().isVisible(), '應提示取得醫師同意');
    await shot(phone, 'phone-6-report-seated');
  });

  await step('退出評估會清除資料', async () => {
    await phone.goto(server.url + '/#/', { waitUntil: 'networkidle' });
    await phone.getByRole('button', { name: /開始評估/ }).click();
    await phone.getByLabel(/我已了解上述說明/).check();
    await phone.getByRole('button', { name: /退出/ }).click();
    await phone.getByRole('button', { name: '確定退出' }).click();
    await phone.waitForURL(/#\/$/);
    const draft = await phone.evaluate(() => sessionStorage.getItem('yd.draft.v1'));
    assert.equal(draft, null);
  });

  await step('計時器：30 秒倒數與點按計次（加速時鐘）', async () => {
    await phone.clock.install();
    await phone.goto(server.url + '/#/', { waitUntil: 'networkidle' });
    await phone.getByRole('button', { name: /開始評估/ }).click();
    await phone.getByLabel(/我已了解上述說明/).check();
    await phone.getByRole('button', { name: /下一步/ }).click();
    await phone.getByRole('radio', { name: /女性/ }).click();
    await phone.getByRole('button', { name: /下一步/ }).click();
    const cards = phone.locator('.q-card');
    for (let i = 0; i < 5; i++) await cards.nth(i).getByRole('radio', { name: '可以', exact: true }).click();
    await phone.getByRole('button', { name: /下一步/ }).click();
    await phone.locator('#test-chairStand').getByRole('button', { name: /開始計時/ }).click();
    const dlg = phone.locator('dialog[open]');
    await dlg.getByRole('button', { name: /開始/ }).first().click();
    await phone.clock.runFor(3200);
    const tap = dlg.getByRole('button', { name: '＋1 次' });
    for (let i = 0; i < 9; i++) await tap.click();
    await shot(phone, 'phone-timer');
    await phone.clock.runFor(31000);
    await dlg.getByRole('button', { name: /填入結果：9 次/ }).click();
    assert.equal(await phone.locator('#in-chairStand').inputValue(), '9');
  });
  assert.deepEqual(phoneErrors, [], '手機頁面不應有錯誤：' + phoneErrors.join('\n'));

  /* ---------------- 本機模式：平板後台 ---------------- */
  const tab = await browser.newPage({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
  const tabErrors = watch(tab);

  await step('後台：密碼錯誤與登入', async () => {
    await tab.goto(server.url + '/#/admin', { waitUntil: 'networkidle' });
    await tab.getByLabel('管理密碼').fill('wrong');
    await tab.getByRole('button', { name: '登入' }).click();
    await tab.getByText('密碼不正確，請再試一次。').waitFor();
    await tab.getByLabel('管理密碼').fill('yindong2026');
    await tab.getByRole('button', { name: '登入' }).click();
    await tab.getByRole('heading', { name: '總覽' }).waitFor();
  });

  await step('後台總覽：19 位長者、平均 78.4 歲、風險 6／8／5', async () => {
    const kpis = await tab.locator('.kpi .value').allTextContents();
    assert.equal(kpis[0].replace(/\D/g, ''), '19');
    assert.match(kpis[1], /78\.4/);
    assert.match(kpis[2], /100%/);
    const bars = await tab.locator('.hbars').first().locator('.num').allTextContents();
    assert.deepEqual(bars, ['32%（6 人）', '42%（8 人）', '26%（5 人）']);
    await noHorizontalScroll(tab);
    await shot(tab, 'tablet-admin-overview');
  });

  await step('後台列表與篩選、長者 19 詳細頁', async () => {
    await tab.getByRole('link', { name: /長者紀錄/ }).first().click();
    await tab.getByText(/共 19 位長者/).waitFor();
    await tab.getByLabel('風險分級').selectOption('high');
    await tab.getByText(/共 5 位長者/).waitFor();
    await shot(tab, 'tablet-admin-records');
    await tab.getByRole('link', { name: '長者 19' }).click();
    await tab.locator('#report-title').waitFor();
    assert.match(await tab.locator('.report-hero .meta').textContent(), /70 歲・男/);
    assert.ok(await tab.locator('.report-hero .badge.high').isVisible());
    assert.ok(await tab.locator('.report-hero .badge.seated').isVisible());
    assert.match(await tab.locator('.week-total').textContent(), /150/);
    await shot(tab, 'tablet-admin-elder19');
  });

  await step('後台：前後測進步比較（長者 01）', async () => {
    await tab.goto(server.url + '/#/admin/record/demo-01', { waitUntil: 'networkidle' });
    await tab.getByRole('heading', { name: '與上次檢測比較' }).waitFor();
    assert.ok((await tab.locator('.db-row').count()) === 6);
  });

  await step('後台：CSV 匯出（含 BOM）與匯入範本', async () => {
    await tab.goto(server.url + '/#/admin/data', { waitUntil: 'networkidle' });
    const [dl] = await Promise.all([tab.waitForEvent('download'), tab.getByRole('button', { name: '匯出全部紀錄（CSV）' }).click()]);
    const p = await dl.path();
    const csv = readFileSync(p, 'utf8');
    assert.ok(csv.charCodeAt(0) === 0xfeff, '需含 UTF-8 BOM');
    const lines = csv.trim().split(/\r\n/);
    assert.ok(lines.length >= 21, 'CSV 至少 20 筆資料：' + lines.length);
    assert.match(lines[0], /30 秒椅子坐站\(次\)/);
    const [tpl] = await Promise.all([tab.waitForEvent('download'), tab.getByRole('button', { name: '下載匯入範本' }).click()]);
    const tplText = readFileSync(await tpl.path(), 'utf8');
    // 範本可直接匯入
    await tab.locator('#f-csv').setInputFiles({ name: 't.csv', mimeType: 'text/csv', buffer: Buffer.from(tplText, 'utf8') });
    await tab.getByRole('button', { name: /確認匯入 1 筆/ }).click();
    await tab.getByText(/已匯入 1 筆/).waitFor();
  });

  await step('後台：清除示範資料後統計更新', async () => {
    await tab.getByRole('button', { name: '清除示範資料' }).click();
    await tab.locator('dialog[open]').getByRole('button', { name: '清除示範資料' }).click();
    await tab.getByText('已清除示範資料').waitFor();
    await tab.goto(server.url + '/#/admin', { waitUntil: 'networkidle' });
    const n = (await tab.locator('.kpi .value').first().textContent()).replace(/\D/g, '');
    assert.ok(Number(n) >= 1 && Number(n) < 19, '應只剩真實紀錄：' + n);
  });

  await step('後台設定：修改密碼與 QR Code', async () => {
    await tab.goto(server.url + '/#/admin/settings', { waitUntil: 'networkidle' });
    await tab.getByLabel('目前密碼').fill('yindong2026');
    await tab.getByLabel(/新密碼/).fill('newpass123');
    await tab.getByRole('button', { name: '更新密碼' }).click();
    await tab.getByText('密碼已更新').waitFor();
    await tab.locator('.qr-box img').waitFor();
    await shot(tab, 'tablet-admin-settings');
  });
  assert.deepEqual(tabErrors, [], '平板頁面不應有錯誤：' + tabErrors.join('\n'));

  /* ---------------- 深色模式與大字 ---------------- */
  await step('深色模式＋特大字級：無水平捲動', async () => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    await p.goto(server.url + '/#/', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /字體大小/ }).click();
    await p.getByRole('button', { name: /字體大小/ }).click();
    assert.equal(await p.evaluate(() => document.documentElement.getAttribute('data-font')), 'xlarge');
    await noHorizontalScroll(p);
    await shot(p, 'phone-dark-xlarge');
    await p.close();
  });
} finally {
  await browser.close();
  await server.close();
}

/* ---------------- 雲端模式（模擬 Netlify Function + Blobs） ---------------- */
const cloud = await startServer({ port: 0, api: true });
const browser2 = await chromium.launch();
try {
  const page = await browser2.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = watch(page);
  await step('雲端模式：評估後資料寫入伺服器', async () => {
    await runWizard(page, cloud.url, { name: '林阿姨', age: 81 });
    assert.ok(await page.getByText(/已儲存。長者編號 YD-0001/).isVisible());
  });
  await step('雲端模式：後台登入與列表', async () => {
    await page.goto(cloud.url + '/#/admin', { waitUntil: 'networkidle' });
    await page.getByText('雲端模式（Netlify Blobs）').first().waitFor();
    await page.getByLabel('管理密碼').fill(process.env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: '登入' }).click();
    await page.getByRole('heading', { name: '總覽' }).waitFor();
    assert.equal((await page.locator('.kpi .value').first().textContent()).replace(/\D/g, ''), '1');
    await shot(page, 'desktop-cloud-admin');
  });
  await step('雲端模式：載入示範資料（批次上傳）', async () => {
    await page.goto(cloud.url + '/#/admin/data', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '載入示範資料' }).click();
    await page.getByText('已載入示範資料').waitFor({ timeout: 30000 });
    await page.goto(cloud.url + '/#/admin', { waitUntil: 'networkidle' });
    assert.equal((await page.locator('.kpi .value').first().textContent()).replace(/\D/g, ''), '20');
  });
  await step('雲端模式：以長者編號查詢並帶入資料', async () => {
    await page.goto(cloud.url + '/#/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /開始評估/ }).click();
    await page.getByLabel(/我已了解上述說明/).check();
    await page.getByRole('button', { name: /下一步/ }).click();
    await page.getByRole('radio', { name: /之前做過/ }).click();
    await page.getByLabel('長者編號').fill('DM-0019');
    await page.getByLabel('年齡（確認身分用）').fill('70');
    await page.getByRole('button', { name: /查詢/ }).click();
    await page.getByRole('button', { name: '是我，帶入資料' }).click();
    assert.equal(await page.locator('#f-age').inputValue(), '70');
    assert.equal(await page.getByRole('radio', { name: /男性/ }).getAttribute('aria-checked'), 'true');
  });
  assert.deepEqual(errs, [], '雲端模式頁面不應有錯誤：' + errs.join('\n'));
} finally {
  await browser2.close();
  await cloud.close();
}


/* ---------------- AI：瀏覽器直接呼叫（攔截 api.anthropic.com） ---------------- */
const aiReplyText = JSON.stringify({
  greeting: '{稱呼}您好！看到您這麼認真，真的很棒。',
  summary: '這次檢測顯示您的腿部力量和平衡需要多加練習，我們先從坐姿動作開始，安全又有效。',
  focus: ['每週兩次練腿力', '每天練平衡五分鐘', '用力時記得吐氣'],
  exerciseTips: [{ id: 'seated-march', tip: '踏步時抬頭挺胸，跟著音樂更有趣。' }],
  safety: ['運動前先量血壓', '旁邊放一張穩固的椅子'],
  motivation: '一起加油，六週後見！'
});
function anthropicRoute(mode) {
  return async (route) => {
    const req = route.request();
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (mode === 'fail') return route.fulfill({ status: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }) });
    const body = JSON.parse(req.postData() || '{}');
    const hdr = await req.allHeaders();
    // SDK 1.x 以 Authorization: Bearer 傳送 API 金鑰（舊版為 x-api-key），兩者皆接受
    const key = hdr['x-api-key'] || String(hdr.authorization || '').replace(/^Bearer\s+/i, '');
    if (key !== 'sk-ant-browser-test') return route.fulfill({ status: 401, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }) });
    if (JSON.stringify(body).includes('陳伯伯')) throw new Error('送給 AI 的資料不應包含姓名');
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: aiReplyText }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } })
    });
  };
}
{
  const s3 = await startServer({ port: 0, api: false });
  const b3 = await chromium.launch();
  try {
    const page = await b3.newPage({ viewport: { width: 1024, height: 900 } });
    const errs = watch(page);
    await page.route('https://api.anthropic.com/**', anthropicRoute('ok'));
    await step('AI（瀏覽器金鑰）：後台設定金鑰並測試連線', async () => {
      await page.goto(s3.url + '/#/admin/settings', { waitUntil: 'networkidle' });
      await page.getByLabel('管理密碼').fill('yindong2026');
      await page.getByRole('button', { name: '登入' }).click();
      await page.getByLabel(/Anthropic API 金鑰/).fill('sk-ant-browser-test');
      await page.getByRole('button', { name: '儲存金鑰' }).click();
      await page.getByText(/使用此裝置輸入的金鑰呼叫 Claude/).waitFor();
      await page.getByRole('button', { name: '測試 AI 連線' }).click();
      await page.getByText(/連線成功/).waitFor({ timeout: 20000 });
    });
    await step('AI（瀏覽器金鑰）：處方顯示 Claude 撰寫的說明並替換稱呼', async () => {
      await runWizard(page, s3.url, { name: '陳伯伯', sex: 'M', age: 70, screening: [true, true, false, false, true] });
      await page.getByText('陳伯伯您好！看到您這麼認真，真的很棒。').waitFor();
      assert.ok(await page.getByText(/由 Claude AI 撰寫說明/).isVisible());
      await shot(page, 'desktop-ai-report');
    });
    await step('AI 失敗時自動改用本機規則引擎', async () => {
      await page.unroute('https://api.anthropic.com/**');
      await page.route('https://api.anthropic.com/**', anthropicRoute('fail'));
      await page.getByRole('button', { name: /完成，回到首頁/ }).click();
      await runWizard(page, s3.url, { name: '林奶奶', age: 82 });
      await page.getByText(/AI 暫時無法使用，已改由本機規則引擎撰寫說明/).waitFor();
      assert.ok(await page.locator('.ai-source', { hasText: '由本機規則引擎撰寫說明' }).isVisible());
    });
    assert.deepEqual(errs.filter((e) => !/api\.anthropic\.com/.test(e)), [], 'AI 頁面不應有錯誤：' + errs.join('\n'));
  } finally {
    await b3.close();
    await s3.close();
  }
}

/* ---------------- AI：伺服器端（模擬 Claude API） ---------------- */
{
  const http = await import('node:http');
  let gotBody = null;
  const mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    gotBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_2', type: 'message', role: 'assistant', model: gotBody.model, content: [{ type: 'text', text: aiReplyText }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${mock.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-server-test';
  const s4 = await startServer({ port: 0, api: true });
  const b4 = await chromium.launch();
  try {
    const page = await b4.newPage({ viewport: { width: 1024, height: 900 } });
    await step('AI（伺服器金鑰）：經 Netlify Function 產生說明、不送出姓名', async () => {
      await runWizard(page, s4.url, { name: '吳奶奶', age: 77 });
      await page.getByText('吳奶奶您好！看到您這麼認真，真的很棒。').waitFor();
      assert.ok(gotBody && !JSON.stringify(gotBody).includes('吳奶奶'), '伺服器送給 AI 的資料不應含姓名');
    });
  } finally {
    await b4.close();
    await s4.close();
    await new Promise((r) => mock.close(r));
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 項通過`);
process.exit(failed.length ? 1 : 0);
