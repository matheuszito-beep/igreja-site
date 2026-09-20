const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../assets/js/devocionais-model.js');

const dbRow = {
  id: 'd1',
  data: '2026-09-17',
  versiculo_referencia: 'João 3:16',
  versiculo_texto: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.',
  texto: 'Deus não poupou esforços para nos alcançar. Hoje, descanse nesse amor.',
  autor: 'Pr. João',
  publicado: true,
};

const validForm = {
  data: '2026-09-17',
  versiculoReferencia: ' João 3:16 ',
  versiculoTexto: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.',
  texto: 'Deus não poupou esforços para nos alcançar. Hoje, descanse nesse amor.',
  autor: ' Pr. João ',
  publicado: true,
};

describe('todayKey', () => {
  test('formata a data local como AAAA-MM-DD', () => {
    assert.equal(model.todayKey(new Date(2026, 8, 17)), '2026-09-17');
  });

  test('preenche mês e dia com zero à esquerda', () => {
    assert.equal(model.todayKey(new Date(2026, 0, 5)), '2026-01-05');
  });
});

describe('rowToDevotional', () => {
  test('converte a linha pública do banco', () => {
    const devotional = model.rowToDevotional(dbRow);
    assert.equal(devotional.versiculoReferencia, 'João 3:16');
    assert.equal(devotional.autor, 'Pr. João');
    assert.equal(devotional.publicado, true);
  });

  test('marca quando a data é a de hoje', () => {
    const devotional = model.rowToDevotional({ ...dbRow, data: model.todayKey() });
    assert.equal(devotional.eDeHoje, true);
  });

  test('marca como não-hoje quando a data é passada', () => {
    const devotional = model.rowToDevotional({ ...dbRow, data: '2020-01-01' });
    assert.equal(devotional.eDeHoje, false);
  });

  test('funciona sem autor informado', () => {
    const devotional = model.rowToDevotional({ ...dbRow, autor: null });
    assert.equal(devotional.autor, undefined);
  });
});

describe('formToRow', () => {
  test('converte o formulário para a linha do banco', () => {
    assert.deepEqual(model.formToRow(validForm), {
      data: '2026-09-17',
      versiculo_referencia: 'João 3:16',
      versiculo_texto: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito.',
      texto: 'Deus não poupou esforços para nos alcançar. Hoje, descanse nesse amor.',
      autor: 'Pr. João',
      publicado: true,
    });
  });

  test('guarda autor em branco como nulo', () => {
    assert.equal(model.formToRow({ ...validForm, autor: '  ' }).autor, null);
  });
});

describe('rowToForm', () => {
  test('preenche o formulário a partir da linha do banco', () => {
    const form = model.rowToForm(dbRow);
    assert.equal(form.data, '2026-09-17');
    assert.equal(form.versiculoReferencia, 'João 3:16');
    assert.equal(form.publicado, true);
  });

  test('funciona com linha vazia (novo devocional)', () => {
    const form = model.rowToForm({});
    assert.equal(form.data, '');
    assert.equal(form.publicado, false);
  });
});

describe('validateDevotionalForm', () => {
  test('aceita formulário válido', () => {
    assert.deepEqual(model.validateDevotionalForm(validForm), { valid: true, errors: {} });
  });

  test('exige data, referência, versículo e texto', () => {
    const { valid, errors } = model.validateDevotionalForm({
      ...validForm, data: '', versiculoReferencia: '', versiculoTexto: '', texto: '',
    });
    assert.equal(valid, false);
    assert.ok(errors.data);
    assert.ok(errors.versiculoReferencia);
    assert.ok(errors.versiculoTexto);
    assert.ok(errors.texto);
  });

  test('recusa data em formato inválido', () => {
    const { errors } = model.validateDevotionalForm({ ...validForm, data: '17/09/2026' });
    assert.ok(errors.data);
  });

  test('limita o tamanho do autor', () => {
    const { errors } = model.validateDevotionalForm({ ...validForm, autor: 'a'.repeat(81) });
    assert.ok(errors.autor);
  });

  test('não exige autor', () => {
    const { valid } = model.validateDevotionalForm({ ...validForm, autor: '' });
    assert.equal(valid, true);
  });
});
