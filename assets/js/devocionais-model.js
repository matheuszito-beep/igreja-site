/**
 * Devocional do dia: conversão e validação entre banco (Supabase), formulário do painel e site.
 * Funciona no navegador (window.DevocionaisModel) e no Node (require) para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DevocionaisModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REFERENCE_MIN = 2;
  const REFERENCE_MAX = 60;
  const VERSE_MIN = 4;
  const VERSE_MAX = 600;
  const TEXT_MIN = 10;
  const TEXT_MAX = 2000;
  const AUTHOR_MAX = 80;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const clean = (value) => (typeof value === 'string' ? value.trim() : '');
  const orNull = (value) => clean(value) || null;

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function todayKey(now) {
    const date = now || new Date();
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function rowToDevotional(row) {
    return Object.freeze({
      id: row.id,
      data: row.data,
      versiculoReferencia: row.versiculo_referencia,
      versiculoTexto: row.versiculo_texto,
      texto: row.texto,
      autor: row.autor || undefined,
      publicado: Boolean(row.publicado),
      eDeHoje: row.data === todayKey(),
    });
  }

  function rowToForm(row) {
    return {
      data: row.data || '',
      versiculoReferencia: row.versiculo_referencia || '',
      versiculoTexto: row.versiculo_texto || '',
      texto: row.texto || '',
      autor: row.autor || '',
      publicado: Boolean(row.publicado),
    };
  }

  function formToRow(values) {
    return {
      data: clean(values.data),
      versiculo_referencia: clean(values.versiculoReferencia),
      versiculo_texto: clean(values.versiculoTexto),
      texto: clean(values.texto),
      autor: orNull(values.autor),
      publicado: Boolean(values.publicado),
    };
  }

  function checkLength(errors, field, value, { min = 0, max, required }) {
    const length = clean(value).length;
    if (length < min) errors[field] = required;
    else if (length > max) errors[field] = 'Use no máximo ' + max + ' caracteres.';
  }

  function validateDevotionalForm(values) {
    const errors = {};
    if (!DATE_RE.test(clean(values.data))) errors.data = 'Escolha a data do devocional.';
    checkLength(errors, 'versiculoReferencia', values.versiculoReferencia, {
      min: REFERENCE_MIN, max: REFERENCE_MAX, required: 'Informe a referência do versículo (ex.: João 3:16).',
    });
    checkLength(errors, 'versiculoTexto', values.versiculoTexto, {
      min: VERSE_MIN, max: VERSE_MAX, required: 'Escreva o texto do versículo.',
    });
    checkLength(errors, 'texto', values.texto, {
      min: TEXT_MIN, max: TEXT_MAX, required: 'Escreva a reflexão do dia.',
    });
    checkLength(errors, 'autor', values.autor, { max: AUTHOR_MAX });
    return { valid: Object.keys(errors).length === 0, errors };
  }

  return Object.freeze({
    REFERENCE_MAX,
    VERSE_MAX,
    TEXT_MAX,
    AUTHOR_MAX,
    todayKey,
    rowToDevotional,
    rowToForm,
    formToRow,
    validateDevotionalForm,
  });
});
