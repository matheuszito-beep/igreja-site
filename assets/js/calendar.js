/**
 * Página de agenda: calendário mensal, lista, filtros por categoria,
 * detalhes do evento e exportação para Google Agenda / .ics.
 * O estado (mês, dia, vista, filtros, evento aberto) fica na URL para ser compartilhável.
 */
(function () {
  'use strict';

  const Site = window.Site;
  if (!Site) return;

  const { $, $$, h, utils, config, capitalize, toast, copyText } = Site;
  let events = [];
  let categories = {};
  let deepLinkPending = true;

  const MAX_CHIPS_PER_DAY = 3;
  const MAX_DOTS_PER_DAY = 3;
  const LIST_MONTHS = 3;
  const LIST_IMAGE_WIDTH = 640;
  const EMPTY_LOOKAHEAD_DAYS = 120;
  const MODAL_IMAGE_WIDTH = 1100;
  const OBJECT_URL_TTL_MS = 1000;
  const VIEWS = ['mes', 'lista'];
  const CATEGORY_KEY_RE = /^[a-z0-9-]{2,30}$/;
  const KEY_OFFSETS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const WHATSAPP_MIN_CHARS = 8;
  const WHATSAPP_MAX_CHARS = 20;
  const NAME_MIN_CHARS = 2;
  const NAME_MAX_CHARS = 80;
  const QUANTIDADE_MAX = 20;

  const fmt = {
    month: new Intl.DateTimeFormat('pt-BR', { month: 'long' }),
    weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }),
    weekdayShort: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }),
    dayMonth: new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }),
    dayMonthShort: new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }),
    full: new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    monthShort: new Intl.DateTimeFormat('pt-BR', { month: 'short' }),
  };

  const el = {
    grid: $('[data-cal-grid]'),
    month: $('[data-cal-month]'),
    year: $('[data-cal-year]'),
    prev: $('[data-cal-prev]'),
    next: $('[data-cal-next]'),
    today: $('[data-cal-today]'),
    filters: $('[data-cal-filters]'),
    error: $('[data-cal-error]'),
    segmented: $('[data-segmented]'),
    viewButtons: $$('[data-view]'),
    panels: $$('[data-view-panel]'),
    list: $('[data-cal-list]'),
    dayWeekday: $('[data-day-weekday]'),
    dayTitle: $('[data-day-title]'),
    dayList: $('[data-day-list]'),
    modal: $('[data-event-modal]'),
  };

  if (!el.grid || !el.modal) return;

  const modal = {
    img: $('[data-modal-img]', el.modal),
    cat: $('[data-modal-cat]', el.modal),
    title: $('[data-modal-title]', el.modal),
    date: $('[data-modal-date]', el.modal),
    time: $('[data-modal-time]', el.modal),
    local: $('[data-modal-local]', el.modal),
    desc: $('[data-modal-desc]', el.modal),
    google: $('[data-modal-google]', el.modal),
    ics: $('[data-modal-ics]', el.modal),
    share: $('[data-modal-share]', el.modal),
    close: $('[data-modal-close]', el.modal),
    actions: $('[data-modal-actions]', el.modal),
    signup: $('[data-modal-signup]', el.modal),
    vagas: $('[data-modal-vagas]', el.modal),
    signupOpen: $('[data-signup-open]', el.modal),
    signupForm: $('[data-signup-form]', el.modal),
    signupMessage: $('[data-signup-message]', el.modal),
    signupSubmit: $('[data-signup-submit]', el.modal),
    signupLogin: $('[data-signup-login]', el.modal),
    signupExisting: $('[data-signup-existing]', el.modal),
    signupExistingText: $('[data-signup-existing-text]', el.modal),
    signupCancel: $('[data-signup-cancel]', el.modal),
  };

  const client = window.SupabaseRest && config.supabase
    ? window.SupabaseRest.create({ url: config.supabase.url, key: config.supabase.chavePublica })
    : null;

  const today = utils.startOfDay(new Date());
  const todayKey = utils.toDateKey(today);
  const categoryColor = (key) => (categories[key] && categories[key].cor) || '#0071e3';
  const categoryName = (key) => (categories[key] && categories[key].nome) || '';
  const sizedImage = (url, width) => url.replace(/([?&])w=\d+/, '$1w=' + width);

  let state = readStateFromUrl();
  let openOccurrence = null;

  /* ---------- Estado na URL ---------- */
  function parseDateParam(value) {
    if (!value) return today;
    try {
      return utils.parseLocal(value);
    } catch (error) {
      console.warn('[agenda] Parâmetro "data" inválido na URL, usando hoje.', error.message);
      return today;
    }
  }

  function readStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const selected = parseDateParam(params.get('data'));
    const monthMatch = /^(\d{4})-(\d{2})$/.exec(params.get('mes') || '');
    const monthIndex = monthMatch ? Number(monthMatch[2]) - 1 : -1;
    const hasMonth = monthIndex >= 0 && monthIndex <= 11;

    return Object.freeze({
      year: hasMonth ? Number(monthMatch[1]) : selected.getFullYear(),
      month: hasMonth ? monthIndex : selected.getMonth(),
      selectedKey: utils.toDateKey(selected),
      view: VIEWS.includes(params.get('vista')) ? params.get('vista') : 'mes',
      categories: Object.freeze((params.get('cat') || '').split(',').filter((key) => CATEGORY_KEY_RE.test(key))),
      eventoId: params.get('evento'),
    });
  }

  function writeStateToUrl() {
    const params = new URLSearchParams();
    params.set('mes', state.year + '-' + String(state.month + 1).padStart(2, '0'));
    params.set('data', state.selectedKey);
    if (state.view !== 'mes') params.set('vista', state.view);
    if (state.categories.length) params.set('cat', state.categories.join(','));
    if (openOccurrence) params.set('evento', openOccurrence.id);
    window.history.replaceState(null, '', window.location.pathname + '?' + params.toString());
  }

  function setState(patch) {
    state = Object.freeze({ ...state, ...patch });
    render();
  }

  /* ---------- Dados ---------- */
  function occurrencesBetween(start, end) {
    const all = utils.expandEvents(events, start, end);
    return state.categories.length ? all.filter((occ) => state.categories.includes(occ.categoria)) : all;
  }

  function isMultiDay(occurrence) {
    return utils.toDateKey(occurrence.start) !== utils.toDateKey(new Date(occurrence.end.getTime() - 1));
  }

  function timeRange(occurrence) {
    if (isMultiDay(occurrence)) {
      return fmt.dayMonthShort.format(occurrence.start) + ', ' + utils.formatHour(occurrence.start) +
        ' – ' + fmt.dayMonthShort.format(occurrence.end) + ', ' + utils.formatHour(occurrence.end);
    }
    return utils.formatHour(occurrence.start) + ' – ' + utils.formatHour(occurrence.end);
  }

  /* ---------- Componentes ---------- */
  function eventRow(occurrence) {
    return h('button', {
      type: 'button',
      class: 'event-row',
      style: { '--cat': categoryColor(occurrence.categoria) },
      onclick: () => openModal(occurrence),
    }, [
      h('span', { class: 'event-row__bar', 'aria-hidden': 'true' }),
      h('span', { class: 'event-row__body' }, [
        h('span', { class: 'event-row__time', text: timeRange(occurrence) }),
        h('span', { class: 'event-row__title', text: occurrence.titulo }),
        occurrence.local ? h('span', { class: 'event-row__place', text: occurrence.local }) : null,
      ]),
      h('span', { class: 'event-row__chevron', 'aria-hidden': 'true' }),
    ]);
  }

  function dayCell(cell, dayEvents, focusKey) {
    const count = dayEvents.length;
    const isSelected = cell.key === state.selectedKey;
    const classes = ['cal__day', !cell.inMonth && 'is-out', cell.key === todayKey && 'is-today', isSelected && 'is-selected']
      .filter(Boolean).join(' ');
    const label = capitalize(fmt.full.format(cell.date)) + ', ' +
      (count ? count + (count === 1 ? ' evento' : ' eventos') : 'sem eventos');

    return h('button', {
      type: 'button',
      class: classes,
      'data-key': cell.key,
      'aria-label': label,
      'aria-pressed': String(isSelected),
      'aria-current': cell.key === todayKey ? 'date' : null,
      tabindex: cell.key === focusKey ? '0' : '-1',
    }, [
      h('span', { class: 'cal__num', 'aria-hidden': 'true', text: String(cell.date.getDate()) }),
      count ? h('span', { class: 'cal__events', 'aria-hidden': 'true' }, [
        ...dayEvents.slice(0, MAX_CHIPS_PER_DAY).map((occ) =>
          h('span', { class: 'cal__chip', style: { '--cat': categoryColor(occ.categoria) } }, [
            occ.key === cell.key ? h('b', { text: utils.formatHour(occ.start) }) : null,
            occ.titulo,
          ])),
        count > MAX_CHIPS_PER_DAY ? h('span', { class: 'cal__more', text: '+' + (count - MAX_CHIPS_PER_DAY) + ' mais' }) : null,
      ]) : null,
      count ? h('span', { class: 'cal__dots', 'aria-hidden': 'true' },
        dayEvents.slice(0, MAX_DOTS_PER_DAY).map((occ) => h('span', { style: { '--cat': categoryColor(occ.categoria) } }))) : null,
    ]);
  }

  /* ---------- Renderização ---------- */
  function renderToolbar() {
    el.month.textContent = capitalize(fmt.month.format(new Date(state.year, state.month, 1)));
    el.year.textContent = String(state.year);
    el.viewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
    el.segmented.style.setProperty('--index', String(VIEWS.indexOf(state.view)));
    el.panels.forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== state.view; });
    $$('[data-cat]', el.filters).forEach((chip) => {
      const key = chip.dataset.cat;
      chip.setAttribute('aria-pressed', String(key ? state.categories.includes(key) : !state.categories.length));
    });
  }

  function renderMonth() {
    const cells = utils.buildMonthGrid(state.year, state.month);
    const rangeEnd = utils.addDays(cells[cells.length - 1].date, 1);
    const byDay = utils.groupByDay(occurrencesBetween(cells[0].date, rangeEnd));
    const hasSelected = cells.some((cell) => cell.key === state.selectedKey);
    const focusKey = hasSelected ? state.selectedKey : cells.find((cell) => cell.inMonth).key;

    el.grid.replaceChildren(...cells.map((cell) => dayCell(cell, byDay[cell.key] || [], focusKey)));
  }

  function renderEmptyDay(date) {
    const [nextOccurrence] = occurrencesBetween(utils.addDays(date, 1), utils.addDays(date, EMPTY_LOOKAHEAD_DAYS));
    return h('li', { class: 'day-panel__empty' }, [
      h('p', { text: 'Nenhum evento neste dia.' }),
      nextOccurrence ? h('button', {
        type: 'button',
        class: 'link-chevron',
        text: 'Próximo: ' + nextOccurrence.titulo + ', ' + fmt.dayMonth.format(nextOccurrence.start),
        onclick: () => selectDay(nextOccurrence.key, false),
      }) : null,
    ]);
  }

  function renderDayPanel() {
    const date = utils.parseLocal(state.selectedKey);
    const dayOccurrences = occurrencesBetween(date, utils.addDays(date, 1));

    el.dayWeekday.textContent = state.selectedKey === todayKey ? 'Hoje' : capitalize(fmt.weekday.format(date));
    el.dayTitle.textContent = fmt.dayMonth.format(date);
    el.dayList.replaceChildren(...(dayOccurrences.length
      ? dayOccurrences.map((occ) => h('li', {}, eventRow(occ)))
      : [renderEmptyDay(date)]));
  }

  function listCard(occurrence) {
    const day = String(occurrence.start.getDate());
    return h('button', {
      type: 'button',
      class: 'list-card' + (occurrence.key === todayKey ? ' is-today' : ''),
      style: { '--cat': categoryColor(occurrence.categoria) },
      onclick: () => openModal(occurrence),
    }, [
      h('span', { class: 'list-card__media', 'aria-hidden': 'true' }, [
        occurrence.imagem
          ? h('img', { src: sizedImage(occurrence.imagem, LIST_IMAGE_WIDTH), alt: '', loading: 'lazy', width: 640, height: 400 })
          : null,
        h('span', { class: 'date-badge' }, [
          h('span', { class: 'date-badge__month', text: fmt.monthShort.format(occurrence.start).replace('.', '') }),
          h('span', { class: 'date-badge__day', text: day }),
        ]),
      ]),
      h('span', { class: 'list-card__date', 'aria-hidden': 'true' }, [
        h('span', { class: 'list-card__weekday', text: fmt.weekdayShort.format(occurrence.start).replace('.', '') }),
        h('span', { class: 'list-card__day', text: day }),
      ]),
      h('span', { class: 'list-card__body' }, [
        h('span', { class: 'sr-only', text: capitalize(fmt.full.format(occurrence.start)) + '.' }),
        h('span', { class: 'pill', text: categoryName(occurrence.categoria) }),
        h('span', { class: 'list-card__title', text: occurrence.titulo }),
        h('span', { class: 'list-card__meta', text: capitalize(fmt.weekday.format(occurrence.start)) + ' · ' + timeRange(occurrence) }),
        occurrence.local ? h('span', { class: 'list-card__place', text: occurrence.local }) : null,
      ]),
    ]);
  }

  function vagasLabel(occurrence) {
    if (!occurrence.vagas) return 'Vagas ilimitadas';
    const restantes = Math.max(occurrence.vagas - occurrence.vagasOcupadas, 0);
    return occurrence.vagasOcupadas + '/' + occurrence.vagas + ' vagas' + (restantes ? '' : ' · Esgotado');
  }

  function describeRange(pageItems) {
    const first = pageItems[0].start;
    const last = pageItems[pageItems.length - 1].start;
    if (typeof fmt.dayMonth.formatRange === 'function') return fmt.dayMonth.formatRange(first, last);
    const from = fmt.dayMonth.format(first);
    const to = fmt.dayMonth.format(last);
    return from === to ? from : from + ' – ' + to;
  }

  function renderList() {
    if (!listCarousel) throw new Error('o arquivo assets/js/agenda-carousel.js não foi carregado.');
    const start = new Date(state.year, state.month, 1);
    const end = new Date(state.year, state.month + LIST_MONTHS, 1);
    const occurrences = occurrencesBetween(start, end);
    const selectedDay = utils.parseLocal(state.selectedKey);
    const firstFromSelected = occurrences.findIndex((occ) => occ.end > selectedDay);
    listCarousel.render(occurrences, firstFromSelected === -1 ? occurrences.length - 1 : firstFromSelected);
  }

  function render() {
    try {
      renderToolbar();
      if (state.view === 'mes') {
        renderMonth();
        renderDayPanel();
      } else {
        renderList();
      }
      el.error.hidden = true;
    } catch (error) {
      console.error('[agenda]', error);
      el.error.textContent = 'Não foi possível montar a agenda: ' + error.message;
      el.error.hidden = false;
    }
    writeStateToUrl();
  }

  /* ---------- Ações ---------- */
  function selectDay(key, shouldFocus) {
    const date = utils.parseLocal(key);
    setState({ selectedKey: key, year: date.getFullYear(), month: date.getMonth() });
    if (shouldFocus) {
      const button = el.grid.querySelector('[data-key="' + key + '"]');
      if (button) button.focus();
    }
  }

  function animateGrid(direction) {
    el.grid.classList.remove('slide-next', 'slide-prev');
    void el.grid.offsetWidth; // reinicia a animação
    el.grid.classList.add(direction > 0 ? 'slide-next' : 'slide-prev');
  }

  function shiftMonth(delta) {
    const first = new Date(state.year, state.month + delta, 1);
    const isCurrentMonth = first.getFullYear() === today.getFullYear() && first.getMonth() === today.getMonth();
    if (state.view === 'mes') animateGrid(delta);
    setState({
      year: first.getFullYear(),
      month: first.getMonth(),
      selectedKey: isCurrentMonth ? todayKey : utils.toDateKey(first),
    });
  }

  function toggleCategory(key) {
    if (!key) {
      setState({ categories: Object.freeze([]) });
      return;
    }
    const active = state.categories.includes(key);
    setState({ categories: Object.freeze(active ? state.categories.filter((k) => k !== key) : [...state.categories, key]) });
  }

  function buildFilters() {
    const allChip = h('button', { type: 'button', class: 'chip', 'data-cat': '', text: 'Todos' });
    const chips = Object.entries(categories).map(([key, category]) =>
      h('button', { type: 'button', class: 'chip', 'data-cat': key, style: { '--cat': category.cor } }, [
        h('span', { class: 'chip__dot', 'aria-hidden': 'true' }),
        category.nome,
      ]));
    el.filters.replaceChildren(allChip, ...chips);
  }

  /* ---------- Modal ---------- */
  function setSignupMessage(text, tone) {
    modal.signupMessage.textContent = text || '';
    modal.signupMessage.hidden = !text;
    if (tone) modal.signupMessage.dataset.tone = tone;
    else delete modal.signupMessage.dataset.tone;
  }

  function setSignupFieldError(name, message) {
    const el = $('[data-signup-error-for="' + name + '"]', modal.signupForm);
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function resetSignupForm() {
    modal.signupForm.hidden = true;
    modal.signupForm.reset();
    modal.signupForm.elements.quantidade.value = '1';
    setSignupMessage('');
    ['nome', 'whatsapp', 'quantidade'].forEach((name) => setSignupFieldError(name, ''));
  }

  function setSignupView(view) {
    modal.signupLogin.hidden = view !== 'login';
    modal.signupExisting.hidden = view !== 'existing';
    modal.signupOpen.hidden = view !== 'closed';
    modal.signupForm.hidden = view !== 'open';
  }

  async function refreshSignupState(occurrence) {
    if (!client || !client.auth.hasSession()) {
      setSignupView('login');
      return;
    }
    try {
      const [existing] = await client.from('inscricoes_evento').select('select=id,quantidade&evento_id=eq.' + occurrence.id);
      if (existing) {
        modal.signupExistingText.textContent = 'Você já está inscrito' +
          (existing.quantidade > 1 ? ' (' + existing.quantidade + ' pessoas)' : '') + '.';
        modal.signupExisting.dataset.id = existing.id;
        modal.signupExisting.dataset.quantidade = existing.quantidade;
        setSignupView('existing');
        return;
      }
    } catch (error) {
      console.warn('[agenda] Não foi possível checar se você já está inscrito.', error);
    }
    const esgotado = Boolean(occurrence.vagas) && occurrence.vagasOcupadas >= occurrence.vagas;
    modal.signupOpen.disabled = esgotado;
    modal.signupOpen.textContent = esgotado ? 'Vagas esgotadas' : 'Inscreva-se';
    setSignupView('closed');
  }

  async function prefillSignupName() {
    modal.signupForm.elements.nome.value = '';
    if (!client || !client.auth.hasSession()) return;
    try {
      const user = await client.auth.getUser();
      const [perfil] = await client.from('perfis').select('select=nome&id=eq.' + user.id);
      if (perfil && perfil.nome) modal.signupForm.elements.nome.value = perfil.nome;
    } catch (error) {
      console.warn('[agenda] Não foi possível pré-preencher o nome de quem está logado.', error);
    }
  }

  function openModal(occurrence) {
    openOccurrence = occurrence;
    el.modal.style.setProperty('--cat', categoryColor(occurrence.categoria));
    modal.img.hidden = !occurrence.imagem;
    if (occurrence.imagem) modal.img.src = sizedImage(occurrence.imagem, MODAL_IMAGE_WIDTH);
    modal.cat.textContent = categoryName(occurrence.categoria);
    modal.title.textContent = occurrence.titulo;
    modal.date.textContent = capitalize(fmt.full.format(occurrence.start));
    modal.time.textContent = timeRange(occurrence);
    modal.local.textContent = occurrence.local || 'Local a confirmar';
    modal.desc.textContent = occurrence.descricao || '';
    modal.desc.hidden = !occurrence.descricao;
    modal.google.href = utils.googleCalendarUrl(occurrence, config.fusoHorario);

    modal.actions.hidden = Boolean(occurrence.porInscricao);
    modal.signup.hidden = !occurrence.porInscricao;
    if (occurrence.porInscricao) {
      modal.vagas.textContent = vagasLabel(occurrence);
      resetSignupForm();
      refreshSignupState(occurrence);
    }

    if (typeof el.modal.showModal === 'function') el.modal.showModal();
    else el.modal.setAttribute('open', '');
    writeStateToUrl();
  }

  function openSignupForm() {
    setSignupView('open');
    prefillSignupName();
    modal.signupForm.elements.nome.focus();
  }

  async function cancelExistingSignup() {
    const id = modal.signupExisting.dataset.id;
    const quantidade = Number(modal.signupExisting.dataset.quantidade) || 0;
    if (!id || !client || !openOccurrence) return;
    modal.signupCancel.disabled = true;
    try {
      await client.from('inscricoes_evento').remove('id=eq.' + id);
      events = events.map((event) => (event.id === openOccurrence.id
        ? { ...event, vagasOcupadas: Math.max((event.vagasOcupadas || 0) - quantidade, 0) }
        : event));
      openOccurrence = { ...openOccurrence, vagasOcupadas: Math.max((openOccurrence.vagasOcupadas || 0) - quantidade, 0) };
      modal.vagas.textContent = vagasLabel(openOccurrence);
      toast('Inscrição cancelada');
      refreshSignupState(openOccurrence);
    } catch (error) {
      console.error('[agenda] Não foi possível cancelar a inscrição.', error);
      toast(error.message || 'Não foi possível cancelar. Tente novamente.');
    } finally {
      modal.signupCancel.disabled = false;
    }
  }

  function validateSignup(values) {
    const errors = {};
    if (values.nome.length < NAME_MIN_CHARS || values.nome.length > NAME_MAX_CHARS) errors.nome = 'Informe seu nome.';
    if (values.whatsapp.length < WHATSAPP_MIN_CHARS || values.whatsapp.length > WHATSAPP_MAX_CHARS) errors.whatsapp = 'Informe um WhatsApp válido, com DDD.';
    if (!Number.isInteger(values.quantidade) || values.quantidade < 1 || values.quantidade > QUANTIDADE_MAX) {
      errors.quantidade = 'Informe quantas pessoas vão (de 1 a ' + QUANTIDADE_MAX + ').';
    }
    return errors;
  }

  async function submitSignup(event) {
    event.preventDefault();
    if (!openOccurrence || !client) return;
    ['nome', 'whatsapp', 'quantidade'].forEach((name) => setSignupFieldError(name, ''));
    setSignupMessage('');

    const values = {
      nome: modal.signupForm.elements.nome.value.trim(),
      whatsapp: modal.signupForm.elements.whatsapp.value.trim(),
      quantidade: Number(modal.signupForm.elements.quantidade.value),
    };
    const errors = validateSignup(values);
    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([name, message]) => setSignupFieldError(name, message));
      return;
    }

    const submitLabel = modal.signupSubmit.textContent;
    modal.signupSubmit.disabled = true;
    modal.signupSubmit.textContent = 'Enviando…';
    try {
      await client.from('inscricoes_evento').insert({
        evento_id: openOccurrence.id,
        nome: values.nome,
        whatsapp: values.whatsapp,
        quantidade: values.quantidade,
      });
      events = events.map((event) => (event.id === openOccurrence.id
        ? { ...event, vagasOcupadas: (event.vagasOcupadas || 0) + values.quantidade }
        : event));
      openOccurrence = { ...openOccurrence, vagasOcupadas: (openOccurrence.vagasOcupadas || 0) + values.quantidade };
      modal.vagas.textContent = vagasLabel(openOccurrence);
      setSignupMessage('Inscrição confirmada! Te esperamos por lá.', 'success');
      refreshSignupState(openOccurrence);
    } catch (error) {
      console.error('[agenda] Não foi possível confirmar a inscrição.', error);
      setSignupMessage(error.message || 'Não foi possível confirmar. Tente novamente.');
    } finally {
      modal.signupSubmit.disabled = false;
      modal.signupSubmit.textContent = submitLabel;
    }
  }

  function closeModal() {
    if (typeof el.modal.close === 'function') el.modal.close();
    else el.modal.removeAttribute('open');
  }

  function downloadIcs() {
    if (!openOccurrence) return;
    const blob = new Blob([utils.toICS(openOccurrence)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: openOccurrence.id + '.ics' });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
  }

  async function shareEvent() {
    if (!openOccurrence) return;
    const shareData = {
      title: openOccurrence.titulo,
      text: openOccurrence.titulo + ' — ' + capitalize(fmt.full.format(openOccurrence.start)),
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error.name !== 'AbortError') toast('Não foi possível compartilhar agora.');
      }
      return;
    }

    const copied = await copyText(window.location.href);
    toast(copied ? 'Link do evento copiado' : 'Não foi possível copiar o link.');
  }

  function openDeepLinkedEvent() {
    if (!state.eventoId) return;
    const date = utils.parseLocal(state.selectedKey);
    try {
      const [match] = utils.expandEvents(events, date, utils.addDays(date, 1)).filter((occ) => occ.id === state.eventoId);
      if (match) openModal(match);
    } catch (error) {
      console.error('[agenda] Não foi possível abrir o evento da URL:', error);
    }
  }

  /* ---------- Eventos de interface ---------- */
  el.prev.addEventListener('click', () => shiftMonth(-1));
  el.next.addEventListener('click', () => shiftMonth(1));
  el.today.addEventListener('click', () => {
    setState({ year: today.getFullYear(), month: today.getMonth(), selectedKey: todayKey });
  });
  el.viewButtons.forEach((button) => button.addEventListener('click', () => setState({ view: button.dataset.view })));
  el.filters.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-cat]');
    if (chip) toggleCategory(chip.dataset.cat);
  });

  el.grid.addEventListener('click', (event) => {
    const day = event.target.closest('[data-key]');
    if (day) selectDay(day.dataset.key, false);
  });

  el.grid.addEventListener('keydown', (event) => {
    const day = event.target.closest('[data-key]');
    if (!day) return;
    const current = utils.parseLocal(day.dataset.key);
    let target = null;
    if (event.key in KEY_OFFSETS) target = utils.addDays(current, KEY_OFFSETS[event.key]);
    else if (event.key === 'Home') target = utils.addDays(current, -current.getDay());
    else if (event.key === 'End') target = utils.addDays(current, 6 - current.getDay());
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      target = new Date(current.getFullYear(), current.getMonth() + (event.key === 'PageUp' ? -1 : 1), 1);
    }
    if (!target) return;
    event.preventDefault();
    selectDay(utils.toDateKey(target), true);
  });

  modal.close.addEventListener('click', closeModal);
  modal.ics.addEventListener('click', downloadIcs);
  modal.share.addEventListener('click', shareEvent);
  modal.signupOpen.addEventListener('click', openSignupForm);
  modal.signupForm.addEventListener('submit', submitSignup);
  modal.signupCancel.addEventListener('click', cancelExistingSignup);
  el.modal.addEventListener('click', (event) => {
    if (event.target === el.modal) closeModal();
  });
  // Garante o Esc mesmo quando o foco não está dentro do diálogo (ou sem suporte nativo).
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && el.modal.open) closeModal();
  });
  el.modal.addEventListener('close', () => {
    openOccurrence = null;
    writeStateToUrl();
  });

  const listCarousel = window.AgendaCarousel
    ? window.AgendaCarousel.create(el.list, { renderCard: listCard, describeRange })
    : null;

  buildFilters();
  render();

  if (window.AgendaData) {
    window.AgendaData.subscribe((data, error) => {
      if (error) {
        el.error.textContent = 'Não foi possível carregar a agenda agora. Verifique sua conexão e tente novamente.';
        el.error.hidden = false;
        return;
      }
      events = data.eventos;
      categories = data.categorias;
      state = Object.freeze({ ...state, categories: Object.freeze(state.categories.filter((key) => categories[key])) });
      buildFilters();
      render();
      if (deepLinkPending) {
        deepLinkPending = false;
        openDeepLinkedEvent();
      }
    });
  }
})();
