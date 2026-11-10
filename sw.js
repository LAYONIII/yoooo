/* Service worker : rend le site installable et l'ouvre même avec une connexion instable.
   Stratégie « réseau d'abord » pour nos fichiers : on a toujours la dernière version
   quand on est en ligne, et la copie en cache sinon. Les requêtes vers Deezer
   et PeerJS ne sont jamais mises en cache. */
const CACHE = 'blindtest-v6';
const FILES = ['./', 'index.html', 'blindtest.html', 'tierlist.html', 'css/style.css', 'css/hub.css', 'css/tierlist.css', 'js/picker.js', 'js/room.js', 'js/tierlist.js', 'js/core.js', 'js/artists.js', 'js/quiz.js', 'js/solo.js', 'js/battle.js', 'js/pick.js', 'js/online.js', 'js/app.js', 'js/fx3d.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
