// 銀動方程式 — 核心引擎單元測試（node --test）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './_load.mjs';

const YD = loadCore();
const N = YD.norms;
const S = YD.screening;

const ALL_YES = { q1: true, q2: true, q3: true, q4: true, q5: true };
function sft(cs, ac, st, sr, bs, ug) {
  const e = (v) => (v === 'x' ? { value: null, unable: true } : { value: v, unable: false });
  return { chairStand: e(cs), armCurl: e(ac), stepTest: e(st), sitReach: e(sr), backScratch: e(bs), upAndGo: e(ug) };
}
function input(over = {}) {
  return {
    profile: { name: '測試', sex: 'F', age: 72, ...(over.profile || {}) },
    screening: over.screening || ALL_YES,
    sft: over.sft || sft(13, 15, 85, 3, -3, 5.5),
    health: { active: true, conditions: [], symptoms: [], falls: 0, ...(over.health || {}) },
    consent: { agreed: true }
  };
}

test('SFT 常模：Rikli & Jones 第 25–75 百分位與單位換算', () => {
  assert.deepEqual([N.getNorm('chairStand', 'F', 72).p25, N.getNorm('chairStand', 'F', 72).p75], [10, 15]);
  assert.deepEqual([N.getNorm('armCurl', 'M', 86).p25, N.getNorm('armCurl', 'M', 86).p75], [11, 17]);
  assert.deepEqual([N.getNorm('stepTest', 'M', 70).p25, N.getNorm('stepTest', 'M', 70).p75], [80, 110]);
  // 坐姿體前彎女性 60–64：-0.5～+5.0 英吋 → -1.3～+12.7 公分
  assert.deepEqual([N.getNorm('sitReach', 'F', 62).p25, N.getNorm('sitReach', 'F', 62).p75], [-1.3, 12.7]);
  // 抓背男性 90–94：-10.5～-4.0 英吋
  assert.deepEqual([N.getNorm('backScratch', 'M', 93).p25, N.getNorm('backScratch', 'M', 93).p75], [-26.7, -10.2]);
  // 起身繞行：p25 為較慢的秒數
  assert.deepEqual([N.getNorm('upAndGo', 'F', 80).p25, N.getNorm('upAndGo', 'F', 80).p75], [8.7, 5.7]);
});

test('年齡組別：未滿 60 與 95 以上採用最近的組別並提示', () => {
  assert.equal(N.ageBandIndex(55).band, '60-64');
  assert.match(N.ageBandIndex(55).note, /未滿 60/);
  assert.equal(N.ageBandIndex(97).band, '90-94');
  assert.equal(N.ageBandIndex(64).band, '60-64');
  assert.equal(N.ageBandIndex(65).band, '65-69');
  assert.equal(N.ageBandIndex(94).band, '90-94');
});

test('SFT 評分：邊界值、數字越小越好、無法完成', () => {
  // 女性 70–74 坐站 10–15：10 與 15 都屬正常範圍
  assert.equal(N.scoreTest('chairStand', { value: 10 }, 'F', 72).status, 'normal');
  assert.equal(N.scoreTest('chairStand', { value: 15 }, 'F', 72).status, 'normal');
  assert.equal(N.scoreTest('chairStand', { value: 9 }, 'F', 72).status, 'below');
  assert.equal(N.scoreTest('chairStand', { value: 16 }, 'F', 72).status, 'above');
  // 起身繞行（女性 70–74：7.1～4.9 秒）
  assert.equal(N.scoreTest('upAndGo', { value: 7.5 }, 'F', 72).status, 'below');
  assert.equal(N.scoreTest('upAndGo', { value: 4.5 }, 'F', 72).status, 'above');
  assert.equal(N.scoreTest('upAndGo', { value: 9.2 }, 'F', 72).riskZone, true);
  assert.equal(N.scoreTest('upAndGo', { value: 8.6 }, 'F', 72).fallRisk, true);
  const u = N.scoreTest('stepTest', { unable: true }, 'F', 72);
  assert.equal(u.status, 'unable');
  assert.equal(u.riskZone, true);
  assert.equal(N.scoreTest('armCurl', undefined, 'F', 72).status, 'missing');
});

test('百分位估計：常模中點約 50、上下界約 25/75，且單調', () => {
  const norm = N.getNorm('chairStand', 'F', 72);
  assert.equal(N.estimatePercentile('chairStand', 12.5, norm), 50);
  assert.ok(Math.abs(N.estimatePercentile('chairStand', 10, norm) - 25) <= 1);
  assert.ok(Math.abs(N.estimatePercentile('chairStand', 15, norm) - 75) <= 1);
  let prev = 0;
  for (let v = 0; v <= 30; v++) {
    const p = N.estimatePercentile('chairStand', v, norm);
    assert.ok(p >= prev);
    prev = p;
  }
  const ug = N.getNorm('upAndGo', 'F', 72);
  assert.ok(N.estimatePercentile('upAndGo', 4.5, ug) > N.estimatePercentile('upAndGo', 7.5, ug));
});

test('動作初篩：關鍵題或 2 題以上「否」切換坐姿適應版', () => {
  assert.equal(S.routeVersion(ALL_YES).version, 'standard');
  assert.equal(S.routeVersion({ ...ALL_YES, q1: false }).version, 'standard');
  assert.equal(S.routeVersion({ ...ALL_YES, q2: false }).version, 'seated');
  assert.equal(S.routeVersion({ ...ALL_YES, q3: false }).version, 'seated');
  assert.equal(S.routeVersion({ ...ALL_YES, q1: false, q4: false }).version, 'seated');
  assert.equal(S.routeVersion({ q1: true }).complete, false);
});

test('ACSM 運動前篩檢六種情境', () => {
  const r = (active, conditions, symptoms) => S.acsmScreen({ active, conditions, symptoms });
  assert.equal(r(false, [], []).clearance, 'none');
  assert.equal(r(false, ['diabetes'], []).clearance, 'recommended');
  assert.equal(r(false, [], ['dizzy']).clearance, 'recommended');
  assert.equal(r(true, [], []).clearance, 'none');
  assert.equal(r(true, ['heart'], []).clearance, 'vigorous-only');
  assert.equal(r(true, [], ['chestPain']).clearance, 'stop');
  // 高血壓本身不是 ACSM 定義的已知心血管疾病
  assert.equal(r(false, ['hypertension'], []).clearance, 'none');
  assert.deepEqual(r(false, ['stroke', 'kidney'], []).diseaseCategories.sort(), ['cardiovascular', 'renal']);
});

test('血壓與心跳門檻', () => {
  assert.equal(S.vitalsCheck({ bpSys: 182, bpDia: 90 }).stopToday, true);
  assert.equal(S.vitalsCheck({ bpSys: 150, bpDia: 112 }).stopToday, true);
  assert.equal(S.vitalsCheck({ bpSys: 165, bpDia: 90 }).level, 'caution');
  assert.equal(S.vitalsCheck({ bpSys: 130, bpDia: 80 }).level, 'ok');
  assert.equal(S.vitalsCheck({ restingHr: 108 }).level, 'caution');
  assert.equal(S.vitalsCheck({}).level, 'ok');
});

test('綜合風險分級與處方版本', () => {
  const low = S.classify(input());
  assert.equal(low.level, 'low');
  assert.equal(low.version, 'standard');

  const diabetes = S.classify(input({ health: { conditions: ['diabetes'], active: false } }));
  assert.equal(diabetes.level, 'moderate');
  assert.equal(diabetes.needsClearance, true);
  assert.equal(diabetes.dose, 1);

  const symptom = S.classify(input({ health: { symptoms: ['chestPain'] } }));
  assert.equal(symptom.level, 'high');
  assert.equal(symptom.version, 'seated');

  const weak = S.classify(input({ sft: sft(8, 10, 60, -5, -12, 7.5) }));
  assert.ok(weak.sft.belowCount >= 4);
  assert.equal(weak.level, 'high');
  assert.equal(weak.version, 'seated');

  const screen = S.classify(input({ screening: { ...ALL_YES, q3: false } }));
  assert.equal(screen.level, 'high');
  assert.equal(screen.version, 'seated');
  assert.match(screen.versionReason, /動作初篩/);
});

test('處方：標準版只含標準版動作、每週 5×30 分鐘 = 150 分鐘', () => {
  const ev = YD.assess.evaluate({ ...input(), health: { ...input().health, daysPerWeek: 5, minutesPerSession: 30 } });
  const rx = ev.rx;
  assert.equal(rx.version, 'standard');
  for (const e of rx.exercises) {
    const ex = YD.exercises.get(e.id);
    assert.ok(ex, e.id);
    assert.ok(ex.versions.includes('standard') || e.substitutedFor, `${e.id} 應屬標準版`);
  }
  assert.equal(rx.week.total, 150);
  assert.ok(rx.week.strengthDays >= 2, '肌力每週至少 2 天');
  assert.ok(rx.week.flexDays >= 2, '伸展每週至少 2 天');
  assert.ok(rx.week.balanceDays >= 2, '平衡每週至少 2 天');
  const cats = new Set(rx.exercises.map((e) => e.category));
  for (const c of ['aerobic', 'strength', 'flexibility', 'balance']) assert.ok(cats.has(c), c);
  // 每天的區塊加總等於該日時間
  for (const d of rx.week.days) assert.equal(d.blocks.reduce((s, b) => s + b.minutes, 0), d.total, d.day);
});

test('處方：坐姿適應版只含坐姿動作；無法站起時排除站立動作', () => {
  const ev = YD.assess.evaluate(input({ screening: { ...ALL_YES, q2: false, q3: false }, sft: sft('x', 8, 40, -10, -20, 'x') }));
  assert.equal(ev.rx.version, 'seated');
  for (const e of ev.rx.exercises) {
    const ex = YD.exercises.get(e.id);
    assert.ok(ex.versions.includes('seated'), `${e.id} 應屬坐姿版`);
    assert.notEqual(ex.requiresStand, true, `${e.id} 需要站立`);
  }
});

test('處方：疾病禁忌與器材替代', () => {
  const sh = YD.assess.evaluate(input({ health: { conditions: ['shoulder'], goals: ['arms'], focusAreas: ['shoulders'] } }));
  assert.ok(!sh.rx.exercises.some((e) => e.id === 'overhead-press'), '肩關節問題不做肩推');
  const knee = YD.assess.evaluate(input({ health: { conditions: ['kneeOA'] } }));
  assert.ok(!knee.rx.exercises.some((e) => e.id === 'quad-stretch'));
  const squat = knee.rx.exercises.find((e) => e.id === 'chair-squat');
  if (squat) assert.ok(squat.notes.some((n) => /一半/.test(n)), '膝退化需提示半蹲');
  const noBand = YD.assess.evaluate(input({ health: { equipment: ['weights'] } }));
  for (const e of noBand.rx.exercises) {
    assert.ok(!(YD.exercises.get(e.id).equipment || []).includes('band'), `${e.id} 需要彈力帶`);
  }
});

test('6 週目標：低於常模者設定可達成的進步目標', () => {
  const ev = YD.assess.evaluate(input({ profile: { sex: 'M', age: 70 }, sft: sft(9, 12, 70, -9, -22, 6.6) }));
  const t = Object.fromEntries(ev.rx.goals.targets.map((x) => [x.key, x]));
  assert.equal(t.chairStand.targetValue, 11);
  assert.equal(t.upAndGo.targetValue, 6);
  assert.equal(ev.rx.goals.phases.length, 3);
});

test('驗證：缺少必要欄位、超出範圍與未知選項', () => {
  const bad = YD.validate.normalizeAssessment({ profile: { age: 30 }, consent: {} });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 3);
  const v = YD.validate.normalizeAssessment({
    profile: { name: '<b>王</b>奶奶', sex: 'F', age: '78' },
    sft: { chairStand: { value: '999' }, upAndGo: { value: 7.25 } },
    health: { conditions: ['diabetes', 'hacker'], falls: 5, minutesPerSession: 33 },
    consent: { agreed: true }
  });
  assert.equal(v.ok, true);
  assert.equal(v.value.profile.name, 'b王/b奶奶');
  assert.equal(v.value.profile.age, 78);
  assert.equal(v.value.sft.chairStand.value, null);
  assert.equal(v.value.sft.upAndGo.value, 7.3);
  assert.deepEqual(v.value.health.conditions, ['diabetes']);
  assert.equal(v.value.health.falls, 0);
  assert.equal(v.value.health.minutesPerSession, 30);
});

test('說明文字：本機版欄位完整、AI 輸出清理與稱呼替換', () => {
  const ev = YD.assess.evaluate(input());
  const n = YD.narrative.local(ev.summary);
  for (const k of ['greeting', 'summary', 'motivation']) assert.ok(n[k].length > 5, k);
  assert.equal(n.focus.length, 3);
  const ids = ev.rx.exercises.map((e) => e.id);
  const clean = YD.narrative.sanitize(
    {
      greeting: '{稱呼}您好<script>alert(1)</script>',
      summary: '說明',
      focus: ['a', 'b', 'c', 'd'],
      exerciseTips: [{ id: ids[0], tip: '好' }, { id: 'not-real', tip: '壞' }],
      safety: ['s'],
      motivation: '加油'
    },
    ids
  );
  assert.equal(clean.greeting, '{稱呼}您好alert(1)');
  assert.equal(clean.focus.length, 3);
  assert.deepEqual(clean.exerciseTips.map((t) => t.id), [ids[0]]);
  assert.equal(YD.narrative.sanitize({ greeting: '' }, ids), null);
  assert.equal(YD.narrative.applyName('{稱呼}您好！', '王奶奶'), '王奶奶您好！');
  assert.equal(YD.narrative.applyName('{稱呼}您好！{稱呼}加油', ''), '您好！您加油');
  assert.equal(YD.narrative.applyName('{稱呼}您好！', '長者 19'), '長者 19 您好！');
  // 送給 AI 的摘要不含姓名
  assert.ok(!JSON.stringify(ev.summary).includes('測試'));
});

test('示範資料符合簡報統計：19 人、平均 78.4 歲、男 4 女 15、低 6 中 8 高 5', () => {
  const recs = YD.demo.build();
  const latest = {};
  for (const r of recs) if (!latest[r.elderCode] || latest[r.elderCode].createdAt < r.createdAt) latest[r.elderCode] = r;
  const L = Object.values(latest);
  assert.equal(L.length, 19);
  const mean = L.reduce((s, r) => s + r.profile.age, 0) / L.length;
  assert.equal(mean.toFixed(1), '78.4');
  assert.equal(L.filter((r) => r.profile.sex === 'M').length, 4);
  const c = { low: 0, moderate: 0, high: 0 };
  for (const r of L) c[r.result.risk]++;
  assert.deepEqual(c, { low: 6, moderate: 8, high: 5 });
  for (const r of L) assert.equal(r.result.version === 'seated', r.result.risk === 'high');
  const e19 = latest['DM-0019'];
  assert.equal(e19.profile.sex, 'M');
  assert.equal(e19.profile.age, 70);
  assert.equal(e19.result.risk, 'high');
  assert.equal(e19.result.version, 'seated');
  assert.equal(e19.result.weeklyMinutes, 150);
  assert.ok(L.every((r) => YD.assess.isComplete(r)), '完成率 100%');
});

test('每個動作都有完整說明與可播放的示範動畫', () => {
  for (const ex of YD.exercises.LIST) {
    assert.ok(ex.steps.length >= 2, ex.id);
    assert.ok(ex.cautions.length >= 1, ex.id);
    assert.ok(ex.figure && ex.figure.frames.length >= 2, ex.id);
    assert.ok(['aerobic', 'strength', 'flexibility', 'balance'].includes(ex.category), ex.id);
    if (ex.fallback) assert.ok(YD.exercises.get(ex.fallback), `${ex.id} 的替代動作 ${ex.fallback} 不存在`);
    if (ex.category !== 'aerobic') assert.ok(YD.exercises.doseText(ex, 2), `${ex.id} 缺少劑量`);
  }
});

test('長者編號與紀錄編號', () => {
  assert.equal(YD.assess.nextElderCode([]), 'YD-0001');
  assert.equal(YD.assess.nextElderCode(['YD-0019', 'YD-0003', 'X']), 'YD-0020');
  assert.match(YD.assess.newRecordId(new Date('2026-11-04T10:00:00')), /^r-20261104-[0-9a-f]{12}$/);
});
