/*
 * 銀動方程式 — 語音朗讀（Web Speech API）與提示音（Web Audio）
 * 朗讀使用台灣華語聲音（zh-TW），語速放慢，方便長者聆聽。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var synth = root.speechSynthesis || null;
  var voice = null;

  function pickVoice() {
    if (!synth) return null;
    var voices = synth.getVoices() || [];
    var prefs = ['zh-TW', 'zh_TW', 'cmn-Hant-TW', 'zh-HK', 'zh-CN', 'zh'];
    for (var i = 0; i < prefs.length; i++) {
      for (var j = 0; j < voices.length; j++) {
        if ((voices[j].lang || '').toLowerCase().indexOf(prefs[i].toLowerCase()) === 0) return voices[j];
      }
    }
    return null;
  }
  if (synth) {
    voice = pickVoice();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', function () {
        voice = pickVoice();
      });
    } else {
      synth.onvoiceschanged = function () {
        voice = pickVoice();
      };
    }
  }

  function speak(text, opts) {
    if (!synth || !text) return false;
    opts = opts || {};
    try {
      if (opts.interrupt !== false) synth.cancel();
      var u = new root.SpeechSynthesisUtterance(String(text).replace(/[✓⚠⛔•]/g, ''));
      u.lang = voice ? voice.lang : 'zh-TW';
      if (voice) u.voice = voice;
      u.rate = opts.rate || 0.9;
      u.pitch = 1;
      if (opts.onend) u.onend = opts.onend;
      synth.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }

  function stop() {
    if (synth) {
      try {
        synth.cancel();
      } catch (e) {
        /* 忽略 */
      }
    }
  }

  /* ---------------- 提示音 ---------------- */
  var ctx = null;
  function audio() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }
  function beep(freq, ms, vol) {
    var ac = audio();
    if (!ac) return;
    try {
      if (ac.state === 'suspended') ac.resume();
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = freq || 880;
      g.gain.value = 0;
      o.connect(g);
      g.connect(ac.destination);
      var t = ac.currentTime;
      g.gain.linearRampToValueAtTime(vol || 0.35, t + 0.02);
      g.gain.linearRampToValueAtTime(0, t + (ms || 180) / 1000);
      o.start(t);
      o.stop(t + (ms || 180) / 1000 + 0.05);
    } catch (e) {
      /* 部分瀏覽器不支援 */
    }
  }

  YD.speech = {
    supported: !!synth,
    speak: speak,
    stop: stop,
    hasChineseVoice: function () {
      return !!voice;
    }
  };
  YD.sound = {
    beep: beep,
    tick: function () {
      beep(660, 120, 0.25);
    },
    go: function () {
      beep(990, 380, 0.4);
    },
    end: function () {
      beep(523, 250, 0.4);
      setTimeout(function () {
        beep(784, 450, 0.4);
      }, 260);
    },
    unlock: function () {
      var ac = audio();
      if (ac && ac.state === 'suspended') ac.resume();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
