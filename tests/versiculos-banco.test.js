const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const banco = require('../assets/js/versiculos-banco.js');

describe('listThemes', () => {
  test('lista os temas com chave e nome', () => {
    const themes = banco.listThemes();
    assert.ok(themes.length > 0);
    assert.ok(themes.every((tema) => tema.chave && tema.nome));
  });

  test('inclui os temas mais comuns de um devocional', () => {
    const chaves = banco.listThemes().map((tema) => tema.chave);
    ['fe', 'ansiedade', 'forca', 'paz', 'amor'].forEach((chave) => {
      assert.ok(chaves.includes(chave), 'esperava o tema "' + chave + '"');
    });
  });
});

describe('versesForTheme', () => {
  test('retorna os versículos de um tema válido', () => {
    const verses = banco.versesForTheme('fe');
    assert.ok(verses.length > 0);
    assert.ok(verses.every((verse) => verse.referencia && verse.texto));
  });

  test('retorna lista vazia para um tema desconhecido', () => {
    assert.deepEqual(banco.versesForTheme('nao-existe'), []);
  });

  test('cada tema listado tem pelo menos um versículo', () => {
    banco.listThemes().forEach((tema) => {
      assert.ok(banco.versesForTheme(tema.chave).length > 0, 'tema "' + tema.chave + '" sem versículos');
    });
  });
});
