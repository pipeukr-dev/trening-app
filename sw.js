// Service worker: офлайн-кэш приложения.
// Занятие идёт на поле без интернета — кэшируем оболочку целиком.
//
// Имя кэша версионное: deploy.sh подставляет метку сборки в строку ниже
// (она же меняет байты sw.js, из-за чего браузер ставит новый воркер).
// Старые кэши удаляются в activate, поэтому обновление доходит с первого раза.
const BUILD = '20260806-2304-2eeeb10';
const CACHE = 'trening-' + BUILD;
const SHELL = './index.html';
const ASSETS = ['./', SHELL];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('trening-') && k !== CACHE)
            .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Оболочка приложения (навигация, index.html) — это единственное, что меняется
// между сборками.
function isShell(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
}

function putCopy(key, response) {
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Оболочка — network-first: сначала сеть (иначе правки не доходят),
  // при неудаче отдаём кэш. На поле сеть падает сразу, задержки нет.
  if (isShell(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => { if (res && res.ok) putCopy(SHELL, res); return res; })
        .catch(() => caches.match(SHELL).then((hit) => hit || caches.match('./')))
    );
    return;
  }

  // Остальное статично — cache-first.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res && res.ok) putCopy(e.request, res);
      return res;
    }).catch(() => caches.match(SHELL)))
  );
});
