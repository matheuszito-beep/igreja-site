/**
 * Painel: células — lista, cadastro com busca do endereço no mapa e endereço guardado só para a equipe.
 */
(function () {
  'use strict';

  const { $, $$, h, toast, setMessage, setBusy, setFieldError, clearFieldErrors, confirmDialog } = window.AdminUI;
  const model = window.CelulasModel;
  const { config } = window.Site;

  const COLUMNS = 'id,nome,perfil,lider_nome,dia_semana,horario,bairro,descricao,latitude,longitude,mostrar_endereco,endereco_publico,publicado,celulas_enderecos(endereco,referencia)';
  const GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
  const SEARCH_AREA = '-47.45,-23.10,-46.85,-23.50'; // região de Cabreúva: oeste, norte, leste, sul
  const FOUND_ZOOM = 17;
  const MAP_RESIZE_DELAY_MS = 60;
  const TEXT_FIELDS = Object.freeze(['nome', 'perfil', 'lider', 'diaSemana', 'horario', 'bairro', 'descricao', 'endereco', 'referencia']);
  const MAP_HINT = 'Busque o endereço ou toque no mapa para marcar o local.';

  const normalize = (text) => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  function create({ client }) {
    const panel = $('[data-panel="celulas"]');
    const list = $('[data-cells-list]', panel);
    const summary = $('[data-cells-summary]', panel);
    const errorEl = $('[data-cells-error]', panel);
    const search = $('[data-cells-search]', panel);

    const dialog = $('[data-cell-editor]');
    const form = $('[data-cell-form]', dialog);
    const fields = form.elements;
    const title = $('[data-cell-editor-title]', dialog);
    const message = $('[data-cell-message]', dialog);
    const saveButton = $('[data-cell-save]', dialog);
    const deleteButton = $('[data-cell-delete]', dialog);
    const geocodeButton = $('[data-cell-geocode]', dialog);
    const mapElement = $('[data-cell-map]', dialog);
    const mapStatus = $('[data-cell-map-status]', dialog);
    const counter = $('[data-count-for="cell-descricao"]', dialog);

    let rows = [];
    let query = '';
    let editing = null;
    let position = null;
    let miniMap = null;

    fields.perfil.replaceChildren(...Object.entries(model.PROFILES).map(([key, profile]) => h('option', { value: key, text: profile.nome })));
    fields.diaSemana.replaceChildren(
      h('option', { value: '', text: 'Escolha o dia' }),
      ...[1, 2, 3, 4, 5, 6, 0].map((day) => h('option', { value: String(day), text: model.WEEKDAYS[day] })),
    );

    /* ---------- Lista ---------- */
    function cellItem(row) {
      const cell = model.rowToCell(row);
      const address = model.rowToForm(row).endereco;
      return h('li', {}, h('button', { type: 'button', class: 'event-item', style: { '--cat': cell.cor }, onclick: () => openEditor(row) }, [
        h('span', { class: 'event-item__date', 'aria-hidden': 'true' }, [
          h('span', { class: 'event-item__month', text: model.WEEKDAYS_SHORT[cell.diaSemana] }),
          h('span', { class: 'event-item__day event-item__day--time', text: model.formatHour(cell.horario) }),
        ]),
        h('span', { class: 'event-item__body' }, [
          h('span', { class: 'event-item__title', text: cell.nome }),
          h('span', { class: 'event-item__meta', text: [cell.bairro, address, cell.lider].filter(Boolean).join(' · ') }),
          h('span', { class: 'event-item__badges' }, [
            h('span', { class: 'badge badge--cat', text: cell.perfilNome }),
            cell.publicado ? null : h('span', { class: 'badge badge--draft', text: 'Rascunho' }),
            h('span', { class: 'badge', text: cell.aproximado ? 'Local aproximado no site' : 'Endereço visível no site' }),
          ]),
        ]),
        h('span', { class: 'event-item__chevron', 'aria-hidden': 'true' }),
      ]));
    }

    function renderList() {
      const items = model.sortBySchedule(rows.map((row) => ({ ...model.rowToCell(row), row })))
        .filter((item) => !query || normalize([item.nome, item.bairro, item.lider, model.rowToForm(item.row).endereco].join(' ')).includes(query));
      const drafts = rows.filter((row) => !row.publicado).length;
      summary.textContent = rows.length + (rows.length === 1 ? ' célula cadastrada' : ' células cadastradas') +
        (drafts ? ' · ' + drafts + (drafts === 1 ? ' rascunho' : ' rascunhos') : '');
      const emptyText = query ? 'Nenhuma célula encontrada para “' + search.value.trim() + '”.' : 'Nenhuma célula cadastrada. Toque em “Nova célula” para começar.';
      list.replaceChildren(...(items.length ? items.map((item) => cellItem(item.row)) : [h('li', { class: 'event-list__empty', text: emptyText })]));
    }

    async function load() {
      setMessage(errorEl, '');
      if (!rows.length) list.replaceChildren(h('li', { class: 'event-list__empty', text: 'Carregando células…' }));
      try {
        rows = await client.from('celulas').select('select=' + COLUMNS + '&order=dia_semana,horario');
        renderList();
      } catch (error) {
        console.error('[painel] Não foi possível carregar as células.', error);
        list.replaceChildren();
        setMessage(errorEl, error.message);
      }
    }

    /* ---------- Mapa do editor ---------- */
    async function ensureMiniMap() {
      if (!miniMap) {
        const L = await window.MapKit.loadLeaflet();
        const map = window.MapKit.createMap(L, mapElement, { center: config.mapa.centro, zoom: config.mapa.zoom, scrollWheelZoom: true });
        map.on('click', (event) => placePin({ latitude: event.latlng.lat, longitude: event.latlng.lng }, false));
        miniMap = { L, map, marker: null };
      }
      miniMap.map.invalidateSize();
      return miniMap;
    }

    function updateMapStatus() {
      mapStatus.textContent = position ? 'Local marcado. Arraste o pino se precisar ajustar.' : MAP_HINT;
    }

    function placePin(point, centerMap) {
      position = point;
      setFieldError(form, 'mapa', '');
      updateMapStatus();
      if (!miniMap) return;
      const { L, map } = miniMap;
      const latLng = [point.latitude, point.longitude];
      if (miniMap.marker) {
        miniMap.marker.setLatLng(latLng);
      } else {
        miniMap.marker = L.marker(latLng, { icon: window.MapKit.pinIcon(L, { selected: true }), draggable: true, autoPan: true }).addTo(map);
        miniMap.marker.on('dragend', () => {
          const dropped = miniMap.marker.getLatLng();
          position = { latitude: dropped.lat, longitude: dropped.lng };
          updateMapStatus();
        });
      }
      if (centerMap) map.setView(latLng, FOUND_ZOOM);
    }

    function removePin() {
      if (miniMap && miniMap.marker) {
        miniMap.marker.remove();
        miniMap.marker = null;
      }
    }

    async function geocode() {
      const address = fields.endereco.value.trim();
      const bairro = fields.bairro.value.trim();
      setFieldError(form, 'endereco', '');
      if (address.length < 5) {
        setFieldError(form, 'endereco', 'Digite o endereço com rua e número para buscar.');
        fields.endereco.focus();
        return;
      }
      const params = new URLSearchParams({
        format: 'jsonv2',
        addressdetails: '1',
        limit: '1',
        countrycodes: 'br',
        'accept-language': 'pt-BR',
        viewbox: SEARCH_AREA,
        q: bairro && !normalize(address).includes(normalize(bairro)) ? address + ', ' + bairro : address,
      });

      setBusy(geocodeButton, true, 'Buscando…');
      try {
        const response = await fetch(GEOCODER_URL + '?' + params.toString(), { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Busca de endereço respondeu ' + response.status);
        const [result] = await response.json();
        if (!result) {
          mapStatus.textContent = 'Não encontramos esse endereço. Toque no mapa para marcar o local.';
          return;
        }
        await ensureMiniMap();
        placePin({ latitude: Number(result.lat), longitude: Number(result.lon) }, true);
        const details = result.address || {};
        const foundBairro = details.suburb || details.neighbourhood || details.quarter || details.city_district || details.village || '';
        if (!bairro && foundBairro) fields.bairro.value = foundBairro;
      } catch (error) {
        console.error('[painel] Falha ao buscar o endereço.', error);
        mapStatus.textContent = 'A busca de endereço não respondeu agora. Toque no mapa para marcar o local.';
      } finally {
        setBusy(geocodeButton, false);
      }
    }

    /* ---------- Editor ---------- */
    const updateCounter = () => { counter.textContent = fields.descricao.value.length + '/' + model.DESCRIPTION_MAX; };

    function writeForm(values) {
      TEXT_FIELDS.forEach((name) => { fields[name].value = values[name] || ''; });
      fields.mostrarEndereco.checked = values.mostrarEndereco;
      fields.publicado.checked = values.publicado;
      position = Number.isFinite(values.latitude) && Number.isFinite(values.longitude)
        ? { latitude: values.latitude, longitude: values.longitude }
        : null;
      updateCounter();
      updateMapStatus();
    }

    function readForm() {
      return {
        ...Object.fromEntries(TEXT_FIELDS.map((name) => [name, fields[name].value])),
        mostrarEndereco: fields.mostrarEndereco.checked,
        publicado: fields.publicado.checked,
        latitude: position ? position.latitude : null,
        longitude: position ? position.longitude : null,
      };
    }

    async function openEditor(row) {
      editing = row || null;
      writeForm(row ? model.rowToForm(row) : { ...model.rowToForm({}), perfil: 'mista', publicado: true });
      title.textContent = row ? 'Editar célula' : 'Nova célula';
      deleteButton.hidden = !row;
      clearFieldErrors(form);
      setMessage(message, '');
      dialog.showModal();
      fields.nome.focus();

      try {
        const { map } = await ensureMiniMap();
        removePin();
        setTimeout(() => {
          map.invalidateSize();
          if (position) placePin(position, true);
          else map.setView(config.mapa.centro, config.mapa.zoom);
        }, MAP_RESIZE_DELAY_MS);
      } catch (error) {
        mapStatus.textContent = error.message + ' Recarregue a página para tentar de novo.';
      }
    }

    async function save(event) {
      event.preventDefault();
      clearFieldErrors(form);
      setMessage(message, '');

      const values = readForm();
      const { valid, errors } = model.validateCellForm(values);
      if (!valid) {
        Object.entries(errors).forEach(([name, text]) => setFieldError(form, name, text));
        setMessage(message, 'Revise os campos destacados.');
        const firstInvalid = fields[Object.keys(errors)[0]];
        if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();
        return;
      }

      const { celula, endereco } = model.formToRows(values);
      const target = editing;
      let saved = null;
      setBusy(saveButton, true, 'Salvando…');
      try {
        saved = target
          ? await client.from('celulas').update('id=eq.' + encodeURIComponent(target.id), celula)
          : await client.from('celulas').insert(celula);
        if (!saved) throw new Error('Você não tem permissão para salvar esta célula.');
        const savedAddress = await client.from('celulas_enderecos').upsert({ celula_id: saved.id, ...endereco }, 'celula_id');
        const row = { ...saved, celulas_enderecos: savedAddress || endereco };
        rows = target ? rows.map((item) => (item.id === row.id ? row : item)) : [...rows, row];
        dialog.close();
        renderList();
        toast(target ? 'Célula atualizada' : 'Célula cadastrada');
      } catch (error) {
        console.error('[painel] Não foi possível salvar a célula.', error);
        if (!saved) {
          setMessage(message, error.message || 'Não foi possível salvar. Tente novamente.');
          return;
        }
        // A célula foi criada, mas o endereço não: a próxima tentativa atualiza em vez de duplicar.
        editing = { ...saved, celulas_enderecos: null };
        rows = target ? rows.map((item) => (item.id === saved.id ? editing : item)) : [...rows, editing];
        deleteButton.hidden = false;
        renderList();
        setMessage(message, 'A célula foi salva, mas o endereço não. Toque em Salvar de novo. (' + error.message + ')');
      } finally {
        setBusy(saveButton, false);
      }
    }

    async function removeCell() {
      const target = editing;
      if (!target) return;
      const confirmed = await confirmDialog({
        title: 'Excluir célula?',
        text: '“' + target.nome + '” sai do mapa do site e do app, junto com o endereço cadastrado.',
        confirmLabel: 'Excluir',
      });
      if (!confirmed) return;

      setBusy(deleteButton, true, 'Excluindo…');
      try {
        const removed = await client.from('celulas').remove('id=eq.' + encodeURIComponent(target.id));
        if (!removed) throw new Error('Você não tem permissão para excluir esta célula.');
        rows = rows.filter((item) => item.id !== target.id);
        dialog.close();
        renderList();
        toast('Célula excluída');
      } catch (error) {
        console.error('[painel] Não foi possível excluir a célula.', error);
        setMessage(message, error.message || 'Não foi possível excluir. Tente novamente.');
      } finally {
        setBusy(deleteButton, false);
      }
    }

    /* ---------- Eventos de interface ---------- */
    form.addEventListener('submit', save);
    deleteButton.addEventListener('click', removeCell);
    geocodeButton.addEventListener('click', geocode);
    fields.descricao.addEventListener('input', updateCounter);
    fields.endereco.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      geocode();
    });
    $$('[data-cell-close]', dialog).forEach((button) => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => { editing = null; });
    $('[data-new-cell]', panel).addEventListener('click', () => openEditor(null));
    search.addEventListener('input', () => {
      query = normalize(search.value.trim());
      renderList();
    });

    return Object.freeze({ load });
  }

  window.AdminCells = Object.freeze({ create });
})();
