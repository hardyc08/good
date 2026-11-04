/*
 * 銀動方程式 — 六步驟評估流程
 * Step 1 同意書 → 2 基本資料 → 3 動作初篩 → 4 體適能測驗 → 5 健康狀況 → 6 AI 處方
 * 草稿存在 sessionStorage，重新整理不會遺失；可隨時退出並清除資料。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var h = function () {
    return YD.dom.h.apply(null, arguments);
  };
  var S = function () {
    return YD.screening;
  };

  var STEPS = [
    { n: 1, icon: '📜', label: '同意書' },
    { n: 2, icon: '📋', label: '基本資料' },
    { n: 3, icon: '🩺', label: '動作初篩' },
    { n: 4, icon: '🏃', label: '體適能測驗' },
    { n: 5, icon: '❤️', label: '健康狀況' },
    { n: 6, icon: '🤖', label: 'AI 處方' }
  ];

  var draft = null;
  var container = null;

  function blankDraft() {
    var sft = {};
    YD.validate.TEST_KEYS.forEach(function (k) {
      sft[k] = { value: null, unable: false };
    });
    return {
      v: 1,
      maxStep: 1,
      consent: { agreed: false, research: false, version: '2026.1', at: null },
      site: YD.store.settings().site || '北港樂智據點',
      operator: '',
      mode: 'new',
      elderCode: null,
      history: null,
      profile: { name: '', sex: null, age: 70, heightCm: null, weightKg: null },
      screening: {},
      sft: sft,
      health: {
        conditions: [],
        noneConditions: false,
        symptoms: [],
        noneSymptoms: false,
        active: null,
        falls: null,
        unsteady: null,
        fearOfFalling: null,
        painAreas: [],
        doctorRestriction: null,
        doctorNote: '',
        bpSys: null,
        bpDia: null,
        restingHr: null,
        goals: [],
        focusAreas: [],
        preferences: [],
        equipment: ['weights', 'towel'],
        daysPerWeek: 5,
        minutesPerSession: 30
      },
      saved: null
    };
  }

  function load() {
    draft = YD.store.draft() || null;
    if (!draft || draft.v !== 1) draft = blankDraft();
  }
  function persist() {
    YD.store.draft(draft);
  }
  function reset() {
    YD.store.draft(null);
    draft = blankDraft();
  }

  /* ------------------------------------------------------------------ */
  /* 共用元件                                                           */
  /* ------------------------------------------------------------------ */
  /** 單選分段按鈕（radiogroup，支援方向鍵）。 */
  function seg(options, value, onChange, opts) {
    opts = opts || {};
    var group = h('div', { class: (opts.yn ? 'yn' : 'seg') + (opts.big ? ' big' : '') + (opts.wide ? ' wide' : ''), role: 'radiogroup', 'aria-labelledby': opts.labelledby || null, 'aria-label': opts.label || null });
    var buttons = [];
    function select(i, focus) {
      buttons.forEach(function (b, j) {
        b.setAttribute('aria-checked', j === i ? 'true' : 'false');
        b.tabIndex = j === i ? 0 : -1;
      });
      if (focus) buttons[i].focus();
      onChange(options[i].value);
    }
    options.forEach(function (o, i) {
      var checked = value === o.value;
      var b = h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': checked ? 'true' : 'false',
          'data-v': o.v || null,
          tabindex: checked || (value === null || value === undefined ? i === 0 : false) ? '0' : '-1',
          onclick: function () {
            select(i, false);
          },
          onkeydown: function (e) {
            var k = e.key;
            if (k === 'ArrowRight' || k === 'ArrowDown') {
              e.preventDefault();
              select((i + 1) % options.length, true);
            } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
              e.preventDefault();
              select((i - 1 + options.length) % options.length, true);
            }
          }
        },
        o.icon ? h('span', { 'aria-hidden': 'true' }, o.icon) : null,
        o.label
      );
      buttons.push(b);
      group.appendChild(b);
    });
    return group;
  }

  function yesNo(value, onChange, labelledby, yesText, noText) {
    return seg(
      [
        { value: true, label: yesText || '是', icon: '✓', v: 'yes' },
        { value: false, label: noText || '否', icon: '✗', v: 'no' }
      ],
      value,
      onChange,
      { yn: true, labelledby: labelledby }
    );
  }

  /** 可複選的選項按鈕，可含「以上皆無」。 */
  function chips(list, selected, onChange, opts) {
    opts = opts || {};
    var wrap = h('div', { class: 'chips', role: 'group', 'aria-labelledby': opts.labelledby || null });
    var sel = selected.slice();
    var noneOn = !!opts.noneValue;
    var noneBtn = null;
    var btns = {};
    function refresh() {
      Object.keys(btns).forEach(function (k) {
        btns[k].setAttribute('aria-pressed', sel.indexOf(k) !== -1 ? 'true' : 'false');
      });
      if (noneBtn) noneBtn.setAttribute('aria-pressed', noneOn ? 'true' : 'false');
    }
    list.forEach(function (it) {
      var b = h(
        'button',
        {
          type: 'button',
          class: 'chip',
          'aria-pressed': 'false',
          onclick: function () {
            var i = sel.indexOf(it.key);
            if (i === -1) {
              if (opts.max && sel.length >= opts.max) {
                YD.dom.toast('最多選 ' + opts.max + ' 項');
                return;
              }
              sel.push(it.key);
            } else sel.splice(i, 1);
            if (sel.length) noneOn = false;
            refresh();
            onChange(sel.slice(), noneOn);
          }
        },
        it.icon ? h('span', { 'aria-hidden': 'true' }, it.icon) : null,
        it.label
      );
      btns[it.key] = b;
      wrap.appendChild(b);
    });
    if (opts.noneLabel) {
      noneBtn = h(
        'button',
        {
          type: 'button',
          class: 'chip none',
          'aria-pressed': 'false',
          onclick: function () {
            noneOn = !noneOn;
            if (noneOn) sel = [];
            refresh();
            onChange(sel.slice(), noneOn);
          }
        },
        opts.noneLabel
      );
      wrap.appendChild(noneBtn);
    }
    refresh();
    return wrap;
  }

  function parseNum(text, t) {
    var s = String(text || '')
      .replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .replace(/[－—–]/g, '-')
      .replace(/[，,]/g, '.')
      .trim();
    if (s === '' || s === '-') return null;
    var n = Number(s);
    if (!isFinite(n)) return null;
    n = Math.max(t.min, Math.min(t.max, n));
    var f = Math.pow(10, t.decimals || 0);
    return Math.round(n * f) / f;
  }

  /** 數字加減器。t: { min, max, step, decimals, unit } */
  function stepper(t, value, onChange, label, id) {
    var input = h('input', {
      id: id,
      type: 'text',
      inputmode: t.decimals || t.allowNegative ? 'decimal' : 'numeric',
      autocomplete: 'off',
      'aria-label': label,
      value: value === null || value === undefined ? '' : String(value)
    });
    function set(v) {
      input.value = v === null ? '' : t.decimals ? v.toFixed(t.decimals) : String(v);
      onChange(v);
    }
    function bump(dir) {
      var cur = parseNum(input.value, t);
      if (cur === null) cur = t.start !== undefined ? t.start - dir * t.step : t.higherIsBetter === false ? 10 : 0;
      set(parseNum(String(cur + dir * t.step), t));
    }
    input.addEventListener('change', function () {
      set(parseNum(input.value, t));
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        bump(1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        bump(-1);
      }
    });
    var el = h(
      'div',
      { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': '減少' + (label ? ' ' + label : ''), onclick: function () { bump(-1); } }, '−'),
      h('div', { class: 'stepper-value' }, input, h('span', { class: 'unit', 'aria-hidden': 'true' }, t.unit || '')),
      h('button', { type: 'button', 'aria-label': '增加' + (label ? ' ' + label : ''), onclick: function () { bump(1); } }, '＋')
    );
    el.setDisabled = function (d) {
      Array.prototype.forEach.call(el.querySelectorAll('button, input'), function (x) {
        x.disabled = d;
      });
    };
    el.input = input;
    return el;
  }

  function speakButton(getText) {
    if (!YD.speech.supported) return null;
    return h(
      'button',
      { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { YD.speech.speak(getText()); } },
      h('span', { 'aria-hidden': 'true' }, '🔊'),
      '朗讀本頁'
    );
  }

  function stepsNav(cur) {
    var ol = h('ol');
    STEPS.forEach(function (s) {
      ol.appendChild(
        h(
          'li',
          { 'aria-current': s.n === cur ? 'step' : null, class: s.n < cur ? 'done' : null },
          h('span', { class: 'dot', 'aria-hidden': 'true' }, s.n < cur ? '✓' : s.icon),
          h('span', { class: 'lbl' }, s.label),
          h('span', { class: 'sr-only' }, s.n < cur ? '（已完成）' : s.n === cur ? '（目前步驟）' : '')
        )
      );
    });
    return h(
      'nav',
      { class: 'steps-nav', 'aria-label': '評估進度' },
      ol,
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: { width: (cur / 6) * 100 + '%' } }))
    );
  }

  function stepHead(n, title, subtitle, readFn) {
    return h(
      'div',
      { class: 'step-head' },
      h('div', null, h('p', { class: 'step-kicker' }, '步驟 ' + n + '／6'), h('h1', { tabindex: '-1', id: 'step-title' }, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
      h(
        'div',
        { class: 'row' },
        readFn ? speakButton(readFn) : null,
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: quit }, h('span', { 'aria-hidden': 'true' }, '✕'), '退出')
      )
    );
  }

  function errorBox() {
    return h('div', { class: 'alert stop', role: 'alert', hidden: true });
  }
  function showErrors(box, errs) {
    YD.dom.clear(box);
    if (!errs.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.appendChild(h('span', { class: 'icon', 'aria-hidden': 'true' }, '⚠'));
    box.appendChild(
      h(
        'div',
        null,
        h('p', { style: { fontWeight: 800 } }, '還有資料需要填寫：'),
        h(
          'ul',
          { style: { margin: 0 } },
          errs.map(function (e) {
            return h('li', null, e);
          })
        )
      )
    );
    box.scrollIntoView({ block: 'center' });
  }

  function actions(back, next, nextLabel) {
    return h(
      'div',
      { class: 'wizard-actions no-print' },
      back ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: back }, '← 上一步') : null,
      next ? h('button', { type: 'button', class: 'btn btn-primary', onclick: next }, nextLabel || '下一步 →') : null
    );
  }

  function go(n) {
    draft.maxStep = Math.max(draft.maxStep, n);
    persist();
    root.location.hash = '#/assess/' + n;
  }

  function quit() {
    YD.dom
      .confirm('確定要退出嗎？', '退出後，這次填寫的資料都會清除，不會被保存。您隨時可以退出，不需要任何理由。', '確定退出', true)
      .then(function (ok) {
        if (!ok) return;
        YD.speech.stop();
        reset();
        root.location.hash = '#/';
        YD.dom.toast('已退出，資料已清除。');
      });
  }

  /* ------------------------------------------------------------------ */
  /* Step 1 同意書                                                      */
  /* ------------------------------------------------------------------ */
  var CONSENT_ITEMS = [
    ['目的', '了解您的體適能與健康狀況，為您量身設計安全、有效的運動處方。'],
    ['內容', '基本資料、5 個動作能力問題、6 項體適能檢測與健康狀況問卷，大約 5～10 分鐘。'],
    ['個資保護', '依《個人資料保護法》第 8 條告知：資料只用於提供您運動處方與改善服務品質；姓名以稱呼或代號記錄，研究分析時一律去識別化；不轉售、不作商業用途。'],
    ['您的權利', '參加完全出於自願，您可以隨時退出，不需要任何理由，也不會影響您在據點的任何服務；您可以要求查閱、更正或刪除您的資料。'],
    ['資料保存', '資料於計畫（競賽）結束後適時刪除。'],
    ['安全', '檢測與運動時如有任何不舒服，請立刻告訴工作人員並停止。'],
    ['聯絡', '如有疑問，請洽據點工作人員。']
  ];

  function step1() {
    var err = errorBox();
    var agree = h('input', { type: 'checkbox', checked: draft.consent.agreed, onchange: function () { draft.consent.agreed = agree.checked; persist(); } });
    var research = h('input', { type: 'checkbox', checked: draft.consent.research, onchange: function () { draft.consent.research = research.checked; persist(); } });
    var site = h('input', { class: 'input', id: 'f-site', value: draft.site, autocomplete: 'off', oninput: function () { draft.site = site.value; persist(); } });
    var op = h('input', { class: 'input', id: 'f-op', value: draft.operator, autocomplete: 'off', oninput: function () { draft.operator = op.value; persist(); } });
    return h(
      'div',
      null,
      stepHead(1, '📜 參與同意書', '請工作人員陪同長者一起閱讀，確認了解後再勾選同意。', function () {
        return '參與同意書。' + CONSENT_ITEMS.map(function (c) { return c[0] + '：' + c[1]; }).join('');
      }),
      err,
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'consent-box', tabindex: '0', role: 'region', 'aria-label': '同意書內容' }, h('ol', null, CONSENT_ITEMS.map(function (c) { return h('li', null, h('strong', null, c[0] + '：'), c[1]); }))),
        h('div', { class: 'stack', style: { marginTop: '18px' } },
          h('label', { class: 'check' }, agree, h('span', null, h('strong', null, '我已了解上述說明，同意參加評估。'), h('span', { class: 'required' }))),
          h('label', { class: 'check' }, research, h('span', null, '我同意以「去識別化」的方式，將資料用於研究分析。（選填）'))
        )
      ),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'grid grid-2' },
          h('div', { class: 'field' }, h('label', { for: 'f-site' }, '據點名稱'), site),
          h('div', { class: 'field' }, h('label', { for: 'f-op' }, '施測人員（選填）'), op)
        )
      ),
      actions(
        function () {
          root.location.hash = '#/';
        },
        function () {
          if (!draft.consent.agreed) return showErrors(err, ['請勾選「同意參加評估」才能繼續。']);
          draft.consent.at = new Date().toISOString();
          go(2);
        }
      )
    );
  }

  /* ------------------------------------------------------------------ */
  /* Step 2 基本資料                                                    */
  /* ------------------------------------------------------------------ */
  function step2() {
    var err = errorBox();
    var p = draft.profile;
    var lookupBox = h('div', { class: 'card soft', hidden: draft.mode !== 'return' });
    var codeIn = h('input', { class: 'input', id: 'f-code', placeholder: '例如 YD-0019', value: draft.elderCode || '', autocapitalize: 'characters', autocomplete: 'off' });
    var ageIn = h('input', { class: 'input', id: 'f-lage', inputmode: 'numeric', placeholder: '例如 70', autocomplete: 'off' });
    var lookupResult = h('div', { 'aria-live': 'polite' });
    function renderFound(res) {
      YD.dom.clear(lookupResult);
      if (!res.found) {
        lookupResult.appendChild(h('div', { class: 'alert caution' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '!'), h('p', null, '找不到符合的紀錄，請確認編號與年齡；也可以改選「第一次評估」。')));
        return;
      }
      var last = res.history[0];
      lookupResult.appendChild(
        h(
          'div',
          { class: 'alert ok' },
          h('span', { class: 'icon', 'aria-hidden': 'true' }, '✓'),
          h(
            'div',
            null,
            h('p', null, h('strong', null, '找到了：'), (res.profile.name || res.elderCode) + '（' + (res.profile.sex === 'M' ? '男' : '女') + '，' + res.profile.age + ' 歲），上次評估 ' + YD.dom.fmtDate(last.createdAt) + '，共 ' + res.history.length + ' 次紀錄。'),
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn-primary btn-sm',
                onclick: function () {
                  draft.elderCode = res.elderCode;
                  draft.history = res.history;
                  p.name = res.profile.name || p.name;
                  p.sex = res.profile.sex;
                  p.age = Math.max(p.age || 0, res.profile.age);
                  persist();
                  rerender();
                  YD.dom.toast('已帶入資料，完成後會和上次比較進步情形。');
                }
              },
              '是我，帶入資料'
            )
          )
        )
      );
    }
    lookupBox.appendChild(h('h2', null, '查詢之前的紀錄'));
    lookupBox.appendChild(
      h('div', { class: 'grid grid-2' },
        h('div', { class: 'field' }, h('label', { for: 'f-code' }, '長者編號'), codeIn, h('p', { class: 'hint' }, '印在上次處方的最上方')),
        h('div', { class: 'field' }, h('label', { for: 'f-lage' }, '年齡（確認身分用）'), ageIn)
      )
    );
    lookupBox.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: function () {
            var code = codeIn.value.trim().toUpperCase();
            if (!/^(YD|DM)-\d{1,6}$/.test(code)) {
              showErrors(err, ['長者編號格式為「YD-」加數字，例如 YD-0019。']);
              return;
            }
            showErrors(err, []);
            YD.store
              .lookupElder(code, Number(ageIn.value) || null)
              .then(renderFound)
              .catch(function (e) {
                YD.dom.toast('查詢失敗：' + e.message);
              });
          }
        },
        '🔍 查詢'
      )
    );
    lookupBox.appendChild(lookupResult);
    if (draft.elderCode && draft.history) {
      lookupResult.appendChild(h('div', { class: 'alert ok' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '✓'), h('p', null, '已連結長者編號 ' + draft.elderCode + '，完成後會和上次比較進步情形。')));
    }

    var nameIn = h('input', { class: 'input', id: 'f-name', value: p.name, maxlength: '20', autocomplete: 'off', placeholder: '例如：王奶奶、陳伯伯', oninput: function () { p.name = nameIn.value; persist(); } });
    var hIn = h('input', { class: 'input', id: 'f-h', inputmode: 'decimal', value: p.heightCm || '', autocomplete: 'off', onchange: function () { p.heightCm = YD.validate.num(hIn.value, 100, 220, 1); persist(); } });
    var wIn = h('input', { class: 'input', id: 'f-w', inputmode: 'decimal', value: p.weightKg || '', autocomplete: 'off', onchange: function () { p.weightKg = YD.validate.num(wIn.value, 25, 200, 1); persist(); } });

    return h(
      'div',
      null,
      stepHead(2, '📋 基本資料', '只需要稱呼、性別和年齡；身高體重可以不填。', function () {
        return '基本資料。請告訴我們怎麼稱呼您、您的性別和年齡。';
      }),
      err,
      h(
        'div',
        { class: 'card' },
        h('h2', { id: 'lbl-mode' }, '這是第幾次評估？'),
        seg(
          [
            { value: 'new', label: '第一次評估', icon: '🌱' },
            { value: 'return', label: '之前做過（有長者編號）', icon: '🔁' }
          ],
          draft.mode,
          function (v) {
            draft.mode = v;
            if (v === 'new') {
              draft.elderCode = null;
              draft.history = null;
            }
            persist();
            lookupBox.hidden = v !== 'return';
          },
          { labelledby: 'lbl-mode', wide: true }
        )
      ),
      lookupBox,
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'field' }, h('label', { for: 'f-name' }, '怎麼稱呼您？'), h('p', { class: 'hint' }, '可以只寫姓氏或代號，保護您的隱私。'), nameIn),
        h('div', { class: 'field' },
          h('div', { class: 'label required', id: 'lbl-sex' }, '性別'),
          seg(
            [
              { value: 'F', label: '女性', icon: '👩' },
              { value: 'M', label: '男性', icon: '👨' }
            ],
            p.sex,
            function (v) {
              p.sex = v;
              persist();
            },
            { big: true, labelledby: 'lbl-sex' }
          )
        ),
        h('div', { class: 'field' },
          h('label', { class: 'required', for: 'f-age' }, '年齡'),
          stepper({ min: 50, max: 110, step: 1, decimals: 0, unit: '歲' }, p.age, function (v) { p.age = v; persist(); }, '年齡', 'f-age')
        )
      ),
      h(
        'details',
        { class: 'card howto', open: !!(p.heightCm || p.weightKg) },
        h('summary', null, '身高、體重（選填）'),
        h('div', { class: 'grid grid-2', style: { marginTop: '8px' } },
          h('div', { class: 'field' }, h('label', { for: 'f-h' }, '身高（公分）'), hIn),
          h('div', { class: 'field' }, h('label', { for: 'f-w' }, '體重（公斤）'), wIn)
        ),
        h('p', { class: 'hint' }, '💡 我們不用 BMI 判斷長者健康：BMI 抓不到肌少症與體脂分布，長者身高縮水也會讓 BMI 失真。我們改用 SFT 功能性體適能檢測，直接測量實際能力。')
      ),
      actions(
        function () {
          go(1);
        },
        function () {
          var errs = [];
          if (!p.sex) errs.push('請選擇性別');
          if (!(p.age >= 50 && p.age <= 110)) errs.push('請填寫年齡（50～110 歲）');
          if (errs.length) return showErrors(err, errs);
          go(3);
        }
      )
    );
  }

  /* ------------------------------------------------------------------ */
  /* Step 3 動作初篩                                                    */
  /* ------------------------------------------------------------------ */
  function step3() {
    var err = errorBox();
    var Qs = S().MOBILITY_QUESTIONS;
    var resultBox = h('div', { 'aria-live': 'polite' });
    var cards = [];
    function renderResult() {
      YD.dom.clear(resultBox);
      var r = S().routeVersion(draft.screening);
      if (!r.complete) return;
      var seated = r.version === 'seated';
      resultBox.appendChild(
        h(
          'div',
          { class: 'route-result ' + r.version },
          h('span', { class: 'big-icon', 'aria-hidden': 'true' }, seated ? '🪑' : '🚶'),
          h(
            'div',
            null,
            h('h2', { style: { margin: '0 0 4px' } }, seated ? '△ 自動切換：坐姿適應版處方' : '✓ 標準版處方'),
            h('p', { style: { margin: 0 } }, seated ? '為了安全，系統會以坐姿為主設計運動（例如坐姿踏步、彈力帶拉伸、坐姿重心轉移）。' + r.reasons.join('；') + '。' : '您可以進行站姿運動（例如快走、椅子坐站、單腳站立、太極拳），需要時再扶椅子。'),
            h('p', { class: 'small', style: { margin: '6px 0 0' } }, '沒有任何一位長者會因為身體比較虛弱而被放棄 —— 每個人都有適合自己的運動。')
          )
        )
      );
    }
    var list = h('div');
    Qs.forEach(function (q, i) {
      var c = h('div', { class: 'q-card' + (typeof draft.screening[q.id] === 'boolean' ? ' answered' : ''), id: 'q-' + q.id });
      c.appendChild(h('p', { class: 'q-text', id: 'lbl-' + q.id }, h('span', { class: 'q-icon', 'aria-hidden': 'true' }, q.icon), h('span', null, (i + 1) + '. ' + q.text)));
      if (q.hint) c.appendChild(h('p', { class: 'hint' }, q.hint));
      c.appendChild(
        yesNo(draft.screening[q.id], function (v) {
          draft.screening[q.id] = v;
          c.classList.add('answered');
          persist();
          renderResult();
          var next = cards[i + 1];
          if (next) {
            setTimeout(function () {
              next.scrollIntoView({ block: 'center', behavior: YD.figure.reduceMotion() ? 'auto' : 'smooth' });
              if (YD.store.settings().speech) YD.speech.speak(Qs[i + 1].text);
            }, 180);
          } else {
            setTimeout(function () {
              resultBox.scrollIntoView({ block: 'center' });
            }, 180);
          }
        }, 'lbl-' + q.id, '可以', '有困難')
      );
      cards.push(c);
      list.appendChild(c);
    });
    renderResult();
    return h(
      'div',
      null,
      stepHead(3, '🩺 動作初篩', '5 個是非題，系統會自動決定適合您的處方版本。', function () {
        return '動作初篩。' + Qs.map(function (q, i) { return '第' + (i + 1) + '題，' + q.text; }).join('');
      }),
      err,
      list,
      resultBox,
      actions(
        function () {
          go(2);
        },
        function () {
          var missing = Qs.filter(function (q) {
            return typeof draft.screening[q.id] !== 'boolean';
          });
          if (missing.length) return showErrors(err, missing.map(function (q) { return '請回答：' + q.text; }));
          go(4);
        }
      )
    );
  }

  /* ------------------------------------------------------------------ */
  /* Step 4 體適能測驗                                                  */
  /* ------------------------------------------------------------------ */
  function testDone(e) {
    return e && (e.unable || typeof e.value === 'number');
  }

  function testCard(t) {
    var e = draft.sft[t.key];
    var p = draft.profile;
    var norm = YD.norms.getNorm(t.key, p.sex, p.age);
    var statusEl = h('span', { class: 'test-status' });
    var card = h('section', { class: 'test-card', id: 'test-' + t.key, 'aria-labelledby': 'tt-' + t.key });
    function refresh() {
      var done = testDone(e);
      card.classList.toggle('done', !!done);
      YD.dom.clear(statusEl);
      statusEl.appendChild(
        done
          ? h('span', { class: 'badge low' }, h('span', { 'aria-hidden': 'true' }, '✓'), e.unable ? '已記錄：無法完成' : '已記錄：' + YD.norms.formatValue(t.key, e.value))
          : h('span', { class: 'badge neutral' }, '尚未完成')
      );
    }
    var st = stepper(t, e.value, function (v) {
      e.value = v;
      persist();
      refresh();
    }, t.name + '結果（' + t.unit + '）', 'in-' + t.key);
    var unable = h('input', {
      type: 'checkbox',
      checked: e.unable,
      onchange: function () {
        e.unable = unable.checked;
        if (e.unable) {
          e.value = null;
          st.input.value = '';
        }
        st.setDisabled(e.unable);
        persist();
        refresh();
      }
    });
    st.setDisabled(e.unable);
    var figBox = h('div', { class: 'fig-box' });
    var timerBtn = t.timer
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary',
            onclick: function () {
              YD.timer.open(t, function (v) {
                e.unable = false;
                unable.checked = false;
                st.setDisabled(false);
                e.value = v;
                st.input.value = t.decimals ? v.toFixed(t.decimals) : String(v);
                persist();
                refresh();
                YD.dom.announce(t.name + '已填入 ' + YD.norms.formatValue(t.key, v));
              });
            }
          },
          h('span', { 'aria-hidden': 'true' }, '⏱'),
          t.timer.type === 'stopwatch' ? '碼錶計時' : '開始計時 ' + (t.timer.seconds >= 60 ? t.timer.seconds / 60 + ' 分鐘' : t.timer.seconds + ' 秒')
        )
      : null;
    var timerHint = t.timer
      ? h('p', { class: 'hint', style: { margin: '0 0 12px' } }, t.timer.type === 'stopwatch' ? '可記錄 2 次，自動取最快的一次。' : '倒數結束會嗶聲提示；過程中點按大按鈕計次，結果自動填入。')
      : null;
    card.appendChild(
      h(
        'div',
        { class: 'test-head' },
        h('span', { style: { fontSize: '1.6rem' }, 'aria-hidden': 'true' }, t.icon),
        h('div', null, h('h2', { class: 'test-title', id: 'tt-' + t.key }, t.name), h('div', { class: 'small muted' }, t.domain)),
        statusEl
      )
    );
    card.appendChild(
      h(
        'div',
        { class: 'test-body' },
        h('div', null, figBox),
        h(
          'div',
          null,
          h('p', null, h('strong', null, '這項測什麼：'), t.why),
          h(
            'details',
            { class: 'howto' },
            h('summary', null, '施測方式（給工作人員）'),
            h('ol', null, t.howTo.map(function (s) { return h('li', null, s); })),
            h('p', { class: 'small' }, h('strong', null, '安全：'), t.safety)
          ),
          timerBtn ? h('div', { class: 'timer-launch' }, timerBtn) : null,
          timerHint,
          h('div', { class: 'field', style: { marginBottom: '10px' } }, h('label', { for: 'in-' + t.key }, '結果（' + t.unit + '）' + (t.allowNegative ? '：沒碰到記負數' : '')), st),
          h('label', { class: 'check' }, unable, h('span', null, '無法完成或不適合施測')),
          h('p', { class: 'norm-line' }, '參考：同齡常模（' + norm.band + ' 歲・' + (p.sex === 'M' ? '男' : '女') + '）' + YD.norms.formatNorm(t.key, norm))
        )
      )
    );
    var spec = YD.exercises.TEST_FIGURES[t.key];
    if (spec) YD.figure.mount(figBox, spec, { label: t.name + ' 示範動畫' });
    refresh();
    return card;
  }

  function step4() {
    var routeR = S().routeVersion(draft.screening);
    var cards = YD.norms.TESTS.map(testCard);
    return h(
      'div',
      null,
      stepHead(4, '🏃 體適能測驗', 'SFT 銀髮族功能性體適能 6 項檢測，可直接用平板計時、點按計次。', function () {
        return '體適能測驗，共六項：' + YD.norms.TESTS.map(function (t) { return t.name; }).join('、') + '。';
      }),
      h(
        'div',
        { class: 'alert info' },
        h('span', { class: 'icon', 'aria-hidden': 'true' }, '🛡️'),
        h('div', null,
          h('p', null, '檢測前先暖身（原地踏步、繞肩膀 3～5 分鐘）。過程中若有胸悶、頭暈、明顯喘或疼痛，請立即停止。'),
          routeR.version === 'seated' ? h('p', null, h('strong', null, '初篩結果為坐姿適應版：'), '請工作人員評估是否適合做「2 分鐘原地踏步」與「8 英呎起身繞行」，不適合時請勾選「無法完成或不適合施測」。') : null
        )
      ),
      cards,
      actions(
        function () {
          go(3);
        },
        function () {
          var left = YD.norms.TESTS.filter(function (t) {
            return !testDone(draft.sft[t.key]);
          });
          if (!left.length) return go(5);
          YD.dom
            .confirm(
              '還有 ' + left.length + ' 項沒有完成',
              '未完成的項目：' + left.map(function (t) { return t.name; }).join('、') + '。這些項目不會納入分析，確定要繼續嗎？',
              '繼續下一步'
            )
            .then(function (ok) {
              if (ok) go(5);
            });
        }
      )
    );
  }

  /* ------------------------------------------------------------------ */
  /* Step 5 健康狀況                                                    */
  /* ------------------------------------------------------------------ */
  function numField(id, label, value, min, max, onSet, hint) {
    var input = h('input', {
      class: 'input',
      id: id,
      inputmode: 'numeric',
      autocomplete: 'off',
      value: value === null || value === undefined ? '' : String(value),
      onchange: function () {
        onSet(YD.validate.num(input.value, min, max, 0));
        if (input.value && YD.validate.num(input.value, min, max, 0) === null) {
          input.setAttribute('aria-invalid', 'true');
          YD.dom.toast(label + '請填 ' + min + '～' + max);
        } else input.removeAttribute('aria-invalid');
      }
    });
    return h('div', { class: 'field' }, h('label', { for: id }, label), hint ? h('p', { class: 'hint' }, hint) : null, input);
  }

  function step5() {
    var err = errorBox();
    var hd = draft.health;
    function set(k) {
      return function (v) {
        hd[k] = v;
        persist();
      };
    }
    var noteIn = h('input', { class: 'input', id: 'f-note', maxlength: '100', value: hd.doctorNote, autocomplete: 'off', oninput: function () { hd.doctorNote = noteIn.value; persist(); } });
    var noteWrap = h('div', { class: 'field', hidden: hd.doctorRestriction !== true }, h('label', { for: 'f-note' }, '醫師的建議（選填）'), noteIn);

    return h(
      'div',
      null,
      stepHead(5, '❤️ 健康狀況', '這些資訊用於 ACSM 運動前安全篩檢，讓處方更安全。', function () {
        return '健康狀況。請告訴我們您有哪些慢性疾病、最近有沒有不舒服、平常的運動習慣和跌倒情形。';
      }),
      err,
      h(
        'section',
        { class: 'card' },
        h('h2', { id: 'lbl-cond' }, '1. 您有以下慢性疾病嗎？（可複選）'),
        chips(S().CONDITIONS, hd.conditions, function (sel, none) { hd.conditions = sel; hd.noneConditions = none; persist(); }, { labelledby: 'lbl-cond', noneLabel: '以上皆無', noneValue: hd.noneConditions })
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { id: 'lbl-sym' }, '2. 最近有沒有以下狀況？（有就點選）'),
        h('p', { class: 'hint' }, '這是 ACSM 運動前篩檢的重要問題，請仔細確認。'),
        chips(S().SYMPTOMS, hd.symptoms, function (sel, none) { hd.symptoms = sel; hd.noneSymptoms = none; persist(); }, { labelledby: 'lbl-sym', noneLabel: '以上都沒有', noneValue: hd.noneSymptoms })
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { id: 'lbl-act' }, '3. 過去 3 個月，您每週至少 3 天、每次 30 分鐘的運動嗎？'),
        h('p', { class: 'hint' }, '例如快走、太極拳、跳舞，運動時會有點喘的程度。'),
        yesNo(hd.active, set('active'), 'lbl-act', '是，有規律運動', '否，沒有')
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { id: 'lbl-falls' }, '4. 過去一年跌倒過幾次？'),
        seg(
          [
            { value: 0, label: '沒有跌倒' },
            { value: 1, label: '1 次' },
            { value: 2, label: '2 次以上' }
          ],
          hd.falls,
          set('falls'),
          { labelledby: 'lbl-falls' }
        ),
        h('h3', { id: 'lbl-unst', style: { marginTop: '18px' } }, '站立或走路時，常覺得不太穩嗎？'),
        yesNo(hd.unsteady, set('unsteady'), 'lbl-unst', '是', '否'),
        h('h3', { id: 'lbl-fear', style: { marginTop: '18px' } }, '您會擔心自己跌倒嗎？'),
        yesNo(hd.fearOfFalling, set('fearOfFalling'), 'lbl-fear', '會擔心', '不擔心')
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { id: 'lbl-pain' }, '5. 哪些部位常常會痛？（選填）'),
        chips(S().PAIN_AREAS, hd.painAreas, function (sel) { hd.painAreas = sel; persist(); }, { labelledby: 'lbl-pain' }),
        h('h3', { id: 'lbl-doc', style: { marginTop: '18px' } }, '醫師有建議您限制某些運動嗎？'),
        yesNo(hd.doctorRestriction, function (v) { hd.doctorRestriction = v; noteWrap.hidden = v !== true; persist(); }, 'lbl-doc', '有', '沒有'),
        noteWrap
      ),
      h(
        'details',
        { class: 'card howto', open: !!(hd.bpSys || hd.bpDia || hd.restingHr) },
        h('summary', null, '6. 血壓與心跳（選填，由工作人員測量）'),
        h('div', { class: 'grid grid-3', style: { marginTop: '8px' } },
          numField('f-sys', '收縮壓（mmHg）', hd.bpSys, 60, 260, set('bpSys')),
          numField('f-dia', '舒張壓（mmHg）', hd.bpDia, 30, 160, set('bpDia')),
          numField('f-hr', '安靜心跳（次/分）', hd.restingHr, 30, 200, set('restingHr'))
        ),
        h('p', { class: 'hint' }, '血壓 ≥ 180/110 時當天不宜運動；≥ 160/100 時只做輕度運動。')
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { id: 'lbl-goal' }, '7. 您運動是為了什麼？（最多選 3 項）'),
        chips(S().GOALS, hd.goals, function (sel) { hd.goals = sel; persist(); }, { labelledby: 'lbl-goal', max: 3 }),
        h('h3', { id: 'lbl-focus', style: { marginTop: '18px' } }, '最想加強哪個部位？（選填）'),
        chips(S().FOCUS_AREAS, hd.focusAreas, function (sel) { hd.focusAreas = sel; persist(); }, { labelledby: 'lbl-focus' }),
        h('h3', { id: 'lbl-pref', style: { marginTop: '18px' } }, '喜歡哪些運動？（選填）'),
        chips(S().PREFERENCES, hd.preferences, function (sel) { hd.preferences = sel; persist(); }, { labelledby: 'lbl-pref' })
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { id: 'lbl-days' }, '8. 每週可以運動幾天？'),
        seg([2, 3, 4, 5, 6, 7].map(function (d) { return { value: d, label: d + ' 天' }; }), hd.daysPerWeek, set('daysPerWeek'), { labelledby: 'lbl-days' }),
        h('h3', { id: 'lbl-min', style: { marginTop: '18px' } }, '每次大約多久？'),
        seg(YD.validate.MINUTES.map(function (m) { return { value: m, label: m + ' 分鐘' }; }), hd.minutesPerSession, set('minutesPerSession'), { labelledby: 'lbl-min' }),
        h('h3', { id: 'lbl-eq', style: { marginTop: '18px' } }, '家裡有哪些運動器材？'),
        chips(S().EQUIPMENT, hd.equipment, function (sel) { hd.equipment = sel; persist(); }, { labelledby: 'lbl-eq' }),
        h('p', { class: 'hint' }, '都沒有也沒關係，系統會改用不需要器材的動作。')
      ),
      actions(
        function () {
          go(4);
        },
        function () {
          var errs = [];
          if (!hd.conditions.length && !hd.noneConditions) errs.push('第 1 題：請選擇疾病，或點選「以上皆無」');
          if (!hd.symptoms.length && !hd.noneSymptoms) errs.push('第 2 題：請點選狀況，或選「以上都沒有」');
          if (typeof hd.active !== 'boolean') errs.push('第 3 題：請回答是否有規律運動');
          if (hd.falls === null || hd.falls === undefined) errs.push('第 4 題：請選擇過去一年跌倒次數');
          if (errs.length) return showErrors(err, errs);
          draft.saved = null;
          go(6);
        },
        '產生我的運動處方 →'
      )
    );
  }

  /* ------------------------------------------------------------------ */
  /* Step 6 AI 處方                                                     */
  /* ------------------------------------------------------------------ */
  function buildInput() {
    var hd = draft.health;
    return {
      elderCode: draft.elderCode,
      site: draft.site,
      consent: draft.consent,
      profile: { name: draft.profile.name, sex: draft.profile.sex, age: draft.profile.age, heightCm: draft.profile.heightCm, weightKg: draft.profile.weightKg, operator: draft.operator },
      screening: draft.screening,
      sft: draft.sft,
      health: {
        conditions: hd.conditions,
        symptoms: hd.symptoms,
        painAreas: hd.painAreas,
        goals: hd.goals,
        focusAreas: hd.focusAreas,
        preferences: hd.preferences,
        equipment: hd.equipment,
        active: hd.active,
        falls: hd.falls,
        unsteady: hd.unsteady === true,
        fearOfFalling: hd.fearOfFalling === true,
        doctorRestriction: hd.doctorRestriction === true,
        doctorNote: hd.doctorNote,
        bpSys: hd.bpSys,
        bpDia: hd.bpDia,
        restingHr: hd.restingHr,
        daysPerWeek: hd.daysPerWeek,
        minutesPerSession: hd.minutesPerSession
      }
    };
  }

  function generatingView() {
    var items = [
      ['📊', '對照 SFT 國際常模，計算各項百分位'],
      ['⚖️', '依 ACSM 篩檢與跌倒風險進行風險分級'],
      ['📋', '套用 FITT 原則，挑選適合的動作與劑量'],
      ['🤖', 'AI 撰寫您的個人化說明']
    ];
    var lis = items.map(function (it) {
      return h('li', null, h('span', { class: 'st', 'aria-hidden': 'true' }, it[0]), h('span', null, it[1]));
    });
    var box = h(
      'div',
      { class: 'card gen-box', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'gen-leaf', 'aria-hidden': 'true' }, '🌿'),
      h('h1', { tabindex: '-1', id: 'step-title' }, '正在為您產生專屬運動處方…'),
      h('p', { class: 'muted' }, '大約需要 5～20 秒，請稍候。'),
      h('ul', { class: 'gen-steps' }, lis)
    );
    box.mark = function (i, state) {
      var li = lis[i];
      if (!li) return;
      li.className = state;
      li.querySelector('.st').textContent = state === 'done' ? '✓' : items[i][0];
    };
    return box;
  }

  function wait(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function step6() {
    var wrap = h('div');
    if (draft.saved && draft.saved.record) {
      showResult(wrap, draft.saved.record, draft.saved.note);
      return wrap;
    }
    var input = buildInput();
    var ev = YD.assess.evaluate(input);
    if (!ev.ok) {
      wrap.appendChild(h('div', { class: 'alert stop' }, h('span', { class: 'icon' }, '⚠'), h('p', null, '資料不完整：' + ev.errors.join('、'))));
      wrap.appendChild(actions(function () { go(5); }, null));
      return wrap;
    }
    var gen = generatingView();
    wrap.appendChild(stepsNavHolder(6));
    wrap.appendChild(gen);
    var reduce = YD.figure.reduceMotion();
    var pace = reduce ? 150 : 650;
    gen.mark(0, 'doing');
    var aiPromise = YD.ai.generate(ev.input, ev, { timeoutMs: 30000 });
    wait(pace)
      .then(function () {
        gen.mark(0, 'done');
        gen.mark(1, 'doing');
        return wait(pace);
      })
      .then(function () {
        gen.mark(1, 'done');
        gen.mark(2, 'doing');
        return wait(pace);
      })
      .then(function () {
        gen.mark(2, 'done');
        gen.mark(3, 'doing');
        return aiPromise;
      })
      .then(function (nar) {
        gen.mark(3, 'done');
        var record = {
          elderCode: draft.elderCode || draft.replaceCode || null,
          createdAt: new Date().toISOString(),
          site: ev.input.site,
          demo: false,
          consent: ev.input.consent,
          profile: ev.input.profile,
          screening: ev.input.screening,
          sft: ev.input.sft,
          health: ev.input.health,
          result: YD.assess.snapshot(ev),
          narrative: { source: nar.source, model: nar.model || null, data: nar.data }
        };
        var replace = draft.replaceId
          ? YD.store.deleteOwn(draft.replaceId).catch(function () {
              return null;
            })
          : Promise.resolve(null);
        return replace
          .then(function () {
            draft.replaceId = null;
            return YD.store.saveAssessment(record);
          })
          .then(function (res) {
            record.id = res.id;
            record.elderCode = res.elderCode;
            record.createdAt = res.createdAt || record.createdAt;
            return { record: record, saved: true, aiError: nar.error };
          })
          .catch(function (e) {
            return { record: record, saved: false, saveError: e.message, aiError: nar.error };
          });
      })
      .then(function (r) {
        var note = r.saved
          ? '已儲存。長者編號 ' + r.record.elderCode + '，下次評估時提供這個編號，就能比較進步情形。'
          : '⚠ 處方已產生，但儲存失敗（' + r.saveError + '）。請先列印保存。';
        if (r.aiError) note += '（AI 暫時無法使用，已改由本機規則引擎撰寫說明。）';
        draft.saved = { record: r.record, note: note, saved: r.saved };
        persist();
        YD.dom.clear(wrap);
        showResult(wrap, r.record, note);
      });
    return wrap;
  }

  function stepsNavHolder(n) {
    return stepsNav(n);
  }

  function showResult(wrap, record, note) {
    YD.dom.clear(wrap);
    wrap.appendChild(stepsNav(6));
    var history = null;
    if (draft.history && draft.history.length) {
      history = draft.history
        .slice()
        .reverse()
        .concat([{ createdAt: record.createdAt, sft: record.sft, profile: record.profile }]);
    }
    var body = h('div');
    wrap.appendChild(body);
    var acts = [
      h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { root.print(); } }, h('span', { 'aria-hidden': 'true' }, '🖨'), '列印／存成 PDF'),
      YD.speech.supported
        ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { YD.speech.speak(YD.report.readAloudText(rendered.ev, rendered.narrative, record.profile.name)); } }, h('span', { 'aria-hidden': 'true' }, '🔊'), '朗讀重點')
        : null,
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: function () {
            YD.speech.stop();
            reset();
            root.location.hash = '#/';
          }
        },
        h('span', { 'aria-hidden': 'true' }, '🏠'),
        '完成，回到首頁'
      ),
      draft.saved && draft.saved.saved && record.id
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onclick: function () {
                YD.dom.confirm('刪除我的資料？', '這次的評估紀錄會從系統中永久刪除（已列印的紙本不受影響）。', '確定刪除', true).then(function (ok) {
                  if (!ok) return;
                  YD.store
                    .deleteOwn(record.id)
                    .then(function () {
                      reset();
                      root.location.hash = '#/';
                      YD.dom.toast('您的資料已刪除。');
                    })
                    .catch(function (e) {
                      YD.dom.toast('刪除失敗：' + e.message);
                    });
                });
              }
            },
            h('span', { 'aria-hidden': 'true' }, '🗑'),
            '刪除我的資料'
          )
        : null
    ];
    var noticeEl = note
      ? h('div', { class: 'alert ' + (draft.saved && draft.saved.saved ? 'ok' : 'caution'), role: 'status' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, draft.saved && draft.saved.saved ? '✓' : '!'), h('p', null, note))
      : null;
    var rendered = YD.report.render(body, record, { mode: 'elder', history: history, actions: acts, notice: noticeEl });
    var title = YD.dom.$('#report-title', body);
    if (title) {
      title.setAttribute('tabindex', '-1');
      title.focus();
    }
    if (YD.store.settings().speech) YD.speech.speak(YD.report.readAloudText(rendered.ev, rendered.narrative, record.profile.name));
  }

  /* ------------------------------------------------------------------ */
  /* 路由入口                                                           */
  /* ------------------------------------------------------------------ */
  var current = 1;
  function rerender() {
    show(container, current);
  }

  function show(el, n) {
    container = el;
    if (!draft) load();
    n = Math.max(1, Math.min(6, Number(n) || 1));
    if (n > draft.maxStep) {
      root.location.replace('#/assess/' + draft.maxStep);
      return;
    }
    if (n < 6 && draft.saved) {
      // 已產生處方後回到前面步驟：修改後重新產生，並取代先前儲存的那一筆
      if (draft.saved.saved && draft.saved.record) {
        draft.replaceId = draft.saved.record.id;
        draft.replaceCode = draft.saved.record.elderCode;
      }
      draft.saved = null;
      persist();
    }
    current = n;
    YD.speech.stop();
    YD.dom.clear(el);
    var view;
    if (n === 6) {
      view = step6();
      el.appendChild(view);
    } else {
      el.appendChild(stepsNav(n));
      view = [step1, step2, step3, step4, step5][n - 1]();
      el.appendChild(view);
    }
    root.scrollTo(0, 0);
    var t = YD.dom.$('#step-title', el);
    if (t) t.focus({ preventScroll: true });
    root.document.title = '步驟 ' + n + '：' + STEPS[n - 1].label + '｜銀動方程式';
    if (YD.store.settings().speech && n < 6) {
      var titles = ['請閱讀參與同意書', '請填寫基本資料', '動作初篩，請回答五個是非題', '體適能測驗，共六項', '請填寫健康狀況'];
      YD.speech.speak(titles[n - 1]);
    }
  }

  function start() {
    reset();
    persist();
    root.location.hash = '#/assess/1';
  }

  function hasDraft() {
    var d = YD.store.draft();
    return !!(d && d.v === 1 && d.maxStep > 1 && !(d.saved && d.saved.record));
  }

  YD.wizard = { show: show, start: start, hasDraft: hasDraft, reset: reset, STEPS: STEPS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
