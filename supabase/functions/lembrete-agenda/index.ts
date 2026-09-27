// ============================================================
// Lembra a comunidade de cultos e eventos de hoje — dois avisos por ocorrência:
// de manhã (08h–08h15 de Brasília) e perto da hora (45–75 min antes de começar).
// Roda a cada 15 min via pg_cron (agendada na migração
// 20260927100100_agendar_lembrete_agenda.sql). Manda geral (sem perfilId) —
// é aviso público de agenda, não pessoal como escala.
//
// Cultos são recorrentes (semanal/quinzenal/mensal) e não têm uma linha por
// ocorrência no banco — o cálculo de "isso acontece hoje?" replica em Deno a
// mesma regra do site (assets/js/calendar-utils.js: nthOccurrence/occurrenceStarts).
// Mantenha as duas em sincronia se a regra de recorrência mudar num dos lados.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Brasil não tem mais horário de verão desde 2019: -03:00 o ano todo.
const FUSO_OFFSET_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

const MANHA_INICIO_MIN = 8 * 60; // 08h00
const MANHA_FIM_MIN = 8 * 60 + 15; // 08h15
const PROXIMO_MIN_ANTES_MIN = 45;
const PROXIMO_MAX_ANTES_MIN = 75;

interface EventoRow {
  id: string;
  titulo: string;
  inicio: string;
  local: string | null;
  eh_culto: boolean;
  recorrencia: 'semanal' | 'quinzenal' | 'mensal' | null;
  recorrencia_ate: string | null;
  excecoes: string[];
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** "Agora", com os getters UTC representando o horário local de Brasília (mesmo truque das outras funções). */
function agoraBrasilia(): Date {
  return new Date(Date.now() - FUSO_OFFSET_MS);
}

function chaveData(date: Date): string {
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
}

function diaBase(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatHora(hora: number, minuto: number): string {
  return hora + 'h' + (minuto ? pad(minuto) : '');
}

/** Extrai ano/mês/dia/hora/minuto de um timestamp "sem fuso" vindo do Postgres ("AAAA-MM-DD HH:MM:SS"). */
function partesDoTimestamp(valor: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(valor);
  if (!match) throw new Error('Timestamp em formato inesperado: ' + valor);
  return {
    ano: Number(match[1]),
    mes: Number(match[2]),
    dia: Number(match[3]),
    hora: Number(match[4]),
    minuto: Number(match[5]),
  };
}

/** Réplica de calendar-utils.js (nthOccurrence + occurrenceStarts), só que verificando "ocorre hoje?" em vez de expandir tudo. */
function ocorreHoje(evento: EventoRow, hoje: Date): { hora: number; minuto: number } | null {
  const inicio = partesDoTimestamp(evento.inicio);
  const primeiroDia = Date.UTC(inicio.ano, inicio.mes - 1, inicio.dia);
  const hojeDia = diaBase(hoje);

  if (hojeDia < primeiroDia) return null;
  if (evento.excecoes && evento.excecoes.includes(chaveData(hoje))) return null;

  if (!evento.recorrencia) {
    return hojeDia === primeiroDia ? { hora: inicio.hora, minuto: inicio.minuto } : null;
  }

  if (evento.recorrencia_ate) {
    const [anoAte, mesAte, diaAte] = evento.recorrencia_ate.split('-').map(Number);
    const ateDia = Date.UTC(anoAte, mesAte - 1, diaAte);
    if (hojeDia > ateDia) return null;
  }

  const diffDias = (hojeDia - primeiroDia) / DIA_MS;

  if (evento.recorrencia === 'semanal' && diffDias % 7 === 0) return { hora: inicio.hora, minuto: inicio.minuto };
  if (evento.recorrencia === 'quinzenal' && diffDias % 14 === 0) return { hora: inicio.hora, minuto: inicio.minuto };
  if (evento.recorrencia === 'mensal' && hoje.getUTCDate() === inicio.dia) return { hora: inicio.hora, minuto: inicio.minuto };
  return null;
}

async function jaAvisado(eventoId: string, data: string, tipo: 'manha' | 'proximo'): Promise<boolean> {
  const response = await fetch(
    SUPABASE_URL + '/rest/v1/avisos_agenda_enviados?select=evento_id&evento_id=eq.' + eventoId + '&data=eq.' + data + '&tipo=eq.' + tipo,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY } },
  );
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function marcarAvisado(eventoId: string, data: string, tipo: 'manha' | 'proximo'): Promise<void> {
  await fetch(SUPABASE_URL + '/rest/v1/avisos_agenda_enviados', {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ evento_id: eventoId, data, tipo }),
  });
}

async function avisar(titulo: string, corpo: string, evento: EventoRow, data: string): Promise<void> {
  await fetch(SUPABASE_URL + '/functions/v1/send-push', {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo,
      corpo,
      url: 'eventos.html?evento=' + evento.id + '&data=' + data,
    }),
  });
}

Deno.serve(async () => {
  try {
    const agora = agoraBrasilia();
    const hojeChave = chaveData(agora);
    const minutoDoDia = agora.getUTCHours() * 60 + agora.getUTCMinutes();

    const response = await fetch(
      SUPABASE_URL + '/rest/v1/eventos?select=id,titulo,inicio,local,eh_culto,recorrencia,recorrencia_ate,excecoes&publicado=eq.true',
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY } },
    );
    if (!response.ok) throw new Error('eventos: a leitura respondeu ' + response.status);
    const eventos: EventoRow[] = await response.json();

    let manha = 0;
    let proximo = 0;

    for (const evento of eventos) {
      const ocorrencia = ocorreHoje(evento, agora);
      if (!ocorrencia) continue;

      const hora = formatHora(ocorrencia.hora, ocorrencia.minuto);
      const inicioMinutoDoDia = ocorrencia.hora * 60 + ocorrencia.minuto;

      if (minutoDoDia >= MANHA_INICIO_MIN && minutoDoDia < MANHA_FIM_MIN && !(await jaAvisado(evento.id, hojeChave, 'manha'))) {
        await marcarAvisado(evento.id, hojeChave, 'manha');
        await avisar(
          'Hoje tem ' + evento.titulo,
          'Às ' + hora + (evento.local ? ', ' + evento.local : '') + '.',
          evento,
          hojeChave,
        );
        manha++;
      }

      const faltamMin = inicioMinutoDoDia - minutoDoDia;
      if (faltamMin >= PROXIMO_MIN_ANTES_MIN && faltamMin <= PROXIMO_MAX_ANTES_MIN && !(await jaAvisado(evento.id, hojeChave, 'proximo'))) {
        await marcarAvisado(evento.id, hojeChave, 'proximo');
        await avisar(
          evento.titulo + ' está quase começando',
          'Às ' + hora + (evento.local ? ', ' + evento.local : '') + '.',
          evento,
          hojeChave,
        );
        proximo++;
      }
    }

    return new Response(JSON.stringify({ data: hojeChave, avaliados: eventos.length, manha, proximo }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[lembrete-agenda]', error);
    return new Response(JSON.stringify({ erro: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
