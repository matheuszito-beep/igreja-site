/**
 * Banco de versículos por tema — sugestões para agilizar o cadastro do devocional no painel.
 * Texto na tradução Almeida Revista e Corrigida (ARC, domínio público), conferido em
 * bibliaonline.com.br/arc. Conjunto inicial e curado a dedo: peça para eu adicionar mais
 * temas ou versículos quando precisar.
 * Funciona no navegador (window.VersiculosBanco) e no Node (require) para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.VersiculosBanco = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TRADUCAO = 'Almeida Revista e Corrigida (ARC)';

  const TEMAS = Object.freeze([
    { chave: 'fe', nome: 'Fé', versiculos: [
      { referencia: 'Hebreus 11:1', texto: 'Ora, a fé é o firme fundamento das coisas que se esperam e a prova das coisas que se não veem.' },
      { referencia: 'Marcos 11:24', texto: 'Por isso, vos digo que tudo o que pedirdes, orando, crede que o recebereis e tê-lo-eis.' },
      { referencia: 'Romanos 10:17', texto: 'De sorte que a fé é pelo ouvir, e o ouvir pela palavra de Deus.' },
    ] },
    { chave: 'esperanca', nome: 'Esperança', versiculos: [
      { referencia: 'Jeremias 29:11', texto: 'Porque eu bem sei os pensamentos que penso de vós, diz o Senhor; pensamentos de paz e não de mal, para vos dar o fim que esperais.' },
    ] },
    { chave: 'ansiedade', nome: 'Ansiedade e medo', versiculos: [
      { referencia: 'Filipenses 4:6-7', texto: 'Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplicas, com ação de graças. E a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos sentimentos em Cristo Jesus.' },
      { referencia: 'Isaías 41:10', texto: 'Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te esforço, e te ajudo, e te sustento com a destra da minha justiça.' },
      { referencia: '1 Pedro 5:7', texto: 'Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.' },
    ] },
    { chave: 'forca', nome: 'Força e coragem', versiculos: [
      { referencia: 'Filipenses 4:13', texto: 'Posso todas as coisas naquele que me fortalece.' },
      { referencia: 'Josué 1:9', texto: 'Não to mandei eu? Esforça-te e tem bom ânimo; não pasmes, nem te espantes, porque o Senhor, teu Deus, é contigo, por onde quer que andares.' },
    ] },
    { chave: 'paz', nome: 'Paz', versiculos: [
      { referencia: 'João 14:27', texto: 'Deixo-vos a paz, a minha paz vos dou; não vo-la dou como o mundo a dá. Não se turbe o vosso coração, nem se atemorize.' },
    ] },
    { chave: 'amor', nome: 'Amor', versiculos: [
      { referencia: 'João 3:16', texto: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.' },
      { referencia: '1 Coríntios 13:4', texto: 'O amor é sofredor, é benigno; o amor não é invejoso; o amor não trata com leviandade, não se ensoberbece.' },
      { referencia: '1 João 4:19', texto: 'Nós o amamos porque ele nos amou primeiro.' },
    ] },
    { chave: 'perdao', nome: 'Perdão', versiculos: [
      { referencia: 'Efésios 4:32', texto: 'Antes, sede uns para com os outros benignos, misericordiosos, perdoando-vos uns aos outros, como também Deus vos perdoou em Cristo.' },
      { referencia: '1 João 1:9', texto: 'Se confessarmos os nossos pecados, ele é fiel e justo para nos perdoar os pecados e nos purificar de toda injustiça.' },
    ] },
    { chave: 'gratidao', nome: 'Gratidão', versiculos: [
      { referencia: '1 Tessalonicenses 5:18', texto: 'Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.' },
    ] },
    { chave: 'sabedoria', nome: 'Sabedoria', versiculos: [
      { referencia: 'Provérbios 3:5-6', texto: 'Confia no Senhor de todo o teu coração e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.' },
      { referencia: 'Tiago 1:5', texto: 'E, se algum de vós tem falta de sabedoria, peça-a a Deus, que a todos dá liberalmente e não o lança em rosto; e ser-lhe-á dada.' },
    ] },
    { chave: 'familia', nome: 'Família', versiculos: [
      { referencia: 'Josué 24:15', texto: 'Porém eu e a minha casa serviremos ao Senhor.' },
      { referencia: 'Provérbios 22:6', texto: 'Instrui o menino no caminho em que deve andar, e, até quando envelhecer, não se desviará dele.' },
    ] },
    { chave: 'provisao', nome: 'Provisão e cuidado de Deus', versiculos: [
      { referencia: 'Salmos 23:1', texto: 'O Senhor é o meu pastor; nada me faltará.' },
      { referencia: 'Mateus 6:33', texto: 'Mas buscai primeiro o Reino de Deus, e a sua justiça, e todas essas coisas vos serão acrescentadas.' },
      { referencia: 'Filipenses 4:19', texto: 'O meu Deus, segundo as suas riquezas, suprirá todas as vossas necessidades em glória, por Cristo Jesus.' },
    ] },
    { chave: 'oracao', nome: 'Oração', versiculos: [
      { referencia: 'Mateus 7:7', texto: 'Pedi, e dar-se-vos-á; buscai e encontrareis; batei, e abrir-se-vos-á.' },
      { referencia: 'Filipenses 4:6', texto: 'Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplicas, com ação de graças.' },
    ] },
    { chave: 'perseveranca', nome: 'Perseverança', versiculos: [
      { referencia: 'Gálatas 6:9', texto: 'E não nos cansemos de fazer o bem, porque a seu tempo ceifaremos, se não houvermos desfalecido.' },
    ] },
    { chave: 'alegria', nome: 'Alegria', versiculos: [
      { referencia: 'Neemias 8:10', texto: 'A alegria do Senhor é a vossa força.' },
      { referencia: 'Salmos 118:24', texto: 'Este é o dia que fez o Senhor; regozijemo-nos e alegremo-nos nele.' },
    ] },
    { chave: 'humildade', nome: 'Humildade', versiculos: [
      { referencia: 'Tiago 4:10', texto: 'Humilhai-vos perante o Senhor, e ele vos exaltará.' },
    ] },
  ]);

  function listThemes() {
    return TEMAS.map((tema) => ({ chave: tema.chave, nome: tema.nome }));
  }

  function versesForTheme(chave) {
    const tema = TEMAS.find((item) => item.chave === chave);
    return tema ? tema.versiculos : [];
  }

  return Object.freeze({ TRADUCAO, listThemes, versesForTheme });
});
