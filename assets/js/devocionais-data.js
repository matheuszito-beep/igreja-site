/**
 * Devocional do dia no site: o de hoje ou, se a equipe ainda não publicou, o último publicado.
 *
 * Uso: DevocionaisData.subscribe((dados, erro) => { ... })  → dados = { devocional }
 */
(function () {
  'use strict';

  const COLUMNS = 'id,data,versiculo_referencia,versiculo_texto,texto,autor,publicado';

  async function fetchDevotional() {
    const { SITE_CONFIG: config, SupabaseRest, DevocionaisModel } = window;
    if (!config || !config.supabase || !SupabaseRest || !DevocionaisModel) {
      throw new Error('Supabase não configurado: verifique assets/js/config.js e a ordem dos scripts.');
    }
    const client = SupabaseRest.create({ url: config.supabase.url, key: config.supabase.chavePublica });
    const [row] = await client.from('devocionais', { anonymous: true })
      .select('select=' + COLUMNS + '&publicado=eq.true&data=lte.' + DevocionaisModel.todayKey() + '&order=data.desc&limit=1');
    return { devocional: row ? DevocionaisModel.rowToDevotional(row) : null };
  }

  if (!window.CachedResource) {
    console.error('[devocional] cached-resource.js precisa ser carregado antes de devocionais-data.js.');
    return;
  }

  window.DevocionaisData = window.CachedResource.create({ key: 'maanaim.devocional.v1', label: 'devocional', load: fetchDevotional });
})();
