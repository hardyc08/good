/*
 * 銀動方程式 — 圖表（HTML 版，無外部套件）
 * 原則：每個數值都以文字同步呈現（不需滑鼠懸停也讀得到），狀態色一律搭配圖示與文字，
 * 顏色經色盲安全檢查（見 app.css 圖表變數）。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var h = function () {
    return YD.dom.h.apply(null, arguments);
  };

  function statusOf(item) {
    if (item.unable) return { cls: 'crit', icon: '⚠', text: '無法完成' };
    if (item.status === 'below' && item.riskZone) return { cls: 'crit', icon: '⚠', text: '低於常模・需加強' };
    if (item.status === 'below') return { cls: 'warn', icon: '!', text: '低於常模' };
    if (item.status === 'above') return { cls: 'good', icon: '✓', text: '優於常模' };
    if (item.status === 'normal') return { cls: 'good', icon: '✓', text: '正常範圍' };
    return { cls: '', icon: '–', text: '未測' };
  }

  function statusPill(item) {
    var s = statusOf(item);
    return h('span', { class: 'status-pill ' + s.cls }, h('span', { 'aria-hidden': 'true' }, s.icon), s.text);
  }

  /** SFT 六項：個人百分位對照同齡常模（第 25–75 百分位）。 */
  function sftChart(score) {
    var N = YD.norms;
    var wrap = h('div', { class: 'sft-chart' });
    score.items.forEach(function (it) {
      var row = h('div', { class: 'sft-row' });
      var valueText = it.unable ? '無法完成' : it.measured ? N.formatValue(it.key, it.value) : '未測';
      row.appendChild(
        h(
          'div',
          { class: 'top' },
          h('div', null, h('span', { class: 'name' }, it.name), h('span', { class: 'domain' }, it.domain)),
          h('div', { class: 'row', style: { gap: '10px' } }, h('span', { class: 'val' }, valueText), statusPill(it))
        )
      );
      if (it.measured) {
        var s = statusOf(it);
        var pct = Math.max(1, Math.min(99, it.percentile || 1));
        var track = h(
          'div',
          {
            class: 'sft-track',
            role: 'img',
            'aria-label': it.name + '：約第 ' + pct + ' 百分位（同齡常模範圍為第 25 到 75 百分位），' + s.text
          },
          h('div', { class: 'rail' }),
          h('div', { class: 'band' }),
          h('div', { class: 'mark ' + s.cls, style: { left: pct + '%' }, title: '約第 ' + pct + ' 百分位' })
        );
        row.appendChild(track);
      }
      row.appendChild(
        h(
          'div',
          { class: 'sub' },
          h('span', null, '同齡常模（' + it.norm.band + ' 歲）：' + N.formatNorm(it.key, it.norm)),
          it.measured ? h('span', null, '約第 ' + it.percentile + ' 百分位') : null
        )
      );
      wrap.appendChild(row);
    });
    wrap.appendChild(
      h(
        'div',
        { class: 'sft-axis', 'aria-hidden': 'true' },
        h('span', null, '較弱'),
        h('span', null, '第 25'),
        h('span', null, '第 50'),
        h('span', null, '第 75'),
        h('span', null, '較強')
      )
    );
    wrap.appendChild(
      h(
        'div',
        { class: 'legend' },
        h('span', null, h('span', { class: 'sw', style: { background: 'var(--band)' } }), '同齡常模範圍（第 25～75 百分位）'),
        h('span', null, h('span', { class: 'sw dot', style: { background: 'var(--st-good)' } }), '✓ 正常／優於常模'),
        h('span', null, h('span', { class: 'sw dot', style: { background: 'var(--st-warn)' } }), '! 低於常模'),
        h('span', null, h('span', { class: 'sw dot', style: { background: 'var(--st-crit)' } }), '⚠ 需特別加強')
      )
    );
    return wrap;
  }

  /** 水平長條（風險分級、各項低於常模比例）。items: [{ label, icon, value, total, cls, note }] */
  function hbars(items, opts) {
    opts = opts || {};
    var max = opts.max || Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    var wrap = h('div', { class: 'hbars', role: 'list' });
    items.forEach(function (it) {
      var pct = it.total ? Math.round((it.value / it.total) * 100) : 0;
      var w = max ? (it.value / max) * 100 : 0;
      var num = opts.percentOnly ? pct + '%' : pct + '%（' + it.value + (opts.unit || ' 人') + '）';
      wrap.appendChild(
        h(
          'div',
          { class: 'hbar', role: 'listitem', 'aria-label': it.label + '：' + num },
          h('span', { class: 'lbl' }, it.icon ? h('span', { 'aria-hidden': 'true' }, it.icon) : null, it.label),
          h('span', { class: 'trk', 'aria-hidden': 'true' }, h('span', { class: 'fill ' + (it.cls || 'one'), style: { width: w + '%', display: 'block' } })),
          h('span', { class: 'num' }, num)
        )
      );
    });
    return wrap;
  }

  /** 分段長條（性別、處方版本）。parts: [{ label, value, cls }] */
  function segBar(parts, title) {
    var total = parts.reduce(function (s, p) { return s + p.value; }, 0) || 1;
    var bar = h('div', {
      class: 'segbar',
      role: 'img',
      'aria-label':
        title +
        '：' +
        parts
          .map(function (p) {
            return p.label + ' ' + p.value + ' 人（' + Math.round((p.value / total) * 100) + '%）';
          })
          .join('、')
    });
    parts.forEach(function (p) {
      if (!p.value) return;
      // 長條本身只呈現比例，名稱與數值由下方圖例以文字呈現（對比 ≥ 7:1）
      bar.appendChild(h('div', { class: 'part ' + p.cls, style: { flex: p.value + ' 1 0' }, title: p.label + ' ' + p.value + ' 人' }));
    });
    var legend = h('div', { class: 'legend' });
    parts.forEach(function (p) {
      legend.appendChild(
        h(
          'span',
          null,
          h('span', { class: 'sw', style: { background: 'var(--c-' + p.cls + ')' } }),
          p.label + '：' + p.value + ' 人（' + Math.round((p.value / total) * 100) + '%）'
        )
      );
    });
    return h('div', null, bar, legend);
  }

  /** 前後測比較（以同齡常模百分位為共同尺度）。history 由舊到新。 */
  function progress(history) {
    var N = YD.norms;
    var first = history[0];
    var last = history[history.length - 1];
    var s1 = N.scoreAll(first.sft, first.profile.sex, first.profile.age);
    var s2 = N.scoreAll(last.sft, last.profile.sex, last.profile.age);
    var wrap = h('div', { class: 'dumbbell' });
    var improved = 0;
    var compared = 0;
    N.TESTS.forEach(function (t) {
      var a = s1.byKey[t.key];
      var b = s2.byKey[t.key];
      if (!a.measured || !b.measured) return;
      compared++;
      var pa = a.percentile;
      var pb = b.percentile;
      var better;
      if (a.unable && !b.unable) better = true;
      else if (b.unable && !a.unable) better = false;
      else if (a.unable && b.unable) better = null;
      else better = t.higherIsBetter ? b.value > a.value : b.value < a.value;
      if (better) improved++;
      var same = !a.unable && !b.unable && a.value === b.value;
      var fmt = function (x) {
        return x.unable ? '無法完成' : N.formatValue(t.key, x.value);
      };
      var deltaText = same ? '持平' : better === true ? '進步' : better === false ? '退步' : '—';
      var lo = Math.min(pa, pb);
      var hi = Math.max(pa, pb);
      wrap.appendChild(
        h(
          'div',
          { class: 'db-row' },
          h(
            'div',
            { class: 'db-top' },
            h('span', null, t.name),
            h(
              'span',
              { class: better === true && !same ? 'delta-up' : better === false ? 'delta-down' : '' },
              fmt(a) + ' → ' + fmt(b) + '　',
              h('span', { 'aria-hidden': 'true' }, same ? '＝' : better ? '▲' : better === false ? '▼' : ''),
              ' ' + deltaText
            )
          ),
          h(
            'div',
            {
              class: 'db-track',
              role: 'img',
              'aria-label': t.name + '：前測約第 ' + pa + ' 百分位，最近一次約第 ' + pb + ' 百分位'
            },
            h('div', { class: 'rail' }),
            h('div', { class: 'band' }),
            h('div', { class: 'seg-line', style: { left: lo + '%', width: Math.max(0, hi - lo) + '%' } }),
            h('div', { class: 'pt pre', style: { left: pa + '%' }, title: '前測：第 ' + pa + ' 百分位' }),
            h('div', { class: 'pt post', style: { left: pb + '%' }, title: '最近：第 ' + pb + ' 百分位' })
          )
        )
      );
    });
    var head = h(
      'p',
      { class: 'muted' },
      '比較 ' + YD.dom.fmtDate(first.createdAt) + '（前測）與 ' + YD.dom.fmtDate(last.createdAt) + '（最近一次），' + compared + ' 項中有 ' + improved + ' 項進步。'
    );
    var legend = h(
      'div',
      { class: 'legend' },
      h('span', null, h('span', { class: 'sw dot', style: { background: 'var(--c-pre)' } }), '前測'),
      h('span', null, h('span', { class: 'sw dot', style: { background: 'var(--c-post)' } }), '最近一次'),
      h('span', null, h('span', { class: 'sw', style: { background: 'var(--band)' } }), '同齡常模範圍（第 25～75 百分位）')
    );
    return h('div', null, head, wrap, legend);
  }

  YD.charts = { sftChart: sftChart, hbars: hbars, segBar: segBar, progress: progress, statusOf: statusOf, statusPill: statusPill };
})(typeof globalThis !== 'undefined' ? globalThis : this);
