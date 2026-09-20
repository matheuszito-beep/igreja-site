/**
 * Mensagens: pequenas funções puras que decidem o que vira destaque, o que
 * vai para a lista e como montar os links — sem tocar no DOM, por isso são
 * fáceis de testar. Funciona no navegador (window.MensagensView) e no Node
 * (require) para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MensagensView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIVE_FALLBACK_TITLE = 'Ao vivo agora';

  const watchUrl = (videoId) => 'https://www.youtube.com/watch?v=' + videoId;

  /** Pede a versão em alta resolução da capa; se a URL não seguir o padrão do YouTube, devolve como veio. */
  const maxResUrl = (thumbnailUrl) => thumbnailUrl.replace(/\/[a-z]+default\.jpg$/, '/maxresdefault.jpg');

  function buildSermonsView({ videos, aoVivo }) {
    const featured = aoVivo
      ? { id: aoVivo.videoId, titulo: aoVivo.titulo || LIVE_FALLBACK_TITLE, thumbnail_url: maxResUrl('https://i.ytimg.com/vi/' + aoVivo.videoId + '/hqdefault.jpg'), live: true }
      : videos[0]
        ? { ...videos[0], live: false }
        : null;

    if (!featured) return { featured: null, list: [] };

    return { featured, list: videos.filter((video) => video.id !== featured.id).slice(0, 3) };
  }

  return Object.freeze({ watchUrl, maxResUrl, buildSermonsView });
});
