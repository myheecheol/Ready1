// 오프라인에서도 열리도록 앱 파일을 캐시합니다. 앱을 고치면 VERSION을 올려 주세요.
const VERSION = "weekly-plan-v1";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // 네트워크 우선, 실패하면 캐시(글꼴 등 외부 파일도 한 번 받으면 캐시)
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone();
    if (res.ok || res.type === "opaque") caches.open(VERSION).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});
