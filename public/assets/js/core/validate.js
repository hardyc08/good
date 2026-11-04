/*
 * 銀動方程式 — 評估資料驗證與正規化
 *
 * 前端（匯入 CSV）與 Netlify Function（寫入資料庫、呼叫 AI）共用。
 * 只接受預先定義的選項代碼與合理範圍內的數值，避免髒資料與提示詞注入。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var TEST_KEYS = ['chairStand', 'armCurl', 'stepTest', 'sitReach', 'backScratch', 'upAndGo'];
  var MINUTES = [15, 20, 30, 45, 60];

  function cleanText(v, max) {
    if (v === null || v === undefined) return '';
    var s = String(v)
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function num(v, min, max, decimals) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!isFinite(n)) return null;
    if (n < min || n > max) return null;
    var f = Math.pow(10, decimals || 0);
    return Math.round(n * f) / f;
  }

  function bool(v) {
    if (v === true || v === false) return v;
    if (v === 'true' || v === '1' || v === 1 || v === '是' || v === 'Y' || v === 'y') return true;
    if (v === 'false' || v === '0' || v === 0 || v === '否' || v === 'N' || v === 'n') return false;
    return null;
  }

  function subset(list, allowed) {
    if (!Array.isArray(list)) return [];
    var keys = allowed.map(function (a) {
      return a.key;
    });
    var out = [];
    list.forEach(function (k) {
      if (keys.indexOf(k) !== -1 && out.indexOf(k) === -1) out.push(k);
    });
    return out;
  }

  /**
   * 正規化一筆評估資料。回傳 { ok, value, errors }。
   * 必要欄位：性別、年齡、同意書。
   */
  function normalizeAssessment(raw) {
    var S = YD.screening;
    var N = YD.norms;
    var errors = [];
    raw = raw || {};
    var p = raw.profile || {};
    var profile = {
      name: cleanText(p.name, 20),
      sex: p.sex === 'M' || p.sex === 'F' ? p.sex : null,
      age: num(p.age, 50, 110, 0),
      heightCm: num(p.heightCm, 100, 220, 1),
      weightKg: num(p.weightKg, 25, 200, 1),
      operator: cleanText(p.operator, 20)
    };
    if (!profile.sex) errors.push('請選擇性別');
    if (profile.age === null) errors.push('年齡需介於 50–110 歲');

    var sc = raw.screening || {};
    var screening = {};
    S.MOBILITY_QUESTIONS.forEach(function (q) {
      var b = bool(sc[q.id]);
      if (b !== null) screening[q.id] = b;
    });

    var sftIn = raw.sft || {};
    var sft = {};
    TEST_KEYS.forEach(function (k) {
      var t = N.TEST_MAP[k];
      var e = sftIn[k] || {};
      var unable = bool(e.unable) === true;
      var value = unable ? null : num(e.value, t.min, t.max, t.decimals);
      sft[k] = { value: value, unable: unable };
    });

    var h = raw.health || {};
    var falls = num(h.falls, 0, 2, 0);
    var health = {
      conditions: subset(h.conditions, S.CONDITIONS),
      symptoms: subset(h.symptoms, S.SYMPTOMS),
      painAreas: subset(h.painAreas, S.PAIN_AREAS),
      goals: subset(h.goals, S.GOALS),
      focusAreas: subset(h.focusAreas, S.FOCUS_AREAS),
      preferences: subset(h.preferences, S.PREFERENCES),
      equipment: Array.isArray(h.equipment) ? subset(h.equipment, S.EQUIPMENT) : ['band', 'weights', 'towel'],
      active: bool(h.active),
      falls: falls === null ? 0 : falls,
      unsteady: bool(h.unsteady) === true,
      fearOfFalling: bool(h.fearOfFalling) === true,
      doctorRestriction: bool(h.doctorRestriction) === true,
      doctorNote: cleanText(h.doctorNote, 100),
      bpSys: num(h.bpSys, 60, 260, 0),
      bpDia: num(h.bpDia, 30, 160, 0),
      restingHr: num(h.restingHr, 30, 200, 0),
      daysPerWeek: num(h.daysPerWeek, 2, 7, 0) || 5,
      minutesPerSession: MINUTES.indexOf(Number(h.minutesPerSession)) !== -1 ? Number(h.minutesPerSession) : 30
    };

    var c = raw.consent || {};
    var consent = {
      agreed: bool(c.agreed) === true,
      research: bool(c.research) === true,
      version: cleanText(c.version || '2026.1', 20),
      at: cleanText(c.at, 40)
    };
    if (!consent.agreed) errors.push('需要勾選同意書');

    return {
      ok: errors.length === 0,
      errors: errors,
      value: {
        profile: profile,
        screening: screening,
        sft: sft,
        health: health,
        consent: consent,
        site: cleanText(raw.site, 30) || '北港樂智據點',
        elderCode: /^[A-Za-z0-9-]{1,20}$/.test(String(raw.elderCode || '')) ? String(raw.elderCode).toUpperCase() : null
      }
    };
  }

  YD.validate = {
    TEST_KEYS: TEST_KEYS,
    MINUTES: MINUTES,
    cleanText: cleanText,
    num: num,
    bool: bool,
    normalizeAssessment: normalizeAssessment
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
