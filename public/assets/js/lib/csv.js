/*
 * 銀動方程式 — CSV 匯出與匯入
 * 匯出檔含 UTF-8 BOM，Excel 開啟中文不會亂碼；匯入使用相同欄位（可先下載範本）。
 * 為避免試算表公式注入，以 = + - @ 開頭的文字欄位會加上單引號。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var S = function () {
    return YD.screening;
  };

  function yn(v) {
    return v === true ? '是' : v === false ? '否' : '';
  }
  function labels(list, keys) {
    return (keys || [])
      .map(function (k) {
        return S().labelOf(list, k);
      })
      .join('、');
  }
  function fromLabels(list, text) {
    if (!text) return [];
    return String(text)
      .split(/[、,，;；]/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)
      .map(function (s) {
        for (var i = 0; i < list.length; i++) if (list[i].label === s || list[i].key === s) return list[i].key;
        return null;
      })
      .filter(Boolean);
  }
  function parseYn(v) {
    var s = String(v === undefined || v === null ? '' : v).trim();
    if (s === '是' || s === 'Y' || s === 'y' || s === '1' || s === 'true') return true;
    if (s === '否' || s === 'N' || s === 'n' || s === '0' || s === 'false') return false;
    return null;
  }

  var Q = ['q1', 'q2', 'q3', 'q4', 'q5'];
  var Q_SHORT = { q1: '不扶物起身', q2: '獨立行走10公尺', q3: '併腳站10秒', q4: '上下樓梯', q5: '站立10分鐘' };
  var FALL_RISK = { low: '低', moderate: '中', high: '高' };

  /** 欄位定義：[標題, 匯出函式, 匯入函式(值, 原始資料物件)] */
  function columns() {
    var N = YD.norms;
    var cols = [
      ['紀錄編號', function (r) { return r.id; }, function (v, o) { o.id = v || null; }],
      ['長者編號', function (r) { return r.elderCode; }, function (v, o) { o.elderCode = v; }],
      ['稱呼', function (r) { return r.profile.name; }, function (v, o) { o.profile.name = v; }],
      ['性別', function (r) { return r.profile.sex === 'M' ? '男' : '女'; }, function (v, o) { o.profile.sex = /男|M/i.test(v) ? 'M' : /女|F/i.test(v) ? 'F' : null; }],
      ['年齡', function (r) { return r.profile.age; }, function (v, o) { o.profile.age = v; }],
      ['身高(公分)', function (r) { return r.profile.heightCm; }, function (v, o) { o.profile.heightCm = v; }],
      ['體重(公斤)', function (r) { return r.profile.weightKg; }, function (v, o) { o.profile.weightKg = v; }],
      ['據點', function (r) { return r.site; }, function (v, o) { o.site = v; }],
      ['評估日期', function (r) { return r.createdAt; }, function (v, o) { o.createdAt = v; }],
      ['同意參加', function (r) { return yn(r.consent && r.consent.agreed); }, function (v, o) { o.consent.agreed = parseYn(v) !== false; }],
      ['同意研究使用', function (r) { return yn(r.consent && r.consent.research); }, function (v, o) { o.consent.research = parseYn(v) === true; }],
      ['示範資料', function (r) { return yn(!!r.demo); }, function (v, o) { o.demo = parseYn(v) === true; }]
    ];
    Q.forEach(function (q, i) {
      cols.push([
        '初篩' + (i + 1) + '_' + Q_SHORT[q],
        function (r) { return yn(r.screening && r.screening[q]); },
        function (v, o) { var b = parseYn(v); if (b !== null) o.screening[q] = b; }
      ]);
    });
    N.TESTS.forEach(function (t) {
      cols.push([
        t.name + '(' + t.unit + ')',
        function (r) { var e = r.sft && r.sft[t.key]; return e && e.unable ? '無法完成' : e && typeof e.value === 'number' ? e.value : ''; },
        function (v, o) { var s = String(v || '').trim(); o.sft[t.key] = s === '無法完成' ? { value: null, unable: true } : { value: s === '' ? null : Number(s), unable: false }; }
      ]);
    });
    N.TESTS.forEach(function (t) {
      cols.push([t.name + '_常模判定', function (r) { var e = r.result && r.result.sft[t.key]; return e ? N.STATUS_TEXT[e.status] : ''; }, null]);
      cols.push([t.name + '_百分位', function (r) { var e = r.result && r.result.sft[t.key]; return e && e.percentile !== null ? e.percentile : ''; }, null]);
    });
    cols = cols.concat([
      ['低於常模項數', function (r) { return r.result ? r.result.belowCount : ''; }, null],
      ['處方版本', function (r) { return r.result ? r.result.versionText : ''; }, null],
      ['綜合風險', function (r) { return r.result ? r.result.riskText : ''; }, null],
      ['強度等級', function (r) { return r.result ? r.result.levelText : ''; }, null],
      ['ACSM篩檢', function (r) { return r.result ? r.result.acsm.title : ''; }, null],
      ['跌倒風險', function (r) { return r.result ? FALL_RISK[r.result.fallRisk] : ''; }, null],
      ['判定依據', function (r) { return r.result ? r.result.reasons.join('；') : ''; }, null],
      ['慢性疾病', function (r) { return labels(S().CONDITIONS, r.health.conditions); }, function (v, o) { o.health.conditions = fromLabels(S().CONDITIONS, v); }],
      ['疑似心血管症狀', function (r) { return labels(S().SYMPTOMS, r.health.symptoms); }, function (v, o) { o.health.symptoms = fromLabels(S().SYMPTOMS, v); }],
      ['規律運動', function (r) { return yn(r.health.active); }, function (v, o) { o.health.active = parseYn(v); }],
      ['過去一年跌倒次數', function (r) { var f = Number(r.health.falls) || 0; return f >= 2 ? '2次以上' : String(f); }, function (v, o) { var s = String(v || ''); o.health.falls = /2/.test(s) ? 2 : /1/.test(s) ? 1 : 0; }],
      ['走路不穩', function (r) { return yn(r.health.unsteady); }, function (v, o) { o.health.unsteady = parseYn(v) === true; }],
      ['擔心跌倒', function (r) { return yn(r.health.fearOfFalling); }, function (v, o) { o.health.fearOfFalling = parseYn(v) === true; }],
      ['疼痛部位', function (r) { return labels(S().PAIN_AREAS, r.health.painAreas); }, function (v, o) { o.health.painAreas = fromLabels(S().PAIN_AREAS, v); }],
      ['醫師限制運動', function (r) { return yn(r.health.doctorRestriction); }, function (v, o) { o.health.doctorRestriction = parseYn(v) === true; }],
      ['醫師說明', function (r) { return r.health.doctorNote; }, function (v, o) { o.health.doctorNote = v; }],
      ['收縮壓', function (r) { return r.health.bpSys; }, function (v, o) { o.health.bpSys = v; }],
      ['舒張壓', function (r) { return r.health.bpDia; }, function (v, o) { o.health.bpDia = v; }],
      ['安靜心跳', function (r) { return r.health.restingHr; }, function (v, o) { o.health.restingHr = v; }],
      ['運動目標', function (r) { return labels(S().GOALS, r.health.goals); }, function (v, o) { o.health.goals = fromLabels(S().GOALS, v); }],
      ['想加強部位', function (r) { return labels(S().FOCUS_AREAS, r.health.focusAreas); }, function (v, o) { o.health.focusAreas = fromLabels(S().FOCUS_AREAS, v); }],
      ['喜歡的運動', function (r) { return labels(S().PREFERENCES, r.health.preferences); }, function (v, o) { o.health.preferences = fromLabels(S().PREFERENCES, v); }],
      ['可用器材', function (r) { return labels(S().EQUIPMENT, r.health.equipment); }, function (v, o) { o.health.equipment = fromLabels(S().EQUIPMENT, v); }],
      ['每週天數', function (r) { return r.health.daysPerWeek; }, function (v, o) { o.health.daysPerWeek = v; }],
      ['每次分鐘', function (r) { return r.health.minutesPerSession; }, function (v, o) { o.health.minutesPerSession = v; }],
      ['每週總分鐘', function (r) { return r.result ? r.result.weeklyMinutes : ''; }, null],
      ['每週有氧分鐘', function (r) { return r.result ? r.result.aerobicMinutes : ''; }, null],
      ['處方動作', function (r) { return r.result ? r.result.exercises.map(function (id) { var e = YD.exercises.get(id); return e ? e.name : id; }).join('、') : ''; }, null],
      ['說明來源', function (r) { return r.narrative && r.narrative.source === 'ai' ? 'AI（' + (r.narrative.model || 'Claude') + '）' : '本機規則引擎'; }, null],
      ['施測人員', function (r) { return r.profile.operator; }, function (v, o) { o.profile.operator = v; }]
    ]);
    return cols;
  }

  function cell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(records) {
    var cols = columns();
    var lines = [cols.map(function (c) { return cell(c[0]); }).join(',')];
    records.forEach(function (r) {
      lines.push(
        cols
          .map(function (c) {
            var v;
            try {
              v = c[1](r);
            } catch (e) {
              v = '';
            }
            return cell(v);
          })
          .join(',')
      );
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /** 解析 CSV 文字為二維陣列（支援引號、跨行、CRLF）。 */
  function parse(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [];
    var row = [];
    var cur = '';
    var inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') {
        row.push(cur);
        cur = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = '';
      } else cur += ch;
    }
    if (cur !== '' || row.length) {
      row.push(cur);
      rows.push(row);
    }
    return rows.filter(function (r) {
      return r.some(function (c) {
        return String(c).trim() !== '';
      });
    });
  }

  /**
   * 將 CSV 轉成紀錄（重新計算風險分級與處方）。
   * 回傳 { records, errors: [{ line, message }] }
   */
  function fromCSV(text) {
    var rows = parse(text);
    if (rows.length < 2) return { records: [], errors: [{ line: 1, message: '檔案沒有資料列' }] };
    var header = rows[0].map(function (h) {
      return String(h).trim();
    });
    var cols = columns();
    var index = {};
    header.forEach(function (h, i) {
      index[h] = i;
    });
    var missing = ['性別', '年齡'].filter(function (h) {
      return index[h] === undefined;
    });
    if (missing.length) return { records: [], errors: [{ line: 1, message: '缺少必要欄位：' + missing.join('、') }] };
    var out = [];
    var errors = [];
    var codes = [];
    rows.slice(1).forEach(function (r, i) {
      var raw = { profile: {}, screening: {}, sft: {}, health: {}, consent: { agreed: true } };
      cols.forEach(function (c) {
        if (!c[2] || index[c[0]] === undefined) return;
        var v = r[index[c[0]]];
        v = v === undefined ? '' : String(v).replace(/^'(?=[=+\-@])/, '').trim();
        c[2](v, raw);
      });
      var ev = YD.assess.evaluate(raw);
      if (!ev.ok) {
        errors.push({ line: i + 2, message: ev.errors.join('、') });
        return;
      }
      var created = raw.createdAt && !isNaN(new Date(raw.createdAt).getTime()) ? new Date(raw.createdAt).toISOString() : new Date().toISOString();
      var code = ev.input.elderCode || YD.assess.nextElderCode(codes);
      codes.push(code);
      out.push({
        id: raw.id && /^[A-Za-z0-9-]{3,60}$/.test(raw.id) ? raw.id : YD.assess.newRecordId(created),
        elderCode: code,
        createdAt: created,
        site: ev.input.site,
        demo: !!raw.demo,
        consent: ev.input.consent,
        profile: ev.input.profile,
        screening: ev.input.screening,
        sft: ev.input.sft,
        health: ev.input.health,
        result: YD.assess.snapshot(ev),
        narrative: { source: 'local', data: YD.narrative.local(ev.summary) },
        imported: true
      });
    });
    return { records: out, errors: errors };
  }

  function template() {
    var sample = YD.demo.build()[0];
    var copy = JSON.parse(JSON.stringify(sample));
    copy.id = '';
    copy.elderCode = 'YD-0101';
    copy.profile.name = '王奶奶';
    copy.demo = false;
    return toCSV([copy]);
  }

  YD.csv = { toCSV: toCSV, fromCSV: fromCSV, parse: parse, template: template, columns: columns };
})(typeof globalThis !== 'undefined' ? globalThis : this);
