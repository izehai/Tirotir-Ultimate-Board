self.addEventListener('install', function(e){
  if (self.skipWaiting) self.skipWaiting();
  e.waitUntil(caches.open('uboard-v2.2.2').then(function(c){ return c.addAll(['/','/teacher','/static/style.css','/socket.io/socket.io.js','/manifest.json']); }));
});
self.addEventListener('activate', function(e){ if (self.clients && self.clients.claim) self.clients.claim(); });
self.addEventListener('fetch', function(e){ e.respondWith(caches.match(e.request).then(function(r){ return r || fetch(e.request); })); });