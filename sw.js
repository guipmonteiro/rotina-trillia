// Service worker: funciona offline, atualiza o feed pela rede e abre o app ao tocar na notificação.
const VERSION = 'v1.2.0';
const SHELL = `rotina-shell-${VERSION}`;
const RUNTIME = 'rotina-runtime';

const ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js', 'js/a11y.js', 'js/holidays.js', 'js/views-onboarding.js', 'js/content.js', 'js/ctx.js', 'js/geo.js', 'js/ics.js',
  'js/ponto.js', 'js/store.js', 'js/ui.js', 'js/util.js',
  'js/views-ajustes.js', 'js/views-mercado.js', 'js/views-ponto.js', 'js/views-trabalho.js',
  'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/badge-96.png',
  'data/feed.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('rotina-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Feed: rede primeiro, cache como reserva
  if (url.origin === location.origin && url.pathname.endsWith('/data/feed.json')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        const c = await caches.open(RUNTIME);
        c.put(new Request(url.origin + url.pathname), res.clone());
        return res;
      } catch {
        return (await caches.match(url.origin + url.pathname)) || caches.match('data/feed.json');
      }
    })());
    return;
  }

  // Arquivos do app: cache primeiro, atualiza em segundo plano
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      const net = fetch(req).then(async (res) => {
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await net) || caches.match('index.html');
    })());
    return;
  }

  // Recursos externos (mapa, fontes, Leaflet): rede, com cópia em cache
  if (/unpkg\.com|fonts\.(googleapis|gstatic)\.com|tile\.openstreetmap\.org/.test(url.host)) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(RUNTIME);
        c.put(req, res.clone());
        return res;
      } catch {
        return caches.match(req);
      }
    })());
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './#bater', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: 'bater' });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
