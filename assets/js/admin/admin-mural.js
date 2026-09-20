/**
 * Painel: mural de oração — moderação (só remover). Ninguém edita o texto de outra pessoa,
 * só a própria equipe (editor/admin) pode tirar algo do ar.
 */
(function () {
  'use strict';

  const { $, h, toast, setMessage, confirmDialog } = window.AdminUI;

  const COLUMNS = 'id,pedido,nome,criado_em';
  const PREVIEW_MAX = 140;
  const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function create({ client }) {
    const panel = $('[data-panel="mural"]');
    const summary = $('[data-mural-admin-summary]', panel);
    const errorEl = $('[data-mural-admin-error]', panel);
    const list = $('[data-mural-admin-list]', panel);

    let rows = [];

    function preview(text) {
      return text.length > PREVIEW_MAX ? text.slice(0, PREVIEW_MAX) + '…' : text;
    }

    function item(row) {
      return h('li', { class: 'member-item' }, [
        h('span', {}, [
          h('span', { class: 'member-item__name', text: preview(row.pedido) }),
          h('span', { class: 'member-item__meta', text: dateFormat.format(new Date(row.criado_em)) + ' · ' + (row.nome || 'Anônimo') }),
        ]),
        h('span', { class: 'member-item__actions' }, [
          h('button', { type: 'button', class: 'text-button', text: 'Remover', onclick: () => remove(row) }),
        ]),
      ]);
    }

    function render() {
      summary.textContent = rows.length + (rows.length === 1 ? ' pedido publicado' : ' pedidos publicados');
      list.replaceChildren(...(rows.length
        ? rows.map(item)
        : [h('li', { class: 'event-list__empty', text: 'Nenhum pedido publicado no mural ainda.' })]));
    }

    async function load() {
      setMessage(errorEl, '');
      if (!rows.length) list.replaceChildren(h('li', { class: 'event-list__empty', text: 'Carregando mural…' }));
      try {
        rows = await client.from('pedidos_oracao').select('select=' + COLUMNS + '&order=criado_em.desc');
        render();
      } catch (error) {
        console.error('[painel] Não foi possível carregar o mural.', error);
        list.replaceChildren();
        setMessage(errorEl, error.message);
      }
    }

    async function remove(row) {
      const confirmed = await confirmDialog({
        title: 'Remover do mural?',
        text: 'Esse pedido some do carrossel público. Isso não pode ser desfeito.',
        confirmLabel: 'Remover',
      });
      if (!confirmed) return;

      try {
        const removed = await client.from('pedidos_oracao').remove('id=eq.' + encodeURIComponent(row.id));
        if (!removed) throw new Error('Você não tem permissão para remover este pedido.');
        rows = rows.filter((item) => item.id !== row.id);
        render();
        toast('Pedido removido do mural');
      } catch (error) {
        console.error('[painel] Não foi possível remover o pedido.', error);
        setMessage(errorEl, error.message);
      }
    }

    return Object.freeze({ load });
  }

  window.AdminMural = Object.freeze({ create });
})();
