const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../assets/js/celulas-model.js');

const dbRow = {
  id: 'c1',
  nome: 'Célula Vida',
  perfil: 'jovens',
  lider_nome: 'Ana e Pedro',
  dia_semana: 2,
  horario: '20:00:00',
  bairro: 'Centro',
  descricao: 'Louvor e estudo.',
  latitude: -23.307,
  longitude: -47.133,
  mostrar_endereco: false,
  endereco_publico: null,
  publicado: true,
  celulas_enderecos: { endereco: 'Rua das Flores, 100', referencia: 'Portão azul' },
};

const validForm = {
  nome: ' Célula Vida ',
  perfil: 'jovens',
  lider: 'Ana e Pedro',
  diaSemana: '2',
  horario: '20:00',
  bairro: 'Centro',
  descricao: '',
  endereco: 'Rua das Flores, 100',
  referencia: '',
  latitude: -23.30712,
  longitude: -47.13345,
  mostrarEndereco: false,
  publicado: true,
};

describe('formatSchedule', () => {
  test('usa o dia no plural e o horário no padrão brasileiro', () => {
    assert.equal(model.formatSchedule(2, '20:00:00'), 'Terças · 20h');
    assert.equal(model.formatSchedule(0, '09:30'), 'Domingos · 9h30');
  });
});

describe('rowToCell', () => {
  test('converte a linha pública do banco', () => {
    const cell = model.rowToCell(dbRow);
    assert.equal(cell.nome, 'Célula Vida');
    assert.equal(cell.perfilNome, 'Jovens');
    assert.equal(cell.lider, 'Ana e Pedro');
    assert.equal(cell.horario, '20:00');
    assert.equal(cell.horarioTexto, 'Terças · 20h');
    assert.equal(cell.latitude, -23.307);
    assert.equal(cell.aproximado, true);
    assert.equal(cell.endereco, undefined);
  });

  test('mostra endereço quando a célula permite', () => {
    const cell = model.rowToCell({ ...dbRow, mostrar_endereco: true, endereco_publico: 'Salão da igreja' });
    assert.equal(cell.aproximado, false);
    assert.equal(cell.endereco, 'Salão da igreja');
  });

  test('aceita coordenadas vindas como texto', () => {
    const cell = model.rowToCell({ ...dbRow, latitude: '-23.307000', longitude: '-47.133000' });
    assert.equal(cell.latitude, -23.307);
    assert.equal(cell.longitude, -47.133);
  });
});

describe('formToRows', () => {
  test('separa dados públicos e endereço privado', () => {
    assert.deepEqual(model.formToRows(validForm), {
      celula: {
        nome: 'Célula Vida',
        perfil: 'jovens',
        lider_nome: 'Ana e Pedro',
        dia_semana: 2,
        horario: '20:00',
        bairro: 'Centro',
        descricao: null,
        latitude: -23.30712,
        longitude: -47.13345,
        mostrar_endereco: false,
        endereco_publico: null,
        publicado: true,
      },
      endereco: { endereco: 'Rua das Flores, 100', referencia: null },
    });
  });

  test('copia o endereço para o site só quando autorizado', () => {
    const { celula } = model.formToRows({ ...validForm, mostrarEndereco: true });
    assert.equal(celula.endereco_publico, 'Rua das Flores, 100');
  });
});

describe('rowToForm', () => {
  test('preenche o formulário com o endereço privado', () => {
    const form = model.rowToForm(dbRow);
    assert.equal(form.diaSemana, '2');
    assert.equal(form.horario, '20:00');
    assert.equal(form.endereco, 'Rua das Flores, 100');
    assert.equal(form.referencia, 'Portão azul');
    assert.equal(form.latitude, -23.307);
  });

  test('aceita o endereço embutido como lista', () => {
    const form = model.rowToForm({ ...dbRow, celulas_enderecos: [{ endereco: 'Rua B, 2', referencia: null }] });
    assert.equal(form.endereco, 'Rua B, 2');
    assert.equal(form.referencia, '');
  });

  test('funciona sem endereço cadastrado', () => {
    assert.equal(model.rowToForm({ ...dbRow, celulas_enderecos: null }).endereco, '');
  });
});

describe('validateCellForm', () => {
  test('aceita formulário válido', () => {
    assert.deepEqual(model.validateCellForm(validForm), { valid: true, errors: {} });
  });

  test('exige nome, bairro, endereço e horário', () => {
    const { valid, errors } = model.validateCellForm({ ...validForm, nome: '', bairro: ' ', endereco: '', horario: '' });
    assert.equal(valid, false);
    assert.ok(errors.nome);
    assert.ok(errors.bairro);
    assert.ok(errors.endereco);
    assert.ok(errors.horario);
  });

  test('recusa dia da semana e perfil inválidos', () => {
    const { errors } = model.validateCellForm({ ...validForm, diaSemana: '7', perfil: 'outro' });
    assert.ok(errors.diaSemana);
    assert.ok(errors.perfil);
  });

  test('exige o local marcado no mapa', () => {
    const { errors } = model.validateCellForm({ ...validForm, latitude: null, longitude: null });
    assert.match(errors.mapa, /mapa/);
  });

  test('limita o tamanho da descrição', () => {
    const { errors } = model.validateCellForm({ ...validForm, descricao: 'a'.repeat(501) });
    assert.ok(errors.descricao);
  });
});

describe('distanceKm', () => {
  test('calcula a distância aproximada entre dois pontos', () => {
    const saoPaulo = { latitude: -23.5505, longitude: -46.6333 };
    const campinas = { latitude: -22.9099, longitude: -47.0626 };
    const km = model.distanceKm(saoPaulo, campinas);
    assert.ok(km > 80 && km < 86, 'distância fora do esperado: ' + km);
    assert.equal(model.distanceKm(saoPaulo, saoPaulo), 0);
  });
});

describe('sortBySchedule', () => {
  test('ordena de segunda a domingo e depois pelo horário', () => {
    const cells = [
      { id: 'dom', diaSemana: 0, horario: '19:00' },
      { id: 'seg-20', diaSemana: 1, horario: '20:00' },
      { id: 'seg-19', diaSemana: 1, horario: '19:00' },
    ];
    assert.deepEqual(model.sortBySchedule(cells).map((c) => c.id), ['seg-19', 'seg-20', 'dom']);
    assert.equal(cells[0].id, 'dom');
  });
});

describe('whatsappMessage', () => {
  test('monta a mensagem com nome, bairro e horário', () => {
    const message = model.whatsappMessage(model.rowToCell(dbRow));
    assert.match(message, /Célula Vida/);
    assert.match(message, /Centro/);
    assert.match(message, /Terças · 20h/);
  });
});
