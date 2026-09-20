/**
 * Painel: inicialização — confere a sessão, carrega o perfil e abre a tela certa para cada papel.
 */
(function () {
  'use strict';

  const { $, $$, showView, ROLE_LABELS, canUsePanel, canEditAll } = window.AdminUI;

  async function fetchProfile(client) {
    const user = await client.auth.getUser();
    if (!user) return null;
    const [profile] = await client.from('perfis').select('select=id,nome,email,papel&id=eq.' + encodeURIComponent(user.id));
    return profile || { id: user.id, email: user.email, nome: null, papel: 'membro' };
  }

  /** Um "membro" comum pode liderar um ministério sem ter o papel geral de líder — confere isso à parte. */
  async function lideraAlgumMinisterio(client, perfilId) {
    try {
      const rows = await client.from('ministerio_membros').select('select=ministerio_id&perfil_id=eq.' + encodeURIComponent(perfilId) + '&lider=eq.true&limit=1');
      return rows.length > 0;
    } catch (error) {
      console.error('[painel] Não foi possível checar liderança de ministério.', error);
      return false;
    }
  }

  function start(client) {
    let eventsModule = null;
    let cellsModule = null;
    let devotionalsModule = null;
    let escalasModule = null;
    let muralModule = null;
    let teamModule = null;
    const auth = window.AuthFlow.create({ client, onSignedIn: enter });

    function selectTab(name) {
      const tabs = $('[data-tabs]');
      const visibleTabs = $$('[data-tab]').filter((button) => !button.hidden);
      visibleTabs.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tab === name)));
      $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
      tabs.style.setProperty('--count', String(visibleTabs.length));
      tabs.style.setProperty('--index', String(Math.max(0, visibleTabs.findIndex((button) => button.dataset.tab === name))));
      if (name === 'eventos' && eventsModule) eventsModule.load();
      if (name === 'celulas' && cellsModule) cellsModule.load();
      if (name === 'devocionais' && devotionalsModule) devotionalsModule.load();
      if (name === 'escalas' && escalasModule) escalasModule.load();
      if (name === 'mural' && muralModule) muralModule.load();
      if (name === 'equipe' && teamModule) teamModule.load();
    }

    async function enter() {
      showView('carregando');
      let profile;
      try {
        profile = await fetchProfile(client);
      } catch (error) {
        console.error('[painel] Não foi possível carregar o perfil.', error);
        await client.auth.signOut();
        auth.setMode('entrar');
        auth.showMessage(error.message);
        return;
      }

      if (!profile) {
        auth.setMode('entrar');
        return;
      }

      // Um "membro" pode ter sido promovido a líder de um ministério específico sem ganhar
      // o papel geral de líder — nesse caso ele ainda entra, só que só vê a aba Escalas.
      const lideraMinisterio = profile.papel === 'membro' ? await lideraAlgumMinisterio(client, profile.id) : false;

      if (!canUsePanel(profile.papel) && !lideraMinisterio) {
        $('[data-pending-email]').textContent = profile.email || '';
        showView('aguardando');
        return;
      }

      $('[data-user-name]').textContent = profile.nome || profile.email;
      $('[data-user-role]').textContent = ROLE_LABELS[profile.papel];
      const tabButtons = $$('[data-tab]');
      tabButtons.forEach((button) => {
        const permitido = button.dataset.roles.split(' ').includes(profile.papel);
        button.hidden = !(permitido || (button.dataset.tab === 'escalas' && lideraMinisterio));
      });
      $('[data-tabs]').hidden = tabButtons.filter((button) => !button.hidden).length < 2;

      eventsModule = canUsePanel(profile.papel) ? window.AdminEvents.create({ client, profile }) : null;
      cellsModule = canEditAll(profile.papel) ? window.AdminCells.create({ client, profile }) : null;
      devotionalsModule = canEditAll(profile.papel) ? window.AdminDevotionals.create({ client, profile }) : null;
      escalasModule = window.AdminEscalas.create({ client, profile });
      muralModule = canEditAll(profile.papel) ? window.AdminMural.create({ client, profile }) : null;
      teamModule = profile.papel === 'admin' ? window.AdminTeam.create({ client, profile }) : null;
      showView('painel');
      const primeiraAbaVisivel = tabButtons.find((button) => !button.hidden);
      selectTab(primeiraAbaVisivel ? primeiraAbaVisivel.dataset.tab : 'eventos');
    }

    $$('[data-tab]').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
    $$('[data-sign-out]').forEach((button) => {
      button.addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.replace(window.location.pathname);
      });
    });

    (async function boot() {
      let redirectType = null;
      try {
        redirectType = client.auth.consumeRedirect(window.location.hash);
      } catch (error) {
        console.error('[painel] Link de acesso inválido ou expirado.', error);
        auth.setMode('entrar');
        auth.showMessage('Este link expirou ou já foi usado. Peça um novo.');
        return;
      } finally {
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      if (redirectType === 'recovery') {
        auth.setMode('nova-senha');
        return;
      }
      if (client.auth.hasSession()) {
        await enter();
        return;
      }
      auth.setMode('entrar');
    })();
  }

  let client;
  try {
    const { supabase } = window.SITE_CONFIG;
    client = window.SupabaseRest.create({ url: supabase.url, key: supabase.chavePublica });
  } catch (error) {
    console.error('[painel] Supabase não configurado.', error);
    showView('entrar');
    const message = $('[data-auth-message]');
    message.textContent = 'O painel ainda não está configurado. Verifique assets/js/config.js.';
    message.hidden = false;
    return;
  }

  window.AdminApp = Object.freeze({ start });
  start(client);
})();
