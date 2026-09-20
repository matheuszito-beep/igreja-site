const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../assets/js/escalas-model.js');

describe('todayKey / addDaysKey', () => {
  test('formata a data local como AAAA-MM-DD', () => {
    assert.equal(model.todayKey(new Date(2026, 8, 17)), '2026-09-17');
  });

  test('soma dias virando o mês corretamente', () => {
    assert.equal(model.addDaysKey('2026-09-30', 1), '2026-10-01');
  });
});

describe('proximidade', () => {
  const hoje = new Date(2026, 8, 17);

  test('marca "hoje" quando a data é a de hoje', () => {
    assert.equal(model.proximidade('2026-09-17', hoje), 'hoje');
  });

  test('marca "amanha" quando a data é amanhã', () => {
    assert.equal(model.proximidade('2026-09-18', hoje), 'amanha');
  });

  test('não marca nada para datas mais distantes', () => {
    assert.equal(model.proximidade('2026-09-20', hoje), null);
    assert.equal(model.proximidade('2026-09-16', hoje), null);
  });
});

describe('rowToEscala', () => {
  test('converte a linha do banco e traduz o status', () => {
    const escala = model.rowToEscala({
      id: 'e1', ministerio_id: 'm1', membro_id: 'mm1', data: '2026-09-20', funcao: 'Vocal', status: 'confirmado',
    });
    assert.equal(escala.statusLabel, 'Confirmado');
    assert.equal(escala.funcao, 'Vocal');
    assert.equal(escala.membroId, 'mm1');
  });

  test('funciona sem função definida', () => {
    const escala = model.rowToEscala({ id: 'e1', ministerio_id: 'm1', membro_id: 'mm1', data: '2026-09-20', funcao: null, status: 'aguardando' });
    assert.equal(escala.funcao, undefined);
  });

  test('traz o evento amarrado quando existir', () => {
    const escala = model.rowToEscala({ id: 'e1', ministerio_id: 'm1', membro_id: 'mm1', evento_id: 'ev1', data: '2026-09-20', status: 'aguardando' });
    assert.equal(escala.eventoId, 'ev1');
  });

  test('funciona sem evento amarrado', () => {
    const escala = model.rowToEscala({ id: 'e1', ministerio_id: 'm1', membro_id: 'mm1', evento_id: null, data: '2026-09-20', status: 'aguardando' });
    assert.equal(escala.eventoId, undefined);
  });
});

describe('validateMinistryForm', () => {
  test('aceita um nome válido', () => {
    assert.deepEqual(model.validateMinistryForm({ nome: 'Louvor' }), { valid: true, errors: {} });
  });

  test('recusa nome muito curto', () => {
    const { valid, errors } = model.validateMinistryForm({ nome: 'L' });
    assert.equal(valid, false);
    assert.ok(errors.nome);
  });
});

describe('validateMemberForm', () => {
  test('aceita e-mail e nome válidos', () => {
    assert.deepEqual(model.validateMemberForm({ email: 'ana@exemplo.com', nome: 'Ana' }), { valid: true, errors: {} });
  });

  test('aceita sem e-mail (pessoa ainda sem conta no site)', () => {
    assert.deepEqual(model.validateMemberForm({ email: '', nome: 'Ana' }), { valid: true, errors: {} });
  });

  test('recusa e-mail inválido quando preenchido', () => {
    const { errors } = model.validateMemberForm({ email: 'não é email', nome: 'Ana' });
    assert.ok(errors.email);
  });

  test('exige o nome', () => {
    const { errors } = model.validateMemberForm({ email: 'ana@exemplo.com', nome: '' });
    assert.ok(errors.nome);
  });
});

describe('isValidDateKey', () => {
  test('aceita datas no formato AAAA-MM-DD', () => {
    assert.equal(model.isValidDateKey('2026-09-20'), true);
  });

  test('recusa vazio ou fora do formato', () => {
    assert.equal(model.isValidDateKey(''), false);
    assert.equal(model.isValidDateKey('20/09/2026'), false);
  });
});

describe('isValidFuncao', () => {
  test('aceita em branco (função é opcional)', () => {
    assert.equal(model.isValidFuncao(''), true);
  });

  test('recusa texto maior que o limite', () => {
    assert.equal(model.isValidFuncao('a'.repeat(model.ROLE_MAX + 1)), false);
  });

  test('aceita até o limite', () => {
    assert.equal(model.isValidFuncao('a'.repeat(model.ROLE_MAX)), true);
  });
});
