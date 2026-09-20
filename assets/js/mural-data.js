/**
 * Mural de oração no site: pedidos publicados (anônimos, a não ser que a pessoa
 * tenha autorizado mostrar o nome), com cópia local no navegador.
 *
 * Uso: MuralData.subscribe((dados, erro) => { ... })  → dados = { pedidos }
 */
(function () {
  'use strict';

  const COLUMNS = 'id,pedido,nome,criado_em';
  const LIMIT = 30;

  async function fetchMural() {
    const { SITE_CONFIG: config, SupabaseRest } = window;
    if (!config || !config.supabase || !SupabaseRest) {
      throw new Error('Supabase não configurado: verifique assets/js/config.js e a ordem dos scripts.');
    }
    const client = SupabaseRest.create({ url: config.supabase.url, key: config.supabase.chavePublica });
    const rows = await client.from('pedidos_oracao', { anonymous: true })
      .select('select=' + COLUMNS + '&order=criado_em.desc&limit=' + LIMIT);
    return {
      pedidos: rows.map((row) => ({ id: row.id, pedido: row.pedido, nome: row.nome || undefined })),
    };
  }

  if (!window.CachedResource) {
    console.error('[mural] cached-resource.js precisa ser carregado antes de mural-data.js.');
    return;
  }

  window.MuralData = window.CachedResource.create({ key: 'maanaim.mural.v1', label: 'mural', load: fetchMural });
})();
