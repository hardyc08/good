/*
 * 銀動方程式 — Service Worker（離線使用）
 * 網頁外殼與核心程式先快取，社區據點網路不穩時仍可評估（資料存在本機）。
 * /api/ 請求一律走網路，不快取任何長者資料。更新版本時請修改 VERSION。
 */
const VERSION = 'yd-1.0.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/css/app.css',
  './assets/js/boot.js',
  './assets/js/core/norms.js',
  './assets/js/core/screening.js',
  './assets/js/core/exercises.js',
  './assets/js/core/prescription.js',
  './assets/js/core/validate.js',
  './assets/js/core/narrative.js',
  './assets/js/core/assess.js',
  './assets/js/data/demo.js',
  './assets/js/lib/dom.js',
  './assets/js/lib/figure.js',
  './assets/js/lib/speech.js',
  './assets/js/lib/store.js',
  './assets/js/lib/ai.js',
  './assets/js/lib/csv.js',
  './assets/js/ui/charts.js',
  './assets/js/ui/report.js',
  './assets/js/ui/timer.js',
  './assets/js/ui/wizard.js',
  './assets/js/ui/admin.js',
  './assets/js/ui/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  if (url.hostname === 'api.anthropic.com') return;

  // 頁面：網路優先，離線時用快取
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 靜態檔與字型：先用快取，背景更新
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
