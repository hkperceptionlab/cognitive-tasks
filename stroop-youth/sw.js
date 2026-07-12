// sw.js — 오프라인용 로컬 캐시. 외부 서버와 통신하지 않는다.
const CACHE = 'stroop-youth-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../core/engine.js',
  '../core/i18n.js',
  '../stroop-common/stroop.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 같은 출처 GET 만 처리: 네트워크 우선(온라인이면 항상 최신 코드) → 실패 시 캐시(오프라인).
// 예전 cache-first 는 캐시된 코드를 계속 내려줘 수정이 기기에 반영되지 않았음.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
