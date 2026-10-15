/* =========================================================
   离线功能：把记账本的文件存一份在手机里，没网也能打开。
   只在网站上（https）起作用，双击本地文件时不会用到。

   每次打开时：先用手机里存的旧版本马上显示，
   同时在后台从网上下载新版本，下次打开就是新版本了。

   ⚠️ 新增文件时要加到 APP_FILES 里，并把 CACHE_NAME 的数字加 1。
   ========================================================= */

const CACHE_NAME = 'jizhang-v3';
const APP_FILES = [
  './',
  './index.html',
  './记账.html',
  './css/style.css',
  './js/tips.js',
  './js/app.js',
  './js/bank-import.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 删掉旧版本的缓存
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const fromNetwork = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached || Response.error());
      if (cached) {
        event.waitUntil(fromNetwork); // 后台更新
        return cached;
      }
      return fromNetwork;
    }),
  );
});
