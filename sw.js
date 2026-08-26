// Service worker: офлайн-кэш приложения.
// Занятие идёт на поле без интернета — кэшируем оболочку целиком.
//
// Имя кэша версионное: deploy.sh подставляет метку сборки в строку ниже
// (дата, время и хэш содержимого). Новый деплой → новое имя кэша, старые
// удаляются в activate; меняются и байты sw.js, и адрес его регистрации
// (index.html регистрирует ./sw.js?v=BUILD), поэтому браузер обязан
// сходить за новым воркером на сервер.
//
// ГЛАВНОЕ ПРО ОБНОВЛЕНИЯ: и заливка кэша при install, и «сначала сеть»
// в fetch идут МИМО HTTP-кэша браузера (cache: 'reload'). Без этого
// GitHub Pages отдаёт index.html с max-age, WebView Telegram держит его
// у себя, и network-first честно возвращает СТАРУЮ сборку: на сервере
// файл новый, а на телефоне прежний. Именно это и не давало обновлениям
// доходить — одного версионного имени кэша мало.
const BUILD = '20260827-0141-b5c1771';
const CACHE = 'trening-' + BUILD;
const SHELL = './index.html';
const ASSETS = ['./', SHELL];

// Запрос в обход HTTP-кэша: ответ всегда с сервера.
// Строим из адреса, а не из самого запроса: у навигационных запросов
// mode = 'navigate', и new Request(запрос, …) на них падает.
function fresh(url) {
  return new Request(url, { cache: 'reload' });
}

self.addEventListener('install', (e) => {
  // Новая версия не ждёт закрытия всех вкладок.
  self.skipWaiting();
  // Кэш заливаем свежими копиями; если сети нет — install не валим,
  // оболочка доедет в кэш при первом же удачном запросе.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map(fresh)))
      .catch(() => {})
  );
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

  // Оболочка — network-first МИМО HTTP-кэша: сначала сервер, при неудаче
  // кэш. На поле сеть падает сразу, задержки нет.
  if (isShell(e.request)) {
    e.respondWith(
      fetch(fresh(e.request.url))
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
