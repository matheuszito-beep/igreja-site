/**
 * Comportamentos compartilhados por todas as páginas:
 * navegação "ilha", animações de entrada, dados da configuração,
 * contagem regressiva do próximo culto, cópia de texto e toast.
 */
(function () {
  'use strict';

  const config = window.SITE_CONFIG;
  const utils = window.CalendarUtils;
  let events = [];

  if (!config || !utils) {
    console.error('[site] config.js ou calendar-utils.js não foram carregados antes de site.js.');
    return;
  }

  const TOAST_DURATION_MS = 2600;
  const LABEL_SWAP_MS = 170;
  const COUNTDOWN_TICK_MS = 1000;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  /** Cria elementos com segurança (textContent, nunca innerHTML). */
  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'style') Object.entries(value).forEach(([prop, val]) => el.style.setProperty(prop, val));
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : String(value));
    });
    [].concat(children).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return el;
  }

  const getPath = (source, path) =>
    path.split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), source);

  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  function whatsappUrl(message) {
    const text = message || config.contato.mensagemPadrao;
    return 'https://wa.me/' + config.contato.whatsapp + '?text=' + encodeURIComponent(text);
  }

  const mapsDirectionsUrl = () =>
    'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(config.endereco.busca);

  const mapsEmbedUrl = () =>
    'https://maps.google.com/maps?q=' + encodeURIComponent(config.endereco.busca) + '&z=16&output=embed';

  function openInNewTab(anchor, url) {
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
  }

  /* ---------- Dados da configuração no HTML ---------- */
  function bindConfig() {
    $$('[data-config]').forEach((el) => {
      const value = getPath(config, el.dataset.config);
      if (value) el.textContent = value;
    });
    $$('[data-whatsapp]').forEach((el) => openInNewTab(el, whatsappUrl(el.dataset.whatsapp)));
    $$('[data-maps]').forEach((el) => openInNewTab(el, mapsDirectionsUrl()));
    $$('[data-map-embed]').forEach((frame) => { frame.src = mapsEmbedUrl(); });
    $$('[data-email]').forEach((el) => { el.href = 'mailto:' + config.contato.email; });
    $$('[data-social]').forEach((el) => {
      const url = config.redes[el.dataset.social];
      if (url) openInNewTab(el, url);
      else el.hidden = true;
    });
    $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
  }

  /* ---------- Toast ---------- */
  let toastEl;
  let toastTimer;

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), TOAST_DURATION_MS);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const area = h('textarea', { 'aria-hidden': 'true', style: { position: 'fixed', opacity: '0' } });
      area.value = text;
      document.body.append(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    }
  }

  function initCopyButtons() {
    $$('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const text = getPath(config, button.dataset.copy);
        const copied = text ? await copyText(text) : false;
        toast(copied ? button.dataset.copyMessage || 'Copiado' : 'Não foi possível copiar. Selecione o texto e copie manualmente.');
      });
    });
  }

  /* ---------- Rolagem: um único listener para todos os efeitos ---------- */
  const scrollCallbacks = [];
  let scrollTicking = false;

  function runScrollCallbacks() {
    scrollCallbacks.forEach((callback) => callback());
    scrollTicking = false;
  }

  function requestScrollFrame() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(runScrollCallbacks);
  }

  function onScrollFrame(callback) {
    scrollCallbacks.push(callback);
    callback();
  }

  window.addEventListener('scroll', requestScrollFrame, { passive: true });
  window.addEventListener('resize', requestScrollFrame, { passive: true });

  /* ---------- Animações de entrada ---------- */
  const revealObserver = 'IntersectionObserver' in window && !reducedMotion.matches
    ? new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 })
    : null;

  function observeReveal(element) {
    if (element.dataset.revealDelay) {
      element.style.setProperty('--reveal-delay', element.dataset.revealDelay + 'ms');
    }
    if (revealObserver) revealObserver.observe(element);
    else element.classList.add('is-visible');
  }

  /* ---------- Navegação "ilha" ---------- */
  function initIsland() {
    const island = $('[data-island]');
    if (!island) return;

    const shell = $('.island__shell', island);
    const bar = $('.island__bar', island);
    const panel = $('.island__panel', island);
    const toggle = $('[data-island-toggle]', island);
    const toggleText = $('.sr-only', toggle);
    const label = $('[data-island-label]', island);
    const progress = $('[data-island-progress]', island);
    const navLinks = $$('.island__links a', island);

    navLinks.forEach((link, index) => link.parentElement.style.setProperty('--i', String(index)));

    const syncWidth = () => shell.style.setProperty('--island-w', bar.offsetWidth + 'px');
    if ('ResizeObserver' in window) new ResizeObserver(syncWidth).observe(bar);
    syncWidth();

    const isOpen = () => island.dataset.state === 'open';

    function setOpen(open, focusToggle) {
      island.dataset.state = open ? 'open' : 'closed';
      toggle.setAttribute('aria-expanded', String(open));
      toggleText.textContent = open ? 'Fechar menu' : 'Abrir menu';
      panel.inert = !open;
      if (focusToggle) toggle.focus();
    }

    setOpen(false);

    bar.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      setOpen(!isOpen());
    });
    $$('[data-island-close]', island).forEach((el) => el.addEventListener('click', () => setOpen(false)));
    $$('a', panel).forEach((link) => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) setOpen(false, true);
    });
    shell.addEventListener('focusout', (event) => {
      if (isOpen() && event.relatedTarget && !shell.contains(event.relatedTarget)) setOpen(false);
    });

    let currentLabel = label.textContent.trim();
    let swapTimer;

    function setLabel(text) {
      if (text === currentLabel) return;
      currentLabel = text;
      if (reducedMotion.matches) {
        label.textContent = text;
        return;
      }
      clearTimeout(swapTimer);
      label.classList.add('is-leaving');
      swapTimer = setTimeout(() => {
        label.textContent = text;
        label.classList.replace('is-leaving', 'is-entering');
        void label.offsetWidth; // força o reflow para animar a entrada
        label.classList.remove('is-entering');
      }, LABEL_SWAP_MS);
    }

    function setCurrentSection(section) {
      setLabel(section.dataset.navLabel);
      navLinks.forEach((link) => {
        if (link.dataset.nav === section.id) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }

    const sections = $$('[data-nav-label]');
    if (sections.length && 'IntersectionObserver' in window) {
      const sectionObserver = new IntersectionObserver((entries) => {
        entries.filter((entry) => entry.isIntersecting).forEach((entry) => setCurrentSection(entry.target));
      }, { rootMargin: '-42% 0px -56% 0px' });
      sections.forEach((section) => sectionObserver.observe(section));
    }

    onScrollFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progress.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    });
  }

  /* ---------- Widget de conta (Entrar / Minha Conta) ---------- */
  function initAccountWidget() {
    const widgets = $$('[data-account-widget]');
    if (!widgets.length) return;
    if (!window.SupabaseRest || !config.supabase) return;

    let signedIn = false;
    try {
      signedIn = window.SupabaseRest.create({ url: config.supabase.url, key: config.supabase.chavePublica }).auth.hasSession();
    } catch (error) {
      console.warn('[conta] Não foi possível checar a sessão para o menu.', error);
    }

    widgets.forEach((widget) => {
      $('[data-account-name]', widget).textContent = signedIn ? 'Minha Conta' : 'Entrar';
      $('[data-account-sub]', widget).textContent = signedIn ? 'Ver seus dados' : 'Sua célula, seus dados e mais';
    });
  }

  /* ---------- Próximo culto e contagem regressiva ---------- */
  function describeWhen(occurrence, now) {
    const todayKey = utils.toDateKey(now);
    const tomorrowKey = utils.toDateKey(utils.addDays(now, 1));
    let day = capitalize(weekdayFormat.format(occurrence.start));
    if (occurrence.key === todayKey) day = 'Hoje';
    else if (occurrence.key === tomorrowKey) day = 'Amanhã';
    return day + ', ' + utils.formatHour(occurrence.start) + ' · ' + (occurrence.local || '');
  }

  function setText(scope, selector, text) {
    $$(selector, scope).forEach((el) => {
      if (el.textContent !== text) el.textContent = text;
    });
  }

  function renderNextService(root, result, now) {
    root.hidden = !result;
    if (!result) return;
    const { occurrence, isLive } = result;
    root.classList.toggle('is-live', isLive);
    setText(root, '[data-ns-status]', isLive ? 'Ao vivo agora' : 'Próximo culto');
    setText(root, '[data-ns-name]', occurrence.titulo);
    setText(root, '[data-ns-when]', isLive ? 'Acontecendo agora · ' + (occurrence.local || '') : describeWhen(occurrence, now));
    const parts = utils.countdownParts(occurrence.start, now);
    Object.entries(parts).forEach(([unit, value]) => setText(root, '[data-cd="' + unit + '"]', String(value).padStart(2, '0')));
  }

  function initNextService() {
    const targets = $$('[data-next-service]');
    const liveIndicators = $$('[data-live-indicator]');
    if (!targets.length && !liveIndicators.length) return;

    let timer = null;

    function stop() {
      clearInterval(timer);
      timer = null;
      targets.forEach((target) => { target.hidden = true; });
    }

    function tick() {
      const now = new Date();
      let result;
      try {
        result = utils.nextService(events, now);
      } catch (error) {
        console.error('[agenda] Evento com dados inválidos:', error);
        stop();
        return;
      }
      targets.forEach((target) => {
        target.classList.remove('is-loading');
        renderNextService(target, result, now);
      });
      liveIndicators.forEach((el) => { el.hidden = !(result && result.isLive); });
    }

    if (!window.AgendaData) {
      stop();
      return;
    }
    window.AgendaData.subscribe((data) => {
      if (!data) {
        stop();
        return;
      }
      events = data.eventos;
      tick();
      if (!timer) timer = setInterval(tick, COUNTDOWN_TICK_MS);
    });
  }

  /* ---------- Inicialização ---------- */
  toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  document.body.append(toastEl);

  bindConfig();
  initIsland();
  initAccountWidget();
  initCopyButtons();
  initNextService();
  $$('[data-reveal]').forEach(observeReveal);

  window.Site = Object.freeze({
    $,
    $$,
    h,
    config,
    utils,
    reducedMotion,
    capitalize,
    toast,
    copyText,
    whatsappUrl,
    onScrollFrame,
    observeReveal,
  });
})();
