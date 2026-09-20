/**
 * Mensagens do site: últimos vídeos do canal do YouTube e status "ao vivo",
 * sincronizados por uma Edge Function a cada poucos minutos. Cópia local no navegador.
 *
 * Uso: MensagensData.subscribe((dados, erro) => { ... })  → dados = { videos, aoVivo, origem }
 */
(function () {
  'use strict';

  async function fetchMensagens() {
    const { SITE_CONFIG: config, SupabaseRest } = window;
    if (!config || !config.supabase || !SupabaseRest) {
      throw new Error('Supabase não configurado: verifique assets/js/config.js e a ordem dos scripts.');
    }
    const client = SupabaseRest.create({ url: config.supabase.url, key: config.supabase.chavePublica });
    const [videos, status] = await Promise.all([
      client.from('mensagens', { anonymous: true }).select('select=id,titulo,thumbnail_url,publicado_em&order=publicado_em.desc&limit=4'),
      client.from('canal_youtube', { anonymous: true }).select('select=ao_vivo,video_id,titulo&id=eq.youtube'),
    ]);
    const [canal] = status;
    return { videos, aoVivo: canal && canal.ao_vivo ? { videoId: canal.video_id, titulo: canal.titulo } : null };
  }

  if (!window.CachedResource) {
    console.error('[mensagens] cached-resource.js precisa ser carregado antes de mensagens-data.js.');
    return;
  }

  window.MensagensData = window.CachedResource.create({ key: 'maanaim.mensagens.v1', label: 'mensagens', load: fetchMensagens });
})();
