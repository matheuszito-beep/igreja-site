/**
 * Agenda do site: categorias e eventos publicados no Supabase, com cópia local no navegador.
 *
 * Uso: AgendaData.subscribe((dados, erro) => { ... })  → dados = { eventos, categorias, origem }
 */
(function () {
  'use strict';

  const EVENT_COLUMNS = 'id,titulo,categoria_id,inicio,fim,local,descricao,imagem_url,eh_culto,recorrencia,recorrencia_ate,excecoes,publicado,inscricao_aberta,vagas,vagas_ocupadas';

  async function fetchAgenda() {
    const { SITE_CONFIG: config, SupabaseRest, AgendaModel } = window;
    if (!config || !config.supabase || !SupabaseRest || !AgendaModel) {
      throw new Error('Supabase não configurado: verifique assets/js/config.js e a ordem dos scripts.');
    }
    const client = SupabaseRest.create({ url: config.supabase.url, key: config.supabase.chavePublica });
    const [categoryRows, eventRows] = await Promise.all([
      client.from('categorias', { anonymous: true }).select('select=id,nome,cor,ordem&order=ordem'),
      client.from('eventos', { anonymous: true }).select('select=' + EVENT_COLUMNS + '&publicado=eq.true&order=inicio'),
    ]);
    return {
      categorias: AgendaModel.rowsToCategories(categoryRows),
      eventos: eventRows.map(AgendaModel.rowToEvent),
    };
  }

  if (!window.CachedResource) {
    console.error('[agenda] cached-resource.js precisa ser carregado antes de agenda-data.js.');
    return;
  }

  window.AgendaData = window.CachedResource.create({ key: 'maanaim.agenda.v1', label: 'agenda', load: fetchAgenda });
})();
