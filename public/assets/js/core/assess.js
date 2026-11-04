/*
 * 銀動方程式 — 評估流程整合
 * 把一筆評估資料跑過：驗證 → 風險分級 → 處方 → 摘要，並產生紀錄快照。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var ENGINE_VERSION = '1.0';

  /** 完整評估。input 可為原始資料（會先正規化）。 */
  function evaluate(input) {
    var norm = YD.validate.normalizeAssessment(input);
    var v = norm.value;
    var cls = YD.screening.classify(v);
    var rx = YD.prescription.build(v, cls);
    var summary = YD.prescription.summarize(v, cls, rx);
    return { ok: norm.ok, errors: norm.errors, input: v, cls: cls, rx: rx, summary: summary };
  }

  /** 精簡結果（存進資料庫、後台列表與 CSV 使用）。 */
  function snapshot(ev) {
    var cls = ev.cls;
    var sft = {};
    cls.sft.items.forEach(function (i) {
      sft[i.key] = { value: i.value, unable: i.unable, status: i.status, percentile: i.percentile };
    });
    return {
      engineVersion: ENGINE_VERSION,
      risk: cls.level,
      riskText: cls.levelText,
      version: cls.version,
      versionText: cls.versionText,
      level: cls.dose,
      levelText: cls.doseText,
      reasons: cls.reasons.map(function (r) {
        return r.text;
      }),
      belowCount: cls.sft.belowCount,
      measuredCount: cls.sft.measuredCount,
      meanPercentile: cls.sft.meanPercentile,
      sft: sft,
      acsm: { code: cls.acsm.code, title: cls.acsm.title, clearance: cls.acsm.clearance },
      fallRisk: cls.fall.level,
      needsClearance: cls.needsClearance,
      stopToday: cls.stopToday,
      weeklyMinutes: ev.rx.week.total,
      aerobicMinutes: ev.rx.week.aerobic,
      exercises: ev.rx.exercises.map(function (e) {
        return e.id;
      })
    };
  }

  function pad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }

  /** 產生下一個長者編號（YD-0001 起）。 */
  function nextElderCode(existing) {
    var max = 0;
    (existing || []).forEach(function (c) {
      var m = /^YD-(\d+)$/.exec(String(c || ''));
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'YD-' + pad(max + 1, 4);
  }

  function randomId() {
    var rnd = '';
    try {
      var a = new Uint8Array(6);
      (root.crypto || {}).getRandomValues(a);
      for (var i = 0; i < a.length; i++) rnd += pad(a[i].toString(16), 2);
    } catch (e) {
      rnd = Math.random().toString(16).slice(2, 14);
    }
    return rnd;
  }

  function newRecordId(date) {
    var d = date ? new Date(date) : new Date();
    return 'r-' + d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2) + '-' + randomId();
  }

  /** 是否完成全部 6 項檢測（無法完成也算已施測）。 */
  function isComplete(record) {
    var s = (record && record.sft) || {};
    return YD.validate.TEST_KEYS.every(function (k) {
      var e = s[k];
      return e && (e.unable || typeof e.value === 'number');
    });
  }

  YD.assess = {
    ENGINE_VERSION: ENGINE_VERSION,
    evaluate: evaluate,
    snapshot: snapshot,
    nextElderCode: nextElderCode,
    newRecordId: newRecordId,
    randomId: randomId,
    isComplete: isComplete
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
