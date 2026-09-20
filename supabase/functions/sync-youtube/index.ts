// ============================================================
// Busca os vídeos mais recentes do canal do YouTube da igreja e detecta
// se está ao vivo agora. Roda a cada 10 minutos via pg_cron (agendado
// na migração 20260915..._agendar_sync_youtube.sql).
//
// Não usa nenhuma biblioteca externa e não precisa de chave de API do
// Google: lê o RSS público do canal e a página pública /live, as duas
// coisas que o próprio YouTube expõe sem login.
// ============================================================

const CHANNEL_ID = 'UCP0hmJcAW4uNr1EBbvKzkjw'; // Igreja Batista Maanaim — youtube.com/@igjmaanaim
const MAX_VIDEOS = 12;
const MIN_INTERVAL_MS = 50_000; // não refaz o trabalho se rodou há menos de 50s (protege contra chamadas repetidas)
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; MaanaimSiteBot/1.0; sincroniza o canal do YouTube para o site da igreja)';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(url + ' respondeu ' + response.status);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

interface VideoEntry {
  id: string;
  titulo: string;
  thumbnailUrl: string;
  publicadoEm: string;
}

/** O feed é o Atom público que todo canal do YouTube expõe — sem chave, sem login. */
function parseFeed(xml: string): VideoEntry[] {
  const entries: VideoEntry[] = [];
  const blocks = xml.split('<entry>').slice(1); // o primeiro pedaço é o cabeçalho do feed, não uma entrada
  for (const block of blocks.slice(0, MAX_VIDEOS)) {
    const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = block.match(/<title>([^<]*)<\/title>/)?.[1];
    const published = block.match(/<published>([^<]+)<\/published>/)?.[1];
    const thumbnail = block.match(/<media:thumbnail url="([^"]+)"/)?.[1];
    if (!id || !title || !published || !thumbnail) continue; // entrada incompleta: ignora essa e segue com as outras
    entries.push({ id, titulo: decodeXmlEntities(title), thumbnailUrl: thumbnail, publicadoEm: published });
  }
  return entries;
}

interface LiveStatus {
  aoVivo: boolean;
  videoId: string | null;
  titulo: string | null;
}

/**
 * A página pública /live de um canal redireciona (via <link rel="canonical">)
 * para o vídeo em transmissão quando o canal está ao vivo, e fica apontando
 * para a própria página do canal quando não está. Não é uma API oficial,
 * mas é o mesmo endereço que o navegador de qualquer pessoa acessaria.
 */
function parseLiveStatus(html: string): LiveStatus {
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || '';
  const watchMatch = canonical.match(/\/watch\?v=([A-Za-z0-9_-]{6,20})/);
  const isLiveNow = /"isLiveNow":true/.test(html);
  if (!watchMatch || !isLiveNow) return { aoVivo: false, videoId: null, titulo: null };

  const details = html.match(/"videoDetails":\{"videoId":"([^"]+)","title":"([^"]*)"/);
  return { aoVivo: true, videoId: watchMatch[1], titulo: details ? decodeXmlEntities(details[2]) : null };
}

async function upsert(table: string, body: Record<string, unknown> | Record<string, unknown>[]): Promise<void> {
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return;
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(table + ': a gravação respondeu ' + response.status + ' — ' + (await response.text()).slice(0, 300));
}

async function readLastCheck(): Promise<number> {
  const response = await fetch(SUPABASE_URL + '/rest/v1/canal_youtube?select=verificado_em&id=eq.youtube', {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY },
  });
  if (!response.ok) return 0; // sem leitura anterior: segue e tenta sincronizar mesmo assim
  const [row] = await response.json();
  return row ? new Date(row.verificado_em).getTime() : 0;
}

Deno.serve(async () => {
  try {
    const lastCheck = await readLastCheck();
    if (Date.now() - lastCheck < MIN_INTERVAL_MS) {
      return new Response(JSON.stringify({ pulado: true, motivo: 'sincronizado há poucos segundos' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [feedXml, liveHtml] = await Promise.all([
      fetchText('https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL_ID),
      fetchText('https://www.youtube.com/channel/' + CHANNEL_ID + '/live'),
    ]);

    const videos = parseFeed(feedXml);
    const live = parseLiveStatus(liveHtml);
    const now = new Date().toISOString();

    await upsert(
      'mensagens',
      videos.map((video) => ({
        id: video.id,
        titulo: video.titulo,
        thumbnail_url: video.thumbnailUrl,
        publicado_em: video.publicadoEm,
        sincronizado_em: now,
      })),
    );

    await upsert('canal_youtube', {
      id: 'youtube',
      ao_vivo: live.aoVivo,
      video_id: live.videoId,
      titulo: live.titulo,
      verificado_em: now,
    });

    return new Response(JSON.stringify({ videos: videos.length, aoVivo: live.aoVivo }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[sync-youtube]', error);
    return new Response(JSON.stringify({ erro: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
