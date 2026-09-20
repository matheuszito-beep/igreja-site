/**
 * Utilitários de datas e agenda.
 * Funciona no navegador (window.CalendarUtils) e no Node (require) para os testes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.CalendarUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MS_PER_SECOND = 1000;
  const MS_PER_MINUTE = 60 * MS_PER_SECOND;
  const DEFAULT_DURATION_MIN = 120;
  const MAX_OCCURRENCES_PER_EVENT = 1000;
  const UPCOMING_HORIZON_DAYS = 365;
  const SERVICE_LOOKAHEAD_DAYS = 8;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;
  const REQUIRED_FIELDS = ['id', 'titulo', 'inicio'];

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function parseLocal(value) {
    const match = DATE_RE.exec(String(value || '').trim());
    if (!match) {
      throw new Error('Data inválida: "' + value + '". Use AAAA-MM-DD ou AAAA-MM-DDTHH:MM.');
    }
    const [, year, month, day, hours = '0', minutes = '0'] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
    if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
      throw new Error('Data inexistente: "' + value + '".');
    }
    return date;
  }

  function toDateKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, days) {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + days);
    return result;
  }

  function buildMonthGrid(year, month) {
    const first = new Date(year, month, 1);
    const gridStart = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(gridStart, index);
      return { date, key: toDateKey(date), inMonth: date.getMonth() === month };
    });
  }

  function validateEvent(event) {
    const missing = REQUIRED_FIELDS.filter((field) => !event || !event[field]);
    if (missing.length) {
      const label = event && event.id ? '"' + event.id + '"' : 'sem id';
      throw new Error('Evento ' + label + ' sem campo obrigatório: ' + missing.join(', ') + '.');
    }
  }

  function eventDurationMs(event) {
    if (!event.fim) return DEFAULT_DURATION_MIN * MS_PER_MINUTE;
    const duration = parseLocal(event.fim) - parseLocal(event.inicio);
    if (duration <= 0) {
      throw new Error('Evento "' + event.id + '" termina antes de começar.');
    }
    return duration;
  }

  function nthOccurrence(first, frequency, index) {
    if (frequency === 'semanal') return addDays(first, index * 7);
    if (frequency === 'quinzenal') return addDays(first, index * 14);
    if (frequency === 'mensal') {
      const date = new Date(first.getFullYear(), first.getMonth() + index, first.getDate(), first.getHours(), first.getMinutes());
      return date.getDate() === first.getDate() ? date : null;
    }
    return undefined;
  }

  function occurrenceStarts(event, rangeEnd) {
    const first = parseLocal(event.inicio);
    const rule = event.recorrencia;
    if (!rule) return [first];

    if (nthOccurrence(first, rule.frequencia, 0) === undefined) {
      throw new Error('Recorrência não suportada em "' + event.id + '": ' + rule.frequencia + '. Use semanal, quinzenal ou mensal.');
    }

    const until = rule.ate ? addDays(parseLocal(rule.ate), 1) : rangeEnd;
    const limit = until < rangeEnd ? until : rangeEnd;
    const exceptions = new Set(rule.excecoes || []);
    const starts = [];

    for (let index = 0; index < MAX_OCCURRENCES_PER_EVENT; index += 1) {
      const start = nthOccurrence(first, rule.frequencia, index);
      if (start === null) continue;
      if (start >= limit) break;
      if (!exceptions.has(toDateKey(start))) starts.push(start);
    }
    return starts;
  }

  function expandEvents(events, rangeStart, rangeEnd) {
    const occurrences = [];
    events.forEach((event) => {
      validateEvent(event);
      const duration = eventDurationMs(event);
      occurrenceStarts(event, rangeEnd).forEach((start) => {
        const end = new Date(start.getTime() + duration);
        if (end <= rangeStart || start >= rangeEnd) return;
        const key = toDateKey(start);
        occurrences.push(Object.freeze({ ...event, start, end, key, occurrenceId: event.id + '@' + key }));
      });
    });
    return occurrences.sort((a, b) => a.start - b.start);
  }

  function daysSpanned(occurrence) {
    const keys = [];
    for (let day = startOfDay(occurrence.start); day < occurrence.end; day = addDays(day, 1)) {
      keys.push(toDateKey(day));
    }
    return keys;
  }

  function groupByDay(occurrences) {
    return occurrences.reduce((groups, occurrence) => {
      daysSpanned(occurrence).forEach((key) => {
        groups[key] = (groups[key] || []).concat(occurrence);
      });
      return groups;
    }, {});
  }

  function upcoming(events, from, limit) {
    return expandEvents(events, from, addDays(from, UPCOMING_HORIZON_DAYS)).slice(0, limit);
  }

  function nextService(events, now) {
    const services = events.filter((event) => event.ehCulto);
    const [occurrence] = expandEvents(services, now, addDays(now, SERVICE_LOOKAHEAD_DAYS));
    if (!occurrence) return null;
    return { occurrence, isLive: occurrence.start <= now };
  }

  function countdownParts(target, now) {
    const totalSeconds = Math.max(0, Math.floor((target - now) / MS_PER_SECOND));
    return {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  }

  function paginate(items, pageSize) {
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw new Error('Tamanho de página inválido: ' + pageSize + '.');
    }
    return Array.from({ length: Math.ceil(items.length / pageSize) }, (_, page) =>
      items.slice(page * pageSize, (page + 1) * pageSize));
  }

  function pageOfIndex(index, pageSize) {
    return Math.floor(Math.max(index, 0) / pageSize);
  }

  function formatHour(date) {
    const minutes = date.getMinutes();
    return date.getHours() + 'h' + (minutes ? pad(minutes) : '');
  }

  function icsLocalDate(date) {
    return String(date.getFullYear()) + pad(date.getMonth() + 1) + pad(date.getDate()) +
      'T' + pad(date.getHours()) + pad(date.getMinutes()) + '00';
  }

  function icsUtcStamp(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function icsEscape(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/([,;])/g, '\\$1');
  }

  function toICS(occurrence, now) {
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Site da Igreja//Agenda//PT-BR',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + occurrence.occurrenceId + '@agenda',
      'DTSTAMP:' + icsUtcStamp(now || new Date()),
      'DTSTART:' + icsLocalDate(occurrence.start),
      'DTEND:' + icsLocalDate(occurrence.end),
      'SUMMARY:' + icsEscape(occurrence.titulo),
      'LOCATION:' + icsEscape(occurrence.local),
      'DESCRIPTION:' + icsEscape(occurrence.descricao),
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  function googleCalendarUrl(occurrence, timeZone) {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: occurrence.titulo,
      dates: icsLocalDate(occurrence.start) + '/' + icsLocalDate(occurrence.end),
      details: occurrence.descricao || '',
      location: occurrence.local || '',
    });
    if (timeZone) params.set('ctz', timeZone);
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  return Object.freeze({
    parseLocal,
    toDateKey,
    startOfDay,
    addDays,
    buildMonthGrid,
    expandEvents,
    groupByDay,
    upcoming,
    nextService,
    countdownParts,
    paginate,
    pageOfIndex,
    formatHour,
    toICS,
    googleCalendarUrl,
  });
});
