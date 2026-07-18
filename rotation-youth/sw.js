// sw.js — 오프라인용 로컬 캐시. 외부 서버와 통신하지 않는다.
//
// caches 는 origin(도메인) 전체가 공유한다. 앱마다 고유 접두사 'cog:<앱폴더명>:' 를 붙이고,
// 정리(activate)도 자기 접두사만 건드린다.
//   · 공유 코드(../core/*, ../*-common/*) → network-first
//   · 앱 고유 정적파일(html·매니페스트·아이콘) → cache-first
//   · 네트워크·캐시 모두 실패 → 흰 화면 대신 반드시 Response 반환.
const APP = 'rotation-youth';
const CACHE = 'cog:' + APP + ':v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../core/engine.js',
  '../core/i18n.js',
  '../rotation-common/rotation.js',
];

const isShared = (url) => url.pathname.includes('/core/') || url.pathname.includes('-common/');

const offline = () =>
  new Response('오프라인 상태이며 캐시에 없는 자료입니다.', {
    status: 503, statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  const legacy = new RegExp('^' + APP + '-v\\d+$');
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => (k.startsWith('cog:' + APP + ':') || legacy.test(k)) && k !== CACHE)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (isShared(url)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.open(CACHE).then((c) => c.match(req)).then((r) => r || offline()))
    );
  } else {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              if (res && res.ok) c.put(req, res.clone()).catch(() => {});
              return res;
            })
            .catch(() => offline())
        )
      )
    );
  }
});
