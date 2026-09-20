/**
 * Dados com cópia local: entrega na hora a última versão salva no navegador
 * e atualiza assim que a resposta do servidor chega (abre rápido e funciona sem internet).
 *
 * Uso: const recurso = CachedResource.create({ key, label, load });
 *      recurso.subscribe((dados, erro) => { ... });
 */
(function () {
  'use strict';

  const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function create({ key, load, label = 'dados', maxAgeMs = DEFAULT_MAX_AGE_MS }) {
    const listeners = new Set();
    let current = null;
    let failure = null;

    function readCache() {
      try {
        const cached = JSON.parse(window.localStorage.getItem(key));
        return cached && Date.now() - cached.savedAt < maxAgeMs ? cached.data : null;
      } catch (error) {
        console.warn('[' + label + '] Cópia local indisponível.', error);
        return null;
      }
    }

    function writeCache(data) {
      try {
        window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
      } catch (error) {
        console.warn('[' + label + '] Não foi possível guardar uma cópia neste navegador.', error);
      }
    }

    function deliver(listener, data, error) {
      try {
        listener(data, error);
      } catch (listenerError) {
        console.error('[' + label + '] Erro ao exibir os dados.', listenerError);
      }
    }

    function subscribe(listener) {
      listeners.add(listener);
      if (current) deliver(listener, current, null);
      else if (failure) deliver(listener, null, failure);
      return () => listeners.delete(listener);
    }

    (async function start() {
      const cached = readCache();
      if (cached) {
        current = { ...cached, origem: 'cache' };
        listeners.forEach((listener) => deliver(listener, current, null));
      }
      try {
        const fresh = await load();
        writeCache(fresh);
        if (!cached || JSON.stringify(cached) !== JSON.stringify(fresh)) {
          current = { ...fresh, origem: 'online' };
          listeners.forEach((listener) => deliver(listener, current, null));
        }
      } catch (error) {
        console.error('[' + label + '] Não foi possível buscar no servidor.', error);
        if (!cached) {
          failure = error;
          listeners.forEach((listener) => deliver(listener, null, error));
        }
      }
    })();

    return Object.freeze({ subscribe });
  }

  window.CachedResource = Object.freeze({ create });
})();
