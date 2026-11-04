/*
 * 銀動方程式 — 主程式：路由、首頁、無障礙工具列
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var h = function () {
    return YD.dom.h.apply(null, arguments);
  };
  var app = null;

  var CREDITS = {
    school: '中國醫藥大學 運動醫學系',
    advisor: '曹榮穗 教授',
    team: '銀動方程式',
    event: '2026 北港盃 中醫大創新創意競賽・銀髮樂活教育組'
  };

  /* ------------------------------------------------------------------ */
  /* 無障礙工具列                                                       */
  /* ------------------------------------------------------------------ */
  var FONTS = [
    { v: 'normal', t: '標準' },
    { v: 'large', t: '大' },
    { v: 'xlarge', t: '特大' }
  ];
  var THEMES = [
    { v: 'auto', t: '自動', i: '🌓' },
    { v: 'light', t: '淺色', i: '☀️' },
    { v: 'dark', t: '深色', i: '🌙' }
  ];

  function applySettings() {
    var s = YD.store.settings();
    var html = root.document.documentElement;
    if (s.font === 'normal') html.removeAttribute('data-font');
    else html.setAttribute('data-font', s.font);
    if (s.theme === 'auto') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', s.theme);
    var f = FONTS.filter(function (x) { return x.v === s.font; })[0] || FONTS[0];
    var th = THEMES.filter(function (x) { return x.v === s.theme; })[0] || THEMES[0];
    var fl = YD.dom.$('#font-label');
    if (fl) fl.textContent = '字級：' + f.t;
    var fb = YD.dom.$('#btn-font');
    if (fb) fb.setAttribute('aria-label', '字體大小：' + f.t + '（按一下切換）');
    var tl = YD.dom.$('#theme-label');
    if (tl) tl.textContent = th.t;
    var ti = YD.dom.$('#theme-icon');
    if (ti) ti.textContent = th.i;
    var tb = YD.dom.$('#btn-theme');
    if (tb) tb.setAttribute('aria-label', '顯示模式：' + th.t + '（按一下切換）');
    var sb = YD.dom.$('#btn-speech');
    if (sb) {
      sb.setAttribute('aria-pressed', s.speech ? 'true' : 'false');
      sb.setAttribute('aria-label', '語音導覽' + (s.speech ? '（已開啟）' : '（已關閉）'));
      sb.hidden = !YD.speech.supported;
    }
  }

  function setupTools() {
    YD.dom.$('#btn-font').addEventListener('click', function () {
      var s = YD.store.settings();
      var i = FONTS.map(function (f) { return f.v; }).indexOf(s.font);
      var next = FONTS[(i + 1) % FONTS.length];
      YD.store.saveSettings({ font: next.v });
      applySettings();
      YD.dom.announce('字體大小：' + next.t);
    });
    YD.dom.$('#btn-theme').addEventListener('click', function () {
      var s = YD.store.settings();
      var i = THEMES.map(function (t) { return t.v; }).indexOf(s.theme);
      var next = THEMES[(i + 1) % THEMES.length];
      YD.store.saveSettings({ theme: next.v });
      applySettings();
      YD.dom.announce('顯示模式：' + next.t);
    });
    YD.dom.$('#btn-speech').addEventListener('click', function () {
      var s = YD.store.saveSettings({ speech: !YD.store.settings().speech });
      applySettings();
      YD.sound.unlock();
      if (s.speech) YD.speech.speak('語音導覽已開啟。每一頁都可以按「朗讀」按鈕聽內容。');
      else YD.speech.stop();
      YD.dom.toast(s.speech ? '🔊 語音導覽已開啟' : '語音導覽已關閉');
    });
  }

  /* ------------------------------------------------------------------ */
  /* 首頁                                                               */
  /* ------------------------------------------------------------------ */
  function landing(el) {
    root.document.title = '銀動方程式｜銀髮個人化運動處方';
    YD.dom.clear(el);
    var resume = YD.wizard.hasDraft();
    el.appendChild(
      h(
        'section',
        { class: 'hero', 'aria-labelledby': 'hero-title' },
        h('div', { class: 'leaf', 'aria-hidden': 'true' }, '🌿'),
        h('h1', { id: 'hero-title', tabindex: '-1' }, '銀動方程式'),
        h('p', { class: 'en' }, 'The Senior Movement Equation'),
        h('p', { class: 'tagline' }, 'AI 驅動的銀髮個人化運動處方系統'),
        h('p', { class: 'muted' }, '讓每位長者都找到屬於自己的運動方程式'),
        h(
          'div',
          { class: 'cta' },
          h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: function () { YD.sound.unlock(); YD.wizard.start(); } }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '▶'), '開始評估（約 5 分鐘）'),
          resume ? h('a', { class: 'btn btn-secondary', href: '#/assess' }, '繼續上次未完成的評估') : null,
          h('p', { class: 'small muted', style: { margin: 0 } }, '之前做過評估？開始後在「基本資料」輸入長者編號，就能比較進步情形。')
        )
      )
    );

    el.appendChild(h('h2', { class: 'section-title' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '🧮'), '三個變數，一份專屬處方'));
    el.appendChild(
      h(
        'div',
        { class: 'grid grid-3' },
        varCard('⏱', '5', '分鐘', '快速評估', '從填寫到拿到處方，過程不超過 5 分鐘'),
        varCard('🔬', '3', '大標準', '運動醫學基礎', 'SFT 國際常模・ACSM 風險分級・FITT 處方原則'),
        varCard('🤖', 'AI', '', '個人化生成', '依長者個別狀況，自動產出專屬運動方案')
      )
    );
    el.appendChild(h('p', { class: 'equals' }, '＝ 專屬於每位長者的運動處方'));

    el.appendChild(h('h2', { class: 'section-title' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '🧭'), '系統流程：六步驟'));
    el.appendChild(
      h(
        'ol',
        { class: 'flow' },
        YD.wizard.STEPS.map(function (s) {
          return h(
            'li',
            { class: s.n === 3 ? 'key' : null },
            h('span', { class: 'n' }, 'Step ' + s.n),
            h('span', { class: 'i', 'aria-hidden': 'true' }, s.icon),
            h('span', { class: 't' }, s.label)
          );
        })
      )
    );
    el.appendChild(
      h(
        'div',
        { class: 'card soft', style: { marginTop: '16px' } },
        h('h3', null, '⚡ 關鍵創新：Step 3 動作初篩自動分流'),
        h('p', null, '系統透過 5 個是非題判斷長者的動作能力，自動切換處方版本——沒有任何一位長者會因為身體比較虛弱就被放棄。'),
        h(
          'div',
          { class: 'grid grid-2' },
          h('div', { class: 'route-result standard' }, h('span', { class: 'big-icon', 'aria-hidden': 'true' }, '🚶'), h('div', null, h('strong', null, '✓ 標準版處方'), h('p', { style: { margin: 0 } }, '快走、椅子坐站、單腳站立、太極拳…'))),
          h('div', { class: 'route-result seated' }, h('span', { class: 'big-icon', 'aria-hidden': 'true' }, '🪑'), h('div', null, h('strong', null, '△ 坐姿適應版'), h('p', { style: { margin: 0 } }, '坐姿踏步、彈力帶拉伸、坐姿重心轉移…')))
        )
      )
    );

    el.appendChild(h('h2', { class: 'section-title' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '🛡️'), '我們認真對待每一筆資料'));
    el.appendChild(
      h(
        'div',
        { class: 'grid grid-3' },
        promise('🔒', '個資保護', ['符合個資法第 8 條告知義務', '姓名以稱呼或代號記錄，研究分析去識別化']),
        promise('📋', '知情同意', ['系統第一步就是同意書', '可隨時退出，不需要理由']),
        promise('🗑️', '資料銷毀', ['計畫結束後資料適時刪除', '不轉售、不作商業利用'])
      )
    );

    el.appendChild(
      h(
        'p',
        { class: 'muted', style: { marginTop: '28px', textAlign: 'center' } },
        CREDITS.school + '・指導教師：' + CREDITS.advisor + '・團隊：' + CREDITS.team
      )
    );
    var t = YD.dom.$('#hero-title', el);
    if (t) t.focus({ preventScroll: true });
  }

  function varCard(icon, big, unit, title, text) {
    return h(
      'div',
      { class: 'card var-card' },
      h('div', { class: 'icon', 'aria-hidden': 'true' }, icon),
      h('div', { class: 'big' }, big, unit ? h('small', null, unit) : null),
      h('h3', { style: { margin: '6px 0 4px' } }, title),
      h('p', { class: 'muted', style: { margin: 0 } }, text)
    );
  }

  function promise(icon, title, items) {
    return h(
      'div',
      { class: 'card' },
      h('h3', null, h('span', { 'aria-hidden': 'true' }, icon + ' '), title),
      h(
        'ul',
        { style: { margin: 0, paddingLeft: '1.2em' } },
        items.map(function (i) {
          return h('li', null, i);
        })
      )
    );
  }

  /* ------------------------------------------------------------------ */
  /* 關於與無障礙聲明                                                   */
  /* ------------------------------------------------------------------ */
  function about(el) {
    root.document.title = '關於與無障礙聲明｜銀動方程式';
    YD.dom.clear(el);
    el.appendChild(h('h1', { tabindex: '-1', id: 'about-title' }, '關於銀動方程式'));
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '🎯 我們想解決的問題'),
        h('p', null, '在社區服務學習中，我們看到許多長輩很認真運動，卻因為不知道正確的方法而效果不彰，甚至受傷。市售健身 App 不夠友善、紙本衛教單無法個人化、一對一諮詢成本太高——銀動方程式用運動醫學的專業，把個人化運動處方帶進社區。')
      )
    );
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '📚 專業基礎與參考文獻'),
        h(
          'ul',
          null,
          [
            'Rikli, R. E., & Jones, C. J. (2013). Senior Fitness Test Manual (2nd ed.). Human Kinetics.',
            'Rikli, R. E., & Jones, C. J. (1999). Functional fitness normative scores for community-residing older adults, ages 60–94. Journal of Aging and Physical Activity, 7(2), 162–181.',
            'American College of Sports Medicine. (2021). ACSM’s Guidelines for Exercise Testing and Prescription (11th ed.). Wolters Kluwer.',
            'Riebe, D., et al. (2015). Updating ACSM’s recommendations for exercise preparticipation health screening. Medicine & Science in Sports & Exercise, 47(11), 2473–2479.',
            'Chodzko-Zajko, W. J., et al. (2009). Exercise and physical activity for older adults. Medicine & Science in Sports & Exercise, 41(7), 1510–1530.',
            'Rose, D. J., Jones, C. J., & Lucchese, N. (2002). Predicting the probability of falls in community-residing older adults using the 8-foot up-and-go. Journal of Aging and Physical Activity, 10(4), 466–475.',
            'Centers for Disease Control and Prevention. STEADI – Stopping Elderly Accidents, Deaths & Injuries.',
            'World Health Organization. (2020). WHO guidelines on physical activity and sedentary behaviour.'
          ].map(function (r) {
            return h('li', null, r);
          })
        )
      )
    );
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '♿ 無障礙聲明（目標：WCAG 2.1 AAA）'),
        h(
          'ul',
          null,
          [
            '文字對比：所有文字與背景對比 ≥ 7:1（實測最低 8.09:1），淺色與深色模式皆符合。',
            '觸控尺寸：按鈕與選項至少 52 × 52 像素，主要按鈕 56～68 像素。',
            '字體大小：基本字級 18 像素，可切換「大」20 像素與「特大」22 像素。',
            '鍵盤操作：所有功能皆可用鍵盤完成，焦點框清楚可見；選項支援方向鍵。',
            '色盲友善：狀態一律以「圖示＋文字＋顏色」呈現；圖表配色通過色盲模擬檢查。',
            '語音導覽：可開啟朗讀，每一頁與每個動作都能唸給長輩聽。',
            '動態效果：尊重系統「減少動態效果」設定，示範動畫改為手動切換。',
            '螢幕報讀：表單皆有標籤，進度與結果以即時區域播報。'
          ].map(function (r) {
            return h('li', null, r);
          })
        )
      )
    );
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '👥 團隊'),
        h('p', null, CREDITS.school + '・指導教師：' + CREDITS.advisor),
        h('p', null, CREDITS.event),
        h('p', { class: 'muted' }, '本系統提供運動建議，不取代醫師診斷與治療。運動中如有任何不適，請立即停止並就醫。')
      )
    );
    el.appendChild(h('p', null, h('a', { class: 'btn btn-secondary', href: '#/' }, '← 回到首頁')));
    YD.dom.$('#about-title', el).focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */
  /* 路由                                                               */
  /* ------------------------------------------------------------------ */
  function route() {
    var hash = root.location.hash || '#/';
    var parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    YD.speech.stop();
    if (parts[0] === 'assess') {
      if (!parts[1]) {
        var d = YD.store.draft();
        root.location.replace('#/assess/' + (d && d.maxStep ? d.maxStep : 1));
        return;
      }
      YD.wizard.show(app, parts[1]);
    } else if (parts[0] === 'admin') {
      YD.admin.show(app, parts.slice(1));
    } else if (parts[0] === 'about') {
      about(app);
    } else {
      landing(app);
    }
    root.scrollTo(0, 0);
  }

  function boot() {
    app = YD.dom.$('#app');
    applySettings();
    setupTools();
    YD.report.setupPrint();
    YD.store.init().then(function () {
      root.addEventListener('hashchange', route);
      route();
    });
    if ('serviceWorker' in root.navigator && root.location.protocol === 'https:') {
      root.navigator.serviceWorker.register('sw.js').catch(function () {
        /* 離線功能非必要 */
      });
    }
  }

  YD.app = { CREDITS: CREDITS, route: route };
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
