/**
 * Service Worker do site: deixa o site instalável ("Adicionar à tela de início") e
 * mostra as notificações push (culto ao vivo, devocional de manhã). Não guarda nada
 * em cache de propósito: os dados da agenda já têm cache próprio em
 * cached-resource.js, e cachear HTML/CSS/JS aqui bagunçaria o "Cache-Control:
 * no-cache" que o .htaccess já usa para sempre servir a versão nova.
 */
'use strict';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

/** send-push manda { title, body, url } — ver supabase/functions/send-push. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { title: 'Batista Maanaim', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Batista Maanaim', {
    body: data.body || '',
    icon: 'assets/img/icon-192.png',
    badge: 'assets/img/icon-192.png',
    data: { url: data.url || '.' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.url || '.', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => client.url.startsWith(self.registration.scope));
      if (open) return open.focus();
      return self.clients.openWindow(url);
    }),
  );
});
