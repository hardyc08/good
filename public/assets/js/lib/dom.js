/*
 * 銀動方程式 — DOM 小工具
 * 所有動態文字一律以 textContent 寫入，避免 XSS。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var doc = root.document;

  /**
   * 建立元素：h('button', { class: 'btn', onclick: fn, 'aria-label': '…' }, '文字', child…)
   * 字串子節點會成為文字節點；null / false 會被略過；陣列會被攤平。
   */
  function h(tag, attrs) {
    var el = doc.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') {
        Object.keys(v).forEach(function (s) {
          if (s.indexOf('--') === 0) el.style.setProperty(s, v[s]);
          else el.style[s] = v[s];
        });
      } else if (k.indexOf('on') === 0 && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'dataset') {
        Object.keys(v).forEach(function (d) {
          el.dataset[d] = v[d];
        });
      } else if (k === 'value') {
        el.value = v;
      } else if (k === 'checked' || k === 'disabled' || k === 'open' || k === 'hidden' || k === 'selected') {
        el[k] = !!v;
      } else if (v === true) {
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) {
        append(el, c);
      });
      return;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(doc.createTextNode(String(child)));
      return;
    }
    el.appendChild(child);
  }

  function $(sel, ctx) {
    return (ctx || doc).querySelector(sel);
  }
  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel));
  }
  function clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /* 螢幕報讀器即時公告 */
  var live = null;
  function announce(msg) {
    if (!live) {
      live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
      doc.body.appendChild(live);
    }
    live.textContent = '';
    setTimeout(function () {
      live.textContent = msg;
    }, 60);
  }

  /* 提示訊息 */
  var toastRegion = null;
  function toast(msg, ms) {
    if (!toastRegion) {
      toastRegion = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
      doc.body.appendChild(toastRegion);
    }
    var t = h('div', { class: 'toast' }, msg);
    toastRegion.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, ms || 3200);
  }

  /**
   * 對話框。opts: { title, body(節點或字串), actions: [{ text, class, value }], dismissValue }
   * 回傳 Promise，值為使用者按下的按鈕 value。
   */
  function dialog(opts) {
    return new Promise(function (resolve) {
      var lastFocus = doc.activeElement;
      var titleId = 'dlg-' + Math.random().toString(36).slice(2);
      var dlg = h('dialog', { class: 'modal', 'aria-labelledby': titleId });
      var inner = h('div', { class: 'modal-inner' });
      inner.appendChild(h('h2', { id: titleId }, opts.title || ''));
      if (opts.body) append(inner, typeof opts.body === 'string' ? h('p', null, opts.body) : opts.body);
      var actions = h('div', { class: 'modal-actions' });
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try {
          dlg.close();
        } catch (e) {
          /* 已關閉 */
        }
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        if (lastFocus && lastFocus.focus) {
          try {
            lastFocus.focus();
          } catch (e) {
            /* 元素已移除 */
          }
        }
        resolve(v);
      }
      (opts.actions || [{ text: '確定', class: 'btn btn-primary', value: true }]).forEach(function (a) {
        actions.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: a.class || 'btn btn-secondary',
              onclick: function () {
                if (a.validate && !a.validate()) return;
                finish(typeof a.value === 'function' ? a.value() : a.value);
              }
            },
            a.text
          )
        );
      });
      inner.appendChild(actions);
      dlg.appendChild(inner);
      dlg.addEventListener('cancel', function (e) {
        e.preventDefault();
        finish(opts.dismissValue !== undefined ? opts.dismissValue : false);
      });
      doc.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal();
      else dlg.setAttribute('open', '');
      var first = dlg.querySelector('input, select, textarea') || actions.querySelector('.btn-primary, .btn-danger') || actions.querySelector('button');
      if (first) first.focus();
      if (opts.onOpen) opts.onOpen(dlg, finish);
    });
  }

  function confirm(title, message, okText, danger) {
    return dialog({
      title: title,
      body: message,
      actions: [
        { text: '取消', class: 'btn btn-ghost', value: false },
        { text: okText || '確定', class: danger ? 'btn btn-danger' : 'btn btn-primary', value: true }
      ]
    });
  }

  function alertBox(title, message) {
    return dialog({ title: title, body: message, actions: [{ text: '我知道了', class: 'btn btn-primary', value: true }] });
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }
  function fmtDate(iso, withTime) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    var s = d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
    if (withTime) s += ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return s;
  }

  /** 預覽模式：在 claude.ai 私人預覽頁中執行（由頁面設定 window.YD_CONFIG）。 */
  function isPreview() {
    return !!(root.YD_CONFIG && root.YD_CONFIG.preview);
  }

  /**
   * 下載檔案。一般網站直接下載；預覽頁不能直接下載，改請檢視者確認存檔。
   * 回傳 Promise（成功 true、取消或無法下載 false），錯誤已用提示訊息告知。
   */
  function download(filename, content, mime) {
    if (isPreview()) {
      var api = root.claude && typeof root.claude.use === 'function' ? root.claude.use('downloads') : Promise.resolve(null);
      return api
        .then(function (dl) {
          if (!dl) {
            toast('這個預覽環境無法下載檔案；正式部署後即可使用。', 4500);
            return false;
          }
          return dl.save({ filename: filename, data: content }).then(
            function () {
              return true;
            },
            function (err) {
              var code = err && err.code;
              if (code === 'declined') toast('已取消下載');
              else if (code === 'rate_limited') toast('已有一個存檔確認視窗，請先處理後再試');
              else toast('這個預覽環境無法下載檔案；正式部署後即可使用。', 4500);
              return false;
            }
          );
        })
        .catch(function () {
          toast('這個預覽環境無法下載檔案；正式部署後即可使用。', 4500);
          return false;
        });
    }
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename });
    doc.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1000);
    return Promise.resolve(true);
  }

  /** 預覽頁的框架不允許開啟列印對話框，此時不顯示列印按鈕。 */
  function canPrint() {
    return !isPreview() && typeof root.print === 'function';
  }

  /** 遮蔽姓名：王小明 → 王○明（去識別化顯示）。 */
  function maskName(name) {
    var s = String(name || '').trim();
    if (!s) return '—';
    if (/^長者\s?\d+$/.test(s)) return s;
    var chars = Array.from(s);
    if (chars.length <= 1) return s;
    if (chars.length === 2) return chars[0] + '○';
    return chars[0] + '○'.repeat(chars.length - 2) + chars[chars.length - 1];
  }

  function riskBadge(level, text) {
    var icon = { low: '✓', moderate: '!', high: '⚠' }[level] || '';
    return h('span', { class: 'badge ' + level }, h('span', { 'aria-hidden': 'true' }, icon), text);
  }
  function versionBadge(version, text) {
    return h(
      'span',
      { class: 'badge ' + (version === 'seated' ? 'seated' : 'std') },
      h('span', { 'aria-hidden': 'true' }, version === 'seated' ? '🪑' : '🚶'),
      text
    );
  }

  YD.dom = {
    h: h,
    append: append,
    $: $,
    $$: $$,
    clear: clear,
    announce: announce,
    toast: toast,
    dialog: dialog,
    confirm: confirm,
    alert: alertBox,
    fmtDate: fmtDate,
    download: download,
    isPreview: isPreview,
    canPrint: canPrint,
    maskName: maskName,
    riskBadge: riskBadge,
    versionBadge: versionBadge
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
