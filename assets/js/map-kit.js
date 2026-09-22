/**
 * Mapas (Leaflet + tiles vetoriais do OpenFreeMap, dados do OpenStreetMap). As bibliotecas só são
 * baixadas quando a página precisa de um mapa, com verificação de integridade (SRI) para garantir
 * que os arquivos não foram alterados.
 */
(function () {
  'use strict';

  const LEAFLET_BASE = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
  const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

  const MAPLIBRE_BASE = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.8.0/dist/';
  const MAPLIBRE_CSS_SRI = 'sha256-Q8HYhrX98KrE5xNb1vhLgj2fSCg6ZIASZl+b5SwBOJ8=';
  const MAPLIBRE_JS_SRI = 'sha256-/Ze3rEckk2nOh+JKg3ReMZWTVxlO83FchrHF+EyCS7Y=';

  const MAPLIBRE_LEAFLET_URL = 'https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js';
  const MAPLIBRE_LEAFLET_SRI = 'sha256-Hmz4yz61/ZCYeaob82o4P7UGyaWy27+rq85lopTdH8s=';

  // Tiles vetoriais do OpenFreeMap: gratuitos, sem chave e sem limite de uso (dados do OpenStreetMap).
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

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
    if (window.L && window.L.maplibreGL) return Promise.resolve(window.L);
    if (!loading) {
      loading = Promise.all([
        inject('link', { rel: 'stylesheet', href: LEAFLET_BASE + 'leaflet.css', integrity: LEAFLET_CSS_SRI, crossorigin: 'anonymous' }),
        inject('link', { rel: 'stylesheet', href: MAPLIBRE_BASE + 'maplibre-gl.css', integrity: MAPLIBRE_CSS_SRI, crossorigin: 'anonymous' }),
        inject('script', { src: LEAFLET_BASE + 'leaflet.js', integrity: LEAFLET_JS_SRI, crossorigin: 'anonymous' }),
        inject('script', { src: MAPLIBRE_BASE + 'maplibre-gl.js', integrity: MAPLIBRE_JS_SRI, crossorigin: 'anonymous' }),
      ])
        // O binding do MapLibre no Leaflet lê window.L e window.maplibregl ao carregar,
        // então só pode ser injetado depois que os dois acima terminarem.
        .then(() => inject('script', { src: MAPLIBRE_LEAFLET_URL, integrity: MAPLIBRE_LEAFLET_SRI, crossorigin: 'anonymous' }))
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
    const map = L.map(element, { center, zoom, scrollWheelZoom, zoomControl: true, minZoom: 1 });
    L.maplibreGL({ style: STYLE_URL }).addTo(map);
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
