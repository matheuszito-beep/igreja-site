/**
 * Painel: equipe (somente administradores) — lista as contas e define o papel de cada pessoa.
 */
(function () {
  'use strict';

  const { $, h, toast, setMessage, ROLE_LABELS } = window.AdminUI;
  const ROLES = Object.freeze(['membro', 'lider', 'editor', 'admin']);

  function initials(person) {
    const source = (person.nome || person.email || '?').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
    return letters.toUpperCase();
  }

  function create({ client, profile }) {
    const list = $('[data-team-list]');
    const errorEl = $('[data-team-error]');
    let people = [];

    async function changeRole(person, select) {
      const previous = person.papel;
      const next = select.value;
      select.disabled = true;
      setMessage(errorEl, '');
      try {
        await client.rpc('definir_papel', { usuario: person.id, novo_papel: next });
        people = people.map((item) => (item.id === person.id ? { ...item, papel: next } : item));
        toast((person.nome || person.email) + ' agora é ' + ROLE_LABELS[next].toLowerCase());
      } catch (error) {
        console.error('[painel] Não foi possível alterar o papel.', error);
        select.value = previous;
        setMessage(errorEl, error.message);
      } finally {
        select.disabled = false;
      }
    }

    function personItem(person) {
      const isMe = person.id === profile.id;
      const select = h('select', {
        class: 'role-select',
        'aria-label': 'Papel de ' + (person.nome || person.email),
        disabled: isMe,
      }, ROLES.map((role) => h('option', { value: role, text: ROLE_LABELS[role], selected: role === person.papel })));
      select.addEventListener('change', () => changeRole(person, select));

      return h('li', { class: 'team-item' }, [
        h('span', { class: 'team-item__avatar', 'aria-hidden': 'true', text: initials(person) }),
        h('span', { class: 'team-item__body' }, [
          h('span', { class: 'team-item__name', text: (person.nome || 'Sem nome') + (isMe ? ' (você)' : '') }),
          h('span', { class: 'team-item__email', text: person.email || '' }),
        ]),
        select,
      ]);
    }

    async function load() {
      setMessage(errorEl, '');
      list.replaceChildren(h('li', { class: 'event-list__empty', text: 'Carregando equipe…' }));
      try {
        people = await client.from('perfis').select('select=id,nome,email,papel,criado_em&order=criado_em');
        list.replaceChildren(...people.map(personItem));
      } catch (error) {
        console.error('[painel] Não foi possível carregar a equipe.', error);
        list.replaceChildren();
        setMessage(errorEl, error.message);
      }
    }

    return Object.freeze({ load });
  }

  window.AdminTeam = Object.freeze({ create });
})();
