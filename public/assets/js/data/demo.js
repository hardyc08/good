/*
 * 銀動方程式 — 示範資料（模擬數據）
 *
 * ⚠ 這 19 位長者的資料是「依簡報統計值模擬」的示範資料，並非真實檢測紀錄：
 *   19 人、平均 78.4 歲、男 4 人／女 15 人、低風險 6 人／中風險 8 人／高風險 5 人，
 *   長者 19 為 70 歲男性、高風險、坐姿適應版。
 * 正式使用時請在後台「清除示範資料」，並以「匯入 CSV」載入真實資料。
 * 另含長者 01 的一筆前測紀錄，用來示範「前後測進步比較」。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var SITE = '北港樂智據點';
  var OPERATOR = '北港附醫個管師';
  var ALL_YES = { q1: true, q2: true, q3: true, q4: true, q5: true };

  function sft(cs, ac, st, sr, bs, ug) {
    function e(v) {
      return v === 'x' ? { value: null, unable: true } : { value: v, unable: false };
    }
    return { chairStand: e(cs), armCurl: e(ac), stepTest: e(st), sitReach: e(sr), backScratch: e(bs), upAndGo: e(ug) };
  }

  function health(o) {
    var h = {
      conditions: [],
      symptoms: [],
      painAreas: [],
      goals: [],
      focusAreas: [],
      preferences: [],
      equipment: ['band', 'weights', 'towel'],
      active: false,
      falls: 0,
      unsteady: false,
      fearOfFalling: false,
      doctorRestriction: false,
      doctorNote: '',
      bpSys: null,
      bpDia: null,
      restingHr: null,
      daysPerWeek: 5,
      minutesPerSession: 30
    };
    Object.keys(o || {}).forEach(function (k) {
      h[k] = o[k];
    });
    return h;
  }

  // [編號, 性別, 年齡, 檢測日期, 初篩, SFT, 健康狀況]
  var ROWS = [
    ['01', 'F', 76, '2026-10-08', ALL_YES, sft(14, 16, 88, 3.0, -3.0, 5.8),
      health({ conditions: ['hypertension'], active: true, goals: ['fall', 'legs'], preferences: ['walking'], bpSys: 132, bpDia: 80, restingHr: 72 })],
    ['02', 'F', 72, '2026-09-17', ALL_YES, sft(14, 16, 92, 4.5, -1.5, 5.3),
      health({ active: true, goals: ['flex', 'endurance'], preferences: ['taichi', 'group'], bpSys: 124, bpDia: 76, restingHr: 70 })],
    ['03', 'F', 68, '2026-09-17', ALL_YES, sft(15, 17, 98, 6.0, 1.0, 5.0),
      health({ active: true, goals: ['arms', 'mood'], focusAreas: ['arms'], preferences: ['dance', 'group'], bpSys: 118, bpDia: 74, restingHr: 68 })],
    ['04', 'F', 74, '2026-09-17', ALL_YES, sft(11, 13, 75, 0.5, -6.0, 6.5),
      health({ conditions: ['diabetes'], active: false, goals: ['chronic', 'weight'], preferences: ['walking'], bpSys: 128, bpDia: 78, restingHr: 76 })],
    ['05', 'F', 77, '2026-09-24', ALL_YES, sft(9, 12, 62, -2.0, -9.0, 7.0),
      health({ conditions: ['hypertension'], active: false, goals: ['legs', 'endurance'], focusAreas: ['legs'], preferences: ['walking'], bpSys: 138, bpDia: 84, restingHr: 78 })],
    ['06', 'F', 78, '2026-09-24', ALL_YES, sft(11, 12, 70, -1.0, -10.0, 7.2),
      health({ conditions: ['kneeOA'], painAreas: ['knee'], active: true, falls: 1, goals: ['fall', 'legs'], preferences: ['taichi'], bpSys: 130, bpDia: 80 })],
    ['07', 'M', 75, '2026-09-24', ALL_YES, sft(13, 16, 90, -3.0, -12.0, 5.8),
      health({ conditions: ['hypertension'], active: true, goals: ['endurance', 'social'], preferences: ['walking', 'group'], bpSys: 134, bpDia: 82, restingHr: 72 })],
    ['08', 'F', 79, '2026-10-01', ALL_YES, sft(9, 10, 72, -2.5, -11.0, 7.0),
      health({ conditions: ['kneeOA', 'osteoporosis'], painAreas: ['knee'], fearOfFalling: true, goals: ['fall', 'arms'], focusAreas: ['legs', 'balance'], bpSys: 126, bpDia: 76 })],
    ['09', 'F', 80, '2026-10-01', ALL_YES, sft(12, 13, 70, 0.0, -8.0, 6.8),
      health({ active: true, goals: ['flex', 'mood'], preferences: ['taichi', 'group'], bpSys: 128, bpDia: 78 })],
    ['10', 'F', 81, '2026-10-01', ALL_YES, sft(10, 12, 65, -3.0, -12.0, 7.8),
      health({ conditions: ['diabetes', 'hypertension'], active: true, goals: ['chronic', 'fall'], preferences: ['walking'], bpSys: 142, bpDia: 84, restingHr: 80 })],
    ['11', 'F', 83, '2026-10-08', ALL_YES, sft(8, 11, 58, -4.0, -13.0, 8.5),
      health({ conditions: ['osteoporosis', 'backPain'], painAreas: ['back'], goals: ['legs', 'fall'], focusAreas: ['legs'], bpSys: 132, bpDia: 76 })],
    ['12', 'M', 82, '2026-10-08', ALL_YES, sft(11, 14, 75, -6.0, -15.0, 7.0),
      health({ conditions: ['heart', 'hypertension'], active: false, goals: ['endurance'], preferences: ['walking'], bpSys: 136, bpDia: 78, restingHr: 74 })],
    ['13', 'F', 84, '2026-10-08', { q1: false, q2: true, q3: false, q4: true, q5: true }, sft(7, 9, 50, -6.0, -16.0, 10.5),
      health({ conditions: ['hypertension', 'kneeOA'], painAreas: ['knee'], falls: 1, unsteady: true, goals: ['fall'], focusAreas: ['balance'], bpSys: 146, bpDia: 82 })],
    ['14', 'F', 75, '2026-10-15', ALL_YES, sft(12, 14, 80, 3.0, -5.0, 6.2),
      health({ active: true, goals: ['flex', 'social'], preferences: ['dance', 'group'], bpSys: 120, bpDia: 74 })],
    ['15', 'F', 71, '2026-10-15', ALL_YES, sft(12, 14, 78, 1.5, -7.0, 6.0),
      health({ conditions: ['hypertension'], active: false, goals: ['chronic'], preferences: ['walking'], bpSys: 164, bpDia: 96, restingHr: 82 })],
    ['16', 'M', 86, '2026-10-15', { q1: false, q2: false, q3: true, q4: false, q5: true }, sft(8, 10, 55, -15.0, -26.0, 9.8),
      health({ conditions: ['stroke', 'hypertension'], falls: 2, unsteady: true, fearOfFalling: true, goals: ['fall', 'legs'], focusAreas: ['legs'], bpSys: 138, bpDia: 80 })],
    ['17', 'F', 87, '2026-10-20', { q1: false, q2: true, q3: true, q4: true, q5: false }, sft(5, 8, 40, -8.0, -20.0, 12.0),
      health({ conditions: ['osteoporosis', 'vision'], falls: 1, fearOfFalling: true, goals: ['fall', 'legs'], bpSys: 140, bpDia: 78 })],
    ['18', 'F', 92, '2026-10-20', { q1: false, q2: false, q3: false, q4: false, q5: false }, sft('x', 7, 35, -12.0, -22.0, 'x'),
      health({ conditions: ['dementia', 'hypertension'], unsteady: true, goals: ['legs', 'mood'], minutesPerSession: 20, bpSys: 136, bpDia: 76 })],
    ['19', 'M', 70, '2026-10-20', { q1: true, q2: true, q3: false, q4: false, q5: true }, sft(8, 11, 58, -10.0, -22.0, 8.8),
      health({ conditions: ['hypertension', 'diabetes'], painAreas: ['knee'], active: false, falls: 1, unsteady: true, goals: ['fall', 'legs'], focusAreas: ['legs', 'balance'], daysPerWeek: 5, minutesPerSession: 30, bpSys: 148, bpDia: 88, restingHr: 80 })]
  ];

  // 長者 01 的前測（約 7 週前），用來示範進步比較
  var BASELINES = [
    ['01', 'F', 76, '2026-08-20', ALL_YES, sft(12, 14, 80, 1.0, -5.0, 6.4),
      health({ conditions: ['hypertension'], active: false, goals: ['fall', 'legs'], preferences: ['walking'], bpSys: 136, bpDia: 82, restingHr: 76 })]
  ];

  function toRaw(row, idSuffix) {
    var no = row[0];
    return {
      id: 'demo-' + no + (idSuffix || ''),
      elderCode: 'YD-00' + no,
      createdAt: row[3] + 'T10:00:00+08:00',
      site: SITE,
      demo: true,
      consent: { agreed: true, research: true, version: '2026.1', at: row[3] + 'T09:40:00+08:00' },
      profile: { name: '長者 ' + no, sex: row[1], age: row[2], operator: OPERATOR },
      screening: row[4],
      sft: row[5],
      health: row[6]
    };
  }

  /** 產生完整的示範紀錄（含評估結果與本機說明文字）。 */
  function build() {
    var raws = ROWS.map(function (r) {
      return toRaw(r);
    }).concat(
      BASELINES.map(function (r) {
        return toRaw(r, '-pre');
      })
    );
    return raws.map(function (raw) {
      var ev = YD.assess.evaluate(raw);
      return {
        id: raw.id,
        elderCode: raw.elderCode,
        createdAt: raw.createdAt,
        site: raw.site,
        demo: true,
        consent: ev.input.consent,
        profile: ev.input.profile,
        screening: ev.input.screening,
        sft: ev.input.sft,
        health: ev.input.health,
        result: YD.assess.snapshot(ev),
        narrative: { source: 'local', data: YD.narrative.local(ev.summary) }
      };
    });
  }

  YD.demo = { build: build, ROWS: ROWS, BASELINES: BASELINES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
