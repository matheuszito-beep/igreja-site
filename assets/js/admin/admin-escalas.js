/**
 * Painel: escalas de voluntários — ministérios, equipe de cada um e quem está escalado.
 * Líder só vê e mexe nos ministérios que lidera; editor/admin veem e criam todos.
 * A equipe não precisa ter conta no site: sem e-mail reconhecido, a pessoa entra só com o
 * nome e o líder marca a resposta dela manualmente (clicando no status da escala).
 * Escalar é em lote: escolhe o culto (ou uma data solta) e marca quem da equipe vai.
 */
(function () {
  'use strict';

  const { $, $$, h, toast, setMessage, setBusy, setFieldError, clearFieldErrors, canEditAll, confirmDialog } = window.AdminUI;
  const model = window.EscalasModel;
  const utils = window.CalendarUtils;
  const agendaModel = window.AgendaModel;

  const MINISTRY_COLUMNS = 'id,nome,ativo';
  const MEMBER_COLUMNS = 'id,ministerio_id,perfil_id,nome_exibicao,email,lider';
  const ESCALA_COLUMNS = 'id,ministerio_id,membro_id,evento_id,data,funcao,status';
  const EVENTO_COLUMNS = 'id,titulo,inicio,fim,eh_culto,recorrencia,recorrencia_ate,excecoes,publicado';
  const CULTOS_LIMIT = 12;
  const STATUS_CYCLE = Object.freeze({ aguardando: 'confirmado', confirmado: 'ausente', ausente: 'aguardando' });
  const OUTRA_DATA = 'outra';

  const fullFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const cultoFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  const monthYearFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

  function create({ client, profile }) {
    const panel = $('[data-panel="escalas"]');
    const summary = $('[data-escalas-summary]', panel);
    const errorEl = $('[data-escalas-error]', panel);
    const newMinistryButton = $('[data-new-ministry]', panel);
    const ministrySelect = $('[data-escalas-ministerio]', panel);
    const content = $('[data-escalas-content]', panel);

    const ministryForm = $('[data-ministry-form]', panel);
    const ministryError = $('[data-ministry-error]', panel);

    const memberForm = $('[data-member-form]', panel);
    const memberErrorEl = $('[data-member-error]', panel);
    const memberList = $('[data-member-list]', panel);

    const quandoSelect = $('[data-escala-quando]', panel);
    const dataManualWrap = $('[data-escala-data-manual]', panel);
    const dataManualInput = $('[data-escala-data-input]', panel);
    const checklist = $('[data-escala-checklist]', panel);
    const escalaErrorEl = $('[data-escala-error]', panel);
    const escalaSubmitButton = $('[data-escala-submit]', panel);
    const escalaList = $('[data-escala-list]', panel);

    const calendarPrev = $('[data-cal-mini-prev]', panel);
    const calendarNext = $('[data-cal-mini-next]', panel);
    const calendarTitle = $('[data-cal-mini-title]', panel);
    const calendarGrid = $('[data-cal-mini-grid]', panel);

    const isEditorRole = canEditAll(profile.papel);
    newMinistryButton.hidden = !isEditorRole;

    let ministries = [];
    let members = [];
    let escalas = [];
    let cultoOccurrences = [];
    let currentMinistryId = null;
    const hoje = new Date();
    let calendarYear = hoje.getFullYear();
    let calendarMonth = hoje.getMonth();

    const memberName = (membroId) => (members.find((item) => item.id === membroId) || {}).nome_exibicao || 'Alguém';
    const cultoTitulo = (eventoId) => (cultoOccurrences.find((occ) => occ.id === eventoId) || {}).titulo;

    /* ---------- Ministérios ---------- */
    function fillMinistrySelect() {
      ministrySelect.replaceChildren(
        h('option', { value: '', text: ministries.length ? 'Escolha um ministério' : 'Nenhum ministério disponível ainda' }),
        ...ministries.map((item) => h('option', { value: item.id, text: item.nome })),
      );
    }

    async function loadMinistries() {
      setMessage(errorEl, '');
      try {
        if (isEditorRole) {
          ministries = await client.from('ministerios').select('select=' + MINISTRY_COLUMNS + '&order=nome');
        } else {
          const rows = await client.from('ministerio_membros')
            .select('select=ministerios(' + MINISTRY_COLUMNS + ')&perfil_id=eq.' + encodeURIComponent(profile.id) + '&lider=eq.true');
          ministries = rows.map((row) => row.ministerios).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome));
        }
        fillMinistrySelect();
        if (ministries.length === 1) {
          ministrySelect.value = ministries[0].id;
          selectMinistry(ministries[0].id);
        }
      } catch (error) {
        console.error('[painel] Não foi possível carregar os ministérios.', error);
        setMessage(errorEl, error.message);
      }
    }

    async function saveMinistry(event) {
      event.preventDefault();
      const nome = ministryForm.elements.nome.value;
      const { valid, errors } = model.validateMinistryForm({ nome });
      setFieldError(ministryForm, 'nome', errors.nome || '');
      if (!valid) return;

      try {
        const created = await client.from('ministerios').insert({ nome: nome.trim() });
        if (!created) throw new Error('Você não tem permissão para criar ministérios.');
        ministries = [...ministries, created].sort((a, b) => a.nome.localeCompare(b.nome));
        fillMinistrySelect();
        ministrySelect.value = created.id;
        ministryForm.reset();
        ministryForm.hidden = true;
        toast('Ministério criado');
        await selectMinistry(created.id);
      } catch (error) {
        console.error('[painel] Não foi possível criar o ministério.', error);
        setMessage(ministryError, error.message || 'Não foi possível criar. Tente novamente.');
      }
    }

    /* ---------- Cultos (pra escalar em cima de um culto da agenda) ---------- */
    async function loadCultos() {
      try {
        const rows = await client.from('eventos').select('select=' + EVENTO_COLUMNS + '&eh_culto=eq.true&publicado=eq.true');
        const services = rows.map(agendaModel.rowToEvent);
        cultoOccurrences = utils.upcoming(services, new Date(), CULTOS_LIMIT);
      } catch (error) {
        console.error('[painel] Não foi possível carregar os cultos da agenda.', error);
        cultoOccurrences = [];
      }
      quandoSelect.replaceChildren(
        h('option', { value: '', text: 'Escolha o culto ou uma data' }),
        ...cultoOccurrences.map((occ) => h('option', {
          value: occ.key + '|' + occ.id,
          text: capitalize(cultoFormat.format(occ.start)) + ' · ' + utils.formatHour(occ.start) + ' — ' + occ.titulo,
        })),
        h('option', { value: OUTRA_DATA, text: 'Outra data…' }),
      );
    }

    function capitalize(text) {
      return text.charAt(0).toUpperCase() + text.slice(1);
    }

    /* ---------- Equipe ---------- */
    function memberItem(member) {
      return h('li', { class: 'member-item' }, [
        h('span', {}, [
          h('span', { class: 'member-item__name', text: member.nome_exibicao }),
          member.lider ? h('span', { class: 'member-item__meta', text: 'Líder do ministério' }) : null,
          member.perfil_id ? null : h('span', { class: 'member-item__meta', text: 'Ainda sem conta no site — responde pelo líder' }),
        ]),
        h('span', { class: 'member-item__actions' }, [
          isEditorRole && member.perfil_id ? h('button', {
            type: 'button',
            class: 'text-button',
            text: member.lider ? 'Tirar liderança' : 'Tornar líder',
            onclick: () => toggleLeader(member),
          }) : null,
          h('button', { type: 'button', class: 'text-button', text: 'Remover', onclick: () => removeMember(member) }),
        ]),
      ]);
    }

    function checklistItem(member) {
      return h('li', { class: 'escala-check-item' }, [
        h('label', {}, [
          h('input', { type: 'checkbox', 'data-membro-check': member.id }),
          member.nome_exibicao,
        ]),
        h('input', {
          type: 'text',
          class: 'field__control field__control--compact',
          placeholder: 'Função (opcional)',
          maxlength: '60',
          'data-membro-funcao': member.id,
        }),
      ]);
    }

    function renderMembers() {
      memberList.replaceChildren(...(members.length
        ? members.map(memberItem)
        : [h('li', { class: 'event-list__empty', text: 'Ninguém na equipe ainda.' })]));
      checklist.replaceChildren(...members.map(checklistItem));
    }

    async function addMember(event) {
      event.preventDefault();
      setMessage(memberErrorEl, '');
      const values = { email: memberForm.elements.email.value, nome: memberForm.elements.nome.value };
      const { valid, errors } = model.validateMemberForm(values);
      if (!valid) {
        setMessage(memberErrorEl, errors.email || errors.nome);
        return;
      }

      const submitButton = $('button[type="submit"]', memberForm);
      setBusy(submitButton, true, 'Adicionando…');
      try {
        const email = values.email.trim();
        let perfilId = null;
        if (email) {
          const [found] = await client.rpc('perfil_por_email', { email_busca: email });
          perfilId = found ? found.id : null;
        }
        const created = await client.from('ministerio_membros').insert({
          ministerio_id: currentMinistryId,
          perfil_id: perfilId,
          nome_exibicao: values.nome.trim(),
          email: email || null,
        });
        if (!created) throw new Error('Você não tem permissão para adicionar pessoas a este ministério.');
        members = [...members, created];
        renderMembers();
        memberForm.reset();
        toast(perfilId
          ? 'Pessoa adicionada à equipe'
          : (email ? 'Adicionada sem conta ainda — quando ela criar uma, é só vincular pelo e-mail de novo' : 'Adicionada sem conta no site'));
      } catch (error) {
        console.error('[painel] Não foi possível adicionar à equipe.', error);
        const duplicate = String(error.message || '').includes('duplicate key');
        setMessage(memberErrorEl, duplicate ? 'Essa pessoa já está na equipe.' : (error.message || 'Não foi possível adicionar. Tente novamente.'));
      } finally {
        setBusy(submitButton, false);
      }
    }

    async function toggleLeader(member) {
      try {
        const updated = await client.from('ministerio_membros').update('id=eq.' + encodeURIComponent(member.id), { lider: !member.lider });
        if (!updated) throw new Error('Você não tem permissão para alterar a liderança.');
        members = members.map((item) => (item.id === member.id ? updated : item));
        renderMembers();
        toast(updated.lider ? member.nome_exibicao + ' agora lidera o ministério' : member.nome_exibicao + ' não lidera mais o ministério');
      } catch (error) {
        console.error('[painel] Não foi possível alterar a liderança.', error);
        setMessage(memberErrorEl, error.message);
      }
    }

    async function removeMember(member) {
      const confirmed = await confirmDialog({
        title: 'Remover da equipe?',
        text: '“' + member.nome_exibicao + '” sai da equipe deste ministério. As escalas já feitas para essa pessoa também saem.',
        confirmLabel: 'Remover',
      });
      if (!confirmed) return;

      try {
        const removed = await client.from('ministerio_membros').remove('id=eq.' + encodeURIComponent(member.id));
        if (!removed) throw new Error('Você não tem permissão para remover esta pessoa.');
        members = members.filter((item) => item.id !== member.id);
        escalas = escalas.filter((item) => item.membro_id !== member.id);
        renderMembers();
        renderEscalas();
        toast('Pessoa removida da equipe');
      } catch (error) {
        console.error('[painel] Não foi possível remover da equipe.', error);
        setMessage(memberErrorEl, error.message);
      }
    }

    /* ---------- Escala ---------- */
    async function cycleStatus(row) {
      try {
        const updated = await client.from('escalas').update('id=eq.' + encodeURIComponent(row.id), { status: STATUS_CYCLE[row.status] });
        if (!updated) throw new Error('Você não tem permissão para alterar esta escala.');
        escalas = escalas.map((item) => (item.id === row.id ? updated : item));
        renderEscalas();
      } catch (error) {
        console.error('[painel] Não foi possível mudar o status.', error);
        setMessage(errorEl, error.message);
      }
    }

    function escalaItem(row) {
      const escala = model.rowToEscala(row);
      const titulo = cultoTitulo(row.evento_id);
      const nome = memberName(row.membro_id) + (escala.funcao ? ' · ' + escala.funcao : '');
      const quando = (titulo ? titulo + ' · ' : '') + fullFormat.format(new Date(row.data + 'T00:00')) +
        (escala.proximidade === 'hoje' ? ' · é hoje!' : escala.proximidade === 'amanha' ? ' · é amanhã!' : '');
      return h('li', { class: 'escala-item' + (escala.proximidade ? ' is-proximo' : '') }, [
        h('span', {}, [
          h('span', { class: 'escala-item__name', text: nome }),
          h('span', { class: 'escala-item__meta', text: quando }),
        ]),
        h('span', { class: 'escala-item__actions' }, [
          h('button', {
            type: 'button',
            class: 'badge badge--' + row.status,
            text: escala.statusLabel,
            title: 'Toque para mudar o status',
            onclick: () => cycleStatus(row),
          }),
          h('button', { type: 'button', class: 'text-button', text: 'Remover', onclick: () => removeEscala(row) }),
        ]),
      ]);
    }

    function renderEscalas() {
      const upcoming = [...escalas].sort((a, b) => a.data.localeCompare(b.data));
      const ausentes = upcoming.filter((row) => row.status === 'ausente').length;
      summary.textContent = upcoming.length + (upcoming.length === 1 ? ' escala cadastrada' : ' escalas cadastradas') +
        (ausentes ? ' · ' + ausentes + (ausentes === 1 ? ' pessoa avisou que não vai' : ' pessoas avisaram que não vão') : '');
      escalaList.replaceChildren(...(upcoming.length
        ? upcoming.map(escalaItem)
        : [h('li', { class: 'event-list__empty', text: 'Nenhuma escala cadastrada ainda.' })]));
      renderCalendar();
    }

    /* ---------- Calendário visual da equipe ---------- */
    function initials(name) {
      const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
      const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
      return letters.toUpperCase();
    }

    function calendarDay(cell, dayEscalas) {
      const isToday = cell.key === model.todayKey();
      const visible = dayEscalas.slice(0, 3);
      const extra = dayEscalas.length - visible.length;
      return h('button', {
        type: 'button',
        class: 'cal-mini-day' + (cell.inMonth ? '' : ' is-outside') + (isToday ? ' is-today' : ''),
        onclick: () => pickDateForScheduling(cell.key),
      }, [
        h('span', { class: 'cal-mini-day__number', text: String(cell.date.getDate()) }),
        h('span', { class: 'cal-mini-day__tags' }, [
          ...visible.map((row) => h('span', {
            class: 'cal-mini-tag cal-mini-tag--' + row.status,
            text: initials(memberName(row.membro_id)),
            title: memberName(row.membro_id) + (row.funcao ? ' · ' + row.funcao : '') + ' · ' + model.STATUS_LABELS[row.status],
          })),
          extra > 0 ? h('span', { class: 'cal-mini-more', text: '+' + extra }) : null,
        ]),
      ]);
    }

    function renderCalendar() {
      const escalasPorDia = {};
      escalas.forEach((row) => {
        (escalasPorDia[row.data] = escalasPorDia[row.data] || []).push(row);
      });
      calendarTitle.textContent = capitalize(monthYearFormat.format(new Date(calendarYear, calendarMonth, 1)));
      calendarGrid.replaceChildren(...utils.buildMonthGrid(calendarYear, calendarMonth)
        .map((cell) => calendarDay(cell, escalasPorDia[cell.key] || [])));
    }

    function shiftCalendarMonth(delta) {
      calendarMonth += delta;
      if (calendarMonth < 0) { calendarMonth = 11; calendarYear -= 1; }
      if (calendarMonth > 11) { calendarMonth = 0; calendarYear += 1; }
      renderCalendar();
    }

    function pickDateForScheduling(key) {
      quandoSelect.value = OUTRA_DATA;
      dataManualWrap.hidden = false;
      dataManualInput.value = key;
      checklist.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function resetChecklist() {
      $$('input[data-membro-check]', checklist).forEach((input) => { input.checked = false; });
      $$('input[data-membro-funcao]', checklist).forEach((input) => { input.value = ''; });
    }

    async function submitEscalaEquipe() {
      setMessage(escalaErrorEl, '');
      const checked = $$('input[data-membro-check]', checklist).filter((input) => input.checked);
      if (!checked.length) {
        setMessage(escalaErrorEl, 'Marque pelo menos uma pessoa da equipe.');
        return;
      }

      let data;
      let eventoId = null;
      if (quandoSelect.value === OUTRA_DATA) {
        data = dataManualInput.value;
      } else if (quandoSelect.value) {
        [data, eventoId] = quandoSelect.value.split('|');
      }
      if (!model.isValidDateKey(data)) {
        setMessage(escalaErrorEl, 'Escolha o culto ou uma data.');
        return;
      }
      const funcoes = checked.map((input) => $('[data-membro-funcao="' + input.dataset.membroCheck + '"]', checklist).value);
      if (funcoes.some((funcao) => !model.isValidFuncao(funcao))) {
        setMessage(escalaErrorEl, 'Use no máximo ' + model.ROLE_MAX + ' caracteres na função.');
        return;
      }

      setBusy(escalaSubmitButton, true, 'Escalando…');
      try {
        const criadas = await Promise.all(checked.map((input) => {
          const funcao = $('[data-membro-funcao="' + input.dataset.membroCheck + '"]', checklist).value.trim();
          return client.from('escalas').insert({
            ministerio_id: currentMinistryId,
            membro_id: input.dataset.membroCheck,
            evento_id: eventoId || null,
            data,
            funcao: funcao || null,
          });
        }));
        escalas = [...escalas, ...criadas.filter(Boolean)];
        renderEscalas();
        resetChecklist();
        toast(checked.length === 1 ? 'Pessoa escalada' : checked.length + ' pessoas escaladas');
      } catch (error) {
        console.error('[painel] Não foi possível escalar a equipe.', error);
        setMessage(escalaErrorEl, error.message || 'Não foi possível escalar. Tente novamente.');
      } finally {
        setBusy(escalaSubmitButton, false);
      }
    }

    async function removeEscala(row) {
      const confirmed = await confirmDialog({
        title: 'Remover da escala?',
        text: memberName(row.membro_id) + ' sai da escala de ' + fullFormat.format(new Date(row.data + 'T00:00')) + '.',
        confirmLabel: 'Remover',
      });
      if (!confirmed) return;

      try {
        const removed = await client.from('escalas').remove('id=eq.' + encodeURIComponent(row.id));
        if (!removed) throw new Error('Você não tem permissão para remover esta escala.');
        escalas = escalas.filter((item) => item.id !== row.id);
        renderEscalas();
        toast('Escala removida');
      } catch (error) {
        console.error('[painel] Não foi possível remover a escala.', error);
        setMessage(errorEl, error.message);
      }
    }

    /* ---------- Trocar de ministério ---------- */
    async function selectMinistry(ministryId) {
      currentMinistryId = ministryId || null;
      content.hidden = !currentMinistryId;
      if (!currentMinistryId) return;

      const now = new Date();
      calendarYear = now.getFullYear();
      calendarMonth = now.getMonth();

      setMessage(errorEl, '');
      try {
        [members, escalas] = await Promise.all([
          client.from('ministerio_membros').select('select=' + MEMBER_COLUMNS + '&ministerio_id=eq.' + encodeURIComponent(currentMinistryId) + '&order=nome_exibicao'),
          client.from('escalas').select('select=' + ESCALA_COLUMNS + '&ministerio_id=eq.' + encodeURIComponent(currentMinistryId) + '&order=data'),
        ]);
        renderMembers();
        renderEscalas();
      } catch (error) {
        console.error('[painel] Não foi possível carregar este ministério.', error);
        setMessage(errorEl, error.message);
      }
    }

    /* ---------- Eventos de interface ---------- */
    newMinistryButton.addEventListener('click', () => {
      ministryForm.hidden = !ministryForm.hidden;
      if (!ministryForm.hidden) ministryForm.elements.nome.focus();
    });
    $('[data-ministry-cancel]', ministryForm).addEventListener('click', () => {
      ministryForm.reset();
      ministryForm.hidden = true;
      clearFieldErrors(ministryForm);
    });
    ministryForm.addEventListener('submit', saveMinistry);
    ministrySelect.addEventListener('change', () => selectMinistry(ministrySelect.value));
    memberForm.addEventListener('submit', addMember);
    quandoSelect.addEventListener('change', () => {
      dataManualWrap.hidden = quandoSelect.value !== OUTRA_DATA;
    });
    escalaSubmitButton.addEventListener('click', submitEscalaEquipe);
    calendarPrev.addEventListener('click', () => shiftCalendarMonth(-1));
    calendarNext.addEventListener('click', () => shiftCalendarMonth(1));

    loadCultos();

    return Object.freeze({ load: loadMinistries });
  }

  window.AdminEscalas = Object.freeze({ create });
})();
