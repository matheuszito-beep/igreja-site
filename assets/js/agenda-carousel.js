/**
 * Carrossel paginado da vista "Lista" da agenda.
 * Mostra alguns eventos por página (conforme a largura da tela) e navega
 * pelas setas, pelo teclado ou deslizando o dedo.
 */
(function () {
  'use strict';

  const Site = window.Site;
  if (!Site) return;

  const { $, h, utils, reducedMotion } = Site;

  const DEFAULT_PER_PAGE = 6;
  const BREAKPOINTS = Object.freeze([
    Object.freeze({ query: window.matchMedia('(max-width: 640px)'), perPage: 3 }),
    Object.freeze({ query: window.matchMedia('(max-width: 1000px)'), perPage: 4 }),
  ]);

  function currentPerPage() {
    const match = BREAKPOINTS.find((breakpoint) => breakpoint.query.matches);
    return match ? match.perPage : DEFAULT_PER_PAGE;
  }

  function create(root, { renderCard, describeRange }) {
    const track = $('[data-list-track]', root);
    const rangeLabel = $('[data-list-range]', root);
    const total = $('[data-list-total]', root);
    const counter = $('[data-list-count]', root);
    const prev = $('[data-list-prev]', root);
    const next = $('[data-list-next]', root);
    const progress = $('[data-list-progress]', root);

    let items = [];
    let pages = [];
    let perPage = currentPerPage();
    let current = 0;
    let frame = 0;

    const pageWidth = () => track.clientWidth || 1;
    const clampPage = (index) => Math.min(Math.max(index, 0), Math.max(pages.length - 1, 0));

    function updatePager(index) {
      current = clampPage(index);
      const hasPages = pages.length > 0;
      prev.disabled = current === 0;
      next.disabled = !hasPages || current === pages.length - 1;
      counter.textContent = hasPages ? current + 1 + ' / ' + pages.length : '0 / 0';
      progress.style.transform = 'scaleX(' + (hasPages ? (current + 1) / pages.length : 0) + ')';

      const label = hasPages ? describeRange(pages[current]) : 'Sem eventos no período';
      if (rangeLabel.textContent !== label) rangeLabel.textContent = label;
    }

    function goTo(index) {
      track.scrollTo({ left: clampPage(index) * pageWidth(), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    }

    function render(nextItems, startIndex) {
      items = nextItems;
      perPage = currentPerPage();
      pages = utils.paginate(items, perPage);
      total.textContent = items.length + (items.length === 1 ? ' evento' : ' eventos');

      if (!pages.length) {
        track.replaceChildren(h('p', { class: 'list-track__empty', text: 'Nenhum evento encontrado para os filtros escolhidos.' }));
        updatePager(0);
        return;
      }

      track.replaceChildren(...pages.map((pageItems, index) => h('div', {
        class: 'list-page',
        role: 'group',
        'aria-roledescription': 'página',
        'aria-label': 'Página ' + (index + 1) + ' de ' + pages.length,
      }, pageItems.map(renderCard))));

      const initialPage = clampPage(utils.pageOfIndex(startIndex, perPage));
      track.scrollLeft = initialPage * pageWidth();
      updatePager(initialPage);
    }

    track.addEventListener('scroll', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => updatePager(Math.round(track.scrollLeft / pageWidth())));
    }, { passive: true });

    prev.addEventListener('click', () => goTo(current - 1));
    next.addEventListener('click', () => goTo(current + 1));

    track.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const target = clampPage(current + (event.key === 'ArrowRight' ? 1 : -1));
      goTo(target);
      if (event.target === track) return;
      const page = track.children[target];
      if (page && page.firstElementChild) page.firstElementChild.focus({ preventScroll: true });
    });

    // Mantém a página alinhada quando a largura muda e refaz a paginação ao trocar de tamanho de tela.
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { track.scrollLeft = current * pageWidth(); }).observe(track);
    }
    BREAKPOINTS.forEach(({ query }) => {
      query.addEventListener('change', () => {
        if (root.hidden || currentPerPage() === perPage) return;
        render(items, current * perPage);
      });
    });

    return Object.freeze({ render });
  }

  window.AgendaCarousel = Object.freeze({ create });
})();
