/**
 * Escalas de voluntários: conversão e validação entre banco (Supabase), formulários do
 * painel e a tela "Sua escala" do membro.
 * Funciona no navegador (window.EscalasModel) e no Node (require) para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.EscalasModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS_LABELS = Object.freeze({
    aguardando: 'Aguardando resposta',
    confirmado: 'Confirmado',
    ausente: 'Não vai dar',
  });

  const MINISTRY_NAME_MIN = 2;
  const MINISTRY_NAME_MAX = 60;
  const DISPLAY_NAME_MIN = 2;
  const DISPLAY_NAME_MAX = 80;
  const ROLE_MAX = 60;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const clean = (value) => (typeof value === 'string' ? value.trim() : '');

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function todayKey(now) {
    const date = now || new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function addDaysKey(dateKey, days) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day + days);
    return todayKey(date);
  }

  /** 'hoje' | 'amanha' | null — usado para destacar a escala que está chegando. */
  function proximidade(dataKey, now) {
    const today = todayKey(now);
    if (dataKey === today) return 'hoje';
    if (dataKey === addDaysKey(today, 1)) return 'amanha';
    return null;
  }

  function rowToEscala(row) {
    return Object.freeze({
      id: row.id,
      ministerioId: row.ministerio_id,
      membroId: row.membro_id,
      eventoId: row.evento_id || undefined,
      data: row.data,
      funcao: row.funcao || undefined,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status] || row.status,
      proximidade: proximidade(row.data),
    });
  }

  function validateMinistryForm(values) {
    const errors = {};
    const length = clean(values.nome).length;
    if (length < MINISTRY_NAME_MIN || length > MINISTRY_NAME_MAX) {
      errors.nome = 'Informe um nome de ' + MINISTRY_NAME_MIN + ' a ' + MINISTRY_NAME_MAX + ' caracteres.';
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  /** O e-mail é opcional: sem conta no site, dá pra escalar só com o nome. */
  function validateMemberForm(values) {
    const errors = {};
    const email = clean(values.email);
    if (email && !EMAIL_RE.test(email)) errors.email = 'Informe um e-mail válido, ou deixe em branco.';
    const length = clean(values.nome).length;
    if (length < DISPLAY_NAME_MIN || length > DISPLAY_NAME_MAX) {
      errors.nome = 'Informe o nome da pessoa.';
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  /** true se a data escolhida (AAAA-MM-DD) é válida. */
  function isValidDateKey(value) {
    return DATE_RE.test(clean(value));
  }

  /** true se a função (opcional) está dentro do tamanho permitido. */
  function isValidFuncao(value) {
    return clean(value).length <= ROLE_MAX;
  }

  return Object.freeze({
    STATUS_LABELS,
    ROLE_MAX,
    todayKey,
    addDaysKey,
    proximidade,
    rowToEscala,
    validateMinistryForm,
    validateMemberForm,
    isValidDateKey,
    isValidFuncao,
  });
});
