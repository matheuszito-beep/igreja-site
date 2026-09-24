// ============================================================
// Cria sozinho o devocional do dia quando a equipe ainda não cadastrou nenhum
// para hoje. Roda uma vez por dia de manhã via pg_cron (agendada na migração
// 20260924100100_agendar_auto_devocional.sql).
//
// Os versículos são os mesmos 30, já curados à mão, de assets/js/versiculos-banco.js
// (tradução Almeida Revista e Corrigida, domínio público) — mantenha as duas listas
// em sincronia se adicionar versículos num dos dois lugares. Não é uma reflexão
// escrita pela equipe: fica só o versículo. A equipe pode editar ou substituir
// pelo painel a qualquer momento, como qualquer outro devocional.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Brasil não tem mais horário de verão desde 2019: -03:00 o ano todo.
const FUSO_OFFSET_MS = 3 * 60 * 60 * 1000;

interface Verso {
  referencia: string;
  texto: string;
}

const VERSICULOS: Verso[] = [
  { referencia: 'Hebreus 11:1', texto: 'Ora, a fé é o firme fundamento das coisas que se esperam e a prova das coisas que se não veem.' },
  { referencia: 'Marcos 11:24', texto: 'Por isso, vos digo que tudo o que pedirdes, orando, crede que o recebereis e tê-lo-eis.' },
  { referencia: 'Romanos 10:17', texto: 'De sorte que a fé é pelo ouvir, e o ouvir pela palavra de Deus.' },
  { referencia: 'Jeremias 29:11', texto: 'Porque eu bem sei os pensamentos que penso de vós, diz o Senhor; pensamentos de paz e não de mal, para vos dar o fim que esperais.' },
  { referencia: 'Filipenses 4:6-7', texto: 'Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplicas, com ação de graças. E a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos sentimentos em Cristo Jesus.' },
  { referencia: 'Isaías 41:10', texto: 'Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te esforço, e te ajudo, e te sustento com a destra da minha justiça.' },
  { referencia: '1 Pedro 5:7', texto: 'Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.' },
  { referencia: 'Filipenses 4:13', texto: 'Posso todas as coisas naquele que me fortalece.' },
  { referencia: 'Josué 1:9', texto: 'Não to mandei eu? Esforça-te e tem bom ânimo; não pasmes, nem te espantes, porque o Senhor, teu Deus, é contigo, por onde quer que andares.' },
  { referencia: 'João 14:27', texto: 'Deixo-vos a paz, a minha paz vos dou; não vo-la dou como o mundo a dá. Não se turbe o vosso coração, nem se atemorize.' },
  { referencia: 'João 3:16', texto: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.' },
  { referencia: '1 Coríntios 13:4', texto: 'O amor é sofredor, é benigno; o amor não é invejoso; o amor não trata com leviandade, não se ensoberbece.' },
  { referencia: '1 João 4:19', texto: 'Nós o amamos porque ele nos amou primeiro.' },
  { referencia: 'Efésios 4:32', texto: 'Antes, sede uns para com os outros benignos, misericordiosos, perdoando-vos uns aos outros, como também Deus vos perdoou em Cristo.' },
  { referencia: '1 João 1:9', texto: 'Se confessarmos os nossos pecados, ele é fiel e justo para nos perdoar os pecados e nos purificar de toda injustiça.' },
  { referencia: '1 Tessalonicenses 5:18', texto: 'Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.' },
  { referencia: 'Provérbios 3:5-6', texto: 'Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.' },
  { referencia: 'Tiago 1:5', texto: 'E, se algum de vós tem falta de sabedoria, peça-a a Deus, que a todos dá liberalmente e não o lança em rosto; e ser-lhe-á dada.' },
  { referencia: 'Josué 24:15', texto: 'Porém eu e a minha casa serviremos ao Senhor.' },
  { referencia: 'Provérbios 22:6', texto: 'Instrui o menino no caminho em que deve andar, e, até quando envelhecer, não se desviará dele.' },
  { referencia: 'Salmos 23:1', texto: 'O Senhor é o meu pastor; nada me faltará.' },
  { referencia: 'Mateus 6:33', texto: 'Mas buscai primeiro o Reino de Deus, e a sua justiça, e todas essas coisas vos serão acrescentadas.' },
  { referencia: 'Filipenses 4:19', texto: 'O meu Deus, segundo as suas riquezas, suprirá todas as vossas necessidades em glória, por Cristo Jesus.' },
  { referencia: 'Mateus 7:7', texto: 'Pedi, e dar-se-vos-á; buscai e encontrareis; batei, e abrir-se-vos-á.' },
  { referencia: 'Filipenses 4:6', texto: 'Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplicas, com ação de graças.' },
  { referencia: 'Gálatas 6:9', texto: 'E não nos cansemos de fazer o bem, porque a seu tempo ceifaremos, se não houvermos desfalecido.' },
  { referencia: 'Neemias 8:10', texto: 'A alegria do Senhor é a vossa força.' },
  { referencia: 'Salmos 118:24', texto: 'Este é o dia que fez o Senhor; regozijemo-nos e alegremo-nos nele.' },
  { referencia: 'Tiago 4:10', texto: 'Humilhai-vos perante o Senhor, e ele vos exaltará.' },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Data e "dia do ano" já no fuso de Brasília, sem depender do fuso do servidor. */
function hojeNoBrasil(): { chave: string; diaDoAno: number } {
  const agora = new Date(Date.now() - FUSO_OFFSET_MS);
  const chave = agora.getUTCFullYear() + '-' + pad(agora.getUTCMonth() + 1) + '-' + pad(agora.getUTCDate());
  const inicioDoAno = Date.UTC(agora.getUTCFullYear(), 0, 1);
  const diaDoAno = Math.floor((Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()) - inicioDoAno) / 86_400_000);
  return { chave, diaDoAno };
}

Deno.serve(async () => {
  try {
    const { chave, diaDoAno } = hojeNoBrasil();
    const verso = VERSICULOS[diaDoAno % VERSICULOS.length];

    // Prefer: resolution=ignore-duplicates + on_conflict=data faz o insert só
    // acontecer se ainda não existir um devocional para hoje — se a equipe já
    // cadastrou um na mão, este envio é simplesmente ignorado.
    const response = await fetch(SUPABASE_URL + '/rest/v1/devocionais?on_conflict=data', {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({
        data: chave,
        versiculo_referencia: verso.referencia,
        versiculo_texto: verso.texto,
        texto: null,
        autor: null,
        publicado: true,
      }),
    });
    if (!response.ok) throw new Error('devocionais: a gravação respondeu ' + response.status + ' — ' + (await response.text()).slice(0, 300));

    return new Response(JSON.stringify({ data: chave, referencia: verso.referencia }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[auto-devocional]', error);
    return new Response(JSON.stringify({ erro: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
