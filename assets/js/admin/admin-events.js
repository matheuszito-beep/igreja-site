/**
 * Painel: lista de eventos e editor (criar, editar, publicar, excluir e enviar imagem).
 */
(function () {
  'use strict';

  const { $, $$, h, toast, capitalize, setMessage, setBusy, confirmDialog, canEditAll } = window.AdminUI;
  const model = window.AgendaModel;
  const utils = window.CalendarUtils;

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const IMAGE_EXTENSIONS = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' });
  const IMAGE_BUCKET = 'eventos';
  const DEFAULT_START_TIME = '19:00';
  const COLUMNS = 'id,titulo,categoria_id,inicio,fim,local,descricao,imagem_url,eh_culto,recorrencia,recorrencia_ate,excecoes,publicado,criado_por,inscricao_aberta,vagas,vagas_ocupadas';
  const TEXT_FIELDS = Object.freeze(['titulo', 'categoria', 'dataInicio', 'horaInicio', 'dataFim', 'horaFim', 'local', 'descricao', 'imagemUrl', 'recorrencia', 'recorrenciaAte', 'vagas']);
  const REGISTRANT_COLUMNS = 'id,nome,whatsapp,quantidade,criado_em';
  const FREQUENCY_LABELS = Object.freeze({ semanal: 'Toda semana', quinzenal: 'A cada 15 dias', mensal: 'Todo mês' });
  const EMPTY_TEXT = Object.freeze({
    proximos: 'Nenhum evento programado. Que tal criar o próximo?',
    rascunhos: 'Nenhum rascunho no momento.',
    fixos: 'Nenhum culto fixo cadastrado.',
    passados: 'Nenhum evento passado.',
  });

  const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
  const fullFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const tagFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

  const normalize = (text) => String(text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  function create({ client, profile }) {
    const panel = $('[data-panel="eventos"]');
    const list = $('[data-events-list]', panel);
    const summary = $('[data-events-summary]', panel);
    const errorEl = $('[data-events-error]', panel);
    const search = $('[data-events-search]', panel);
    const filterGroup = $('[data-events-filter]', panel);

    const dialog = $('[data-editor]');
    const form = $('[data-editor-form]', dialog);
    const fields = form.elements;
    const editorTitle = $('[data-editor-title]', dialog);
    const editorMessage = $('[data-editor-message]', dialog);
    const saveButton = $('[data-editor-save]', dialog);
    const deleteButton = $('[data-editor-delete]', dialog);
    const preview = $('[data-image-preview]', dialog);
    const removeImageButton = $('[data-image-remove]', dialog);
    const exceptionInput = $('[data-exception-input]', dialog);
    const exceptionList = $('[data-exceptions]', dialog);
    const repeatOptions = $('[data-repeat-options]', dialog);
    const endDateField = $('[data-end-date]', dialog);
    const liderHint = $('[data-lider-hint]', dialog);
    const counter = $('[data-count-for="descricao"]', dialog);
    const vagasField = $('[data-vagas-field]', dialog);
    const registrantsBox = $('[data-registrants-box]', dialog);
    const registrantsCount = $('[data-registrants-count]', dialog);
    const registrantsList = $('[data-registrants-list]', dialog);
    const registrantsCsvButton = $('[data-registrants-csv]', dialog);

    const isEditorRole = canEditAll(profile.papel);
    let rows = [];
    let categories = [];
    let filter = 'proximos';
    let query = '';
    let editing = null;
    let exceptions = [];
    let pendingFile = null;
    let objectUrl = null;
    let registrants = [];

    const categoryById = (id) => categories.find((category) => category.id === id);
    const canEditRow = (row) => isEditorRole || (row.criado_por === profile.id && !row.publicado);
    const startOf = (row) => utils.parseLocal(model.rowToEvent(row).inicio);

    /* ---------- Lista ---------- */
    function nextOccurrence(row, now) {
      try {
        return utils.upcoming([model.rowToEvent(row)], now, 1)[0] || null;
      } catch (error) {
        console.warn('[painel] Evento com dados inconsistentes:', row.id, error);
        return null;
      }
    }

    function matchesFilter(item) {
      if (filter === 'rascunhos') return !item.row.publicado;
      if (filter === 'fixos') return item.row.eh_culto;
      if (filter === 'passados') return !item.next;
      return Boolean(item.next);
    }

    function sortItems(a, b) {
      if (filter === 'passados') return startOf(b.row) - startOf(a.row);
      return (a.next ? a.next.start : startOf(a.row)) - (b.next ? b.next.start : startOf(b.row));
    }

    function badgesFor(row) {
      const category = categoryById(row.categoria_id);
      return [
        category ? h('span', { class: 'badge badge--cat', text: category.nome }) : null,
        row.publicado ? null : h('span', { class: 'badge badge--draft', text: 'Rascunho' }),
        row.eh_culto ? h('span', { class: 'badge', text: 'Culto fixo' }) : null,
        row.inscricao_aberta ? h('span', { class: 'badge', text: 'Inscrição' + (row.vagas ? ' · ' + row.vagas_ocupadas + '/' + row.vagas : '') }) : null,
        row.recorrencia ? h('span', { class: 'badge', text: FREQUENCY_LABELS[row.recorrencia] }) : null,
        canEditRow(row) ? null : h('span', { class: 'badge', text: 'Somente leitura' }),
      ];
    }

    function eventItem({ row, next }) {
      const category = categoryById(row.categoria_id);
      const date = next ? next.start : startOf(row);
      const meta = capitalize(fullFormat.format(date)) + ' · ' + utils.formatHour(date) + (row.local ? ' · ' + row.local : '');
      return h('li', {}, h('button', {
        type: 'button',
        class: 'event-item',
        style: { '--cat': category ? category.cor : '#86868b' },
        onclick: () => openEditor(row),
      }, [
        h('span', { class: 'event-item__date', 'aria-hidden': 'true' }, [
          h('span', { class: 'event-item__month', text: monthFormat.format(date).replace('.', '') }),
          h('span', { class: 'event-item__day', text: String(date.getDate()) }),
        ]),
        h('span', { class: 'event-item__body' }, [
          h('span', { class: 'event-item__title', text: row.titulo }),
          h('span', { class: 'event-item__meta', text: meta }),
          h('span', { class: 'event-item__badges' }, badgesFor(row)),
        ]),
        h('span', { class: 'event-item__chevron', 'aria-hidden': 'true' }),
      ]));
    }

    function renderList() {
      const now = new Date();
      const items = rows
        .map((row) => ({ row, next: nextOccurrence(row, now) }))
        .filter((item) => matchesFilter(item) && (!query || normalize(item.row.titulo + ' ' + (item.row.local || '')).includes(query)))
        .sort(sortItems);

      const drafts = rows.filter((row) => !row.publicado).length;
      summary.textContent = rows.length + (rows.length === 1 ? ' evento cadastrado' : ' eventos cadastrados') +
        (drafts ? ' · ' + drafts + (drafts === 1 ? ' rascunho' : ' rascunhos') : '');

      const emptyText = query ? 'Nenhum evento encontrado para “' + search.value.trim() + '”.' : EMPTY_TEXT[filter];
      list.replaceChildren(...(items.length ? items.map(eventItem) : [h('li', { class: 'event-list__empty', text: emptyText })]));
    }

    async function load() {
      setMessage(errorEl, '');
      list.replaceChildren(h('li', { class: 'event-list__empty', text: 'Carregando eventos…' }));
      try {
        const [categoryRows, eventRows] = await Promise.all([
          client.from('categorias').select('select=id,nome,cor,ordem&order=ordem'),
          client.from('eventos').select('select=' + COLUMNS + '&order=inicio'),
        ]);
        categories = categoryRows;
        rows = eventRows;
        fields.categoria.replaceChildren(
          h('option', { value: '', text: 'Escolha uma categoria' }),
          ...categories.map((category) => h('option', { value: category.id, text: category.nome })),
        );
        renderList();
      } catch (error) {
        console.error('[painel] Não foi possível carregar os eventos.', error);
        list.replaceChildren();
        setMessage(errorEl, error.message);
      }
    }

    /* ---------- Editor ---------- */
    const setFieldError = (name, message) => window.AdminUI.setFieldError(form, name, message);
    const clearFieldErrors = () => window.AdminUI.clearFieldErrors(form);
    const updateCounter = () => { counter.textContent = fields.descricao.value.length + '/' + model.DESCRIPTION_MAX; };

    function showPreview(url, isObjectUrl) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = isObjectUrl ? url : null;
      preview.hidden = !url;
      if (url) preview.src = url;
      else preview.removeAttribute('src');
      removeImageButton.hidden = !url;
    }

    function renderExceptions() {
      exceptionList.replaceChildren(...exceptions.map((date) => {
        const label = tagFormat.format(utils.parseLocal(date));
        return h('li', { class: 'tag' }, [
          label,
          h('button', {
            type: 'button',
            class: 'tag__remove',
            'aria-label': 'Remover ' + label,
            text: '×',
            onclick: () => {
              exceptions = exceptions.filter((item) => item !== date);
              renderExceptions();
            },
          }),
        ]);
      }));
    }

    function syncConditionalFields() {
      endDateField.hidden = !fields.multiDia.checked;
      if (fields.multiDia.checked && !fields.dataFim.value) fields.dataFim.value = fields.dataInicio.value;
      repeatOptions.hidden = !fields.recorrencia.value;
      vagasField.hidden = !fields.porInscricao.checked;
      fields.recorrencia.disabled = fields.porInscricao.checked;
      if (fields.porInscricao.checked) {
        fields.recorrencia.value = '';
        repeatOptions.hidden = true;
      }
    }

    function writeForm(values) {
      TEXT_FIELDS.forEach((name) => { fields[name].value = values[name] || ''; });
      fields.ehCulto.checked = values.ehCulto;
      fields.publicado.checked = values.publicado;
      fields.porInscricao.checked = Boolean(values.porInscricao);
      fields.multiDia.checked = Boolean(values.dataFim && values.dataFim !== values.dataInicio);
      fields.arquivo.value = '';
      exceptionInput.value = '';
      exceptions = [...values.excecoes];
      pendingFile = null;
      syncConditionalFields();
      renderExceptions();
      showPreview(values.imagemUrl, false);
      updateCounter();
    }

    function readForm() {
      const values = Object.fromEntries(TEXT_FIELDS.map((name) => [name, fields[name].value]));
      return {
        ...values,
        dataFim: fields.multiDia.checked ? values.dataFim : '',
        ehCulto: fields.ehCulto.checked,
        porInscricao: fields.porInscricao.checked,
        publicado: isEditorRole && fields.publicado.checked,
        excecoes: exceptions,
      };
    }

    function registrantRow(person) {
      return h('li', { class: 'registrants__row' }, [
        h('span', {}, [
          h('strong', { text: person.nome }),
          ' · ',
          h('small', { text: person.quantidade + (person.quantidade === 1 ? ' pessoa' : ' pessoas') }),
        ]),
        h('small', { text: person.whatsapp }),
      ]);
    }

    function exportRegistrantsCsv(row) {
      const header = ['Nome', 'WhatsApp', 'Pessoas', 'Inscrito em'];
      const lines = [header, ...registrants.map((person) => [
        person.nome,
        person.whatsapp,
        String(person.quantidade),
        fullFormat.format(new Date(person.criado_em)),
      ])];
      const csv = lines.map((line) => line.map((field) => '"' + String(field).replace(/"/g, '""') + '"').join(',')).join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = h('a', { href: url, download: 'inscritos-' + normalize(row.titulo).replace(/[^a-z0-9]+/g, '-') + '.csv' });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function loadRegistrants(row) {
      registrants = [];
      registrantsBox.hidden = true;
      if (!row || !row.inscricao_aberta) return;
      try {
        registrants = await client.from('inscricoes_evento').select('select=' + REGISTRANT_COLUMNS + '&evento_id=eq.' + encodeURIComponent(row.id) + '&order=criado_em');
      } catch (error) {
        console.warn('[painel] Não foi possível carregar os inscritos.', error);
        return;
      }
      registrantsBox.hidden = false;
      registrantsCount.textContent = '(' + registrants.length + (row.vagas ? '/' + row.vagas : '') + ')';
      registrantsList.replaceChildren(...(registrants.length
        ? registrants.map(registrantRow)
        : [h('li', { class: 'registrants__row', text: 'Ainda sem inscritos.' })]));
    }

    function openEditor(row) {
      editing = row || null;
      const editable = !row || canEditRow(row);
      writeForm(row ? model.rowToForm(row) : {
        ...model.rowToForm({}),
        dataInicio: utils.toDateKey(new Date()),
        horaInicio: DEFAULT_START_TIME,
        publicado: isEditorRole,
      });
      editorTitle.textContent = !row ? 'Novo evento' : editable ? 'Editar evento' : 'Detalhes do evento';
      $$('fieldset', form).forEach((fieldset) => { fieldset.disabled = !editable; });
      fields.publicado.disabled = !isEditorRole;
      liderHint.hidden = isEditorRole;
      saveButton.hidden = !editable;
      deleteButton.hidden = !row || !editable;
      clearFieldErrors();
      setMessage(editorMessage, '');
      loadRegistrants(row);
      dialog.showModal();
      if (editable) fields.titulo.focus();
    }

    function selectFile() {
      const [file] = fields.arquivo.files;
      setFieldError('imagemUrl', '');
      if (!file) return;
      const problem = !IMAGE_EXTENSIONS[file.type] ? 'Use uma imagem JPG, PNG, WebP ou AVIF.'
        : file.size > MAX_IMAGE_BYTES ? 'A imagem precisa ter no máximo 5 MB.' : '';
      if (problem) {
        setFieldError('imagemUrl', problem);
        fields.arquivo.value = '';
        return;
      }
      pendingFile = file;
      fields.imagemUrl.value = '';
      showPreview(URL.createObjectURL(file), true);
    }

    function uploadImage(file) {
      const path = new Date().getFullYear() + '/' + crypto.randomUUID() + '.' + IMAGE_EXTENSIONS[file.type];
      return client.storage.upload(IMAGE_BUCKET, path, file);
    }

    async function save(event) {
      event.preventDefault();
      clearFieldErrors();
      setMessage(editorMessage, '');

      const values = readForm();
      const { valid, errors } = model.validateEventForm(values);
      if (!valid) {
        Object.entries(errors).forEach(([name, message]) => setFieldError(name, message));
        setMessage(editorMessage, 'Revise os campos destacados.');
        const firstInvalid = fields[Object.keys(errors)[0]];
        if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();
        return;
      }

      const wasEditing = editing;
      setBusy(saveButton, true, 'Salvando…');
      try {
        if (pendingFile) values.imagemUrl = await uploadImage(pendingFile);
        const row = model.formToRow(values);
        const saved = wasEditing
          ? await client.from('eventos').update('id=eq.' + encodeURIComponent(wasEditing.id), row)
          : await client.from('eventos').insert(row);
        if (!saved) throw new Error('Você não tem permissão para salvar este evento.');
        rows = wasEditing ? rows.map((item) => (item.id === saved.id ? saved : item)) : [...rows, saved];
        dialog.close();
        renderList();
        toast(wasEditing ? 'Evento atualizado' : saved.publicado ? 'Evento publicado' : 'Rascunho salvo');
      } catch (error) {
        console.error('[painel] Não foi possível salvar o evento.', error);
        setMessage(editorMessage, error.message || 'Não foi possível salvar. Tente novamente.');
      } finally {
        setBusy(saveButton, false);
      }
    }

    async function removeEvent() {
      const target = editing;
      if (!target) return;
      const confirmed = await confirmDialog({
        title: 'Excluir evento?',
        text: '“' + target.titulo + '” será removido do site e do app. Isso não pode ser desfeito.',
        confirmLabel: 'Excluir',
      });
      if (!confirmed) return;

      setBusy(deleteButton, true, 'Excluindo…');
      try {
        const removed = await client.from('eventos').remove('id=eq.' + encodeURIComponent(target.id));
        if (!removed) throw new Error('Você não tem permissão para excluir este evento.');
        rows = rows.filter((item) => item.id !== target.id);
        dialog.close();
        renderList();
        toast('Evento excluído');
      } catch (error) {
        console.error('[painel] Não foi possível excluir o evento.', error);
        setMessage(editorMessage, error.message || 'Não foi possível excluir. Tente novamente.');
      } finally {
        setBusy(deleteButton, false);
      }
    }

    function addException() {
      if (!exceptionInput.value) return;
      exceptions = [...new Set([...exceptions, exceptionInput.value])].sort();
      exceptionInput.value = '';
      renderExceptions();
    }

    /* ---------- Eventos de interface ---------- */
    form.addEventListener('submit', save);
    deleteButton.addEventListener('click', removeEvent);
    $$('[data-editor-close]', dialog).forEach((button) => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => {
      editing = null;
      pendingFile = null;
      registrants = [];
      showPreview('', false);
    });
    fields.multiDia.addEventListener('change', syncConditionalFields);
    fields.recorrencia.addEventListener('change', syncConditionalFields);
    fields.porInscricao.addEventListener('change', syncConditionalFields);
    registrantsCsvButton.addEventListener('click', () => { if (editing) exportRegistrantsCsv(editing); });
    fields.descricao.addEventListener('input', updateCounter);
    fields.arquivo.addEventListener('change', selectFile);
    fields.imagemUrl.addEventListener('change', () => {
      const url = fields.imagemUrl.value.trim();
      if (!url) return;
      pendingFile = null;
      fields.arquivo.value = '';
      showPreview(/^https:\/\//i.test(url) ? url : '', false);
    });
    removeImageButton.addEventListener('click', () => {
      pendingFile = null;
      fields.arquivo.value = '';
      fields.imagemUrl.value = '';
      showPreview('', false);
    });
    $('[data-exception-add]', dialog).addEventListener('click', addException);
    $('[data-new-event]', panel).addEventListener('click', () => openEditor(null));
    search.addEventListener('input', () => {
      query = normalize(search.value.trim());
      renderList();
    });
    filterGroup.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (!chip) return;
      filter = chip.dataset.filter;
      $$('[data-filter]', filterGroup).forEach((button) => button.setAttribute('aria-pressed', String(button === chip)));
      renderList();
    });

    return Object.freeze({ load });
  }

  window.AdminEvents = Object.freeze({ create });
})();
