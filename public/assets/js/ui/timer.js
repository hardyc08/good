/*
 * 銀動方程式 — 檢測計時器
 * 30 秒／2 分鐘倒數＋大按鈕計次（坐站、手臂屈舉、原地踏步），
 * 碼錶（8 英呎起身繞行，記錄兩次取最快）。施測人員可直接用平板計時。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});
  var h = function () {
    return YD.dom.h.apply(null, arguments);
  };

  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function openDialog(title, content, onClose) {
    var lastFocus = root.document.activeElement;
    var dlg = h('dialog', { class: 'modal', 'aria-label': title });
    var inner = h('div', { class: 'modal-inner' }, h('h2', null, title), content);
    dlg.appendChild(inner);
    function close() {
      if (onClose) onClose();
      try {
        dlg.close();
      } catch (e) {
        /* 已關閉 */
      }
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    dlg.addEventListener('cancel', function (e) {
      e.preventDefault();
      close();
    });
    root.document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute('open', '');
    return { dlg: dlg, close: close };
  }

  /** 倒數＋計次 */
  function countdown(test, onResult) {
    var total = test.timer.seconds;
    var left = total;
    var count = 0;
    var running = false;
    var finished = false;
    var timer = null;
    var endAt = 0;
    var spokeHalf = false;
    var C = 2 * Math.PI * 96;

    var timeEl = h('div', { class: 'timer-time', 'aria-hidden': 'true' }, fmt(total));
    var svgNS = 'http://www.w3.org/2000/svg';
    var ring = root.document.createElementNS(svgNS, 'svg');
    ring.setAttribute('viewBox', '0 0 220 220');
    ring.setAttribute('class', 'timer-ring');
    ring.setAttribute('aria-hidden', 'true');
    var track = root.document.createElementNS(svgNS, 'circle');
    track.setAttribute('cx', '110');
    track.setAttribute('cy', '110');
    track.setAttribute('r', '96');
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke-width', '14');
    track.setAttribute('class', 'track');
    var arc = root.document.createElementNS(svgNS, 'circle');
    arc.setAttribute('cx', '110');
    arc.setAttribute('cy', '110');
    arc.setAttribute('r', '96');
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke-width', '14');
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('transform', 'rotate(-90 110 110)');
    arc.setAttribute('stroke-dasharray', String(C));
    arc.setAttribute('stroke-dashoffset', '0');
    arc.setAttribute('class', 'prog');
    ring.appendChild(track);
    ring.appendChild(arc);
    var face = h('div', { class: 'timer-face', style: { position: 'relative' } }, ring, h('div', { style: { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, timeEl));
    var srTime = h('div', { class: 'sr-only', 'aria-live': 'assertive' });
    var countEl = h('span', { class: 'tap-count' }, '0');
    var stateText = h('p', { class: 'muted', style: { textAlign: 'center', margin: '4px 0 0' }, 'aria-live': 'polite' }, '按「開始」後倒數 3 秒，聽到嗶聲開始。');

    var tapBtn = h(
      'button',
      {
        type: 'button',
        class: 'tap-btn',
        disabled: true,
        onclick: function () {
          if (!running) return;
          count++;
          countEl.textContent = String(count);
          YD.sound.beep(1200, 60, 0.15);
        }
      },
      '＋1 次'
    );
    var minusBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        onclick: function () {
          if (count > 0) count--;
          countEl.textContent = String(count);
        }
      },
      '−1 修正'
    );
    var startBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: start }, '▶ 開始');
    var resetBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: reset }, '↺ 重設');
    var useBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-accent',
        disabled: true,
        onclick: function () {
          onResult(count);
          d.close();
        }
      },
      '填入結果'
    );

    function render() {
      timeEl.textContent = fmt(left);
      arc.setAttribute('stroke-dashoffset', String(C * (1 - left / total)));
      useBtn.textContent = '填入結果：' + count + ' 次';
    }
    function start() {
      if (running) return;
      YD.sound.unlock();
      startBtn.disabled = true;
      finished = false;
      count = 0;
      countEl.textContent = '0';
      var n = 3;
      stateText.textContent = '預備… 3';
      YD.sound.tick();
      var pre = setInterval(function () {
        n--;
        if (n > 0) {
          stateText.textContent = '預備… ' + n;
          YD.sound.tick();
          return;
        }
        clearInterval(pre);
        YD.sound.go();
        YD.speech.speak('開始');
        running = true;
        tapBtn.disabled = false;
        tapBtn.focus();
        stateText.textContent = test.key === 'stepTest' ? '計時中：每次「右膝」抬到標示高度就按一下' : '計時中：每完成一次就按一下';
        endAt = performance.now() + total * 1000;
        timer = setInterval(tick, 200);
      }, 1000);
    }
    function tick() {
      left = (endAt - performance.now()) / 1000;
      if (left <= 5.2 && left > 0 && Math.abs(left - Math.round(left)) < 0.11) YD.sound.tick();
      if (!spokeHalf && total >= 120 && left <= total / 2) {
        spokeHalf = true;
        YD.speech.speak('剩下一分鐘');
      }
      if (left <= 0) {
        left = 0;
        stop(true);
      }
      render();
    }
    function stop(done) {
      clearInterval(timer);
      timer = null;
      running = false;
      tapBtn.disabled = true;
      if (done) {
        finished = true;
        YD.sound.end();
        YD.speech.speak('時間到，共 ' + count + ' 次');
        stateText.textContent = '時間到！共 ' + count + ' 次。可以按「−1 修正」調整後再填入。';
        srTime.textContent = '時間到，共 ' + count + ' 次';
        useBtn.disabled = false;
        useBtn.focus();
      }
      startBtn.disabled = false;
      render();
    }
    function reset() {
      stop(false);
      left = total;
      count = 0;
      spokeHalf = false;
      countEl.textContent = '0';
      useBtn.disabled = true;
      stateText.textContent = '按「開始」後倒數 3 秒，聽到嗶聲開始。';
      render();
    }

    var content = h(
      'div',
      null,
      face,
      srTime,
      stateText,
      tapBtn,
      h('div', { class: 'row between', style: { marginTop: '12px' } }, h('div', null, '目前次數：', countEl, ' 次'), minusBtn),
      h('div', { class: 'modal-actions' }, startBtn, resetBtn, useBtn, h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { d.close(); } }, '關閉'))
    );
    var d = openDialog(test.name + '・' + (total >= 60 ? total / 60 + ' 分鐘' : total + ' 秒') + '計時', content, function () {
      if (timer) clearInterval(timer);
      YD.speech.stop();
    });
    render();
    startBtn.focus();
    return d;
  }

  /** 碼錶（起身繞行） */
  function stopwatch(test, onResult) {
    var t0 = 0;
    var running = false;
    var raf = null;
    var laps = [];
    var timeEl = h('div', { class: 'timer-time' }, '0.0');
    var stateText = h('p', { class: 'muted', style: { textAlign: 'center' }, 'aria-live': 'polite' }, '說「開始」的同時按下按鈕；長者坐回椅子時再按一次。');
    var lapList = h('ol', { class: 'lap-list', 'aria-label': '已記錄的次數' });
    var main = h('button', { type: 'button', class: 'tap-btn', onclick: toggle }, '▶ 開始計時');
    var useBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-accent',
        disabled: true,
        onclick: function () {
          onResult(Math.min.apply(null, laps));
          d.close();
        }
      },
      '填入最快的一次'
    );
    function frame() {
      timeEl.textContent = ((performance.now() - t0) / 1000).toFixed(1);
      raf = root.requestAnimationFrame(frame);
    }
    function toggle() {
      YD.sound.unlock();
      if (!running) {
        if (laps.length >= 2) laps = [];
        running = true;
        t0 = performance.now();
        main.textContent = '■ 停止（坐回椅子）';
        stateText.textContent = '計時中…';
        YD.sound.go();
        frame();
      } else {
        running = false;
        root.cancelAnimationFrame(raf);
        var sec = Math.round(((performance.now() - t0) / 1000) * 10) / 10;
        timeEl.textContent = sec.toFixed(1);
        laps.push(sec);
        YD.sound.end();
        main.textContent = laps.length >= 2 ? '↺ 重新測量' : '▶ 第 2 次計時';
        stateText.textContent = '第 ' + laps.length + ' 次：' + sec.toFixed(1) + ' 秒' + (laps.length < 2 ? '。休息一下再測第 2 次（取最快的一次）。' : '。');
        renderLaps();
      }
    }
    function renderLaps() {
      YD.dom.clear(lapList);
      laps.forEach(function (l, i) {
        lapList.appendChild(h('li', null, h('span', null, '第 ' + (i + 1) + ' 次'), h('span', null, l.toFixed(1) + ' 秒')));
      });
      useBtn.disabled = !laps.length;
      if (laps.length) useBtn.textContent = '填入最快的一次：' + Math.min.apply(null, laps).toFixed(1) + ' 秒';
    }
    var content = h(
      'div',
      null,
      h('div', { class: 'timer-face' }, timeEl, h('div', { class: 'muted' }, '秒')),
      stateText,
      main,
      lapList,
      h('div', { class: 'modal-actions' }, useBtn, h('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { d.close(); } }, '關閉'))
    );
    var d = openDialog(test.name + '・碼錶', content, function () {
      if (raf) root.cancelAnimationFrame(raf);
    });
    main.focus();
    return d;
  }

  function open(test, onResult) {
    if (!test.timer) return null;
    return test.timer.type === 'stopwatch' ? stopwatch(test, onResult) : countdown(test, onResult);
  }

  YD.timer = { open: open, fmt: fmt };
})(typeof globalThis !== 'undefined' ? globalThis : this);
