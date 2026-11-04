/*
 * 銀動方程式 — AI 個人化說明（Claude）
 *
 * 取得方式依序嘗試：
 *  1. Netlify Function（/api/ai/narrative）：金鑰放在伺服器環境變數，最安全（建議）。
 *  2. 瀏覽器直接呼叫：管理者在後台「設定」輸入自己的 API 金鑰（只存在此裝置），
 *     適合沒有後端的展示環境。
 *  3. 都無法使用或逾時 → 改用本機規則引擎產生說明（處方內容完全相同）。
 * 送出的資料不含姓名；處方動作與劑量由規則引擎決定，AI 只撰寫說明文字。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var MODELS = [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5（預設，品質最佳）' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5（速度較快）' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5（最省成本）' }
  ];
  var SDK_URL = 'assets/vendor/anthropic-sdk.min.js';

  function status() {
    var st = YD.store.state;
    var s = YD.store.settings();
    if (s.aiMode === 'local') return { via: null, reason: '已設定只使用本機規則引擎' };
    if (st.serverAI) return { via: 'server', model: st.serverModel };
    if (YD.store.aiKey()) return { via: 'browser', model: s.aiModel };
    return { via: null, reason: '尚未設定 AI 金鑰' };
  }

  var sdkPromise = null;
  function loadSdk() {
    if (root.AnthropicSDK) return Promise.resolve(root.AnthropicSDK);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var s = root.document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () {
        if (root.AnthropicSDK) resolve(root.AnthropicSDK);
        else reject(new Error('AI 套件載入失敗'));
      };
      s.onerror = function () {
        sdkPromise = null;
        reject(new Error('AI 套件載入失敗'));
      };
      root.document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        reject(new Error('AI 回應逾時'));
      }, ms);
      p.then(
        function (v) {
          clearTimeout(t);
          resolve(v);
        },
        function (e) {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  function anonymize(input) {
    var copy = JSON.parse(JSON.stringify(input));
    if (copy.profile) {
      copy.profile.name = '';
      copy.profile.operator = '';
    }
    if (copy.health) copy.health.doctorNote = '';
    delete copy.elderCode;
    delete copy.site;
    return copy;
  }

  function viaServer(input, timeoutMs) {
    return withTimeout(
      YD.store.api('/ai/narrative', { method: 'POST', body: { input: anonymize(input) }, timeout: timeoutMs }),
      timeoutMs
    ).then(function (res) {
      if (!res || !res.narrative) throw new Error('AI 回應格式不正確');
      return { source: 'ai', via: 'server', model: res.model || null, data: res.narrative };
    });
  }

  function viaBrowser(ev, timeoutMs) {
    var key = YD.store.aiKey();
    var model = YD.store.settings().aiModel || MODELS[0].id;
    var ids = ev.rx.exercises.map(function (e) {
      return e.id;
    });
    return loadSdk().then(function (Anthropic) {
      var client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: timeoutMs });
      var req = client.beta.messages.create({
        model: model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: YD.narrative.OUTPUT_SCHEMA } },
        system: YD.narrative.SYSTEM_PROMPT,
        messages: [{ role: 'user', content: YD.narrative.userMessage(ev.summary) }]
      });
      return withTimeout(req, timeoutMs)
        .then(function (msg) {
          if (msg.stop_reason === 'refusal') throw new Error('AI 未提供回應');
          if (msg.stop_reason === 'max_tokens') throw new Error('AI 回應不完整');
          var text = (msg.content || [])
            .filter(function (b) {
              return b.type === 'text';
            })
            .map(function (b) {
              return b.text;
            })
            .join('');
          var data = YD.narrative.sanitize(JSON.parse(text), ids);
          if (!data) throw new Error('AI 回應格式不正確');
          return { source: 'ai', via: 'browser', model: msg.model || model, data: data };
        })
        .catch(function (err) {
          if (err instanceof Anthropic.AuthenticationError) throw new Error('AI 金鑰無效，請到後台設定重新輸入');
          if (err instanceof Anthropic.RateLimitError) throw new Error('AI 使用量已達上限，請稍後再試');
          if (err instanceof Anthropic.APIError) throw new Error('AI 服務暫時無法使用（' + (err.status || '連線') + '）');
          throw err;
        });
    });
  }

  /**
   * 產生個人化說明。成功回傳 { source: 'ai', via, model, data }；
   * 失敗時回傳本機版本 { source: 'local', data, error }，不會拋出例外。
   */
  function generate(input, ev, opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || 30000;
    var st = status();
    var local = function (err) {
      return { source: 'local', data: YD.narrative.local(ev.summary), error: err ? err.message || String(err) : null };
    };
    if (!st.via) return Promise.resolve(local(null));
    var p = st.via === 'server' ? viaServer(input, timeoutMs) : viaBrowser(ev, timeoutMs);
    return p.catch(function (err) {
      return local(err);
    });
  }

  /** 後台「測試 AI 連線」。 */
  function test() {
    var ev = YD.assess.evaluate(YD.demo.build()[0]);
    var st = status();
    if (!st.via) return Promise.reject(new Error(st.reason));
    var p = st.via === 'server' ? viaServer(ev.input, 45000) : viaBrowser(ev, 45000);
    return p;
  }

  YD.ai = { MODELS: MODELS, status: status, generate: generate, test: test, anonymize: anonymize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
