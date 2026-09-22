/**
 * Mapa com as 3 unidades da igreja, na seção "Planeje sua visita" da página inicial.
 */
(function () {
  'use strict';

  const Site = window.Site;
  if (!Site || !window.MapKit) return;

  const { $, h, config } = Site;
  const FIT_PADDING = [32, 32];
  const FIT_MAX_ZOOM = 15;

  const el = {
    map: $('[data-visit-map]'),
    status: $('[data-visit-map-status]'),
  };
  if (!el.map || !el.status || !config.unidades || !config.unidades.length) return;

  const directionsUrl = (unidade) =>
    'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(unidade.busca);

  function popupContent(unidade) {
    return h('div', {}, [
      h('span', { class: 'map-popup__title', text: unidade.nome + (unidade.principal ? ' · sede' : '') }),
      h('span', { class: 'map-popup__meta', text: unidade.linha1 }),
      h('span', { class: 'map-popup__meta', text: unidade.linha2 }),
      h('a', { class: 'map-popup__link', href: directionsUrl(unidade), target: '_blank', rel: 'noopener', text: 'Como chegar' }),
    ]);
  }

  async function init() {
    try {
      const L = await window.MapKit.loadLeaflet();
      const principal = config.unidades.find((unidade) => unidade.principal) || config.unidades[0];
      const map = window.MapKit.createMap(L, el.map, { center: principal.coords, zoom: 13 });

      const points = config.unidades.map((unidade) => {
        L.marker(unidade.coords, {
          icon: window.MapKit.pinIcon(L, { selected: unidade.principal }),
          title: unidade.nome,
          alt: unidade.nome,
        })
          .bindPopup(popupContent(unidade))
          .addTo(map);
        return unidade.coords;
      });

      if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM });
      el.status.hidden = true;
    } catch (error) {
      el.status.textContent = error.message + ' Veja o endereço de cada unidade acima.';
    }
  }

  init();
})();
