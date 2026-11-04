/*
 * 銀動方程式 — 個人化運動處方報告
 * 長者端（第 6 步結果）與後台詳細頁共用；支援列印（A4）與語音朗讀。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var h = function () {
    return YD.dom.h.apply(null, arguments);
  };

  var CAT_ORDER = ['aerobic', 'strength', 'balance', 'flexibility'];

  function speakBtn(getText, label) {
    if (!YD.speech.supported) return null;
    return h(
      'button',
      {
        type: 'button',
        class: 'btn btn-ghost btn-sm no-print',
        onclick: function () {
          YD.speech.speak(getText());
        }
      },
      h('span', { 'aria-hidden': 'true' }, '🔊'),
      label || '唸給我聽'
    );
  }

  function card(title, icon, body, extra) {
    var c = h('section', { class: 'card' + (extra && extra.cls ? ' ' + extra.cls : '') });
    var head = h('div', { class: 'row between' }, h('h2', { class: 'card-title' }, icon ? h('span', { 'aria-hidden': 'true' }, icon) : null, h('span', null, title)));
    if (extra && extra.action) head.appendChild(extra.action);
    c.appendChild(head);
    c.appendChild(h('div', { style: { marginTop: '14px' } }, body));
    return c;
  }

  function exerciseCard(item, ex, version, tip) {
    var spec = YD.exercises.figureFor(ex, version);
    var details = h('details', { class: 'ex-card' });
    var thumb = h('span', { class: 'thumb', 'aria-hidden': 'true' });
    thumb.appendChild(YD.figure.staticSvg(spec, Math.min(1, spec.frames.length - 1)));
    details.appendChild(
      h(
        'summary',
        null,
        thumb,
        h('span', null, h('p', { class: 'ex-name' }, ex.name), h('p', { class: 'ex-dose' }, item.dose)),
        h('span', { class: 'chev', 'aria-hidden': 'true' }, '▾')
      )
    );
    var figBox = h('div', { class: 'fig-box' });
    var body = h(
      'div',
      { class: 'ex-body' },
      h('div', null, figBox, h('p', { class: 'small muted', style: { marginTop: '6px' } }, '示範動畫：' + (spec.view === 'front' ? '正面' : '側面') + '視角')),
      h(
        'div',
        null,
        item.notes.map(function (n) {
          return h('div', { class: 'ex-note' }, h('span', { 'aria-hidden': 'true' }, '⚠ '), '給您的調整：' + n);
        }),
        tip ? h('div', { class: 'ex-tip' }, h('span', { 'aria-hidden': 'true' }, '💡 '), tip) : null,
        h('h3', null, '操作步驟'),
        h(
          'ol',
          null,
          ex.steps.map(function (s) {
            return h('li', null, s);
          })
        ),
        h('h3', null, '注意事項'),
        h(
          'ul',
          null,
          ex.cautions.map(function (s) {
            return h('li', null, s);
          })
        ),
        ex.breath ? h('p', null, h('strong', null, '呼吸：'), ex.breath) : null,
        speakBtn(function () {
          return ex.name + '。' + item.dose + '。操作步驟：' + ex.steps.join('') + '注意事項：' + ex.cautions.join('') + item.notes.join('');
        }, '朗讀這個動作')
      )
    );
    details.appendChild(body);
    var fig = null;
    details.addEventListener('toggle', function () {
      if (details.open && !fig) {
        fig = YD.figure.mount(figBox, spec, { label: ex.name + ' 示範動畫' });
        if (fig.frames > 1) {
          var paused = !fig.playing;
          var ctrl = h(
            'button',
            {
              type: 'button',
              class: 'fig-ctrl',
              'aria-label': paused ? '播放示範動畫' : '暫停示範動畫',
              onclick: function () {
                if (YD.figure.reduceMotion() && !fig.playing) {
                  fig.next();
                  return;
                }
                if (fig.playing) {
                  fig.pause();
                  ctrl.textContent = '▶';
                  ctrl.setAttribute('aria-label', '播放示範動畫');
                } else {
                  fig.play();
                  ctrl.textContent = '❚❚';
                  ctrl.setAttribute('aria-label', '暫停示範動畫');
                }
              }
            },
            paused ? (YD.figure.reduceMotion() ? '⏭' : '▶') : '❚❚'
          );
          if (YD.figure.reduceMotion()) ctrl.setAttribute('aria-label', '下一個動作姿勢');
          figBox.appendChild(ctrl);
        }
      } else if (!details.open && fig) {
        fig.destroy();
        fig = null;
        YD.dom.clear(figBox);
      }
    });
    return details;
  }

  function weekView(rx) {
    var wrap = h('div', { class: 'week' });
    rx.week.days.forEach(function (d) {
      var day = h('div', { class: 'day' + (d.type === 'rest' ? ' rest' : '') });
      day.appendChild(h('h3', { class: 'day-title' }, h('span', null, d.day), h('span', null, d.total ? d.total + ' 分' : '休息')));
      day.appendChild(h('div', { class: 'type' }, d.typeText));
      if (d.blocks.length) {
        var ul = h('ul');
        d.blocks.forEach(function (b) {
          var names = b.exercises
            .map(function (id) {
              var e = YD.exercises.get(id);
              return e ? e.name.replace(/（.*?）/g, '') : id;
            })
            .join('、');
          ul.appendChild(h('li', null, h('span', null, b.label), h('span', { class: 'm' }, b.minutes + ' 分'), names ? h('span', { class: 'ex-names' }, names) : null));
        });
        day.appendChild(ul);
      } else if (d.note) {
        day.appendChild(h('p', { class: 'small muted', style: { margin: 0 } }, d.note));
      }
      wrap.appendChild(day);
    });
    return wrap;
  }

  function fittView(rx) {
    var C = YD.exercises.CATEGORY;
    var g = h('div', { class: 'fitt-grid' });
    CAT_ORDER.forEach(function (cat) {
      var f = rx.fitt[cat];
      g.appendChild(
        h(
          'div',
          { class: 'fitt-card' },
          h('h3', null, h('span', { 'aria-hidden': 'true' }, C[cat].icon), C[cat].full),
          h(
            'dl',
            null,
            h('dt', null, 'F', h('small', null, '頻率')),
            h('dd', null, f.F),
            h('dt', null, 'I', h('small', null, '強度')),
            h('dd', null, f.I),
            h('dt', null, 'T', h('small', null, '時間')),
            h('dd', null, f.T),
            h('dt', null, 'T', h('small', null, '類型')),
            h('dd', null, f.T2)
          )
        )
      );
    });
    return g;
  }

  function goalsView(rx) {
    var phases = h('div', { class: 'phases' });
    rx.goals.phases.forEach(function (p) {
      phases.appendChild(
        h(
          'div',
          { class: 'phase' },
          h('div', { class: 'wk' }, p.weeks),
          h('h3', { style: { margin: '2px 0 4px' } }, p.title),
          h(
            'ul',
            null,
            p.items.map(function (i) {
              return h('li', null, i);
            })
          )
        )
      );
    });
    var table = h(
      'table',
      { class: 'target-table' },
      h('caption', { class: 'sr-only' }, '第 6 週體適能目標'),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, '檢測項目'), h('th', { scope: 'col' }, '目前'), h('th', { scope: 'col' }, '第 6 週目標'), h('th', { scope: 'col' }, '同齡常模'))),
      h(
        'tbody',
        null,
        rx.goals.targets.map(function (t) {
          return h(
            'tr',
            null,
            h('th', { scope: 'row' }, t.name),
            h('td', { class: 'num', 'data-label': '目前' }, t.current),
            h('td', { class: 'num', 'data-label': '第 6 週目標' }, t.target),
            h('td', { 'data-label': '同齡常模' }, t.norm)
          );
        })
      )
    );
    return h(
      'div',
      null,
      phases,
      h('h3', { style: { marginTop: '20px' } }, '第 6 週重新檢測的目標'),
      h('div', { class: 'table-wrap' }, table),
      h('h3', { style: { marginTop: '20px' } }, '好習慣目標'),
      h(
        'ul',
        null,
        rx.goals.behavior.map(function (b) {
          return h('li', null, b);
        })
      )
    );
  }

  function safetyView(rx, narrative) {
    var s = rx.safety;
    var parts = [];
    if (narrative && narrative.safety && narrative.safety.length) {
      parts.push(h('h3', null, '給您的個人提醒'));
      parts.push(
        h(
          'ul',
          null,
          narrative.safety.map(function (t) {
            return h('li', null, t);
          })
        )
      );
    }
    parts.push(h('h3', null, '出現以下狀況，請立刻停止運動、坐下休息'));
    parts.push(
      h(
        'ul',
        { class: 'stop-signs' },
        s.stopSigns.map(function (t) {
          return h('li', null, t);
        })
      )
    );
    parts.push(h('p', { class: 'muted' }, '休息後仍未改善，請就醫；胸痛或呼吸困難嚴重時，請撥打 119。'));
    parts.push(h('h3', null, '自覺費力程度（0～10 分）'));
    parts.push(
      h(
        'table',
        { class: 'rpe-table' },
        h('caption', { class: 'sr-only' }, '自覺費力量表'),
        h(
          'tbody',
          null,
          s.rpeScale.map(function (r) {
            return h('tr', null, h('td', null, r.v + ' 分'), h('td', null, r.t));
          })
        )
      )
    );
    parts.push(h('p', null, h('strong', null, '您的目標強度：'), '自覺費力 ' + s.intensity.rpe + ' 分（' + s.intensity.label + '）— ' + s.intensity.talk + '。'));
    if (s.conditions.length) {
      parts.push(h('h3', null, '依您的健康狀況'));
      parts.push(
        h(
          'ul',
          null,
          s.conditions.map(function (c) {
            return h('li', null, h('strong', null, c.label.replace(/（.*）/, '') + '：'), c.text);
          })
        )
      );
    }
    parts.push(h('h3', null, '每次運動都要記得'));
    parts.push(
      h(
        'ul',
        null,
        s.general.map(function (t) {
          return h('li', null, t);
        })
      )
    );
    return h('div', null, parts);
  }

  function sourceLabel(n) {
    if (n && n.source === 'ai') return '🤖 由 Claude AI 撰寫說明' + (n.model ? '（' + n.model + '）' : '') + '・處方由運動醫學規則把關';
    return '⚙️ 由本機規則引擎撰寫說明・處方依 SFT、ACSM、FITT 產生';
  }

  /**
   * 繪製報告。
   * opts: { mode: 'elder'|'admin', history: [舊→新紀錄], actions: [節點], notice: 節點 }
   */
  function render(container, record, opts) {
    opts = opts || {};
    var ev = YD.assess.evaluate(record);
    var cls = ev.cls;
    var rx = ev.rx;
    var nar = (record.narrative && record.narrative.data) || YD.narrative.local(ev.summary);
    var name = (record.profile && record.profile.name) || '';
    var fixName = function (t) {
      return YD.narrative.applyName(t, name);
    };
    var tips = {};
    (nar.exerciseTips || []).forEach(function (t) {
      tips[t.id] = fixName(t.tip);
    });
    var p = record.profile;
    var out = h('article', { class: 'report', 'aria-labelledby': 'report-title' });

    out.appendChild(h('div', { class: 'print-only' }, h('p', null, '🌿 銀動方程式 The Senior Movement Equation — 個人化運動處方')));

    // 標題
    var badges = h(
      'div',
      { class: 'badges' },
      YD.dom.riskBadge(cls.level, cls.levelText),
      YD.dom.versionBadge(cls.version, cls.versionText),
      h('span', { class: 'badge neutral' }, '強度：' + cls.doseText),
      record.demo ? h('span', { class: 'badge demo' }, '示範資料（模擬）') : null
    );
    out.appendChild(
      h(
        'header',
        { class: 'report-hero' },
        h('div', { class: 'small' }, '🌿 銀動方程式・個人化運動處方'),
        h('h1', { id: 'report-title' }, (name ? name + ' 的' : '您的') + '專屬運動處方'),
        h(
          'div',
          { class: 'meta' },
          [
            record.elderCode ? '長者編號 ' + record.elderCode : null,
            p.age + ' 歲',
            p.sex === 'M' ? '男' : '女',
            '評估日期 ' + YD.dom.fmtDate(record.createdAt),
            record.site || null
          ]
            .filter(Boolean)
            .join('・')
        ),
        badges
      )
    );
    if (opts.notice) out.appendChild(opts.notice);

    // 安全警示
    rx.safety.alerts.forEach(function (a) {
      var icon = a.level === 'stop' ? '⛔' : a.level === 'clearance' ? '🩺' : '⚠';
      out.appendChild(h('div', { class: 'alert ' + a.level, role: a.level === 'stop' ? 'alert' : null }, h('span', { class: 'icon', 'aria-hidden': 'true' }, icon), h('p', null, a.text)));
    });

    // AI 說明
    var aiBody = h(
      'div',
      null,
      h('p', { style: { fontSize: '1.15rem', fontWeight: 700 } }, fixName(nar.greeting)),
      h('p', null, fixName(nar.summary)),
      h('h3', null, '接下來 6 週的重點'),
      h(
        'ol',
        { class: 'focus-list' },
        nar.focus.map(function (f, i) {
          return h('li', null, h('span', { class: 'n', 'aria-hidden': 'true' }, String(i + 1)), h('span', null, fixName(f)));
        })
      ),
      h('p', { style: { marginTop: '14px' } }, h('span', { class: 'ai-source' }, sourceLabel(record.narrative)))
    );
    out.appendChild(
      card('給您的個人化說明', '🤖', aiBody, {
        cls: 'ai-card',
        action: speakBtn(function () {
          return fixName(nar.greeting) + fixName(nar.summary) + '接下來的重點：' + nar.focus.map(fixName).join('。');
        })
      })
    );

    // SFT 結果
    out.appendChild(
      card(
        '體適能檢測結果（對照 SFT 國際常模）',
        '📊',
        h(
          'div',
          null,
          cls.sft.ageBandNote ? h('p', { class: 'muted' }, cls.sft.ageBandNote) : null,
          YD.charts.sftChart(cls.sft)
        )
      )
    );

    // 風險分級
    var reasons = h(
      'ul',
      { class: 'reasons' },
      cls.reasons.map(function (r) {
        return h('li', null, YD.dom.riskBadge(r.level, { low: '低', moderate: '中', high: '高' }[r.level]), h('span', null, r.text));
      })
    );
    out.appendChild(
      card(
        '風險分級與判定依據',
        '⚖️',
        h(
          'div',
          null,
          h('p', null, '綜合評估：', YD.dom.riskBadge(cls.level, cls.levelText), '　', YD.dom.versionBadge(cls.version, cls.versionText)),
          h('p', null, cls.versionReason + '。'),
          reasons,
          h('hr', { class: 'divider' }),
          h('div', { class: 'grid grid-2' },
            h('div', null, h('h3', null, 'ACSM 運動前篩檢'), h('p', null, h('strong', null, cls.acsm.title + '：'), cls.acsm.advice)),
            h('div', null, h('h3', null, '跌倒風險'), h('p', null, h('strong', null, YD.screening.LEVEL_TEXT[cls.fall.level] + '：'), cls.fall.factors.length ? cls.fall.factors.join('、') : '沒有明顯的跌倒風險因子'))
          ),
          h('p', { class: 'small muted' }, '依據：ACSM 運動測試與處方指引（第 11 版）運動前篩檢流程、CDC STEADI 跌倒風險篩檢、SFT 銀髮族功能性體適能常模（Rikli & Jones）。')
        )
      )
    );

    // 進步比較
    if (opts.history && opts.history.length >= 2) {
      out.appendChild(card('與上次檢測比較', '📈', YD.charts.progress(opts.history)));
    }

    // FITT
    out.appendChild(card('FITT 運動處方', '📋', h('div', null, h('p', { class: 'muted' }, 'F 頻率・I 強度・T 時間・T 類型（ACSM 處方四要素）'), fittView(rx))));

    // 動作
    var exWrap = h('div');
    exWrap.appendChild(
      h(
        'div',
        { class: 'card soft' },
        h('h3', null, '每次運動前：暖身 ' + rx.week.plan.warm + ' 分鐘'),
        h('ul', null, rx.warmup.map(function (w) { return h('li', null, w); })),
        h('h3', null, '每次運動後：緩和 ' + rx.week.plan.cool + ' 分鐘'),
        h('ul', null, rx.cooldown.map(function (w) { return h('li', null, w); }))
      )
    );
    CAT_ORDER.forEach(function (cat) {
      var items = rx.exercises.filter(function (e) {
        return e.category === cat;
      });
      if (!items.length) return;
      var C = YD.exercises.CATEGORY[cat];
      exWrap.appendChild(h('h3', { class: 'cat-head' }, h('span', { 'aria-hidden': 'true' }, C.icon), C.full + '（' + items.length + ' 個動作）'));
      var list = h('div', { class: 'ex-list' });
      items.forEach(function (it) {
        var ex = YD.exercises.get(it.id);
        if (ex) list.appendChild(exerciseCard(it, ex, rx.version, tips[it.id] || ex.tip));
      });
      exWrap.appendChild(list);
    });
    out.appendChild(card('我的運動動作', '🏃', h('div', null, h('p', { class: 'muted no-print' }, '點一下動作，就能看到示範動畫、操作步驟和注意事項。'), exWrap)));

    // 一週計畫
    var total = h(
      'div',
      { class: 'week-total' },
      h('span', null, '每週總運動時間 ', h('span', { class: 'big' }, String(rx.week.total)), ' 分鐘'),
      h('span', null, '其中有氧 ' + rx.week.aerobic + ' 分鐘、肌力 ' + rx.week.strengthDays + ' 天、平衡 ' + rx.week.balanceDays + ' 天、伸展 ' + rx.week.flexDays + ' 天')
    );
    var guideline =
      rx.week.total >= 150
        ? '✓ 每週總運動時間約 ' + rx.week.total + ' 分鐘，涵蓋 ACSM 高齡者建議的有氧、肌力、柔軟度與平衡四大要素；有氧時間會在 6 週內逐步累積到每週 ' + (rx.level === 1 ? 90 : 150) + ' 分鐘以上。'
        : '目前每週 ' + rx.week.total + ' 分鐘，先建立習慣；ACSM 建議高齡者每週累積 150 分鐘中等強度有氧運動，請依 6 週目標逐步增加。';
    out.appendChild(card('一週運動計畫', '📅', h('div', null, weekView(rx), total, h('p', { class: 'muted', style: { marginTop: '8px' } }, guideline))));

    // 6 週目標
    out.appendChild(card('6 週進展目標', '🎯', goalsView(rx), { cls: 'page-break' }));

    // 安全
    out.appendChild(card('運動安全守則', '🛡️', safetyView(rx, nar ? { safety: (nar.safety || []).map(fixName) } : null)));

    // 鼓勵
    out.appendChild(
      h(
        'section',
        { class: 'card', style: { textAlign: 'center' } },
        h('p', { style: { fontSize: '1.3rem', fontWeight: 800, margin: 0 } }, '🌿 ' + fixName(nar.motivation))
      )
    );

    if (opts.actions) out.appendChild(h('div', { class: 'report-actions no-print' }, opts.actions));

    out.appendChild(
      h(
        'p',
        { class: 'small muted' },
        '本處方依 SFT 常模、ACSM 指引與 FITT 原則由系統產生（引擎版本 ' + YD.assess.ENGINE_VERSION + '），僅供運動建議，不取代醫師診斷。'
      )
    );

    YD.dom.clear(container);
    container.appendChild(out);
    return { ev: ev, narrative: nar };
  }

  /** 列印前展開所有動作卡，列印後還原。 */
  function setupPrint() {
    var opened = [];
    root.addEventListener('beforeprint', function () {
      opened = [];
      YD.dom.$$('details.ex-card').forEach(function (d) {
        if (!d.open) {
          d.open = true;
          opened.push(d);
        }
      });
    });
    root.addEventListener('afterprint', function () {
      opened.forEach(function (d) {
        d.open = false;
      });
      opened = [];
    });
  }

  function readAloudText(ev, nar, name) {
    var fix = function (t) {
      return YD.narrative.applyName(t, name);
    };
    var rx = ev.rx;
    return [
      fix(nar.greeting),
      fix(nar.summary),
      '每週運動 ' + rx.week.trainingDays + ' 天，每次 ' + rx.week.sessionMinutes + ' 分鐘。',
      '您的動作有：' +
        rx.exercises
          .map(function (e) {
            return YD.exercises.get(e.id).name;
          })
          .join('、') +
        '。',
      fix(nar.motivation)
    ].join('');
  }

  YD.report = { render: render, setupPrint: setupPrint, readAloudText: readAloudText };
})(typeof globalThis !== 'undefined' ? globalThis : this);
