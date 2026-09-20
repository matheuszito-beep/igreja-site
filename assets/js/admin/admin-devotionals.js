/**
 * Painel: devocional do dia — lista e editor (um por data, escrito pela equipe).
 */
(function () {
  'use strict';

  const { $, $$, h, toast, setMessage, setBusy, setFieldError, clearFieldErrors, confirmDialog } = window.AdminUI;
  const model = window.DevocionaisModel;
  const utils = window.CalendarUtils;
  const banco = window.VersiculosBanco;

  const PREVIEW_MAX = 70;

  const COLUMNS = 'id,data,versiculo_referencia,versiculo_texto,texto,autor,publicado';
  const TEXT_FIELDS = Object.freeze(['data', 'versiculoReferencia', 'versiculoTexto', 'texto', 'autor']);

  const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
  const fullFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  function create({ client }) {
    const panel = $('[data-panel="devocionais"]');
    const list = $('[data-devotionals-list]', panel);
    const summary = $('[data-devotionals-summary]', panel);
    const errorEl = $('[data-devotionals-error]', panel);

    const dialog = $('[data-devotional-editor]');
    const form = $('[data-devotional-form]', dialog);
    const fields = form.elements;
    const title = $('[data-devotional-editor-title]', dialog);
    const message = $('[data-devotional-message]', dialog);
    const saveButton = $('[data-devotional-save]', dialog);
    const deleteButton = $('[data-devotional-delete]', dialog);
    const verseCounter = $('[data-count-for="dev-versiculo"]', dialog);
    const textCounter = $('[data-count-for="dev-texto"]', dialog);
    const temaSelect = $('[data-devotional-tema]', dialog);
    const suggestionsList = $('[data-devotional-sugestoes]', dialog);

    let rows = [];
    let editing = null;

    /* ---------- Sugestão de versículo por tema ---------- */
    if (banco) {
      temaSelect.append(...banco.listThemes().map((tema) => h('option', { value: tema.chave, text: tema.nome })));
    }

    function useSuggestion(verse) {
      fields.versiculoReferencia.value = verse.referencia;
      fields.versiculoTexto.value = verse.texto;
      setFieldError(form, 'versiculoReferencia', '');
      setFieldError(form, 'versiculoTexto', '');
      updateCounters();
      fields.texto.focus();
    }

    function renderSuggestions() {
      const verses = banco ? banco.versesForTheme(temaSelect.value) : [];
      suggestionsList.hidden = !verses.length;
      suggestionsList.replaceChildren(...verses.map((verse) => h('li', {}, h('button', {
        type: 'button',
        class: 'verse-suggestion',
        onclick: () => useSuggestion(verse),
      }, [
        h('span', { class: 'verse-suggestion__ref', text: verse.referencia }),
        h('span', {
          class: 'verse-suggestion__preview',
          text: verse.texto.length > PREVIEW_MAX ? verse.texto.slice(0, PREVIEW_MAX) + '…' : verse.texto,
        }),
      ]))));
    }

    temaSelect.addEventListener('change', renderSuggestions);

    /* ---------- Lista ---------- */
    function devotionalItem(row) {
      const date = utils.parseLocal(row.data);
      const isToday = row.data === model.todayKey();
      return h('li', {}, h('button', { type: 'button', class: 'event-item', style: { '--cat': isToday ? '#0071e3' : '#86868b' }, onclick: () => openEditor(row) }, [
        h('span', { class: 'event-item__date', 'aria-hidden': 'true' }, [
          h('span', { class: 'event-item__month', text: monthFormat.format(date).replace('.', '') }),
          h('span', { class: 'event-item__day', text: String(date.getDate()) }),
        ]),
        h('span', { class: 'event-item__body' }, [
          h('span', { class: 'event-item__title', text: row.versiculo_referencia }),
          h('span', { class: 'event-item__meta', text: fullFormat.format(date) }),
          h('span', { class: 'event-item__badges' }, [
            isToday ? h('span', { class: 'badge badge--cat', text: 'Hoje' }) : null,
            row.publicado ? null : h('span', { class: 'badge badge--draft', text: 'Rascunho' }),
          ]),
        ]),
        h('span', { class: 'event-item__chevron', 'aria-hidden': 'true' }),
      ]));
    }

    function renderList() {
      const items = [...rows].sort((a, b) => b.data.localeCompare(a.data));
      const drafts = rows.filter((row) => !row.publicado).length;
      summary.textContent = rows.length + (rows.length === 1 ? ' devocional cadastrado' : ' devocionais cadastrados') +
        (drafts ? ' · ' + drafts + (drafts === 1 ? ' rascunho' : ' rascunhos') : '');
      const emptyText = 'Nenhum devocional cadastrado. Toque em “Novo devocional” para começar.';
      list.replaceChildren(...(items.length ? items.map(devotionalItem) : [h('li', { class: 'event-list__empty', text: emptyText })]));
    }

    async function load() {
      setMessage(errorEl, '');
      if (!rows.length) list.replaceChildren(h('li', { class: 'event-list__empty', text: 'Carregando devocionais…' }));
      try {
        rows = await client.from('devocionais').select('select=' + COLUMNS + '&order=data.desc');
        renderList();
      } catch (error) {
        console.error('[painel] Não foi possível carregar os devocionais.', error);
        list.replaceChildren();
        setMessage(errorEl, error.message);
      }
    }

    /* ---------- Editor ---------- */
    const updateCounters = () => {
      verseCounter.textContent = fields.versiculoTexto.value.length + '/' + model.VERSE_MAX;
      textCounter.textContent = fields.texto.value.length + '/' + model.TEXT_MAX;
    };

    function writeForm(values) {
      TEXT_FIELDS.forEach((name) => { fields[name].value = values[name] || ''; });
      fields.publicado.checked = values.publicado;
      updateCounters();
    }

    function readForm() {
      return {
        ...Object.fromEntries(TEXT_FIELDS.map((name) => [name, fields[name].value])),
        publicado: fields.publicado.checked,
      };
    }

    function openEditor(row) {
      editing = row || null;
      writeForm(row ? model.rowToForm(row) : { ...model.rowToForm({}), data: model.todayKey(), publicado: true });
      temaSelect.value = '';
      renderSuggestions();
      title.textContent = row ? 'Editar devocional' : 'Novo devocional';
      deleteButton.hidden = !row;
      clearFieldErrors(form);
      setMessage(message, '');
      dialog.showModal();
      fields.data.focus();
    }

    async function save(event) {
      event.preventDefault();
      clearFieldErrors(form);
      setMessage(message, '');

      const values = readForm();
      const { valid, errors } = model.validateDevotionalForm(values);
      if (!valid) {
        Object.entries(errors).forEach(([name, text]) => setFieldError(form, name, text));
        setMessage(message, 'Revise os campos destacados.');
        const firstInvalid = fields[Object.keys(errors)[0]];
        if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();
        return;
      }

      const row = model.formToRow(values);
      const target = editing;
      setBusy(saveButton, true, 'Salvando…');
      try {
        const saved = target
          ? await client.from('devocionais').update('id=eq.' + encodeURIComponent(target.id), row)
          : await client.from('devocionais').insert(row);
        if (!saved) throw new Error('Você não tem permissão para salvar este devocional.');
        rows = target ? rows.map((item) => (item.id === saved.id ? saved : item)) : [...rows, saved];
        dialog.close();
        renderList();
        toast(target ? 'Devocional atualizado' : 'Devocional cadastrado');
      } catch (error) {
        console.error('[painel] Não foi possível salvar o devocional.', error);
        const duplicate = String(error.message || '').includes('devocionais_data_key');
        setMessage(message, duplicate ? 'Já existe um devocional cadastrado para essa data.' : (error.message || 'Não foi possível salvar. Tente novamente.'));
      } finally {
        setBusy(saveButton, false);
      }
    }

    async function removeDevotional() {
      const target = editing;
      if (!target) return;
      const confirmed = await confirmDialog({
        title: 'Excluir devocional?',
        text: 'O devocional de ' + fullFormat.format(utils.parseLocal(target.data)) + ' sai do site. Isso não pode ser desfeito.',
        confirmLabel: 'Excluir',
      });
      if (!confirmed) return;

      setBusy(deleteButton, true, 'Excluindo…');
      try {
        const removed = await client.from('devocionais').remove('id=eq.' + encodeURIComponent(target.id));
        if (!removed) throw new Error('Você não tem permissão para excluir este devocional.');
        rows = rows.filter((item) => item.id !== target.id);
        dialog.close();
        renderList();
        toast('Devocional excluído');
      } catch (error) {
        console.error('[painel] Não foi possível excluir o devocional.', error);
        setMessage(message, error.message || 'Não foi possível excluir. Tente novamente.');
      } finally {
        setBusy(deleteButton, false);
      }
    }

    /* ---------- Eventos de interface ---------- */
    form.addEventListener('submit', save);
    deleteButton.addEventListener('click', removeDevotional);
    fields.versiculoTexto.addEventListener('input', updateCounters);
    fields.texto.addEventListener('input', updateCounters);
    $$('[data-devotional-close]', dialog).forEach((button) => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => { editing = null; });
    $('[data-new-devotional]', panel).addEventListener('click', () => openEditor(null));

    return Object.freeze({ load });
  }

  window.AdminDevotionals = Object.freeze({ create });
})();
