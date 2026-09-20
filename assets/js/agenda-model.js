/**
 * Conversão e validação dos eventos entre banco (Supabase), formulário do painel e agenda do site.
 * Funciona no navegador (window.AgendaModel) e no Node (require) para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AgendaModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const HTTPS_URL_RE = /^https:\/\/\S+$/i;
  const FREQUENCIES = Object.freeze(['semanal', 'quinzenal', 'mensal']);
  const TITLE_MIN = 2;
  const TITLE_MAX = 120;
  const LOCAL_MAX = 120;
  const DESCRIPTION_MAX = 2000;

  const clean = (value) => (typeof value === 'string' ? value.trim() : '');
  const orNull = (value) => clean(value) || null;
  const isBlank = (value) => value === null || value === undefined || value === '';

  function withoutUndefined(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
  }

  /** '2026-01-10T19:30:00' ou '2026-01-10 19:30:00' → '2026-01-10T19:30' */
  function minuteStamp(value) {
    return isBlank(value) ? undefined : String(value).replace(' ', 'T').slice(0, 16);
  }

  function isRealDate(value) {
    if (!DATE_RE.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function rowToEvent(row) {
    return withoutUndefined({
      id: row.id,
      titulo: row.titulo,
      categoria: row.categoria_id,
      inicio: minuteStamp(row.inicio),
      fim: minuteStamp(row.fim),
      local: isBlank(row.local) ? undefined : row.local,
      descricao: isBlank(row.descricao) ? undefined : row.descricao,
      imagem: isBlank(row.imagem_url) ? undefined : row.imagem_url,
      ehCulto: Boolean(row.eh_culto),
      publicado: Boolean(row.publicado),
      porInscricao: Boolean(row.inscricao_aberta),
      vagas: isBlank(row.vagas) ? undefined : Number(row.vagas),
      vagasOcupadas: Number(row.vagas_ocupadas) || 0,
      recorrencia: row.recorrencia
        ? withoutUndefined({
          frequencia: row.recorrencia,
          ate: isBlank(row.recorrencia_ate) ? undefined : row.recorrencia_ate,
          excecoes: row.excecoes || [],
        })
        : undefined,
    });
  }

  function rowsToCategories(rows) {
    return [...rows]
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .reduce((categories, row) => ({ ...categories, [row.id]: { nome: row.nome, cor: row.cor } }), {});
  }

  function formToRow(values) {
    const repeats = FREQUENCIES.includes(values.recorrencia);
    const startDate = clean(values.dataInicio);
    const endTime = clean(values.horaFim);
    const endDate = clean(values.dataFim) || startDate;

    return {
      titulo: clean(values.titulo),
      categoria_id: clean(values.categoria),
      inicio: startDate + 'T' + clean(values.horaInicio) + ':00',
      fim: endTime ? endDate + 'T' + endTime + ':00' : null,
      local: orNull(values.local),
      descricao: orNull(values.descricao),
      imagem_url: orNull(values.imagemUrl),
      eh_culto: Boolean(values.ehCulto),
      recorrencia: repeats ? values.recorrencia : null,
      recorrencia_ate: repeats ? orNull(values.recorrenciaAte) : null,
      excecoes: repeats ? [...new Set((values.excecoes || []).map(clean).filter(Boolean))].sort() : [],
      publicado: Boolean(values.publicado),
      inscricao_aberta: Boolean(values.porInscricao),
      vagas: values.porInscricao && clean(values.vagas) ? Number(values.vagas) : null,
    };
  }

  function splitStamp(value) {
    const stamp = minuteStamp(value);
    return stamp ? [stamp.slice(0, 10), stamp.slice(11, 16)] : ['', ''];
  }

  function rowToForm(row) {
    const [dataInicio, horaInicio] = splitStamp(row.inicio);
    const [dataFim, horaFim] = splitStamp(row.fim);
    return {
      titulo: row.titulo || '',
      categoria: row.categoria_id || '',
      dataInicio,
      horaInicio,
      dataFim,
      horaFim,
      local: row.local || '',
      descricao: row.descricao || '',
      imagemUrl: row.imagem_url || '',
      ehCulto: Boolean(row.eh_culto),
      recorrencia: row.recorrencia || '',
      recorrenciaAte: row.recorrencia_ate || '',
      excecoes: [...(row.excecoes || [])],
      publicado: Boolean(row.publicado),
      porInscricao: Boolean(row.inscricao_aberta),
      vagas: isBlank(row.vagas) ? '' : String(row.vagas),
    };
  }

  function validateWhen(values, errors) {
    const startDate = clean(values.dataInicio);
    const startTime = clean(values.horaInicio);
    const endDate = clean(values.dataFim);
    const endTime = clean(values.horaFim);

    if (!isRealDate(startDate)) errors.dataInicio = 'Informe uma data válida.';
    if (!TIME_RE.test(startTime)) errors.horaInicio = 'Informe o horário de início.';
    if (endDate && !isRealDate(endDate)) errors.dataFim = 'Informe uma data válida.';
    if (endTime && !TIME_RE.test(endTime)) errors.horaFim = 'Horário inválido.';
    if (endDate && !endTime) errors.horaFim = 'Informe o horário de término.';

    const canCompare = !errors.dataInicio && !errors.horaInicio && !errors.dataFim && !errors.horaFim && endTime;
    if (canCompare && (endDate || startDate) + 'T' + endTime <= startDate + 'T' + startTime) {
      errors.horaFim = 'O término precisa ser depois do início.';
    }
  }

  function validateRecurrence(values, errors) {
    if (isBlank(values.recorrencia)) return;
    if (!FREQUENCIES.includes(values.recorrencia)) {
      errors.recorrencia = 'Escolha uma opção de repetição válida.';
      return;
    }
    const until = clean(values.recorrenciaAte);
    if (until && !isRealDate(until)) {
      errors.recorrenciaAte = 'Informe uma data válida.';
    } else if (until && !errors.dataInicio && until < clean(values.dataInicio)) {
      errors.recorrenciaAte = 'A repetição precisa terminar depois da primeira data.';
    }
    if ((values.excecoes || []).some((date) => !isRealDate(clean(date)))) {
      errors.excecoes = 'Há datas canceladas inválidas.';
    }
  }

  function validateInscricao(values, errors) {
    if (!values.porInscricao) return;
    if (!isBlank(values.recorrencia)) {
      errors.recorrencia = 'Um evento por inscrição não pode se repetir — crie um evento próprio para cada data.';
    }
    const vagas = clean(values.vagas);
    if (vagas && (!/^\d+$/.test(vagas) || Number(vagas) < 1)) {
      errors.vagas = 'Informe um número de vagas válido, ou deixe em branco para não limitar.';
    }
  }

  function validateEventForm(values) {
    const errors = {};
    const title = clean(values.titulo);

    if (title.length < TITLE_MIN) errors.titulo = 'Informe o nome do evento.';
    else if (title.length > TITLE_MAX) errors.titulo = 'Use no máximo ' + TITLE_MAX + ' caracteres.';
    if (!clean(values.categoria)) errors.categoria = 'Escolha uma categoria.';
    validateWhen(values, errors);
    if (clean(values.local).length > LOCAL_MAX) errors.local = 'Use no máximo ' + LOCAL_MAX + ' caracteres.';
    if (clean(values.descricao).length > DESCRIPTION_MAX) errors.descricao = 'Use no máximo ' + DESCRIPTION_MAX + ' caracteres.';
    if (clean(values.imagemUrl) && !HTTPS_URL_RE.test(clean(values.imagemUrl))) {
      errors.imagemUrl = 'Use um link que comece com https://';
    }
    validateRecurrence(values, errors);
    validateInscricao(values, errors);

    return { valid: Object.keys(errors).length === 0, errors };
  }

  return Object.freeze({
    FREQUENCIES,
    DESCRIPTION_MAX,
    rowToEvent,
    rowsToCategories,
    formToRow,
    rowToForm,
    validateEventForm,
  });
});
