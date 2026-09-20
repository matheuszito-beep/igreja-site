const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../assets/js/agenda-model.js');

const dbRow = {
  id: '5b7c2f0e-1111-4c1a-9a55-0d7b1c2e3f40',
  titulo: 'Rede Jovem',
  categoria_id: 'jovens',
  inicio: '2026-01-10T19:30:00',
  fim: '2026-01-10T21:30:00',
  local: 'Auditório Jovem',
  descricao: 'Culto dos jovens.',
  imagem_url: 'https://exemplo.supabase.co/storage/v1/object/public/eventos/jovens.jpg',
  eh_culto: true,
  recorrencia: 'semanal',
  recorrencia_ate: '2027-12-31',
  excecoes: ['2026-10-17'],
  publicado: true,
  inscricao_aberta: false,
  vagas: null,
  vagas_ocupadas: 0,
};

const validForm = {
  titulo: 'Noite de Louvor',
  categoria: 'especial',
  dataInicio: '2026-09-26',
  horaInicio: '19:30',
  dataFim: '',
  horaFim: '22:00',
  local: ' Templo principal ',
  descricao: 'Uma noite de adoração.',
  imagemUrl: '',
  ehCulto: false,
  recorrencia: '',
  recorrenciaAte: '',
  excecoes: [],
  publicado: true,
  porInscricao: false,
  vagas: '',
};

describe('rowToEvent', () => {
  test('converte a linha do banco para o formato usado pela agenda', () => {
    assert.deepEqual(model.rowToEvent(dbRow), {
      id: dbRow.id,
      titulo: 'Rede Jovem',
      categoria: 'jovens',
      inicio: '2026-01-10T19:30',
      fim: '2026-01-10T21:30',
      local: 'Auditório Jovem',
      descricao: 'Culto dos jovens.',
      imagem: dbRow.imagem_url,
      ehCulto: true,
      publicado: true,
      porInscricao: false,
      vagasOcupadas: 0,
      recorrencia: { frequencia: 'semanal', ate: '2027-12-31', excecoes: ['2026-10-17'] },
    });
  });

  test('omite campos vazios e recorrência inexistente', () => {
    const event = model.rowToEvent({ ...dbRow, fim: null, local: null, imagem_url: null, recorrencia: null, recorrencia_ate: null, excecoes: [] });
    assert.equal(event.fim, undefined);
    assert.equal(event.local, undefined);
    assert.equal(event.imagem, undefined);
    assert.equal(event.recorrencia, undefined);
  });

  test('aceita horário com fuso vindo do banco sem mudar a hora local', () => {
    assert.equal(model.rowToEvent({ ...dbRow, inicio: '2026-01-10 19:30:00' }).inicio, '2026-01-10T19:30');
  });
});

describe('rowsToCategories', () => {
  test('monta o mapa de categorias respeitando a ordem', () => {
    const categories = model.rowsToCategories([
      { id: 'kids', nome: 'Kids', cor: '#ff9500', ordem: 2 },
      { id: 'culto', nome: 'Cultos', cor: '#0071e3', ordem: 1 },
    ]);
    assert.deepEqual(Object.keys(categories), ['culto', 'kids']);
    assert.deepEqual(categories.kids, { nome: 'Kids', cor: '#ff9500' });
  });
});

describe('formToRow', () => {
  test('converte o formulário em linha do banco', () => {
    assert.deepEqual(model.formToRow(validForm), {
      titulo: 'Noite de Louvor',
      categoria_id: 'especial',
      inicio: '2026-09-26T19:30:00',
      fim: '2026-09-26T22:00:00',
      local: 'Templo principal',
      descricao: 'Uma noite de adoração.',
      imagem_url: null,
      eh_culto: false,
      recorrencia: null,
      recorrencia_ate: null,
      excecoes: [],
      publicado: true,
      inscricao_aberta: false,
      vagas: null,
    });
  });

  test('sem horário de término grava fim nulo', () => {
    assert.equal(model.formToRow({ ...validForm, horaFim: '' }).fim, null);
  });

  test('evento de vários dias usa a data final informada', () => {
    const row = model.formToRow({ ...validForm, dataFim: '2026-09-28', horaFim: '12:00' });
    assert.equal(row.fim, '2026-09-28T12:00:00');
  });

  test('recorrência leva data final e exceções ordenadas sem repetição', () => {
    const row = model.formToRow({ ...validForm, recorrencia: 'semanal', recorrenciaAte: '2026-12-31', excecoes: ['2026-11-07', '2026-10-03', '2026-11-07'] });
    assert.equal(row.recorrencia, 'semanal');
    assert.equal(row.recorrencia_ate, '2026-12-31');
    assert.deepEqual(row.excecoes, ['2026-10-03', '2026-11-07']);
  });

  test('sem recorrência descarta data final e exceções', () => {
    const row = model.formToRow({ ...validForm, recorrencia: '', recorrenciaAte: '2026-12-31', excecoes: ['2026-10-03'] });
    assert.equal(row.recorrencia_ate, null);
    assert.deepEqual(row.excecoes, []);
  });

  test('evento por inscrição leva o limite de vagas', () => {
    const row = model.formToRow({ ...validForm, porInscricao: true, vagas: '100' });
    assert.equal(row.inscricao_aberta, true);
    assert.equal(row.vagas, 100);
  });

  test('sem marcar por inscrição, vagas é descartado mesmo se preenchido', () => {
    const row = model.formToRow({ ...validForm, porInscricao: false, vagas: '100' });
    assert.equal(row.inscricao_aberta, false);
    assert.equal(row.vagas, null);
  });

  test('por inscrição sem preencher vagas grava sem limite', () => {
    const row = model.formToRow({ ...validForm, porInscricao: true, vagas: '' });
    assert.equal(row.vagas, null);
  });
});

describe('rowToForm', () => {
  test('preenche o formulário a partir da linha do banco', () => {
    const form = model.rowToForm(dbRow);
    assert.equal(form.dataInicio, '2026-01-10');
    assert.equal(form.horaInicio, '19:30');
    assert.equal(form.dataFim, '2026-01-10');
    assert.equal(form.horaFim, '21:30');
    assert.equal(form.recorrencia, 'semanal');
    assert.deepEqual(form.excecoes, ['2026-10-17']);
    assert.equal(form.imagemUrl, dbRow.imagem_url);
    assert.equal(form.porInscricao, false);
    assert.equal(form.vagas, '');
  });

  test('preenche vagas quando o evento tem limite', () => {
    const form = model.rowToForm({ ...dbRow, inscricao_aberta: true, vagas: 50 });
    assert.equal(form.porInscricao, true);
    assert.equal(form.vagas, '50');
  });

  test('ida e volta preserva os dados', () => {
    assert.deepEqual(model.formToRow(model.rowToForm(dbRow)), {
      titulo: dbRow.titulo,
      categoria_id: dbRow.categoria_id,
      inicio: dbRow.inicio,
      fim: dbRow.fim,
      local: dbRow.local,
      descricao: dbRow.descricao,
      imagem_url: dbRow.imagem_url,
      eh_culto: dbRow.eh_culto,
      recorrencia: dbRow.recorrencia,
      recorrencia_ate: dbRow.recorrencia_ate,
      excecoes: dbRow.excecoes,
      publicado: dbRow.publicado,
      inscricao_aberta: dbRow.inscricao_aberta,
      vagas: dbRow.vagas,
    });
  });
});

describe('validateEventForm', () => {
  test('aceita formulário válido', () => {
    assert.deepEqual(model.validateEventForm(validForm), { valid: true, errors: {} });
  });

  test('exige título, categoria, data e hora', () => {
    const { valid, errors } = model.validateEventForm({ ...validForm, titulo: ' ', categoria: '', dataInicio: '', horaInicio: '' });
    assert.equal(valid, false);
    assert.ok(errors.titulo);
    assert.ok(errors.categoria);
    assert.ok(errors.dataInicio);
    assert.ok(errors.horaInicio);
  });

  test('recusa término antes do início', () => {
    const { errors } = model.validateEventForm({ ...validForm, horaFim: '18:00' });
    assert.match(errors.horaFim, /depois do início/);
  });

  test('recusa data inexistente', () => {
    const { errors } = model.validateEventForm({ ...validForm, dataInicio: '2026-02-30' });
    assert.ok(errors.dataInicio);
  });

  test('recusa link de imagem que não seja https', () => {
    const { errors } = model.validateEventForm({ ...validForm, imagemUrl: 'javascript:alert(1)' });
    assert.ok(errors.imagemUrl);
  });

  test('exige que a repetição termine depois do início', () => {
    const { errors } = model.validateEventForm({ ...validForm, recorrencia: 'semanal', recorrenciaAte: '2026-09-01' });
    assert.ok(errors.recorrenciaAte);
  });

  test('limita o tamanho da descrição', () => {
    const { errors } = model.validateEventForm({ ...validForm, descricao: 'a'.repeat(2001) });
    assert.ok(errors.descricao);
  });

  test('evento por inscrição não pode se repetir', () => {
    const { errors } = model.validateEventForm({ ...validForm, porInscricao: true, recorrencia: 'semanal' });
    assert.ok(errors.recorrencia);
  });

  test('recusa vagas inválidas', () => {
    const { errors } = model.validateEventForm({ ...validForm, porInscricao: true, vagas: '0' });
    assert.ok(errors.vagas);
  });

  test('aceita evento por inscrição sem limite de vagas', () => {
    const { valid } = model.validateEventForm({ ...validForm, porInscricao: true, vagas: '' });
    assert.equal(valid, true);
  });
});
