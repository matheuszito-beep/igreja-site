/**
 * Mapas (Leaflet + OpenStreetMap/CARTO). A biblioteca só é baixada quando a página precisa de um mapa,
 * com verificação de integridade (SRI) para garantir que o arquivo não foi alterado.
 */
(function () {
  'use strict';

  const LEAFLET_BASE = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
  const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  // Mapa do OpenStreetMap: gratuito e sem chave (uso leve, com atribuição visível).
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const MAX_ZOOM = 19;

  let loading = null;

  function inject(tagName, attributes) {
    return new Promise((resolve, reject) => {
      const element = document.createElement(tagName);
      Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
      element.addEventListener('load', resolve, { once: true });
      element.addEventListener('error', () => reject(new Error('Falha ao carregar ' + (attributes.src || attributes.href))), { once: true });
      document.head.append(element);
    });
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!loading) {
      loading = Promise.all([
        inject('link', { rel: 'stylesheet', href: LEAFLET_BASE + 'leaflet.css', integrity: LEAFLET_CSS_SRI, crossorigin: 'anonymous' }),
        inject('script', { src: LEAFLET_BASE + 'leaflet.js', integrity: LEAFLET_JS_SRI, crossorigin: 'anonymous' }),
      ])
        .then(() => window.L)
        .catch((error) => {
          loading = null;
          console.error('[mapa] Não foi possível carregar a biblioteca de mapas.', error);
          throw new Error('Não foi possível carregar o mapa agora.');
        });
    }
    return loading;
  }

  function createMap(L, element, { center, zoom, scrollWheelZoom = false }) {
    const map = L.map(element, { center, zoom, scrollWheelZoom, zoomControl: true });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map);
    return map;
  }

  function pinIcon(L, { selected = false, user = false } = {}) {
    return L.divIcon({
      className: 'map-pin' + (selected ? ' is-selected' : '') + (user ? ' map-pin--user' : ''),
      html: '<span class="map-pin__shape"></span>',
      iconSize: user ? [22, 22] : [34, 44],
      iconAnchor: user ? [11, 11] : [17, 43],
      popupAnchor: [0, -38],
    });
  }

  window.MapKit = Object.freeze({ loadLeaflet, createMap, pinIcon });
})();
