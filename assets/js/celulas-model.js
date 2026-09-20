/**
 * Células: conversão e validação entre banco (Supabase), formulário do painel e página do site.
 * Funciona no navegador (window.CelulasModel) e no Node (require) para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CelulasModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WEEKDAYS = Object.freeze(['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']);
  const WEEKDAYS_SHORT = Object.freeze(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
  const PROFILES = Object.freeze({
    mista: Object.freeze({ nome: 'Mista', cor: '#1d1d1f' }),
    jovens: Object.freeze({ nome: 'Jovens', cor: '#bf5af2' }),
    adolescentes: Object.freeze({ nome: 'Adolescentes', cor: '#28a745' }),
    casais: Object.freeze({ nome: 'Casais', cor: '#ff375f' }),
    mulheres: Object.freeze({ nome: 'Mulheres', cor: '#ff9500' }),
    homens: Object.freeze({ nome: 'Homens', cor: '#0071e3' }),
  });

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  const NAME_MIN = 2;
  const NAME_MAX = 80;
  const ADDRESS_MIN = 5;
  const ADDRESS_MAX = 200;
  const REFERENCE_MAX = 120;
  const DESCRIPTION_MAX = 500;
  const EARTH_RADIUS_KM = 6371;

  const clean = (value) => (typeof value === 'string' ? value.trim() : '');
  const orNull = (value) => clean(value) || null;
  const isBlank = (value) => value === null || value === undefined || value === '';
  const toNumber = (value) => (isBlank(value) ? NaN : Number(value));
  const shortTime = (value) => String(value || '').slice(0, 5);
  const weekOrder = (day) => (day + 6) % 7;

  function formatHour(time) {
    const [hours, minutes] = shortTime(time).split(':').map(Number);
    return hours + 'h' + (minutes ? String(minutes).padStart(2, '0') : '');
  }

  function formatSchedule(day, time) {
    return WEEKDAYS[day] + 's · ' + formatHour(time);
  }

  function rowToCell(row) {
    const profileKey = PROFILES[row.perfil] ? row.perfil : 'mista';
    const day = Number(row.dia_semana);
    const approximate = !row.mostrar_endereco;
    return Object.freeze({
      id: row.id,
      nome: row.nome,
      perfil: profileKey,
      perfilNome: PROFILES[profileKey].nome,
      cor: PROFILES[profileKey].cor,
      lider: row.lider_nome || undefined,
      diaSemana: day,
      horario: shortTime(row.horario),
      horarioTexto: formatSchedule(day, row.horario),
      bairro: row.bairro,
      descricao: row.descricao || undefined,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      aproximado: approximate,
      endereco: approximate ? undefined : row.endereco_publico || undefined,
      publicado: Boolean(row.publicado),
    });
  }

  function formToRows(values) {
    const address = clean(values.endereco);
    const showAddress = Boolean(values.mostrarEndereco);
    return {
      celula: {
        nome: clean(values.nome),
        perfil: clean(values.perfil) || 'mista',
        lider_nome: orNull(values.lider),
        dia_semana: Number(values.diaSemana),
        horario: shortTime(clean(values.horario)),
        bairro: clean(values.bairro),
        descricao: orNull(values.descricao),
        latitude: toNumber(values.latitude),
        longitude: toNumber(values.longitude),
        mostrar_endereco: showAddress,
        endereco_publico: showAddress ? address : null,
        publicado: Boolean(values.publicado),
      },
      endereco: { endereco: address, referencia: orNull(values.referencia) },
    };
  }

  function privateAddress(row) {
    const embedded = row.celulas_enderecos;
    return Array.isArray(embedded) ? embedded[0] || null : embedded || null;
  }

  function rowToForm(row) {
    const address = privateAddress(row);
    return {
      nome: row.nome || '',
      perfil: row.perfil || 'mista',
      lider: row.lider_nome || '',
      diaSemana: isBlank(row.dia_semana) ? '' : String(row.dia_semana),
      horario: shortTime(row.horario),
      bairro: row.bairro || '',
      descricao: row.descricao || '',
      endereco: address ? address.endereco || '' : '',
      referencia: address ? address.referencia || '' : '',
      latitude: isBlank(row.latitude) ? null : Number(row.latitude),
      longitude: isBlank(row.longitude) ? null : Number(row.longitude),
      mostrarEndereco: Boolean(row.mostrar_endereco),
      publicado: Boolean(row.publicado),
    };
  }

  function checkLength(errors, field, value, { min = 0, max, required }) {
    const length = clean(value).length;
    if (length < min) errors[field] = required;
    else if (length > max) errors[field] = 'Use no máximo ' + max + ' caracteres.';
  }

  function validateCellForm(values) {
    const errors = {};
    checkLength(errors, 'nome', values.nome, { min: NAME_MIN, max: NAME_MAX, required: 'Informe o nome da célula.' });
    if (!PROFILES[clean(values.perfil)]) errors.perfil = 'Escolha um perfil.';
    checkLength(errors, 'lider', values.lider, { max: NAME_MAX });
    if (!/^[0-6]$/.test(clean(String(isBlank(values.diaSemana) ? '' : values.diaSemana)))) {
      errors.diaSemana = 'Escolha o dia da semana.';
    }
    if (!TIME_RE.test(clean(values.horario))) errors.horario = 'Informe o horário.';
    checkLength(errors, 'bairro', values.bairro, { min: NAME_MIN, max: NAME_MAX, required: 'Informe o bairro.' });
    checkLength(errors, 'endereco', values.endereco, { min: ADDRESS_MIN, max: ADDRESS_MAX, required: 'Informe o endereço com rua e número.' });
    checkLength(errors, 'referencia', values.referencia, { max: REFERENCE_MAX });
    checkLength(errors, 'descricao', values.descricao, { max: DESCRIPTION_MAX });

    const latitude = toNumber(values.latitude);
    const longitude = toNumber(values.longitude);
    const validPoint = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    if (!validPoint) errors.mapa = 'Marque o local no mapa: busque o endereço ou toque no mapa.';

    return { valid: Object.keys(errors).length === 0, errors };
  }

  function distanceKm(from, to) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const deltaLat = toRadians(to.latitude - from.latitude);
    const deltaLng = toRadians(to.longitude - from.longitude);
    const haversine = Math.sin(deltaLat / 2) ** 2 +
      Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
  }

  function sortBySchedule(cells) {
    return [...cells].sort((a, b) => weekOrder(a.diaSemana) - weekOrder(b.diaSemana) || a.horario.localeCompare(b.horario));
  }

  function whatsappMessage(cell) {
    return 'Olá! Quero participar da ' + cell.nome + ' (' + cell.bairro + ', ' + cell.horarioTexto + ').';
  }

  return Object.freeze({
    WEEKDAYS,
    WEEKDAYS_SHORT,
    PROFILES,
    DESCRIPTION_MAX,
    formatHour,
    formatSchedule,
    rowToCell,
    formToRows,
    rowToForm,
    validateCellForm,
    distanceKm,
    sortBySchedule,
    whatsappMessage,
  });
});
