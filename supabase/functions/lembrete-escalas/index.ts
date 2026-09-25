// ============================================================
// Lembra quem está confirmado numa escala de amanhã — roda 1x por dia à noite
// via pg_cron (agendada na migração 20260925130000_agendar_lembrete_escalas.sql).
// Só avisa quem está com status "confirmado" (quem ainda não respondeu ou já
// avisou que não vai não recebe lembrete).
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Brasil não tem mais horário de verão desde 2019: -03:00 o ano todo.
const FUSO_OFFSET_MS = 3 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Data de amanhã já no fuso de Brasília, sem depender do fuso do servidor. */
function amanhaNoBrasil(): string {
  const agora = new Date(Date.now() - FUSO_OFFSET_MS + 24 * 60 * 60 * 1000);
  return agora.getUTCFullYear() + '-' + pad(agora.getUTCMonth() + 1) + '-' + pad(agora.getUTCDate());
}

interface Escala {
  funcao: string | null;
  ministerios: { nome: string } | null;
  // escalas aponta pra ministerio_membros (membro_id), não direto pro perfil — porque
  // dá pra escalar gente sem conta. Quem não tem perfil_id aqui, não recebe lembrete.
  ministerio_membros: { perfil_id: string | null } | null;
}

Deno.serve(async () => {
  try {
    const amanha = amanhaNoBrasil();
    const response = await fetch(
      SUPABASE_URL + '/rest/v1/escalas?select=funcao,ministerios(nome),ministerio_membros(perfil_id)&data=eq.' + amanha + '&status=eq.confirmado',
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY } },
    );
    if (!response.ok) throw new Error('escalas: a leitura respondeu ' + response.status);
    const escalas: Escala[] = await response.json();

    let enviados = 0;
    for (const escala of escalas) {
      const perfilId = escala.ministerio_membros?.perfil_id;
      if (!perfilId) continue;
      const envio = await fetch(SUPABASE_URL + '/functions/v1/send-push', {
        method: 'POST',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'Você está escalado amanhã',
          corpo: (escala.ministerios?.nome || 'Ministério') + (escala.funcao ? ' · ' + escala.funcao : ''),
          url: 'conta.html',
          perfilId,
        }),
      });
      if (envio.ok) enviados++;
    }

    return new Response(JSON.stringify({ data: amanha, escalas: escalas.length, enviados }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[lembrete-escalas]', error);
    return new Response(JSON.stringify({ erro: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
