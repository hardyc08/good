/*
 * 銀動方程式 — 後台管理系統
 * 總覽統計、長者紀錄、單筆處方與進步比較、CSV 匯出匯入、示範資料、設定（AI、密碼、QR Code）。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var h = function () {
    return YD.dom.h.apply(null, arguments);
  };

  var TABS = [
    { id: 'overview', label: '📊 總覽', hash: '#/admin' },
    { id: 'records', label: '👥 長者紀錄', hash: '#/admin/records' },
    { id: 'data', label: '📁 匯出／匯入', hash: '#/admin/data' },
    { id: 'settings', label: '⚙️ 設定', hash: '#/admin/settings' }
  ];
  var ui = { masked: true, q: '', risk: '', version: '', sex: '' };

  function tabs(active) {
    return h(
      'nav',
      { class: 'admin-tabs no-print', 'aria-label': '後台功能' },
      TABS.map(function (t) {
        return h('a', { href: t.hash, 'aria-current': t.id === active ? 'page' : null }, t.label);
      })
    );
  }

  function modePill() {
    var remote = YD.store.state.mode === 'remote';
    return h('span', { class: 'mode-pill' }, h('span', { 'aria-hidden': 'true' }, remote ? '☁️' : '💾'), remote ? '雲端模式（Netlify Blobs）' : '本機模式（資料存在此裝置）');
  }

  function header(title, active) {
    return h(
      'div',
      null,
      h(
        'div',
        { class: 'row between no-print', style: { marginBottom: '12px' } },
        h('div', null, h('p', { class: 'step-kicker' }, '🌿 銀動方程式・後台管理系統'), h('h1', { tabindex: '-1', id: 'admin-title', style: { margin: 0 } }, title)),
        h(
          'div',
          { class: 'row' },
          modePill(),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost btn-sm no-print',
              onclick: function () {
                YD.store.logout();
                root.location.hash = '#/';
                YD.dom.toast('已登出後台');
              }
            },
            '登出'
          )
        )
      ),
      tabs(active)
    );
  }

  function loading(el) {
    YD.dom.clear(el);
    el.appendChild(h('div', { class: 'empty', role: 'status' }, '資料載入中…'));
  }
  function failed(el, e) {
    YD.dom.clear(el);
    el.appendChild(h('div', { class: 'alert stop', role: 'alert' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '⚠'), h('p', null, '讀取資料失敗：' + e.message)));
    if (e.status === 401) {
      YD.store.logout();
      setTimeout(function () {
        root.location.hash = '#/admin';
      }, 1200);
    }
  }

  /** 依長者編號分組：每位長者的最新紀錄與全部紀錄（由舊到新）。 */
  function groupElders(records) {
    var map = {};
    records.forEach(function (r) {
      var k = r.elderCode || r.id;
      (map[k] = map[k] || []).push(r);
    });
    return Object.keys(map).map(function (k) {
      var list = map[k].slice().sort(function (a, b) {
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });
      return { code: k, latest: list[list.length - 1], all: list };
    });
  }

  function resultOf(r) {
    if (r.result && r.result.risk) return r.result;
    return YD.assess.snapshot(YD.assess.evaluate(r));
  }

  /* ------------------------------------------------------------------ */
  /* 登入                                                               */
  /* ------------------------------------------------------------------ */
  function loginView(el, next) {
    var err = h('p', { class: 'error-text', role: 'alert', hidden: true });
    var pw = h('input', { class: 'input', id: 'f-pw', type: 'password', autocomplete: 'current-password' });
    var remote = YD.store.state.mode === 'remote';
    var form = h(
      'form',
      {
        class: 'card login-card',
        onsubmit: function (e) {
          e.preventDefault();
          err.hidden = true;
          btn.disabled = true;
          YD.store
            .login(pw.value)
            .then(function (res) {
              if (res && res.usingDefault) YD.dom.toast('您正在使用預設密碼，請到「設定」修改。', 5000);
              next();
            })
            .catch(function (e2) {
              err.textContent = e2.status === 401 || /密碼/.test(e2.message) ? '密碼不正確，請再試一次。' : '登入失敗：' + e2.message;
              err.hidden = false;
              pw.focus();
            })
            .then(function () {
              btn.disabled = false;
            });
        }
      },
      h('h1', { tabindex: '-1', id: 'admin-title' }, '🔒 後台管理登入'),
      h('p', { class: 'muted' }, '供據點工作人員、個管師查看長者紀錄與匯出資料。'),
      h('div', { class: 'field' }, h('label', { for: 'f-pw' }, '管理密碼'), pw, err),
      h('p', { class: 'hint' }, remote ? '雲端模式：密碼為 Netlify 環境變數 ADMIN_PASSWORD 的值。' : '本機模式：首次使用請以 README 中的預設密碼登入，並立即到「設定」修改。'),
      null
    );
    var btn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, '登入');
    form.appendChild(btn);
    form.appendChild(h('p', { style: { marginTop: '14px' } }, modePill()));
    YD.dom.clear(el);
    el.appendChild(form);
    pw.focus();
  }

  /* ------------------------------------------------------------------ */
  /* 總覽                                                               */
  /* ------------------------------------------------------------------ */
  function overview(el) {
    YD.dom.clear(el);
    el.appendChild(header('總覽', 'overview'));
    var body = h('div');
    el.appendChild(body);
    loading(body);
    YD.store
      .list()
      .then(function (records) {
        YD.dom.clear(body);
        var elders = groupElders(records);
        if (!elders.length) {
          body.appendChild(h('div', { class: 'card empty' }, h('p', null, '目前還沒有任何評估紀錄。'), h('a', { class: 'btn btn-primary', href: '#/admin/data' }, '載入示範資料或匯入 CSV')));
          return;
        }
        var latest = elders.map(function (e) {
          return e.latest;
        });
        var demoCount = records.filter(function (r) {
          return r.demo;
        }).length;
        if (demoCount) {
          body.appendChild(
            h(
              'div',
              { class: 'alert caution' },
              h('span', { class: 'icon', 'aria-hidden': 'true' }, '!'),
              h('div', null, h('p', null, h('strong', null, '目前包含 ' + demoCount + ' 筆示範資料（模擬數據）'), '，依簡報統計值產生，僅供展示。正式使用前請到「匯出／匯入」清除示範資料並匯入真實紀錄。'))
            )
          );
        }
        var n = latest.length;
        var ages = latest.map(function (r) {
          return Number(r.profile.age) || 0;
        });
        var meanAge = ages.reduce(function (a, b) { return a + b; }, 0) / n;
        var complete = latest.filter(YD.assess.isComplete).length;
        var males = latest.filter(function (r) { return r.profile.sex === 'M'; }).length;
        var res = latest.map(resultOf);
        var cnt = { low: 0, moderate: 0, high: 0 };
        res.forEach(function (r) { cnt[r.risk]++; });
        var seated = res.filter(function (r) { return r.version === 'seated'; }).length;
        var highSeated = res.filter(function (r) { return r.risk === 'high' && r.version === 'seated'; }).length;

        body.appendChild(
          h(
            'div',
            { class: 'kpis' },
            kpi('長者人數', String(n), '位'),
            kpi('平均年齡', meanAge.toFixed(1), '歲'),
            kpi('完成率', Math.round((complete / n) * 100) + '%', ''),
            kpi('評估總次數', String(records.length), '次')
          )
        );

        var grid = h('div', { class: 'grid grid-2' });
        grid.appendChild(
          h(
            'section',
            { class: 'card' },
            h('h2', null, '⚖️ 系統自動風險分級結果'),
            YD.charts.hbars(
              [
                { label: '低風險', icon: '✓', value: cnt.low, total: n, cls: 'low' },
                { label: '中風險', icon: '!', value: cnt.moderate, total: n, cls: 'moderate' },
                { label: '高風險', icon: '⚠', value: cnt.high, total: n, cls: 'high' }
              ],
              { max: n }
            ),
            cnt.high ? h('p', { class: 'muted', style: { marginTop: '12px' } }, '✦ ' + highSeated + ' 位高風險長者，系統已自動切換為「坐姿適應版」處方。') : null
          )
        );
        grid.appendChild(
          h(
            'section',
            { class: 'card' },
            h('h2', null, '👥 性別分布'),
            YD.charts.segBar(
              [
                { label: '男', value: males, cls: 'male' },
                { label: '女', value: n - males, cls: 'female' }
              ],
              '性別分布'
            ),
            h('h2', { style: { marginTop: '22px' } }, '📋 處方版本'),
            YD.charts.segBar(
              [
                { label: '標準版', value: n - seated, cls: 'std' },
                { label: '坐姿適應版', value: seated, cls: 'seated' }
              ],
              '處方版本'
            )
          )
        );
        body.appendChild(grid);

        // 各項低於常模比例
        var items = YD.norms.TESTS.map(function (t) {
          var measured = 0;
          var below = 0;
          res.forEach(function (r) {
            var s = r.sft && r.sft[t.key];
            if (!s || s.status === 'missing') return;
            measured++;
            if (s.status === 'below' || s.status === 'unable') below++;
          });
          return { label: t.name, value: below, total: measured || 1, measured: measured };
        }).sort(function (a, b) {
          return b.value / b.total - a.value / a.total;
        });
        body.appendChild(
          h(
            'section',
            { class: 'card' },
            h('h2', null, '📊 各項體適能低於同齡常模的比例'),
            h('p', { class: 'muted' }, '比例越高，代表越多長者需要加強這項能力，可作為據點團體課程規劃的參考。'),
            h(
              'div',
              { class: 'hbars', style: { '--lbl': '12em' } },
              items.map(function (it) {
                var pct = Math.round((it.value / it.total) * 100);
                return h(
                  'div',
                  { class: 'hbar', style: { gridTemplateColumns: 'minmax(8em, 13em) minmax(0, 1fr) auto' }, role: 'img', 'aria-label': it.label + '：' + pct + '%（' + it.value + ' 人）' },
                  h('span', { class: 'lbl' }, it.label),
                  h('span', { class: 'trk', 'aria-hidden': 'true' }, h('span', { class: 'fill one', style: { width: pct + '%', display: 'block' } })),
                  h('span', { class: 'num' }, pct + '%（' + it.value + ' 人）')
                );
              })
            )
          )
        );

        // 近期評估
        var recent = records.slice(0, 6);
        body.appendChild(
          h(
            'section',
            { class: 'card' },
            h('div', { class: 'row between' }, h('h2', { style: { margin: 0 } }, '🕒 近期評估'), h('a', { href: '#/admin/records' }, '查看全部 →')),
            h(
              'ul',
              { class: 'reasons', style: { marginTop: '12px' } },
              recent.map(function (r) {
                var rs = resultOf(r);
                return h(
                  'li',
                  { style: { alignItems: 'center' } },
                  h('span', { class: 'muted nowrap' }, YD.dom.fmtDate(r.createdAt)),
                  h('a', { href: '#/admin/record/' + encodeURIComponent(r.id), style: { fontWeight: 800 } }, displayName(r)),
                  YD.dom.riskBadge(rs.risk, rs.riskText),
                  r.demo ? h('span', { class: 'badge demo' }, '示範') : null
                );
              })
            )
          )
        );
      })
      .catch(function (e) {
        failed(body, e);
      });
  }

  function kpi(label, value, unit) {
    return h('div', { class: 'kpi' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value, unit ? h('small', null, unit) : null));
  }

  function displayName(r) {
    var n = r.profile && r.profile.name;
    if (!n) return r.elderCode || '（未填稱呼）';
    return ui.masked ? YD.dom.maskName(n) : n;
  }

  /* ------------------------------------------------------------------ */
  /* 長者紀錄列表                                                       */
  /* ------------------------------------------------------------------ */
  function recordsView(el) {
    YD.dom.clear(el);
    el.appendChild(header('長者紀錄', 'records'));
    var body = h('div');
    el.appendChild(body);
    loading(body);
    YD.store
      .list()
      .then(function (records) {
        YD.dom.clear(body);
        var elders = groupElders(records);
        var tableHolder = h('div');
        var countEl = h('p', { class: 'muted', 'aria-live': 'polite' });
        function select(id, label, opts, key) {
          var s = h(
            'select',
            {
              class: 'input',
              id: id,
              onchange: function () {
                ui[key] = s.value;
                draw();
              }
            },
            opts.map(function (o) {
              return h('option', { value: o[0], selected: ui[key] === o[0] }, o[1]);
            })
          );
          return h('div', { class: 'field', style: { margin: 0 } }, h('label', { for: id }, label), s);
        }
        var search = h('input', {
          class: 'input',
          id: 'f-q',
          type: 'search',
          value: ui.q,
          placeholder: '稱呼或長者編號',
          oninput: function () {
            ui.q = search.value;
            draw();
          }
        });
        var mask = h('input', {
          type: 'checkbox',
          checked: ui.masked,
          onchange: function () {
            ui.masked = mask.checked;
            draw();
          }
        });
        body.appendChild(
          h(
            'div',
            { class: 'filters' },
            h('div', { class: 'field', style: { margin: 0 } }, h('label', { for: 'f-q' }, '搜尋'), search),
            select('f-risk', '風險分級', [['', '全部'], ['low', '低風險'], ['moderate', '中風險'], ['high', '高風險']], 'risk'),
            select('f-ver', '處方版本', [['', '全部'], ['standard', '標準版'], ['seated', '坐姿適應版']], 'version'),
            select('f-sex', '性別', [['', '全部'], ['F', '女'], ['M', '男']], 'sex')
          )
        );
        body.appendChild(h('label', { class: 'check', style: { maxWidth: '520px', marginBottom: '12px' } }, mask, h('span', null, '去識別化顯示姓名（例如 王○明）')));
        body.appendChild(countEl);
        body.appendChild(tableHolder);

        function draw() {
          var q = ui.q.trim().toLowerCase();
          var rows = elders.filter(function (e) {
            var r = e.latest;
            var rs = resultOf(r);
            if (ui.risk && rs.risk !== ui.risk) return false;
            if (ui.version && rs.version !== ui.version) return false;
            if (ui.sex && r.profile.sex !== ui.sex) return false;
            if (q && String(r.profile.name || '').toLowerCase().indexOf(q) === -1 && String(e.code).toLowerCase().indexOf(q) === -1) return false;
            return true;
          });
          rows.sort(function (a, b) {
            return String(a.code).localeCompare(String(b.code));
          });
          countEl.textContent = '共 ' + rows.length + ' 位長者（' + elders.length + ' 位中）';
          YD.dom.clear(tableHolder);
          if (!rows.length) {
            tableHolder.appendChild(h('div', { class: 'card empty' }, '沒有符合條件的紀錄。'));
            return;
          }
          var table = h(
            'table',
            { class: 'data' },
            h('caption', { class: 'sr-only' }, '長者評估紀錄'),
            h(
              'thead',
              null,
              h('tr', null, ['長者', '編號', '性別', '年齡', '風險', '處方版本', '最近評估', '次數'].map(function (t) {
                return h('th', { scope: 'col' }, t);
              }))
            ),
            h(
              'tbody',
              null,
              rows.map(function (e) {
                var r = e.latest;
                var rs = resultOf(r);
                return h(
                  'tr',
                  null,
                  h('td', null, h('a', { class: 'rowlink', href: '#/admin/record/' + encodeURIComponent(r.id) }, displayName(r)), r.demo ? h('span', { class: 'badge demo', style: { marginLeft: '6px' } }, '示範') : null),
                  h('td', { class: 'num' }, e.code),
                  h('td', null, r.profile.sex === 'M' ? '男' : '女'),
                  h('td', { class: 'num' }, String(r.profile.age)),
                  h('td', null, YD.dom.riskBadge(rs.risk, rs.riskText)),
                  h('td', null, YD.dom.versionBadge(rs.version, rs.versionText)),
                  h('td', { class: 'num' }, YD.dom.fmtDate(r.createdAt)),
                  h('td', { class: 'num' }, String(e.all.length))
                );
              })
            )
          );
          tableHolder.appendChild(h('div', { class: 'table-wrap' }, table));
        }
        draw();
      })
      .catch(function (e) {
        failed(body, e);
      });
  }

  /* ------------------------------------------------------------------ */
  /* 單筆紀錄                                                           */
  /* ------------------------------------------------------------------ */
  function recordView(el, id) {
    YD.dom.clear(el);
    el.appendChild(header('長者紀錄詳細', 'records'));
    var body = h('div');
    el.appendChild(body);
    loading(body);
    YD.store
      .list()
      .then(function (records) {
        var rec = records.filter(function (r) {
          return r.id === id;
        })[0];
        if (!rec) throw new Error('找不到這筆紀錄（可能已被刪除）');
        var all = records
          .filter(function (r) {
            return (r.elderCode || r.id) === (rec.elderCode || rec.id);
          })
          .sort(function (a, b) {
            return String(a.createdAt).localeCompare(String(b.createdAt));
          });
        YD.dom.clear(body);
        body.appendChild(h('p', { class: 'no-print' }, h('a', { href: '#/admin/records' }, '← 回到長者紀錄')));
        if (all.length > 1) {
          body.appendChild(
            h(
              'div',
              { class: 'card soft no-print' },
              h('h2', { style: { fontSize: '1.15rem' } }, '這位長者的評估紀錄（' + all.length + ' 次）'),
              h(
                'div',
                { class: 'row' },
                all.map(function (r, i) {
                  var cur = r.id === rec.id;
                  return h(
                    'a',
                    { class: 'btn btn-sm ' + (cur ? 'btn-primary' : 'btn-ghost'), href: '#/admin/record/' + encodeURIComponent(r.id), 'aria-current': cur ? 'true' : null },
                    '第 ' + (i + 1) + ' 次・' + YD.dom.fmtDate(r.createdAt)
                  );
                })
              )
            )
          );
        }
        var upto = all.filter(function (r) {
          return String(r.createdAt) <= String(rec.createdAt);
        });
        var acts = [
          h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { root.print(); } }, h('span', { 'aria-hidden': 'true' }, '🖨'), '列印處方'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary',
              onclick: function () {
                YD.dom.download('銀動方程式_' + (rec.elderCode || rec.id) + '.csv', YD.csv.toCSV(all), 'text/csv;charset=utf-8');
              }
            },
            h('span', { 'aria-hidden': 'true' }, '⬇'),
            '匯出這位長者 CSV'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onclick: function () {
                YD.dom.confirm('刪除這筆紀錄？', '將永久刪除 ' + YD.dom.fmtDate(rec.createdAt) + ' 的評估紀錄，無法復原。', '確定刪除', true).then(function (ok) {
                  if (!ok) return;
                  YD.store
                    .remove(rec.id)
                    .then(function () {
                      YD.dom.toast('已刪除紀錄');
                      root.location.hash = '#/admin/records';
                    })
                    .catch(function (e) {
                      YD.dom.toast('刪除失敗：' + e.message);
                    });
                });
              }
            },
            h('span', { 'aria-hidden': 'true' }, '🗑'),
            '刪除這筆'
          )
        ];
        var holder = h('div');
        body.appendChild(holder);
        var notice = rec.demo
          ? h('div', { class: 'alert caution' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '!'), h('p', null, '這是示範資料（模擬數據），非真實長者紀錄。'))
          : null;
        YD.report.render(holder, rec, { mode: 'admin', history: upto.length >= 2 ? upto : null, actions: acts, notice: notice });
      })
      .catch(function (e) {
        failed(body, e);
      });
  }

  /* ------------------------------------------------------------------ */
  /* 匯出／匯入                                                         */
  /* ------------------------------------------------------------------ */
  function dataView(el) {
    YD.dom.clear(el);
    el.appendChild(header('匯出／匯入', 'data'));
    var stamp = new Date().toISOString().slice(0, 10);
    var preview = h('div', { 'aria-live': 'polite' });
    var fileIn = h('input', {
      type: 'file',
      id: 'f-csv',
      accept: '.csv,text/csv',
      class: 'input',
      onchange: function () {
        var f = fileIn.files && fileIn.files[0];
        if (!f) return;
        var reader = new root.FileReader();
        reader.onload = function () {
          var res = YD.csv.fromCSV(String(reader.result || ''));
          YD.dom.clear(preview);
          preview.appendChild(
            h(
              'div',
              { class: 'alert ' + (res.records.length ? 'info' : 'stop') },
              h('span', { class: 'icon', 'aria-hidden': 'true' }, res.records.length ? '📄' : '⚠'),
              h(
                'div',
                null,
                h('p', null, '可匯入 ' + res.records.length + ' 筆' + (res.errors.length ? '，' + res.errors.length + ' 筆有問題：' : '。')),
                res.errors.length
                  ? h('ul', null, res.errors.slice(0, 10).map(function (e) { return h('li', null, '第 ' + e.line + ' 列：' + e.message); }))
                  : null,
                res.records.length
                  ? h(
                      'button',
                      {
                        type: 'button',
                        class: 'btn btn-primary btn-sm',
                        onclick: function () {
                          YD.store
                            .importMany(res.records)
                            .then(function (nSaved) {
                              YD.dom.toast('已匯入 ' + nSaved + ' 筆紀錄（系統已重新計算風險與處方）');
                              YD.dom.clear(preview);
                              fileIn.value = '';
                            })
                            .catch(function (e) {
                              YD.dom.toast('匯入失敗：' + e.message);
                            });
                        }
                      },
                      '確認匯入 ' + res.records.length + ' 筆'
                    )
                  : null
              )
            )
          );
        };
        reader.readAsText(f, 'utf-8');
      }
    });

    function run(p, ok) {
      return p
        .then(function () {
          YD.dom.toast(ok);
        })
        .catch(function (e) {
          YD.dom.toast('失敗：' + e.message);
        });
    }

    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '⬇ 一鍵匯出'),
        h('p', { class: 'muted' }, 'CSV 可用 Excel 開啟，提供給個管師或研究單位使用；包含 SFT 數值、常模判定、百分位、風險分級與處方摘要。'),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary',
              onclick: function () {
                YD.store.list().then(function (records) {
                  YD.dom.download('銀動方程式_全部紀錄_' + stamp + '.csv', YD.csv.toCSV(records), 'text/csv;charset=utf-8');
                  YD.dom.toast('已匯出 ' + records.length + ' 筆紀錄');
                }).catch(function (e) { YD.dom.toast('匯出失敗：' + e.message); });
              }
            },
            '匯出全部紀錄（CSV）'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary',
              onclick: function () {
                YD.store.list().then(function (records) {
                  var research = records.filter(function (r) { return r.consent && r.consent.research; }).map(function (r) {
                    var c = JSON.parse(JSON.stringify(r));
                    c.profile.name = '';
                    c.profile.operator = '';
                    c.health.doctorNote = '';
                    return c;
                  });
                  YD.dom.download('銀動方程式_研究用去識別化_' + stamp + '.csv', YD.csv.toCSV(research), 'text/csv;charset=utf-8');
                  YD.dom.toast('已匯出 ' + research.length + ' 筆同意研究使用的去識別化資料');
                }).catch(function (e) { YD.dom.toast('匯出失敗：' + e.message); });
              }
            },
            '匯出研究用（去識別化）'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onclick: function () {
                YD.store.list().then(function (records) {
                  YD.dom.download('銀動方程式_備份_' + stamp + '.json', JSON.stringify({ app: 'yindong', version: 1, exportedAt: new Date().toISOString(), records: records }, null, 1), 'application/json');
                });
              }
            },
            '完整備份（JSON）'
          )
        )
      )
    );

    var jsonIn = h('input', {
      type: 'file',
      id: 'f-json',
      accept: '.json,application/json',
      class: 'input',
      onchange: function () {
        var f = jsonIn.files && jsonIn.files[0];
        if (!f) return;
        var reader = new root.FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(String(reader.result || '{}'));
            var recs = (data.records || []).filter(function (r) {
              return r && r.id && r.profile && r.sft;
            });
            YD.dom.confirm('還原備份？', '將匯入 ' + recs.length + ' 筆紀錄（相同編號的紀錄會被覆蓋）。', '確定還原').then(function (ok) {
              if (!ok) return;
              run(YD.store.importMany(recs), '已還原 ' + recs.length + ' 筆紀錄');
            });
          } catch (e) {
            YD.dom.toast('檔案格式不正確');
          }
          jsonIn.value = '';
        };
        reader.readAsText(f, 'utf-8');
      }
    });

    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '⬆ 匯入真實資料（CSV）'),
        h('p', { class: 'muted' }, '請先下載範本，依欄位填入（性別、年齡為必填；SFT 數值可填「無法完成」；複選欄位以「、」分隔）。系統會自動重新計算常模、風險分級與處方。'),
        h(
          'div',
          { class: 'row', style: { marginBottom: '12px' } },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-secondary',
              onclick: function () {
                YD.dom.download('銀動方程式_匯入範本.csv', YD.csv.template(), 'text/csv;charset=utf-8');
              }
            },
            '下載匯入範本'
          )
        ),
        h('div', { class: 'field' }, h('label', { for: 'f-csv' }, '選擇 CSV 檔案'), fileIn),
        preview,
        h('div', { class: 'field' }, h('label', { for: 'f-json' }, '還原 JSON 備份'), jsonIn)
      )
    );

    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '🧪 示範資料'),
        h('p', { class: 'muted' }, '19 位長者的模擬資料（依簡報統計值產生：平均 78.4 歲、男 4 女 15、低 6／中 8／高 5），另含 1 筆前測紀錄示範進步比較。'),
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-secondary', onclick: function () { run(YD.store.loadDemo(), '已載入示範資料'); } }, '載入示範資料'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onclick: function () {
                YD.dom.confirm('清除示範資料？', '只會刪除標記為「示範」的模擬紀錄，真實紀錄不受影響。', '清除示範資料', true).then(function (ok) {
                  if (ok) run(YD.store.clearDemo(), '已清除示範資料');
                });
              }
            },
            '清除示範資料'
          )
        )
      )
    );

    var confirmIn = h('input', { class: 'input', id: 'f-del', autocomplete: 'off', placeholder: '請輸入「刪除全部」' });
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '🗑 資料銷毀'),
        h('p', { class: 'muted' }, '依倫理規範，計畫（競賽）結束後應適時刪除資料。刪除前請先匯出備份。此動作無法復原。'),
        h('div', { class: 'field' }, h('label', { for: 'f-del' }, '確認文字'), confirmIn),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-danger',
            onclick: function () {
              if (confirmIn.value.trim() !== '刪除全部') {
                YD.dom.toast('請輸入「刪除全部」以確認');
                confirmIn.focus();
                return;
              }
              run(YD.store.clearAll(), '已刪除全部資料').then(function () {
                confirmIn.value = '';
              });
            }
          },
          '永久刪除全部資料'
        )
      )
    );
  }

  /* ------------------------------------------------------------------ */
  /* 設定                                                               */
  /* ------------------------------------------------------------------ */
  function settingsView(el) {
    YD.dom.clear(el);
    el.appendChild(header('設定', 'settings'));
    var st = YD.store.state;
    var s = YD.store.settings();
    var remote = st.mode === 'remote';

    // 儲存模式
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '💾 資料儲存'),
        h('p', null, modePill()),
        remote
          ? h('p', null, '資料存放在 Netlify Blobs，所有裝置共用同一個後台。後台密碼由 Netlify 環境變數 ADMIN_PASSWORD 設定。')
          : h(
              'div',
              null,
              h('p', null, '目前資料只存在這台裝置的瀏覽器中。若要讓多台平板共用資料，請將專案連結 Git 部署到 Netlify，並設定環境變數 ADMIN_PASSWORD（詳見 README）。'),
              h('p', { class: 'muted' }, '提醒：清除瀏覽器資料會一併刪除紀錄，請定期到「匯出／匯入」備份。')
            )
      )
    );

    // 密碼
    if (!remote) {
      var oldPw = h('input', { class: 'input', id: 'f-old', type: 'password', autocomplete: 'current-password' });
      var newPw = h('input', { class: 'input', id: 'f-new', type: 'password', autocomplete: 'new-password' });
      el.appendChild(
        h(
          'section',
          { class: 'card' },
          h('h2', null, '🔒 修改後台密碼'),
          YD.store.usingDefaultPassword() ? h('div', { class: 'alert caution' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '!'), h('p', null, '目前使用預設密碼，請盡快修改。')) : null,
          h('div', { class: 'grid grid-2' }, h('div', { class: 'field' }, h('label', { for: 'f-old' }, '目前密碼'), oldPw), h('div', { class: 'field' }, h('label', { for: 'f-new' }, '新密碼（至少 6 個字元）'), newPw)),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-primary',
              onclick: function () {
                YD.store
                  .changePassword(oldPw.value, newPw.value)
                  .then(function () {
                    oldPw.value = '';
                    newPw.value = '';
                    YD.dom.toast('密碼已更新');
                    settingsView(el);
                  })
                  .catch(function (e) {
                    YD.dom.toast(e.message === '密碼不正確' ? '目前密碼不正確' : e.message);
                  });
              }
            },
            '更新密碼'
          )
        )
      );
    }

    // AI
    var aiStatus = h('div', { 'aria-live': 'polite' });
    function renderAiStatus() {
      YD.dom.clear(aiStatus);
      var a = YD.ai.status();
      var text = a.via === 'server' ? '✓ 使用伺服器上的 Claude（模型：' + (a.model || '預設') + '）' : a.via === 'browser' ? '✓ 使用此裝置輸入的金鑰呼叫 Claude（模型：' + a.model + '）' : '目前使用本機規則引擎撰寫說明（' + a.reason + '）';
      aiStatus.appendChild(h('p', null, h('strong', null, '狀態：'), text));
    }
    renderAiStatus();
    var modeSel = h(
      'select',
      {
        class: 'input',
        id: 'f-aimode',
        onchange: function () {
          YD.store.saveSettings({ aiMode: modeSel.value });
          renderAiStatus();
        }
      },
      h('option', { value: 'auto', selected: s.aiMode === 'auto' }, '自動：可用時使用 Claude AI 撰寫說明'),
      h('option', { value: 'local', selected: s.aiMode === 'local' }, '只使用本機規則引擎（不連網）')
    );
    var modelSel = h(
      'select',
      {
        class: 'input',
        id: 'f-model',
        onchange: function () {
          YD.store.saveSettings({ aiModel: modelSel.value });
          renderAiStatus();
        }
      },
      YD.ai.MODELS.map(function (m) {
        return h('option', { value: m.id, selected: s.aiModel === m.id }, m.label);
      })
    );
    var keyIn = h('input', { class: 'input', id: 'f-key', type: 'password', autocomplete: 'off', placeholder: YD.store.aiKey() ? '已設定（輸入新金鑰可取代）' : 'sk-ant-…' });
    var testOut = h('div', { 'aria-live': 'polite' });
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '🤖 AI 個人化說明（Claude）'),
        h('p', { class: 'muted' }, '運動項目與劑量一律由規則引擎依 SFT、ACSM、FITT 決定；AI 只負責用長輩聽得懂的話撰寫說明與鼓勵。送出的資料不含姓名。'),
        aiStatus,
        h('div', { class: 'field' }, h('label', { for: 'f-aimode' }, 'AI 使用方式'), modeSel),
        st.serverAI
          ? h('p', null, '伺服器已設定 ANTHROPIC_API_KEY，不需要在這裡輸入金鑰。')
          : h(
              'div',
              null,
              h('div', { class: 'alert caution' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '!'), h('p', null, '建議做法：在 Netlify 設定環境變數 ANTHROPIC_API_KEY，金鑰不會出現在瀏覽器。若只是展示，也可以在下方輸入金鑰，金鑰只會存在這台裝置；請勿在公用裝置使用。')),
              h('div', { class: 'grid grid-2' },
                h('div', { class: 'field' }, h('label', { for: 'f-key' }, 'Anthropic API 金鑰（只存在此裝置）'), keyIn),
                h('div', { class: 'field' }, h('label', { for: 'f-model' }, '模型'), modelSel)
              ),
              h(
                'div',
                { class: 'row' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-primary',
                    onclick: function () {
                      if (keyIn.value.trim()) {
                        YD.store.aiKey(keyIn.value.trim());
                        keyIn.value = '';
                        keyIn.placeholder = '已設定（輸入新金鑰可取代）';
                        YD.dom.toast('已儲存金鑰');
                      }
                      renderAiStatus();
                    }
                  },
                  '儲存金鑰'
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-ghost',
                    onclick: function () {
                      YD.store.aiKey('');
                      keyIn.placeholder = 'sk-ant-…';
                      renderAiStatus();
                      YD.dom.toast('已移除金鑰');
                    }
                  },
                  '移除金鑰'
                )
              )
            ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary',
            style: { marginTop: '12px' },
            onclick: function () {
              YD.dom.clear(testOut);
              testOut.appendChild(h('p', { role: 'status' }, '測試中，約需 5～20 秒…'));
              YD.ai
                .test()
                .then(function (r) {
                  YD.dom.clear(testOut);
                  testOut.appendChild(h('div', { class: 'alert ok' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '✓'), h('div', null, h('p', null, '連線成功（' + (r.model || '') + '）。範例說明：'), h('p', null, YD.narrative.applyName(r.data.summary, '王奶奶')))));
                })
                .catch(function (e) {
                  YD.dom.clear(testOut);
                  testOut.appendChild(h('div', { class: 'alert stop' }, h('span', { class: 'icon', 'aria-hidden': 'true' }, '⚠'), h('p', null, '連線失敗：' + e.message)));
                });
            }
          },
          '測試 AI 連線'
        ),
        testOut
      )
    );

    // 據點
    var siteIn = h('input', { class: 'input', id: 'f-defsite', value: s.site });
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '📍 預設據點名稱'),
        h('div', { class: 'field' }, h('label', { for: 'f-defsite' }, '新評估預設的據點'), siteIn),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary',
            onclick: function () {
              YD.store.saveSettings({ site: siteIn.value.trim() || '北港樂智據點' });
              YD.dom.toast('已儲存');
            }
          },
          '儲存'
        )
      )
    );

    // QR Code
    var url = root.location.origin && /^https?:/.test(root.location.protocol) ? root.location.origin + root.location.pathname.replace(/index\.html$/, '') : '';
    var qrBox = h('div', { class: 'qr-box' });
    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, '📱 推廣 QR Code'),
        url ? h('p', null, '長者或家屬掃描即可開啟系統：', h('strong', null, url)) : h('p', { class: 'muted' }, '部署到網站後即可產生 QR Code。'),
        url ? qrBox : null,
        url
          ? h(
              'p',
              null,
              h(
                'button',
                {
                  type: 'button',
                  class: 'btn btn-ghost btn-sm',
                  onclick: function () {
                    var img = qrBox.querySelector('img');
                    if (img) {
                      var a = h('a', { href: img.src, download: '銀動方程式_QRCode.gif' });
                      root.document.body.appendChild(a);
                      a.click();
                      a.remove();
                    }
                  }
                },
                '下載 QR Code 圖片'
              )
            )
          : null
      )
    );
    if (url) renderQR(qrBox, url);

    el.appendChild(
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'ℹ️ 系統資訊'),
        h('p', null, '引擎版本 ' + YD.assess.ENGINE_VERSION + '・動作資料庫 ' + YD.exercises.LIST.length + ' 個動作・SFT 常模 7 個年齡組 × 2 性別。')
      )
    );
  }

  var qrLoad = null;
  function renderQR(box, url) {
    function draw() {
      try {
        var qr = root.qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        var img = YD.dom.h('img', { src: qr.createDataURL(8, 2), alt: '開啟銀動方程式的 QR Code：' + url, width: 220, height: 220 });
        YD.dom.clear(box);
        box.appendChild(img);
      } catch (e) {
        box.textContent = 'QR Code 產生失敗';
      }
    }
    if (root.qrcode) return draw();
    if (!qrLoad) {
      qrLoad = new Promise(function (resolve, reject) {
        var sc = root.document.createElement('script');
        sc.src = 'assets/vendor/qrcode.js';
        sc.onload = resolve;
        sc.onerror = reject;
        root.document.head.appendChild(sc);
      });
    }
    qrLoad.then(draw).catch(function () {
      box.textContent = 'QR Code 元件載入失敗';
    });
  }

  /* ------------------------------------------------------------------ */
  /* 路由                                                               */
  /* ------------------------------------------------------------------ */
  function show(el, parts) {
    var sub = parts[0] || 'overview';
    root.document.title = '後台管理｜銀動方程式';
    if (!YD.store.isAdmin()) {
      loginView(el, function () {
        show(el, parts);
      });
      return;
    }
    if (sub === 'records') recordsView(el);
    else if (sub === 'record' && parts[1]) recordView(el, decodeURIComponent(parts[1]));
    else if (sub === 'data') dataView(el);
    else if (sub === 'settings') settingsView(el);
    else overview(el);
    var t = YD.dom.$('#admin-title', el);
    if (t) t.focus({ preventScroll: true });
  }

  YD.admin = { show: show, groupElders: groupElders };
})(typeof globalThis !== 'undefined' ? globalThis : this);
