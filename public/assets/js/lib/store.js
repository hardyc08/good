/*
 * 銀動方程式 — 資料儲存
 *
 * 兩種模式，自動偵測：
 *  1. 雲端模式（remote）：部署在 Netlify 且設定 ADMIN_PASSWORD 時，資料存在 Netlify Blobs，
 *     所有裝置共用同一個後台。
 *  2. 本機模式（local）：直接開啟網頁、Netlify Drop 拖曳部署或未設定後端時，資料存在
 *     此裝置瀏覽器（localStorage），適合單一平板在據點使用。
 */
(function (root) {
  'use strict';
  var YD = (root.YD = root.YD || {});

  var KEY = {
    records: 'yd.records.v1',
    seeded: 'yd.seeded.v1',
    settings: 'yd.settings.v1',
    adminHash: 'yd.adminHash.v1',
    aiKey: 'yd.aiKey.v1'
  };
  var SKEY = { admin: 'yd.admin.v1', draft: 'yd.draft.v1', own: 'yd.own.v1' };
  var DEFAULT_PASSWORD = 'yindong2026';
  var API = '/api';

  function getJSON(storage, k, fallback) {
    try {
      var v = storage.getItem(k);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function setJSON(storage, k, v) {
    try {
      storage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  }
  function ls() {
    try {
      return root.localStorage;
    } catch (e) {
      return null;
    }
  }
  function ss() {
    try {
      return root.sessionStorage;
    } catch (e) {
      return null;
    }
  }
  function lget(k, d) {
    var s = ls();
    return s ? getJSON(s, k, d) : d;
  }
  function lset(k, v) {
    var s = ls();
    return s ? setJSON(s, k, v) : false;
  }
  function sget(k, d) {
    var s = ss();
    return s ? getJSON(s, k, d) : d;
  }
  function sset(k, v) {
    var s = ss();
    return s ? setJSON(s, k, v) : false;
  }
  function sdel(k) {
    try {
      var s = ss();
      if (s) s.removeItem(k);
    } catch (e) {
      /* 忽略 */
    }
  }

  var state = {
    mode: 'local',
    checked: false,
    serverAI: false,
    serverModel: null,
    adminConfigured: false,
    storageOk: !!ls()
  };

  /* ---------------- 網路 ---------------- */
  function fetchTimeout(url, opts, ms) {
    opts = opts || {};
    var ctrl = root.AbortController ? new root.AbortController() : null;
    var timer = null;
    if (ctrl) {
      opts.signal = ctrl.signal;
      timer = setTimeout(function () {
        ctrl.abort();
      }, ms || 15000);
    }
    return root.fetch(url, opts).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var session = sget(SKEY.admin, null);
    if (opts.admin && session && session.token) headers.Authorization = 'Bearer ' + session.token;
    Object.keys(opts.headers || {}).forEach(function (k) {
      headers[k] = opts.headers[k];
    });
    return fetchTimeout(
      API + path,
      { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined },
      opts.timeout || 20000
    ).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) {
            var err = new Error((data && data.error) || '伺服器錯誤（' + res.status + '）');
            err.status = res.status;
            throw err;
          }
          return data;
        });
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    if (state.checked) return Promise.resolve(state);
    var isHttp = /^https?:$/.test(root.location ? root.location.protocol : '');
    var localOnly = !!(root.YD_CONFIG && (root.YD_CONFIG.preview || root.YD_CONFIG.localOnly));
    var probe = isHttp && !localOnly
      ? fetchTimeout(API + '/health', {}, 3000)
          .then(function (res) {
            if (!res.ok) return null;
            return res.json().catch(function () {
              return null;
            });
          })
          .catch(function () {
            return null;
          })
      : Promise.resolve(null);
    return probe.then(function (h) {
      if (h && h.ok) {
        state.serverAI = !!h.ai;
        state.serverModel = h.model || null;
        state.adminConfigured = !!h.adminConfigured;
        if (h.storage && h.adminConfigured) state.mode = 'remote';
      }
      state.checked = true;
      if (state.mode === 'local') seedIfNeeded();
      return state;
    });
  }

  /* ---------------- 本機資料 ---------------- */
  function localAll() {
    var list = lget(KEY.records, []);
    return Array.isArray(list) ? list : [];
  }
  function localSave(list) {
    if (!lset(KEY.records, list)) {
      var e = new Error('此裝置儲存空間不足，請先到後台匯出並清除舊資料。');
      e.code = 'QUOTA';
      throw e;
    }
  }
  function seedIfNeeded() {
    if (!ls()) return;
    if (lget(KEY.seeded, false)) return;
    var existing = localAll();
    var ids = {};
    existing.forEach(function (r) {
      ids[r.id] = true;
    });
    var demo = YD.demo.build().filter(function (r) {
      return !ids[r.id];
    });
    try {
      localSave(existing.concat(demo));
      lset(KEY.seeded, true);
    } catch (e) {
      /* 空間不足時略過示範資料 */
    }
  }

  function sortByDate(list) {
    return list.slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  /* ---------------- 公開功能（長者端） ---------------- */
  function saveAssessment(record) {
    if (state.mode === 'remote') {
      return api('/records', { method: 'POST', body: record }).then(function (res) {
        var own = sget(SKEY.own, {});
        own[res.id] = res.deleteToken;
        sset(SKEY.own, own);
        return res;
      });
    }
    return new Promise(function (resolve) {
      var list = localAll();
      var rec = JSON.parse(JSON.stringify(record));
      rec.id = rec.id || YD.assess.newRecordId();
      if (!rec.elderCode) {
        rec.elderCode = YD.assess.nextElderCode(
          list.map(function (r) {
            return r.elderCode;
          })
        );
      }
      rec.createdAt = rec.createdAt || new Date().toISOString();
      list.push(rec);
      localSave(list);
      var own = sget(SKEY.own, {});
      own[rec.id] = 'local';
      sset(SKEY.own, own);
      resolve({ id: rec.id, elderCode: rec.elderCode, createdAt: rec.createdAt });
    });
  }

  function deleteOwn(id) {
    var own = sget(SKEY.own, {});
    if (!own[id]) return Promise.reject(new Error('只能刪除自己剛剛建立的紀錄。'));
    if (state.mode === 'remote') {
      return api('/records/' + encodeURIComponent(id), { method: 'DELETE', headers: { 'X-Delete-Token': own[id] } }).then(function () {
        delete own[id];
        sset(SKEY.own, own);
        return true;
      });
    }
    return new Promise(function (resolve) {
      localSave(
        localAll().filter(function (r) {
          return r.id !== id;
        })
      );
      delete own[id];
      sset(SKEY.own, own);
      resolve(true);
    });
  }

  /** 以長者編號 + 年齡（±1 歲）查詢過去紀錄，回傳最少必要資訊。 */
  function lookupElder(code, age) {
    code = String(code || '').trim().toUpperCase();
    if (state.mode === 'remote') return api('/lookup', { method: 'POST', body: { elderCode: code, age: age } });
    return new Promise(function (resolve) {
      var mine = sortByDate(
        localAll().filter(function (r) {
          return r.elderCode === code;
        })
      );
      if (!mine.length) return resolve({ found: false });
      var last = mine[0];
      if (age && Math.abs(Number(age) - Number(last.profile.age)) > 1) return resolve({ found: false });
      resolve({
        found: true,
        elderCode: code,
        profile: { name: last.profile.name, sex: last.profile.sex, age: last.profile.age },
        history: mine.map(function (r) {
          return { id: r.id, createdAt: r.createdAt, sft: r.sft, profile: { sex: r.profile.sex, age: r.profile.age } };
        })
      });
    });
  }

  /* ---------------- 後台 ---------------- */
  function hashText(text) {
    var subtle = root.crypto && root.crypto.subtle;
    if (subtle && root.TextEncoder) {
      return subtle.digest('SHA-256', new root.TextEncoder().encode('yindong:' + text)).then(function (buf) {
        return Array.prototype.map
          .call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          })
          .join('');
      });
    }
    // 非安全環境（例如 file://）的簡易雜湊
    var h1 = 5381;
    var s = 'yindong:' + text;
    for (var i = 0; i < s.length; i++) h1 = ((h1 << 5) + h1 + s.charCodeAt(i)) >>> 0;
    return Promise.resolve('djb2-' + h1.toString(16));
  }

  function login(password) {
    if (state.mode === 'remote') {
      return api('/admin/login', { method: 'POST', headers: { Authorization: 'Bearer ' + password } }).then(function () {
        sset(SKEY.admin, { mode: 'remote', token: password, at: Date.now() });
        return { ok: true };
      });
    }
    return hashText(password).then(function (hash) {
      var stored = lget(KEY.adminHash, null);
      var p = stored ? Promise.resolve(stored === hash) : hashText(DEFAULT_PASSWORD).then(function (d) {
        return d === hash;
      });
      return p.then(function (ok) {
        if (!ok) {
          var e = new Error('密碼不正確');
          e.status = 401;
          throw e;
        }
        sset(SKEY.admin, { mode: 'local', at: Date.now() });
        return { ok: true, usingDefault: !stored };
      });
    });
  }
  function isAdmin() {
    var s = sget(SKEY.admin, null);
    return !!(s && s.mode === state.mode);
  }
  function logout() {
    sdel(SKEY.admin);
  }
  function changePassword(oldPw, newPw) {
    if (state.mode === 'remote') return Promise.reject(new Error('雲端模式的密碼請在 Netlify 環境變數 ADMIN_PASSWORD 修改。'));
    if (!newPw || newPw.length < 6) return Promise.reject(new Error('新密碼至少需要 6 個字元。'));
    return login(oldPw).then(function () {
      return hashText(newPw).then(function (hash) {
        lset(KEY.adminHash, hash);
        return true;
      });
    });
  }
  function usingDefaultPassword() {
    return state.mode === 'local' && !lget(KEY.adminHash, null);
  }

  function list() {
    if (state.mode === 'remote') {
      return api('/records', { admin: true }).then(function (res) {
        return sortByDate(res.records || []);
      });
    }
    return Promise.resolve(sortByDate(localAll()));
  }
  function get(id) {
    if (state.mode === 'remote') {
      return api('/records/' + encodeURIComponent(id), { admin: true }).then(function (res) {
        return res.record;
      });
    }
    var r = localAll().filter(function (x) {
      return x.id === id;
    })[0];
    return r ? Promise.resolve(r) : Promise.reject(new Error('找不到這筆紀錄'));
  }
  function remove(id) {
    if (state.mode === 'remote') return api('/records/' + encodeURIComponent(id), { method: 'DELETE', admin: true });
    localSave(
      localAll().filter(function (r) {
        return r.id !== id;
      })
    );
    return Promise.resolve(true);
  }
  function importMany(records) {
    if (state.mode === 'remote') {
      // 分批上傳，避免單次請求過大
      var batches = [];
      for (var i = 0; i < records.length; i += 50) batches.push(records.slice(i, i + 50));
      var total = 0;
      return batches
        .reduce(function (p, b) {
          return p.then(function () {
            return api('/records/bulk', { method: 'POST', admin: true, body: { records: b } }).then(function (res) {
              total += res.saved || 0;
            });
          });
        }, Promise.resolve())
        .then(function () {
          return total;
        });
    }
    var cur = localAll();
    var byId = {};
    cur.forEach(function (r, i) {
      byId[r.id] = i;
    });
    records.forEach(function (r) {
      if (byId[r.id] !== undefined) cur[byId[r.id]] = r;
      else cur.push(r);
    });
    localSave(cur);
    return Promise.resolve(records.length);
  }
  function loadDemo() {
    var demo = YD.demo.build();
    return importMany(demo);
  }
  function clearDemo() {
    if (state.mode === 'remote') return api('/records?demo=1', { method: 'DELETE', admin: true });
    localSave(
      localAll().filter(function (r) {
        return !r.demo;
      })
    );
    lset(KEY.seeded, true);
    return Promise.resolve(true);
  }
  function clearAll() {
    if (state.mode === 'remote') return api('/records?all=1', { method: 'DELETE', admin: true });
    localSave([]);
    lset(KEY.seeded, true);
    return Promise.resolve(true);
  }

  /* ---------------- 設定 ---------------- */
  var DEFAULT_SETTINGS = {
    font: 'normal',
    theme: 'auto',
    speech: false,
    aiMode: 'auto',
    aiModel: 'claude-opus-5-5',
    site: '北港樂智據點'
  };
  function settings() {
    var s = lget(KEY.settings, {}) || {};
    var out = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      out[k] = s[k] !== undefined ? s[k] : DEFAULT_SETTINGS[k];
    });
    return out;
  }
  function saveSettings(patch) {
    var s = settings();
    Object.keys(patch || {}).forEach(function (k) {
      s[k] = patch[k];
    });
    lset(KEY.settings, s);
    return s;
  }
  function aiKey(v) {
    if (v === undefined) return lget(KEY.aiKey, '') || '';
    if (!v) {
      try {
        ls().removeItem(KEY.aiKey);
      } catch (e) {
        /* 忽略 */
      }
      return '';
    }
    lset(KEY.aiKey, v);
    return v;
  }

  /* ---------------- 評估草稿（重新整理不遺失） ---------------- */
  function draft(v) {
    if (v === undefined) return sget(SKEY.draft, null);
    if (v === null) {
      sdel(SKEY.draft);
      return null;
    }
    sset(SKEY.draft, v);
    return v;
  }

  YD.store = {
    state: state,
    init: init,
    api: api,
    fetchTimeout: fetchTimeout,
    saveAssessment: saveAssessment,
    deleteOwn: deleteOwn,
    lookupElder: lookupElder,
    login: login,
    isAdmin: isAdmin,
    logout: logout,
    changePassword: changePassword,
    usingDefaultPassword: usingDefaultPassword,
    list: list,
    get: get,
    remove: remove,
    importMany: importMany,
    loadDemo: loadDemo,
    clearDemo: clearDemo,
    clearAll: clearAll,
    settings: settings,
    saveSettings: saveSettings,
    aiKey: aiKey,
    draft: draft,
    DEFAULT_PASSWORD: DEFAULT_PASSWORD
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
