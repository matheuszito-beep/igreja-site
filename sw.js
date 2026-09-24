/**
 * Service Worker do site — hoje só existe para o site poder ser "adicionado à tela
 * de início" (PWA). Não guarda nada em cache de propósito: os dados da agenda já
 * têm cache próprio em cached-resource.js, e cachear HTML/CSS/JS aqui bagunçaria o
 * "Cache-Control: no-cache" que o .htaccess já usa para sempre servir a versão nova.
 *
 * É também a base para notificação push (culto ao vivo, devocional de manhã) quando
 * esse trabalho entrar em pauta — o listener de "push" entra aqui quando chegar a hora.
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
