/**
 * Cliente mínimo e sem dependências para a API do Supabase.
 * Cobre o que o site e o painel usam: tabelas, RPC, login por e-mail/senha e envio de imagens.
 * A chave usada aqui é a PUBLICÁVEL (feita para ficar no navegador); quem protege os dados são as regras RLS do banco.
 */
(function () {
  'use strict';

  const SESSION_KEY = 'maanaim.sessao';
  const REFRESH_MARGIN_SECONDS = 60;
  const REQUEST_TIMEOUT_MS = 15000;
  const DEFAULT_EXPIRES_IN_SECONDS = 3600;

  const FRIENDLY_MESSAGES = Object.freeze({
    invalid_credentials: 'E-mail ou senha incorretos.',
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
    'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
    user_already_exists: 'Já existe uma conta com este e-mail.',
    'User already registered': 'Já existe uma conta com este e-mail.',
    weak_password: 'Escolha uma senha mais forte (pelo menos 8 caracteres).',
    over_email_send_rate_limit: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    email_address_not_authorized: 'O envio de e-mails ainda não está liberado para este endereço. Fale com o administrador.',
    '42501': 'Você não tem permissão para fazer isso.',
    '23503': 'A categoria escolhida não existe mais. Atualize a página.',
    '23514': 'Algum campo está fora do formato permitido. Revise o formulário.',
  });

  class SupabaseError extends Error {
    constructor(message, status, details) {
      super(message);
      this.name = 'SupabaseError';
      this.status = status;
      this.details = details;
    }
  }

  function readStoredSession() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('[supabase] Não foi possível ler a sessão salva.', error);
      return null;
    }
  }

  function storeSession(session) {
    try {
      if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.warn('[supabase] Não foi possível salvar a sessão neste navegador.', error);
    }
  }

  function parseBody(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  }

  function toError(status, data) {
    const code = data && (data.error_code || data.code);
    const raw = data && (data.msg || data.message || data.error_description || data.error);
    const fallback = status === 401 ? 'Sua sessão expirou. Entre novamente.'
      : status === 403 ? FRIENDLY_MESSAGES['42501']
        : 'Algo deu errado. Tente novamente em instantes.';
    return new SupabaseError(FRIENDLY_MESSAGES[code] || FRIENDLY_MESSAGES[raw] || raw || fallback, status, data);
  }

  function create({ url, key }) {
    if (!url || !key) {
      throw new SupabaseError('Configure supabase.url e supabase.chavePublica em assets/js/config.js.', 0);
    }

    const base = url.replace(/\/+$/, '');
    let session = readStoredSession();
    let refreshing = null;

    function saveSession(data) {
      session = data && data.access_token
        ? {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || DEFAULT_EXPIRES_IN_SECONDS),
          user: data.user || (session && session.user) || null,
        }
        : null;
      storeSession(session);
      return session;
    }

    async function send(path, { method = 'GET', headers = {}, body, token, rawBody = false } = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const requestHeaders = { apikey: key, ...headers };
      if (token) requestHeaders.Authorization = 'Bearer ' + token;
      if (body !== undefined && !rawBody) requestHeaders['Content-Type'] = 'application/json';

      let response;
      try {
        response = await fetch(base + path, {
          method,
          headers: requestHeaders,
          body: body === undefined ? undefined : rawBody ? body : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        const message = error.name === 'AbortError'
          ? 'O servidor demorou para responder. Tente novamente.'
          : 'Sem conexão com o servidor. Verifique sua internet.';
        throw new SupabaseError(message, 0, error);
      } finally {
        clearTimeout(timer);
      }

      const data = parseBody(await response.text());
      if (!response.ok) throw toError(response.status, data);
      return data;
    }

    async function refreshSession() {
      if (!refreshing) {
        refreshing = send('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: { refresh_token: session.refresh_token },
        })
          .then(saveSession)
          .catch((error) => {
            saveSession(null);
            throw new SupabaseError('Sua sessão expirou. Entre novamente.', 401, error);
          })
          .finally(() => { refreshing = null; });
      }
      return refreshing;
    }

    async function accessToken() {
      if (!session) return null;
      const now = Math.floor(Date.now() / 1000);
      if (session.expires_at - REFRESH_MARGIN_SECONDS > now) return session.access_token;
      return (await refreshSession()).access_token;
    }

    async function request(path, options = {}) {
      const { anonymous = false, ...rest } = options;
      const token = anonymous ? null : await accessToken();
      return send(path, { ...rest, token });
    }

    const firstRow = (rows) => (Array.isArray(rows) ? rows[0] : rows);

    function from(table, { anonymous = false } = {}) {
      const path = '/rest/v1/' + table;
      return Object.freeze({
        select: (query = 'select=*') => request(path + '?' + query, { anonymous }),
        insert: (row) => request(path, { method: 'POST', body: row, headers: { Prefer: 'return=representation' } }).then(firstRow),
        upsert: (row, onConflict) => request(path + '?on_conflict=' + encodeURIComponent(onConflict), {
          method: 'POST',
          body: row,
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        }).then(firstRow),
        update: (filter, patch) => request(path + '?' + filter, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } }).then(firstRow),
        remove: (filter) => request(path + '?' + filter, { method: 'DELETE', headers: { Prefer: 'return=representation' } }).then(firstRow),
      });
    }

    const rpc = (name, params) => request('/rest/v1/rpc/' + name, { method: 'POST', body: params || {} });

    const auth = Object.freeze({
      async signIn(email, password) {
        return saveSession(await send('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
      },
      signUp(email, password, nome, redirectTo) {
        const query = redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : '';
        return send('/auth/v1/signup' + query, { method: 'POST', body: { email, password, data: { nome } } });
      },
      requestPasswordReset(email, redirectTo) {
        const query = redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : '';
        return send('/auth/v1/recover' + query, { method: 'POST', body: { email } });
      },
      async updatePassword(password) {
        const user = await request('/auth/v1/user', { method: 'PUT', body: { password } });
        saveSession({ ...session, user });
        return user;
      },
      /** Lê os tokens que o Supabase coloca no endereço após confirmar e-mail ou pedir nova senha. */
      consumeRedirect(hash) {
        const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
        if (params.get('error_description')) {
          throw new SupabaseError(params.get('error_description').replace(/\+/g, ' '), 400);
        }
        if (!params.get('access_token')) return null;
        saveSession({
          access_token: params.get('access_token'),
          refresh_token: params.get('refresh_token'),
          expires_in: Number(params.get('expires_in')) || DEFAULT_EXPIRES_IN_SECONDS,
        });
        return params.get('type');
      },
      async getUser() {
        if (!session) return null;
        const user = await request('/auth/v1/user');
        saveSession({ ...session, user });
        return user;
      },
      async signOut() {
        if (session) {
          try {
            await request('/auth/v1/logout', { method: 'POST' });
          } catch (error) {
            console.warn('[supabase] Falha ao encerrar a sessão no servidor; saindo mesmo assim.', error);
          }
        }
        saveSession(null);
      },
      hasSession: () => Boolean(session),
    });

    const storage = Object.freeze({
      async upload(bucket, objectPath, file) {
        const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
        await request('/storage/v1/object/' + bucket + '/' + encodedPath, {
          method: 'POST',
          body: file,
          rawBody: true,
          headers: { 'Content-Type': file.type, 'x-upsert': 'false', 'Cache-Control': 'max-age=31536000' },
        });
        return base + '/storage/v1/object/public/' + bucket + '/' + encodedPath;
      },
    });

    return Object.freeze({ from, rpc, auth, storage });
  }

  window.SupabaseRest = Object.freeze({ create, SupabaseError });
})();
