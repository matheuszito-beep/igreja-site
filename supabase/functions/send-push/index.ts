// ============================================================
// Dispara notificação push para todos os aparelhos inscritos em push_tokens.
// Chamada internamente por outras Edge Functions (sync-youtube quando o canal
// fica ao vivo, auto-devocional quando publica o devocional do dia) — não é
// pensada para ser chamada direto pelo site.
//
// Usa a biblioteca "web-push" (compatibilidade NPM das Edge Functions) porque
// criptografar a mensagem à mão (RFC 8291) é fácil de errar; a biblioteca já é
// testada e mantida pela comunidade.
// ============================================================

import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// A chave privada é a única parte secreta do VAPID — configure em Supabase →
// Edge Functions → Secrets. A pública não precisa ser segredo (fica também em
// assets/js/config.js) e por isso pode ficar direto no código.
const VAPID_PUBLIC_KEY = 'BBenpBK6OiA5arEb7BaKFo8mNWS63tM-EPZdYJ0fKnMRNd5fizT7ulpl1XdEXVgIr415bvhHFNomC6BPvkf3NaI';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = 'mailto:contato@batistamaanaim.com.br';

interface PushToken {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayload {
  titulo: string;
  corpo: string;
  url?: string;
}

async function listTokens(): Promise<PushToken[]> {
  const response = await fetch(SUPABASE_URL + '/rest/v1/push_tokens?select=id,endpoint,p256dh,auth', {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY },
  });
  if (!response.ok) throw new Error('push_tokens: a leitura respondeu ' + response.status);
  return response.json();
}

async function removeToken(id: string): Promise<void> {
  await fetch(SUPABASE_URL + '/rest/v1/push_tokens?id=eq.' + id, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY },
  });
}

Deno.serve(async (req) => {
  try {
    if (!VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ erro: 'VAPID_PRIVATE_KEY não configurada nas secrets da função.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload: PushPayload = await req.json();
    if (!payload.titulo || !payload.corpo) {
      return new Response(JSON.stringify({ erro: 'Informe "titulo" e "corpo".' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const tokens = await listTokens();
    const body = JSON.stringify({ title: payload.titulo, body: payload.corpo, url: payload.url || '.' });

    let enviados = 0;
    let removidos = 0;
    await Promise.all(tokens.map(async (token) => {
      try {
        await webpush.sendNotification(
          { endpoint: token.endpoint, keys: { p256dh: token.p256dh, auth: token.auth } },
          body,
        );
        enviados++;
      } catch (error) {
        const statusCode = error && typeof error === 'object' && 'statusCode' in error ? (error as { statusCode: number }).statusCode : 0;
        if (statusCode === 404 || statusCode === 410) {
          await removeToken(token.id);
          removidos++;
        } else {
          console.error('[send-push] Falha ao enviar para um aparelho.', error);
        }
      }
    }));

    return new Response(JSON.stringify({ enviados, removidos, total: tokens.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[send-push]', error);
    return new Response(JSON.stringify({ erro: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
