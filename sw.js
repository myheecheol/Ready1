// 오프라인에서도 열리도록 앱 파일을 캐시합니다. 앱을 고치면 VERSION을 올려 주세요.
const VERSION = "weekly-plan-v7";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];
// 이 주소들만 캐시(앱 파일, 글꼴, QR 라이브러리). 구글 시트 동기화 요청은 절대 캐시하지 않음
const CACHE_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin && !CACHE_HOSTS.includes(url.hostname)) return;
  // 네트워크 우선, 실패하면 캐시. 페이지 이동만 index.html로 대체
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
});
