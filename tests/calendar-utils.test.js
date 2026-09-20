const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../assets/js/calendar-utils.js');

const weeklyService = {
  id: 'culto-domingo',
  titulo: 'Culto da Família',
  categoria: 'culto',
  ehCulto: true,
  inicio: '2026-09-06T10:00',
  fim: '2026-09-06T11:30',
  recorrencia: { frequencia: 'semanal', ate: '2026-09-30' },
};

describe('parseLocal', () => {
  test('interpreta data e hora no fuso local', () => {
    const date = utils.parseLocal('2026-09-20T19:30');
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 8);
    assert.equal(date.getDate(), 20);
    assert.equal(date.getHours(), 19);
    assert.equal(date.getMinutes(), 30);
  });

  test('aceita apenas a data (meia-noite)', () => {
    const date = utils.parseLocal('2026-12-25');
    assert.equal(date.getHours(), 0);
  });

  test('lança erro claro para formato inválido', () => {
    assert.throws(() => utils.parseLocal('20/09/2026'), /Data inválida/);
  });

  test('lança erro para data inexistente', () => {
    assert.throws(() => utils.parseLocal('2026-02-30'), /Data inexistente/);
  });
});

describe('toDateKey e addDays', () => {
  test('gera chave com zeros à esquerda', () => {
    assert.equal(utils.toDateKey(new Date(2026, 0, 5)), '2026-01-05');
  });

  test('addDays retorna nova data sem alterar a original', () => {
    const original = new Date(2026, 8, 30);
    const next = utils.addDays(original, 2);
    assert.equal(utils.toDateKey(next), '2026-10-02');
    assert.equal(utils.toDateKey(original), '2026-09-30');
  });
});

describe('buildMonthGrid', () => {
  test('monta 42 células começando no domingo', () => {
    const grid = utils.buildMonthGrid(2026, 8);
    assert.equal(grid.length, 42);
    assert.equal(grid[0].key, '2026-08-30');
    assert.equal(grid[0].date.getDay(), 0);
    assert.equal(grid.filter((cell) => cell.inMonth).length, 30);
  });
});

describe('expandEvents', () => {
  const september = [new Date(2026, 8, 1), new Date(2026, 9, 1)];

  test('inclui evento único dentro do intervalo', () => {
    const events = [{ id: 'a', titulo: 'A', inicio: '2026-09-19T09:00', fim: '2026-09-19T12:00' }];
    const result = utils.expandEvents(events, ...september);
    assert.equal(result.length, 1);
    assert.equal(result[0].key, '2026-09-19');
    assert.equal(result[0].occurrenceId, 'a@2026-09-19');
  });

  test('ignora evento fora do intervalo', () => {
    const events = [{ id: 'a', titulo: 'A', inicio: '2026-11-01T09:00' }];
    assert.equal(utils.expandEvents(events, ...september).length, 0);
  });

  test('usa duração padrão de 2h quando não há fim', () => {
    const events = [{ id: 'a', titulo: 'A', inicio: '2026-09-19T09:00' }];
    const [occ] = utils.expandEvents(events, ...september);
    assert.equal(occ.end.getHours(), 11);
  });

  test('repete eventos semanais até a data final', () => {
    const keys = utils.expandEvents([weeklyService], ...september).map((o) => o.key);
    assert.deepEqual(keys, ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']);
  });

  test('respeita exceções da recorrência', () => {
    const event = {
      ...weeklyService,
      recorrencia: { ...weeklyService.recorrencia, excecoes: ['2026-09-20'] },
    };
    const keys = utils.expandEvents([event], ...september).map((o) => o.key);
    assert.deepEqual(keys, ['2026-09-06', '2026-09-13', '2026-09-27']);
  });

  test('suporta recorrência quinzenal e mensal', () => {
    const range = [new Date(2026, 8, 1), new Date(2026, 11, 1)];
    const biweekly = { id: 'q', titulo: 'Q', inicio: '2026-09-02T20:00', recorrencia: { frequencia: 'quinzenal', ate: '2026-09-30' } };
    const monthly = { id: 'm', titulo: 'M', inicio: '2026-09-05T08:00', recorrencia: { frequencia: 'mensal' } };
    assert.deepEqual(utils.expandEvents([biweekly], ...range).map((o) => o.key), ['2026-09-02', '2026-09-16', '2026-09-30']);
    assert.deepEqual(utils.expandEvents([monthly], ...range).map((o) => o.key), ['2026-09-05', '2026-10-05', '2026-11-05']);
  });

  test('ordena ocorrências por horário de início', () => {
    const events = [
      { id: 'tarde', titulo: 'Tarde', inicio: '2026-09-10T15:00' },
      { id: 'manha', titulo: 'Manhã', inicio: '2026-09-10T08:00' },
    ];
    const ids = utils.expandEvents(events, ...september).map((o) => o.id);
    assert.deepEqual(ids, ['manha', 'tarde']);
  });

  test('lança erro quando o evento termina antes de começar', () => {
    const events = [{ id: 'x', titulo: 'X', inicio: '2026-09-10T15:00', fim: '2026-09-10T14:00' }];
    assert.throws(() => utils.expandEvents(events, ...september), /termina antes de começar/);
  });

  test('lança erro para evento sem campos obrigatórios', () => {
    assert.throws(() => utils.expandEvents([{ id: 'x', inicio: '2026-09-10' }], ...september), /titulo/);
  });

  test('lança erro para recorrência desconhecida', () => {
    const events = [{ id: 'x', titulo: 'X', inicio: '2026-09-10', recorrencia: { frequencia: 'diaria' } }];
    assert.throws(() => utils.expandEvents(events, ...september), /Recorrência não suportada/);
  });
});

describe('groupByDay', () => {
  test('evento de vários dias aparece em cada dia', () => {
    const events = [{ id: 'retiro', titulo: 'Retiro', inicio: '2026-10-16T19:00', fim: '2026-10-18T14:00' }];
    const occ = utils.expandEvents(events, new Date(2026, 9, 1), new Date(2026, 10, 1));
    const grouped = utils.groupByDay(occ);
    assert.deepEqual(Object.keys(grouped), ['2026-10-16', '2026-10-17', '2026-10-18']);
  });

  test('evento que termina à meia-noite não invade o dia seguinte', () => {
    const events = [{ id: 'n', titulo: 'N', inicio: '2026-10-16T22:00', fim: '2026-10-17T00:00' }];
    const occ = utils.expandEvents(events, new Date(2026, 9, 1), new Date(2026, 10, 1));
    assert.deepEqual(Object.keys(utils.groupByDay(occ)), ['2026-10-16']);
  });
});

describe('upcoming', () => {
  test('inclui evento em andamento e respeita o limite', () => {
    const now = new Date(2026, 8, 13, 10, 30);
    const result = utils.upcoming([weeklyService], now, 2);
    assert.deepEqual(result.map((o) => o.key), ['2026-09-13', '2026-09-20']);
  });
});

describe('nextService', () => {
  const other = { id: 'festa', titulo: 'Festa', inicio: '2026-09-13T09:00', fim: '2026-09-13T18:00' };

  test('marca como ao vivo quando o culto está acontecendo', () => {
    const result = utils.nextService([weeklyService, other], new Date(2026, 8, 13, 10, 15));
    assert.equal(result.occurrence.id, 'culto-domingo');
    assert.equal(result.isLive, true);
  });

  test('retorna o próximo culto ignorando eventos que não são cultos', () => {
    const result = utils.nextService([weeklyService, other], new Date(2026, 8, 13, 12, 0));
    assert.equal(result.occurrence.key, '2026-09-20');
    assert.equal(result.isLive, false);
  });

  test('retorna null quando não há cultos', () => {
    assert.equal(utils.nextService([other], new Date(2026, 8, 13)), null);
  });
});

describe('countdownParts', () => {
  test('separa dias, horas, minutos e segundos', () => {
    const now = new Date(2026, 8, 13, 10, 0, 0);
    const target = new Date(2026, 8, 14, 12, 30, 15);
    assert.deepEqual(utils.countdownParts(target, now), { days: 1, hours: 2, minutes: 30, seconds: 15 });
  });

  test('nunca retorna valores negativos', () => {
    const parts = utils.countdownParts(new Date(2026, 0, 1), new Date(2026, 5, 1));
    assert.deepEqual(parts, { days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});

describe('formatHour', () => {
  test('formata no padrão brasileiro', () => {
    assert.equal(utils.formatHour(new Date(2026, 0, 1, 19, 0)), '19h');
    assert.equal(utils.formatHour(new Date(2026, 0, 1, 9, 5)), '9h05');
  });
});

describe('exportação para agendas', () => {
  const [occ] = utils.expandEvents(
    [{ id: 'noite', titulo: 'Noite de Louvor, Oração', local: 'Templo; Sala 1', descricao: 'Linha 1\nLinha 2', inicio: '2026-09-26T19:00', fim: '2026-09-26T22:00' }],
    new Date(2026, 8, 1),
    new Date(2026, 9, 1),
  );

  test('toICS gera arquivo válido com escapes e CRLF', () => {
    const ics = utils.toICS(occ, new Date(Date.UTC(2026, 8, 13, 12, 0, 0)));
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTSTART:20260926T190000\r\n/);
    assert.match(ics, /DTEND:20260926T220000\r\n/);
    assert.match(ics, /DTSTAMP:20260913T120000Z\r\n/);
    assert.match(ics, /SUMMARY:Noite de Louvor\\, Oração\r\n/);
    assert.match(ics, /LOCATION:Templo\\; Sala 1\r\n/);
    assert.match(ics, /DESCRIPTION:Linha 1\\nLinha 2\r\n/);
    assert.match(ics, /END:VCALENDAR$/);
  });

  test('googleCalendarUrl inclui datas e fuso', () => {
    const url = new URL(utils.googleCalendarUrl(occ, 'America/Sao_Paulo'));
    assert.equal(url.searchParams.get('dates'), '20260926T190000/20260926T220000');
    assert.equal(url.searchParams.get('text'), 'Noite de Louvor, Oração');
    assert.equal(url.searchParams.get('ctz'), 'America/Sao_Paulo');
  });
});

describe('paginate', () => {
  test('divide a lista em páginas do tamanho pedido', () => {
    assert.deepEqual(utils.paginate([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  test('retorna lista vazia quando não há itens', () => {
    assert.deepEqual(utils.paginate([], 6), []);
  });

  test('lança erro para tamanho de página inválido', () => {
    assert.throws(() => utils.paginate([1], 0), /Tamanho de página inválido/);
  });
});

describe('pageOfIndex', () => {
  test('encontra a página que contém o item', () => {
    assert.equal(utils.pageOfIndex(0, 6), 0);
    assert.equal(utils.pageOfIndex(5, 6), 0);
    assert.equal(utils.pageOfIndex(6, 6), 1);
  });

  test('trata índice negativo como a primeira página', () => {
    assert.equal(utils.pageOfIndex(-1, 6), 0);
  });
});
