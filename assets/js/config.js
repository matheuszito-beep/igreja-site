/**
 * ============================================================
 *  CONFIGURAÇÕES DA IGREJA — edite aqui e o site todo atualiza
 * ============================================================
 * Campos marcados com data-config no HTML são preenchidos com estes valores.
 */
window.SITE_CONFIG = Object.freeze({
  nome: 'Batista Maanaim',
  nomeCompleto: '1ª Igreja Batista Maanaim',
  fusoHorario: 'America/Sao_Paulo',

  // Banco de dados da agenda (Supabase). A chave publicável foi feita para ficar no site:
  // quem protege os dados são as regras de permissão do banco.
  supabase: Object.freeze({
    url: 'https://htwckbwlhdesdkgdtwle.supabase.co',
    chavePublica: 'sb_publishable_xgMndWnGmDjDpsyXLUC7lw_bIk4j0eK',
  }),

  // Mapa das células: ponto de partida quando ainda não há células para enquadrar.
  mapa: Object.freeze({
    centro: Object.freeze([-23.2804, -47.0613]),
    zoom: 13,
  }),

  contato: Object.freeze({
    // Somente números, com DDI 55 + DDD. Ex.: 5511999999999
    whatsapp: '5511999999999',
    whatsappExibicao: '(11) 99999-9999',
    email: 'contato@batistamaanaim.com.br',
    mensagemPadrao: 'Olá! Vim pelo site da igreja e gostaria de mais informações.',
  }),

  endereco: Object.freeze({
    linha1: 'Rua Exemplo, 000',
    linha2: 'Novo Bonfim — Cabreúva, SP',
    cep: '13315-000',
    // Texto usado no Google Maps (mapa e "Como chegar"). Com o endereço completo o pino fica exato.
    busca: 'Novo Bonfim, Cabreúva - SP',
  }),

  pix: Object.freeze({
    chave: '00.000.000/0001-00',
    tipo: 'CNPJ',
    favorecido: '1ª Igreja Batista Maanaim',
    banco: 'Banco Exemplo · Ag. 0001 · C/C 12345-6',
  }),

  redes: Object.freeze({
    instagram: 'https://www.instagram.com/',
    youtube: 'https://www.youtube.com/@igjmaanaim',
    spotify: 'https://open.spotify.com/',
  }),
});
