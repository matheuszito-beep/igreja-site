/**
 * Página inicial: cultos, carrossel de eventos, efeitos de rolagem,
 * contadores, cartão Pix e formulário de pedido de oração.
 */
(function () {
  'use strict';

  const Site = window.Site;
  if (!Site) return;

  const { $, $$, h, utils, reducedMotion, capitalize, observeReveal, onScrollFrame, whatsappUrl, toast } = Site;
  let events = [];
  let categories = {};
  let updateCarouselControls = null;
  let updateCultosCarousel = null;

  const UPCOMING_LIMIT = 8;
  const CARD_IMAGE_WIDTH = 700;
  const PRAYER_MIN_CHARS = 10;
  const PRAYER_MAX_CHARS = 800;
  const COUNT_UP_MS = 1400;
  const MAX_TILT_DEG = 9;
  const REVEAL_STAGGER_MS = 80;

  const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
  const monthShortFormat = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
  const dayMonthFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'long' });
  const sermonDateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  const categoryColor = (key) => (categories[key] && categories[key].cor) || '#0071e3';
  const categoryName = (key) => (categories[key] && categories[key].nome) || '';
  const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes();

  /** Pede ao Unsplash (ou CDN compatível) uma versão menor da imagem. */
  const sizedImage = (url, width) => url.replace(/([?&])w=\d+/, '$1w=' + width);

  /* ---------- Cultos ---------- */
  function cultoCard(occurrence, isNext, index) {
    const card = h('article', {
      class: 'culto-card' + (isNext ? ' is-next' : ''),
      style: { '--cat': categoryColor(occurrence.categoria) },
      'data-reveal': '',
      'data-reveal-delay': String(index * REVEAL_STAGGER_MS),
    }, [
      isNext ? h('span', { class: 'culto-card__badge', text: 'Próximo' }) : null,
      h('p', { class: 'culto-card__day', text: capitalize(weekdayFormat.format(occurrence.start)) }),
      h('p', { class: 'culto-card__time', text: utils.formatHour(occurrence.start) }),
      h('div', { class: 'culto-card__body' }, [
        h('h3', { class: 'culto-card__name', text: occurrence.titulo }),
        occurrence.descricao ? h('p', { class: 'culto-card__desc', text: occurrence.descricao }) : null,
      ]),
    ]);
    observeReveal(card);
    return card;
  }

  function renderCultos() {
    const container = $('[data-cultos]');
    if (!container) return;

    const now = new Date();
    let occurrences;
    try {
      occurrences = utils.expandEvents(events.filter((event) => event.ehCulto), now, utils.addDays(now, 7));
    } catch (error) {
      console.error('[cultos] Evento com dados inválidos:', error);
      return;
    }

    const seen = new Set();
    const unique = occurrences.filter((occ) => !seen.has(occ.id) && seen.add(occ.id));
    const nextId = unique.length ? unique[0].id : null;
    const byWeekday = [...unique].sort((a, b) =>
      a.start.getDay() - b.start.getDay() || minutesOfDay(a.start) - minutesOfDay(b.start));

    container.replaceChildren(...byWeekday.map((occ, index) => cultoCard(occ, occ.id === nextId, index)));
    updateCultosCarousel = updateCultosCarousel || initCarouselControls(container, '[data-cultos-prev]', '[data-cultos-next]');
    updateCultosCarousel();
  }

  /* ---------- Carrossel de eventos ---------- */
  function eventCard(occurrence) {
    const href = 'eventos.html?data=' + occurrence.key + '&evento=' + encodeURIComponent(occurrence.id);
    const month = monthShortFormat.format(occurrence.start).replace('.', '');
    return h('a', { class: 'event-card', href, style: { '--cat': categoryColor(occurrence.categoria) } }, [
      occurrence.imagem
        ? h('img', { src: sizedImage(occurrence.imagem, CARD_IMAGE_WIDTH), alt: '', loading: 'lazy', width: 700, height: 525 })
        : null,
      h('span', { class: 'date-badge', 'aria-hidden': 'true' }, [
        h('span', { class: 'date-badge__month', text: month }),
        h('span', { class: 'date-badge__day', text: String(occurrence.start.getDate()) }),
      ]),
      occurrence.porInscricao ? h('span', { class: 'event-card__badge', text: 'Inscrições abertas' }) : null,
      h('div', { class: 'event-card__body' }, [
        h('span', { class: 'pill', text: categoryName(occurrence.categoria) }),
        h('h3', { class: 'event-card__title', text: occurrence.titulo }),
        h('p', { class: 'event-card__meta', text: capitalize(dayMonthFormat.format(occurrence.start)) + ' · ' + utils.formatHour(occurrence.start) }),
        occurrence.local ? h('p', { class: 'event-card__meta', text: occurrence.local }) : null,
      ]),
    ]);
  }

  function initCarouselControls(track, prevSelector, nextSelector) {
    const prev = $(prevSelector);
    const next = $(nextSelector);
    if (!prev || !next) return () => {};

    const step = () => {
      const card = track.firstElementChild;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
    };
    const behavior = () => (reducedMotion.matches ? 'auto' : 'smooth');
    const update = () => {
      const maxScroll = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= maxScroll;
    };

    prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: behavior() }));
    next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: behavior() }));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return update;
  }

  function renderUpcoming() {
    const track = $('[data-upcoming]');
    if (!track) return;

    let items;
    try {
      items = utils.upcoming(events.filter((event) => !event.recorrencia), new Date(), UPCOMING_LIMIT);
    } catch (error) {
      console.error('[eventos] Evento com dados inválidos:', error);
      track.replaceChildren(h('p', { class: 'carousel__empty', text: 'Não foi possível carregar os eventos agora.' }));
      return;
    }

    track.replaceChildren(...(items.length
      ? items.map(eventCard)
      : [h('p', { class: 'carousel__empty', text: 'Novos eventos em breve.' })]));
    updateCarouselControls = updateCarouselControls || initCarouselControls(track, '[data-carousel-prev]', '[data-carousel-next]');
    updateCarouselControls();
  }

  function showAgendaUnavailable() {
    const message = 'Não foi possível carregar a agenda agora. Tente novamente em instantes.';
    const cultos = $('[data-cultos]');
    const track = $('[data-upcoming]');
    if (cultos) cultos.replaceChildren(h('p', { class: 'carousel__empty', text: message }));
    if (track) track.replaceChildren(h('p', { class: 'carousel__empty', text: message }));
  }

  /* ---------- Hero: imagem se expande ao rolar ---------- */
  function initHeroMedia() {
    const media = $('[data-hero-media]');
    if (!media || reducedMotion.matches) return;

    onScrollFrame(() => {
      const progress = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.7)));
      media.style.setProperty('--hero-scale', (0.9 + 0.1 * progress).toFixed(4));
      media.style.setProperty('--hero-zoom', (1.12 - 0.12 * progress).toFixed(4));
    });
  }

  /* ---------- Devocional do dia ---------- */
  function renderDevotional(data) {
    const card = $('[data-devotional]');
    if (!card) return;
    if (!data.devocional) {
      card.hidden = true;
      return;
    }

    const devotional = data.devocional;
    $('[data-devotional-eyebrow]', card).textContent = devotional.eDeHoje ? 'Devocional do dia' : 'Devocional';
    $('[data-devotional-versiculo]', card).textContent = '“' + devotional.versiculoTexto + '”';
    $('[data-devotional-referencia]', card).textContent = devotional.versiculoReferencia;
    const reflexao = $('[data-devotional-reflexao]', card);
    reflexao.textContent = devotional.texto || '';
    reflexao.hidden = !devotional.texto;
    const autor = $('[data-devotional-autor]', card);
    autor.textContent = devotional.autor ? '— ' + devotional.autor : '';
    autor.hidden = !devotional.autor;

    card.hidden = false;
    observeReveal(card);
  }

  /* ---------- Frase que "acende" palavra por palavra ---------- */
  function initStatement() {
    const statement = $('[data-statement]');
    if (!statement) return;

    const words = statement.textContent.trim().split(/\s+/);
    statement.replaceChildren(...words.flatMap((word, index) => [
      h('span', { class: 'word', text: word }),
      index < words.length - 1 ? ' ' : null,
    ]).filter((node) => node !== null));

    const spans = $$('.word', statement);
    if (reducedMotion.matches) {
      spans.forEach((span) => span.classList.add('is-lit'));
      return;
    }

    onScrollFrame(() => {
      const rect = statement.getBoundingClientRect();
      const viewport = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (viewport * 0.85 - rect.top) / (rect.height + viewport * 0.3)));
      const litCount = Math.round(progress * spans.length);
      spans.forEach((span, index) => span.classList.toggle('is-lit', index < litCount));
    });
  }

  /* ---------- Números que contam ---------- */
  function initCountUp() {
    const items = $$('[data-count]');
    if (!items.length) return;

    const numberFormat = new Intl.NumberFormat('pt-BR');
    const display = (el, value) => { el.textContent = (el.dataset.prefix || '') + numberFormat.format(value); };

    if (reducedMotion.matches || !('IntersectionObserver' in window)) return;

    const run = (el) => {
      const target = Number(el.dataset.count);
      const startedAt = performance.now();
      const frame = (time) => {
        const progress = Math.min(1, (time - startedAt) / COUNT_UP_MS);
        display(el, Math.round(target * (1 - Math.pow(1 - progress, 4))));
        if (progress < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        run(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    items.forEach((el) => {
      display(el, 0);
      observer.observe(el);
    });
  }

  /* ---------- Cartão Pix com inclinação 3D ---------- */
  function initPixCard() {
    const card = $('[data-tilt]');
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!card || reducedMotion.matches || !canHover) return;

    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.classList.add('is-tilting');
      card.style.setProperty('--ry', ((x - 0.5) * 2 * MAX_TILT_DEG).toFixed(2) + 'deg');
      card.style.setProperty('--rx', ((0.5 - y) * 2 * MAX_TILT_DEG).toFixed(2) + 'deg');
      card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
      card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    });

    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }

  /* ---------- Mensagens (vídeos do canal do YouTube) ---------- */
  // h() cria elementos HTML comuns; o ícone de play precisa do namespace SVG à parte.
  function playIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z');
    svg.append(path);
    return svg;
  }

  function sermonFeatured(video) {
    const view = window.MensagensView;
    return h('a', {
      class: 'sermon-featured' + (video.live ? ' is-live' : ''),
      href: view.watchUrl(video.id),
      target: '_blank',
      rel: 'noopener',
      'data-reveal': '',
    }, [
      // Nem todo vídeo tem capa em alta resolução; se faltar (404), volta para a que o YouTube garante ter.
      h('img', {
        src: view.maxResUrl(video.thumbnail_url),
        alt: '',
        loading: 'lazy',
        width: 1280,
        height: 720,
        onerror: (event) => { event.target.onerror = null; event.target.src = video.thumbnail_url; },
      }),
      h('span', { class: 'play', 'aria-hidden': 'true' }, playIcon()),
      h('span', { class: 'sermon-badge' }, video.live ? 'Ao vivo agora' : capitalize(sermonDateFormat.format(new Date(video.publicado_em)))),
      h('span', { class: 'sermon-featured__title', text: video.titulo }),
    ]);
  }

  function sermonItem(video, index) {
    return h('li', { 'data-reveal': '', 'data-reveal-delay': String(80 + index * 60) }, h('a', { class: 'sermon-item', href: window.MensagensView.watchUrl(video.id), target: '_blank', rel: 'noopener' }, [
      h('img', { src: video.thumbnail_url, alt: '', loading: 'lazy', width: 400, height: 250 }),
      h('span', {}, [
        h('span', { class: 'sermon-item__series', text: capitalize(sermonDateFormat.format(new Date(video.publicado_em))) }),
        h('span', { class: 'sermon-item__title', style: { display: 'block' }, text: video.titulo }),
      ]),
    ]));
  }

  function socialLink(key, label) {
    const url = Site.config.redes[key];
    return url ? h('a', { class: 'link-chevron', href: url, target: '_blank', rel: 'noopener', text: label }) : null;
  }

  function renderMensagens(data) {
    const container = $('[data-sermons]');
    if (!container) return;

    const { featured, list } = window.MensagensView.buildSermonsView(data);
    if (!featured) {
      container.replaceChildren(h('p', { class: 'sermons__empty', text: 'Novas mensagens em breve.' }));
      return;
    }

    container.replaceChildren(
      sermonFeatured(featured),
      h('div', {}, [
        h('ul', { class: 'sermon-list' }, list.map(sermonItem)),
        h('div', { class: 'sermons__footer' }, [socialLink('youtube', 'Canal no YouTube'), socialLink('spotify', 'Podcast no Spotify')]),
      ]),
    );
    $$('[data-reveal]', container).forEach(observeReveal);
  }

  function showSermonsUnavailable() {
    const container = $('[data-sermons]');
    if (container) container.replaceChildren(h('p', { class: 'sermons__empty', text: 'Não foi possível carregar as mensagens agora.' }));
  }

  /* ---------- Mural de oração (carrossel com 3 cards, o do centro em destaque) ---------- */
  const MURAL_INTERVAL_MS = 6000;
  let muralPedidos = [];
  let muralIndex = 0;
  let muralTimer = null;

  function muralSlotContent(slot, pedido) {
    const el = $('[data-mural-slot="' + slot + '"]');
    if (!el) return;
    el.hidden = !pedido;
    if (!pedido) return;
    el.replaceChildren(...[
      h('p', { class: 'mural-card__texto', text: pedido.pedido }),
      pedido.nome ? h('p', { class: 'mural-card__nome', text: '— ' + pedido.nome }) : null,
    ].filter(Boolean));
  }

  function renderMuralSlots() {
    const carousel = $('[data-mural-carousel]');
    const empty = $('[data-mural-empty]');
    if (!carousel || !empty) return;

    const total = muralPedidos.length;
    empty.hidden = total > 0;
    carousel.hidden = total === 0;
    if (!total) return;

    muralSlotContent('center', muralPedidos[muralIndex % total]);
    const solo = total < 3;
    muralSlotContent('prev', solo ? null : muralPedidos[(muralIndex - 1 + total) % total]);
    muralSlotContent('next', solo ? null : muralPedidos[(muralIndex + 1) % total]);
  }

  function stopMuralTimer() {
    if (muralTimer) clearInterval(muralTimer);
    muralTimer = null;
  }

  function startMuralTimer() {
    stopMuralTimer();
    if (muralPedidos.length < 2 || reducedMotion.matches) return;
    muralTimer = setInterval(() => {
      muralIndex = (muralIndex + 1) % muralPedidos.length;
      renderMuralSlots();
    }, MURAL_INTERVAL_MS);
  }

  function initMuralCarousel() {
    const carousel = $('[data-mural-carousel]');
    if (!carousel || !window.MuralData) return;
    carousel.addEventListener('mouseenter', stopMuralTimer);
    carousel.addEventListener('mouseleave', startMuralTimer);
    window.MuralData.subscribe((data, error) => {
      if (error) return;
      muralPedidos = data.pedidos;
      muralIndex = 0;
      renderMuralSlots();
      startMuralTimer();
    });
  }

  /* ---------- Confirmação simples (dupla checagem pra mostrar o nome no mural) ---------- */
  function confirmarNomeNoMural() {
    const dialog = $('[data-mural-confirm]');
    if (!dialog) return Promise.resolve(false);
    const ok = $('[data-mural-confirm-ok]', dialog);
    const cancel = $('[data-mural-confirm-cancel]', dialog);
    return new Promise((resolve) => {
      const finish = (result) => { resolve(result); dialog.close(); };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      dialog.addEventListener('close', () => {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(false);
      }, { once: true });
      dialog.showModal();
    });
  }

  async function publicarNoMural(pedidoTexto, nomeParaMostrar) {
    try {
      const { supabase } = window.SITE_CONFIG;
      const client = window.SupabaseRest.create({ url: supabase.url, key: supabase.chavePublica });
      await client.from('pedidos_oracao', { anonymous: true }).insert({
        pedido: pedidoTexto,
        nome: nomeParaMostrar || null,
        mostrar_nome: Boolean(nomeParaMostrar),
      });
    } catch (error) {
      console.error('[oração] Não foi possível publicar no mural.', error);
      toast('Seu pedido foi enviado pro WhatsApp, mas não deu pra publicar no mural agora.');
    }
  }

  /* ---------- Pedido de oração → WhatsApp (e, opcionalmente, o mural) ---------- */
  function initPrayerForm() {
    const form = $('[data-prayer-form]');
    if (!form) return;

    const { nome, pedido, anonimo, contato, mural, muralNome } = form.elements;
    const muralNomeWrap = $('[data-mural-nome-wrap]', form);
    const counter = $('[data-char-count]', form);
    const errorEl = $('.field__error', pedido.closest('.field'));

    const validate = () => {
      const length = pedido.value.trim().length;
      if (length < PRAYER_MIN_CHARS) return 'Escreva pelo menos ' + PRAYER_MIN_CHARS + ' caracteres.';
      if (length > PRAYER_MAX_CHARS) return 'Use no máximo ' + PRAYER_MAX_CHARS + ' caracteres.';
      return '';
    };

    const showError = (message) => {
      pedido.closest('.field').classList.toggle('field--error', Boolean(message));
      pedido.setAttribute('aria-invalid', String(Boolean(message)));
      errorEl.textContent = message;
    };

    const updateCounter = () => { counter.textContent = pedido.value.length + '/' + PRAYER_MAX_CHARS; };

    pedido.addEventListener('input', () => {
      updateCounter();
      if (form.dataset.submitted) showError(validate());
    });

    anonimo.addEventListener('change', () => { nome.disabled = anonimo.checked; });

    mural.addEventListener('change', () => {
      muralNomeWrap.hidden = !mural.checked;
      if (!mural.checked) muralNome.checked = false;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      form.dataset.submitted = 'true';

      const error = validate();
      showError(error);
      if (error) {
        pedido.focus();
        return;
      }

      const name = anonimo.checked ? 'Anônimo' : nome.value.trim() || 'Não informado';
      const lines = ['*Pedido de oração* (enviado pelo site)', '', '*Nome:* ' + name, '', pedido.value.trim()];
      if (contato.checked) lines.push('', 'Gostaria de receber uma ligação da equipe.');

      window.open(whatsappUrl(lines.join('\n')), '_blank', 'noopener');
      toast('Abrimos o WhatsApp com o seu pedido. É só enviar.');

      if (mural.checked) {
        const pedidoTexto = pedido.value.trim();
        const quererMostrarNome = muralNome.checked && Boolean(nome.value.trim());
        const autorizado = quererMostrarNome ? await confirmarNomeNoMural() : false;
        publicarNoMural(pedidoTexto, autorizado ? nome.value.trim() : null);
      }

      form.reset();
      nome.disabled = false;
      muralNomeWrap.hidden = true;
      delete form.dataset.submitted;
      updateCounter();
    });
  }

  initHeroMedia();
  initStatement();
  initCountUp();
  initPixCard();
  initPrayerForm();
  initMuralCarousel();

  if (window.AgendaData) {
    window.AgendaData.subscribe((data, error) => {
      if (error) {
        showAgendaUnavailable();
        return;
      }
      events = data.eventos;
      categories = data.categorias;
      renderCultos();
      renderUpcoming();
    });
  } else {
    showAgendaUnavailable();
  }

  if (window.MensagensData && window.MensagensView) {
    window.MensagensData.subscribe((data, error) => {
      if (error) showSermonsUnavailable();
      else renderMensagens(data);
    });
  } else {
    showSermonsUnavailable();
  }

  // Card opcional: se não vier devocional (ainda não publicado, ou erro), o card simplesmente fica escondido.
  if (window.DevocionaisData) {
    window.DevocionaisData.subscribe((data, error) => {
      if (!error) renderDevotional(data);
    });
  }
})();
