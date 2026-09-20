/**
 * Página de células: mapa com os pontos, filtros por dia e perfil, "perto de mim" e lista.
 */
(function () {
  'use strict';

  const Site = window.Site;
  const model = window.CelulasModel;
  if (!Site || !model || !window.CachedResource || !window.MapKit) return;

  const { $, $$, h, config, whatsappUrl, toast, reducedMotion } = Site;

  const COLUMNS = 'id,nome,perfil,lider_nome,dia_semana,horario,bairro,descricao,latitude,longitude,mostrar_endereco,endereco_publico,publicado';
  const ALL = 'todos';
  const SELECTED_ZOOM = 15;
  const APPROXIMATE_RADIUS_M = 140;
  const FIT_PADDING = [48, 48];
  const GEOLOCATION_TIMEOUT_MS = 10000;
  const GEOLOCATION_MAX_AGE_MS = 5 * 60 * 1000;
  const NARROW_LAYOUT = window.matchMedia('(max-width: 900px)');

  const el = {
    days: $('[data-cells-days]'),
    profiles: $('[data-cells-profiles]'),
    nearMe: $('[data-near-me]'),
    error: $('[data-cells-error]'),
    map: $('[data-cells-map]'),
    mapStatus: $('[data-map-status]'),
    count: $('[data-cells-count]'),
    list: $('[data-cells-list]'),
    mineBanner: $('[data-mine-banner]'),
  };
  if (!el.map || !el.list) return;

  if (!window.SupabaseRest || !config.supabase) {
    console.error('[células] Supabase não configurado: verifique assets/js/config.js e a ordem dos scripts.');
    return;
  }
  const client = window.SupabaseRest.create({ url: config.supabase.url, key: config.supabase.chavePublica });

  let cells = [];
  let myCelulaId = null;
  let state = Object.freeze({ day: ALL, profile: ALL, selectedId: null, userLocation: null });
  let leaflet = null;

  const kmFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const formatDistance = (km) => (km < 1 ? Math.max(50, Math.round((km * 1000) / 50) * 50) + ' m' : kmFormat.format(km) + ' km');
  const scrollBehavior = () => (reducedMotion.matches ? 'auto' : 'smooth');
  const directionsUrl = (cell) => 'https://www.google.com/maps/dir/?api=1&destination=' + cell.latitude + ',' + cell.longitude;

  function setState(patch) {
    state = Object.freeze({ ...state, ...patch });
    render();
  }

  function visibleCells() {
    const filtered = cells.filter((cell) =>
      (state.day === ALL || cell.diaSemana === state.day) && (state.profile === ALL || cell.perfil === state.profile));
    if (!state.userLocation) return model.sortBySchedule(filtered);
    return [...filtered].sort((a, b) => model.distanceKm(state.userLocation, a) - model.distanceKm(state.userLocation, b));
  }

  /* ---------- Filtros ---------- */
  function chip(label, pressed, onClick, color) {
    return h('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(pressed),
      style: color ? { '--cat': color } : null,
      onclick: onClick,
    }, [color ? h('span', { class: 'chip__dot', 'aria-hidden': 'true' }) : null, label]);
  }

  function renderFilters() {
    const days = [...new Set(cells.map((cell) => cell.diaSemana))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    el.days.replaceChildren(
      chip('Todos os dias', state.day === ALL, () => setState({ day: ALL })),
      ...days.map((day) => chip(model.WEEKDAYS[day], state.day === day, () => setState({ day }))),
    );

    const profiles = Object.keys(model.PROFILES).filter((key) => cells.some((cell) => cell.perfil === key));
    el.profiles.replaceChildren(
      chip('Todos os perfis', state.profile === ALL, () => setState({ profile: ALL })),
      ...profiles.map((key) => chip(model.PROFILES[key].nome, state.profile === key, () => setState({ profile: key }), model.PROFILES[key].cor)),
    );
    el.profiles.hidden = profiles.length < 2;
  }

  /* ---------- Lista ---------- */
  function cellCard(cell) {
    const distance = state.userLocation ? model.distanceKm(state.userLocation, cell) : null;
    const isMine = cell.id === myCelulaId;
    return h('li', {}, h('article', {
      class: 'cell-card' + (cell.id === state.selectedId ? ' is-selected' : '') + (isMine ? ' is-mine' : ''),
      style: { '--cat': cell.cor },
      'data-cell-id': cell.id,
    }, [
      h('button', { type: 'button', class: 'cell-card__main', onclick: () => select(cell.id, false) }, [
        h('span', { class: 'cell-card__when', 'aria-hidden': 'true' }, [
          h('span', { class: 'cell-card__weekday', text: model.WEEKDAYS_SHORT[cell.diaSemana] }),
          h('span', { class: 'cell-card__time', text: model.formatHour(cell.horario) }),
        ]),
        h('span', { class: 'cell-card__body' }, [
          h('span', { class: 'cell-card__tags' }, [
            h('span', { class: 'pill', text: cell.perfilNome }),
            isMine ? h('span', { class: 'cell-card__mine', text: 'Sua célula' }) : null,
          ]),
          h('span', { class: 'cell-card__name', text: cell.nome }),
          h('span', { class: 'cell-card__meta', text: cell.horarioTexto + ' · ' + (cell.endereco || cell.bairro) }),
          cell.lider ? h('span', { class: 'cell-card__meta', text: 'Líder: ' + cell.lider }) : null,
          cell.descricao ? h('span', { class: 'cell-card__desc', text: cell.descricao }) : null,
        ]),
      ]),
      distance === null ? null : h('span', { class: 'cell-card__distance', text: formatDistance(distance) }),
      h('div', { class: 'cell-card__actions' }, [
        h('a', { class: 'btn', href: whatsappUrl(model.whatsappMessage(cell)), target: '_blank', rel: 'noopener', text: 'Quero participar' }),
        cell.aproximado ? null : h('a', { class: 'link-chevron', href: directionsUrl(cell), target: '_blank', rel: 'noopener', text: 'Como chegar' }),
      ]),
    ]));
  }

  function renderList(visible) {
    const total = visible.length;
    el.count.textContent = !cells.length ? 'Nenhuma célula publicada ainda.'
      : (total === 1 ? '1 célula encontrada' : total + ' células encontradas') +
        (state.userLocation && total ? ' · da mais perto para a mais longe' : '');
    const empty = cells.length ? 'Nenhuma célula com esses filtros. Tente outro dia ou perfil.' : 'Em breve novas células por aqui.';
    el.list.replaceChildren(...(total ? visible.map(cellCard) : [h('li', { class: 'cells-empty', text: empty })]));
  }

  /* ---------- Mapa ---------- */
  function popupContent(cell) {
    return h('div', {}, [
      h('span', { class: 'map-popup__title', text: cell.nome }),
      h('span', { class: 'map-popup__meta', text: cell.horarioTexto }),
      h('span', { class: 'map-popup__meta', text: cell.endereco || cell.bairro + ' · local aproximado' }),
      h('a', { class: 'map-popup__link', href: whatsappUrl(model.whatsappMessage(cell)), target: '_blank', rel: 'noopener', text: 'Quero participar' }),
    ]);
  }

  function fitToContent(visible) {
    const { L, map } = leaflet;
    const points = visible.map((cell) => [cell.latitude, cell.longitude]);
    if (state.userLocation) points.push([state.userLocation.latitude, state.userLocation.longitude]);
    if (!points.length) map.setView(config.mapa.centro, config.mapa.zoom);
    else if (points.length === 1) map.setView(points[0], SELECTED_ZOOM);
    else map.fitBounds(L.latLngBounds(points), { padding: FIT_PADDING, maxZoom: SELECTED_ZOOM });
  }

  function renderMap(visible) {
    if (!leaflet) return;
    const { L, map, layer, markers } = leaflet;
    layer.clearLayers();
    markers.clear();

    visible.forEach((cell) => {
      const point = [cell.latitude, cell.longitude];
      if (cell.aproximado) {
        L.circle(point, { radius: APPROXIMATE_RADIUS_M, stroke: false, fillColor: '#000', fillOpacity: 0.07, interactive: false }).addTo(layer);
      }
      const marker = L.marker(point, { icon: window.MapKit.pinIcon(L, { selected: cell.id === state.selectedId }), title: cell.nome, alt: cell.nome })
        .bindPopup(popupContent(cell))
        .on('click', () => select(cell.id, true))
        .addTo(layer);
      markers.set(cell.id, marker);
    });

    if (state.userLocation) {
      L.marker([state.userLocation.latitude, state.userLocation.longitude], {
        icon: window.MapKit.pinIcon(L, { user: true }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
    }
    fitToContent(visible);
  }

  async function initMap() {
    try {
      const L = await window.MapKit.loadLeaflet();
      const map = window.MapKit.createMap(L, el.map, { center: config.mapa.centro, zoom: config.mapa.zoom });
      leaflet = { L, map, layer: L.layerGroup().addTo(map), markers: new Map() };
      el.mapStatus.hidden = true;
      renderMap(visibleCells());
    } catch (error) {
      el.mapStatus.textContent = error.message + ' A lista de células continua disponível.';
    }
  }

  function renderMineBanner() {
    const cell = cells.find((item) => item.id === myCelulaId);
    el.mineBanner.hidden = !cell;
    if (!cell) return;
    el.mineBanner.replaceChildren(
      h('span', { class: 'cells-mine__dot', 'aria-hidden': 'true' }),
      h('p', {}, [
        'Você participa da ',
        h('strong', { text: cell.nome }),
        ' — ' + cell.horarioTexto + '. ',
        h('a', { class: 'link-chevron', href: 'conta.html', text: 'Ver na Minha Conta' }),
      ]),
    );
  }

  function render() {
    const visible = visibleCells();
    renderFilters();
    renderList(visible);
    renderMap(visible);
    renderMineBanner();
  }

  /** Sabe se a pessoa já está numa célula (só quando logada). Silencioso se falhar. */
  async function loadMyCelula() {
    if (!client || !client.auth.hasSession()) return;
    try {
      const [vinculo] = await client.from('celula_membros').select('select=celula_id');
      myCelulaId = vinculo ? vinculo.celula_id : null;
      render();
    } catch (error) {
      console.warn('[células] Não foi possível checar se você já participa de alguma.', error);
    }
  }

  /* ---------- Seleção e localização ---------- */
  function select(id, fromMap) {
    state = Object.freeze({ ...state, selectedId: id });
    $$('.cell-card', el.list).forEach((card) => card.classList.toggle('is-selected', card.dataset.cellId === id));
    const cell = cells.find((item) => item.id === id);

    if (leaflet && cell) {
      leaflet.markers.forEach((marker, markerId) => marker.setIcon(window.MapKit.pinIcon(leaflet.L, { selected: markerId === id })));
      if (!fromMap) {
        const point = [cell.latitude, cell.longitude];
        if (reducedMotion.matches) leaflet.map.setView(point, SELECTED_ZOOM);
        else leaflet.map.flyTo(point, SELECTED_ZOOM, { duration: 0.8 });
        const marker = leaflet.markers.get(id);
        if (marker) marker.openPopup();
        if (NARROW_LAYOUT.matches) el.map.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      }
    }

    if (fromMap) {
      const card = el.list.querySelector('[data-cell-id="' + id + '"]');
      if (card) card.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' });
    }
  }

  function locateUser() {
    if (state.userLocation) {
      el.nearMe.setAttribute('aria-pressed', 'false');
      setState({ userLocation: null });
      return;
    }
    if (!navigator.geolocation) {
      toast('Seu navegador não permite usar a localização.');
      return;
    }
    el.nearMe.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        el.nearMe.disabled = false;
        el.nearMe.setAttribute('aria-pressed', 'true');
        setState({ userLocation: { latitude: position.coords.latitude, longitude: position.coords.longitude } });
      },
      (error) => {
        el.nearMe.disabled = false;
        console.warn('[células] Localização indisponível.', error);
        toast(error.code === error.PERMISSION_DENIED
          ? 'Permita o acesso à localização para ver as células mais perto.'
          : 'Não foi possível descobrir sua localização agora.');
      },
      { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS },
    );
  }

  /* ---------- Dados ---------- */
  async function fetchCells() {
    const rows = await client.from('celulas', { anonymous: true }).select('select=' + COLUMNS + '&publicado=eq.true');
    return { celulas: rows };
  }

  window.CachedResource.create({ key: 'maanaim.celulas.v1', label: 'células', load: fetchCells })
    .subscribe((data, error) => {
      if (error) {
        el.error.textContent = 'Não foi possível carregar as células agora. Tente novamente em instantes.';
        el.error.hidden = false;
        el.count.textContent = '';
        return;
      }
      el.error.hidden = true;
      cells = data.celulas.map(model.rowToCell).filter((cell) => Number.isFinite(cell.latitude) && Number.isFinite(cell.longitude));
      if (state.selectedId && !cells.some((cell) => cell.id === state.selectedId)) {
        state = Object.freeze({ ...state, selectedId: null });
      }
      render();
    });

  el.nearMe.addEventListener('click', locateUser);
  initMap();
  loadMyCelula();
})();
