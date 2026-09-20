/**
 * Servidor local para testar o site: `npm start` → http://localhost:4173
 * Reaproveita os cabeçalhos de segurança do .htaccess, deixando o ambiente
 * local igual ao da Hostinger. Não é usado em produção.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const BLOCKED_PATH = /^\/(tests|tools|supabase|node_modules)(\/|$)|^\/(package\.json|README\.md|BACKLOG\.md|\.htaccess)$/;
const IGNORED_HEADERS = new Set(['cache-control', 'expires']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function loadHtaccessHeaders() {
  const htaccess = await readFile(join(ROOT, '.htaccess'), 'utf8').catch(() => '');
  const pattern = /^\s*Header\s+(?:always\s+)?set\s+([\w-]+)\s+"([^"]*)"/gm;
  return Object.fromEntries(
    [...htaccess.matchAll(pattern)]
      .filter(([, name]) => !IGNORED_HEADERS.has(name.toLowerCase()))
      .map(([, name, value]) => [name, value]),
  );
}

async function fileInfo(path) {
  return stat(path).catch(() => null);
}

async function resolveFile(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  const candidate = resolve(ROOT, relative);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;

  const info = await fileInfo(candidate);
  let filePath = candidate;
  if (info && info.isDirectory()) filePath = join(candidate, 'index.html');
  else if (!info && !extname(candidate)) filePath = candidate + '.html';

  const finalInfo = await fileInfo(filePath);
  return finalInfo && finalInfo.isFile() ? filePath : null;
}

const securityHeaders = await loadHtaccessHeaders();

createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (BLOCKED_PATH.test(pathname)) {
      response.writeHead(403, { 'Content-Type': MIME_TYPES['.txt'] });
      response.end('Acesso negado');
      return;
    }

    const filePath = await resolveFile(pathname);
    if (!filePath) {
      const page = await readFile(join(ROOT, '404.html')).catch(() => 'Página não encontrada');
      response.writeHead(404, { ...securityHeaders, 'Content-Type': MIME_TYPES['.html'] });
      response.end(page);
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      ...securityHeaders,
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    console.error('[serve] Falha ao responder', request.url, error);
    response.writeHead(error instanceof URIError ? 400 : 500, { 'Content-Type': MIME_TYPES['.txt'] });
    response.end(error instanceof URIError ? 'Endereço inválido' : 'Erro interno');
  }
}).listen(PORT, () => {
  console.log(`Site rodando em http://localhost:${PORT}`);
});
