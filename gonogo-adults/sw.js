// sw.js — 오프라인용 로컬 캐시. 외부 서버와 통신하지 않는다.
//
// caches 는 origin(도메인) 전체가 공유한다. 30개 앱이 한 도메인에 올라가므로
// 앱마다 고유 접두사 'cog:<앱폴더명>:' 를 붙이고, 정리(activate)도 자기 접두사만 건드린다.
//
// 전략:
//   · 공유 코드(../core/*, ../*-common/* = 엔진·문구)  → network-first
//       온라인이면 항상 최신을 받아 캐시를 갱신한다. 엔진/문구를 고쳐도
//       30개 앱의 버전 번호를 일일이 안 올려도 반영된다. 오프라인이면 캐시.
//   · 앱 고유 정적파일(html·매니페스트·아이콘)          → cache-first (빠르게 열림)
//   · 네트워크·캐시 모두 실패 → 흰 화면 대신 반드시 Response 반환.
const APP = 'gonogo-adults';
const CACHE = 'cog:' + APP + ':v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  '../core/engine.js',
  '../core/i18n.js',
  '../gonogo-common/gonogo.js',
];

// 공유 코드(엔진·문구)인가 → network-first 대상
const isShared = (url) => url.pathname.includes('/core/') || url.pathname.includes('-common/');

// 네트워크·캐시 모두 실패 시 돌려줄 응답(흰 화면 방지)
const offline = () =>
  new Response('오프라인 상태이며 캐시에 없는 자료입니다.', {
    status: 503, statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

self.addEventListener('install', (e) => {
  // addAll 대신 개별 add + 실패 허용: 아이콘 하나가 404여도 설치가 실패하지 않는다.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  const legacy = new RegExp('^' + APP + '-v\\d+$'); // 접두사 도입 전 옛 캐시 이름(같은 앱 것만)
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // 내 앱의 옛 버전만 삭제. 다른 앱 캐시는 절대 건드리지 않는다.
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
    // network-first: 최신 → (실패 시) 자기 캐시 → (그것도 없으면) offline()
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
    // cache-first: 자기 캐시 → (없으면) 네트워크(받으면 캐시) → (실패 시) offline()
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
