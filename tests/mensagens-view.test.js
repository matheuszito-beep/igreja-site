const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const view = require('../assets/js/mensagens-view.js');

const videos = [
  { id: 'v3', titulo: 'Culto ao Senhor', thumbnail_url: 'https://i.ytimg.com/vi/v3/hqdefault.jpg', publicado_em: '2026-09-14T11:38:56+00:00' },
  { id: 'v2', titulo: 'Culto ao Senhor', thumbnail_url: 'https://i.ytimg.com/vi/v2/hqdefault.jpg', publicado_em: '2026-09-13T22:11:04+00:00' },
  { id: 'v1', titulo: 'Culto ao Senhor', thumbnail_url: 'https://i.ytimg.com/vi/v1/hqdefault.jpg', publicado_em: '2026-08-31T12:04:41+00:00' },
];

describe('watchUrl', () => {
  test('monta o link do vídeo no YouTube', () => {
    assert.equal(view.watchUrl('abc123'), 'https://www.youtube.com/watch?v=abc123');
  });
});

describe('maxResUrl', () => {
  test('troca hqdefault por maxresdefault no mesmo vídeo', () => {
    assert.equal(view.maxResUrl('https://i.ytimg.com/vi/abc123/hqdefault.jpg'), 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg');
  });

  test('não quebra se a URL vier em outro formato', () => {
    assert.equal(view.maxResUrl('https://exemplo.com/foto.jpg'), 'https://exemplo.com/foto.jpg');
  });
});

describe('buildSermonsView', () => {
  test('sem transmissão ao vivo, destaca o vídeo mais recente e lista os seguintes', () => {
    const result = view.buildSermonsView({ videos, aoVivo: null });
    assert.equal(result.featured.id, 'v3');
    assert.equal(result.featured.live, false);
    assert.deepEqual(result.list.map((item) => item.id), ['v2', 'v1']);
  });

  test('com transmissão ao vivo, ela vira o destaque e sai da lista', () => {
    const result = view.buildSermonsView({ videos, aoVivo: { videoId: 'v2', titulo: 'Culto ao Senhor' } });
    assert.equal(result.featured.id, 'v2');
    assert.equal(result.featured.live, true);
    assert.deepEqual(result.list.map((item) => item.id), ['v3', 'v1']);
  });

  test('transmissão ao vivo de um vídeo que ainda não está na lista', () => {
    const result = view.buildSermonsView({ videos, aoVivo: { videoId: 'ao-vivo-novo', titulo: 'Culto ao Senhor' } });
    assert.equal(result.featured.id, 'ao-vivo-novo');
    assert.equal(result.featured.live, true);
    assert.deepEqual(result.list.map((item) => item.id), ['v3', 'v2', 'v1']);
  });

  test('sem nenhum vídeo ainda, não quebra', () => {
    assert.deepEqual(view.buildSermonsView({ videos: [], aoVivo: null }), { featured: null, list: [] });
  });

  test('lista sem legenda quando falta título ao vivo', () => {
    const result = view.buildSermonsView({ videos: [], aoVivo: { videoId: 'x', titulo: null } });
    assert.equal(result.featured.titulo, 'Ao vivo agora');
  });
});
