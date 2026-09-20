/**
 * Minha Conta: entrar/criar conta e "Sua célula" — a pessoa escolhe a própria
 * célula uma vez e passa a ver aqui o encontro, o líder e o endereço completo.
 */
(function () {
  'use strict';

  const { $, h, showView, setMessage, setBusy, toast, capitalize, confirmDialog } = window.AdminUI;
  const model = window.CelulasModel;
  const escalasModel = window.EscalasModel;
  const utils = window.CalendarUtils;

  const CELULA_COLUMNS = 'id,nome,perfil,lider_nome,dia_semana,horario,bairro,latitude,longitude,mostrar_endereco,endereco_publico,publicado';

  const escalaDateFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  function directionsUrl(cell) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + cell.latitude + ',' + cell.longitude;
  }

  function start(client) {
    const auth = window.AuthFlow.create({
      client,
      onSignedIn: enter,
      texts: {
        entrar: { title: 'Minha Conta', lead: 'Entre com seu e-mail e senha.' },
        cadastro: { title: 'Criar minha conta', lead: 'Depois de criar, você já pode escolher a sua célula.' },
        recuperar: { title: 'Recuperar senha', lead: 'Enviaremos um link para você criar uma nova senha.' },
        'nova-senha': { title: 'Criar nova senha', lead: 'Escolha uma senha com pelo menos 8 caracteres.' },
      },
    });

    const celulaVazio = $('[data-celula-vazio]');
    const celulaPreenchida = $('[data-celula-preenchida]');
    const celulaSelect = $('[data-celula-select]');
    const celulaMessage = $('[data-celula-message]');
    const perfilForm = $('[data-perfil-form]');
    const perfilMessage = $('[data-perfil-message]');

    let userId = null;
    let celulasPublicadas = [];

    async function loadCelulaOptions() {
      celulaSelect.replaceChildren();
      try {
        celulasPublicadas = model.sortBySchedule(
          (await client.from('celulas').select('select=' + CELULA_COLUMNS + '&publicado=eq.true')).map(model.rowToCell),
        );
        celulaSelect.replaceChildren(
          new Option('Escolha a sua célula', ''),
          ...celulasPublicadas.map((cell) => new Option(cell.nome + ' — ' + cell.horarioTexto + ', ' + cell.bairro, cell.id)),
        );
      } catch (error) {
        console.error('[conta] Não foi possível carregar as células.', error);
        setMessage(celulaMessage, 'Não foi possível carregar as células agora. Recarregue a página.');
      }
    }

    async function renderCelula() {
      const [vinculo] = await client.from('celula_membros').select('select=celula_id&perfil_id=eq.' + userId);

      celulaVazio.hidden = Boolean(vinculo);
      celulaPreenchida.hidden = !vinculo;
      if (!vinculo) {
        loadCelulaOptions();
        return;
      }

      const [row] = await client.from('celulas').select('select=' + CELULA_COLUMNS + '&id=eq.' + vinculo.celula_id);
      const [endereco] = await client.from('celulas_enderecos').select('select=endereco&celula_id=eq.' + vinculo.celula_id);
      if (!row) {
        // A célula foi removida depois que a pessoa se vinculou a ela.
        await client.from('celula_membros').remove('perfil_id=eq.' + userId);
        celulaVazio.hidden = false;
        celulaPreenchida.hidden = true;
        loadCelulaOptions();
        return;
      }
      const cell = model.rowToCell(row);

      $('[data-celula-nome]').textContent = cell.nome;
      $('[data-celula-quando]').textContent = cell.horarioTexto;
      $('[data-celula-endereco]').textContent = endereco ? endereco.endereco : cell.bairro;
      $('[data-celula-lider-linha]').hidden = !cell.lider;
      if (cell.lider) $('[data-celula-lider]').textContent = cell.lider;
      $('[data-celula-mapa]').href = directionsUrl(cell);
    }

    /* ---------- Sua escala ---------- */
    const escalaCard = $('[data-escala-card]');
    const escalaList = $('[data-escala-minha-list]');

    async function responderEscala(escalaId, status) {
      try {
        await client.from('escalas').update('id=eq.' + escalaId, { status });
        await renderEscalas();
        toast(status === 'confirmado' ? 'Presença confirmada' : 'Avisamos que você não vai conseguir');
      } catch (error) {
        console.error('[conta] Não foi possível responder à escala.', error);
        toast(error.message || 'Não foi possível salvar. Tente novamente.');
      }
    }

    function escalaMinhaItem(row, ministerioNome, cultoTitulo) {
      const escala = escalasModel.rowToEscala(row);
      const quando = (cultoTitulo ? cultoTitulo + ' · ' : '') +
        capitalize(escalaDateFormat.format(new Date(row.data + 'T00:00'))) +
        (escala.proximidade === 'hoje' ? ' · é hoje!' : escala.proximidade === 'amanha' ? ' · é amanhã!' : '') +
        (escala.funcao ? ' · ' + escala.funcao : '');
      return h('li', { class: 'escala-minha-item' }, [
        h('div', {}, [
          h('p', { class: 'escala-minha-item__ministerio', text: ministerioNome }),
          h('p', { class: 'escala-minha-item__quando', text: quando }),
        ]),
        h('div', { class: 'escala-minha-item__resposta' }, [
          h('button', {
            type: 'button',
            class: 'chip',
            'data-resposta': 'confirmado',
            'aria-pressed': String(row.status === 'confirmado'),
            text: 'Confirmar presença',
            onclick: () => responderEscala(row.id, 'confirmado'),
          }),
          h('button', {
            type: 'button',
            class: 'chip',
            'data-resposta': 'ausente',
            'aria-pressed': String(row.status === 'ausente'),
            text: 'Não vou conseguir',
            onclick: () => responderEscala(row.id, 'ausente'),
          }),
        ]),
      ]);
    }

    async function renderEscalas() {
      try {
        const meusMembros = await client.from('ministerio_membros').select('select=id&perfil_id=eq.' + userId);
        if (!meusMembros.length) {
          escalaCard.hidden = true;
          return;
        }
        const membroIds = meusMembros.map((item) => item.id).join(',');
        const [rows, ministerios] = await Promise.all([
          client.from('escalas').select('select=id,ministerio_id,evento_id,data,funcao,status&membro_id=in.(' + membroIds + ')&data=gte.' + escalasModel.todayKey() + '&order=data'),
          client.from('ministerios').select('select=id,nome'),
        ]);
        const nomePorMinisterio = Object.fromEntries(ministerios.map((item) => [item.id, item.nome]));
        const eventoIds = [...new Set(rows.map((row) => row.evento_id).filter(Boolean))];
        const eventos = eventoIds.length
          ? await client.from('eventos').select('select=id,titulo&id=in.(' + eventoIds.join(',') + ')')
          : [];
        const tituloPorEvento = Object.fromEntries(eventos.map((item) => [item.id, item.titulo]));
        escalaCard.hidden = !rows.length;
        escalaList.replaceChildren(...rows.map((row) => escalaMinhaItem(row, nomePorMinisterio[row.ministerio_id] || 'Ministério', tituloPorEvento[row.evento_id])));
      } catch (error) {
        console.error('[conta] Não foi possível carregar sua escala.', error);
        escalaCard.hidden = true;
      }
    }

    /* ---------- Minhas inscrições ---------- */
    const inscricoesCard = $('[data-inscricoes-card]');
    const inscricoesList = $('[data-inscricoes-list]');

    async function cancelarInscricao(id, titulo) {
      const confirmado = await confirmDialog({
        title: 'Cancelar inscrição?',
        text: 'Sua vaga em “' + titulo + '” será liberada. Isso não pode ser desfeito.',
        confirmLabel: 'Cancelar inscrição',
      });
      if (!confirmado) return;
      try {
        await client.from('inscricoes_evento').remove('id=eq.' + id);
        await renderInscricoes();
        toast('Inscrição cancelada');
      } catch (error) {
        console.error('[conta] Não foi possível cancelar a inscrição.', error);
        toast(error.message || 'Não foi possível cancelar. Tente novamente.');
      }
    }

    function inscricaoItem(row, evento) {
      const titulo = evento ? evento.titulo : 'Evento removido';
      const quando = evento
        ? capitalize(escalaDateFormat.format(new Date(evento.inicio.replace(' ', 'T')))) + ' · ' + utils.formatHour(new Date(evento.inicio.replace(' ', 'T')))
        : '';
      return h('li', { class: 'escala-minha-item' }, [
        h('div', {}, [
          h('p', { class: 'escala-minha-item__ministerio', text: titulo }),
          h('p', { class: 'escala-minha-item__quando', text: quando + (quando ? ' · ' : '') + row.quantidade + (row.quantidade === 1 ? ' pessoa' : ' pessoas') }),
        ]),
        h('button', { type: 'button', class: 'text-button', text: 'Cancelar inscrição', onclick: () => cancelarInscricao(row.id, titulo) }),
      ]);
    }

    async function renderInscricoes() {
      if (!inscricoesCard) return;
      try {
        const rows = await client.from('inscricoes_evento').select('select=id,evento_id,quantidade,criado_em&order=criado_em.desc');
        inscricoesCard.hidden = !rows.length;
        if (!rows.length) return;
        const eventoIds = [...new Set(rows.map((row) => row.evento_id))];
        const eventos = await client.from('eventos').select('select=id,titulo,inicio&id=in.(' + eventoIds.join(',') + ')');
        const eventoPorId = Object.fromEntries(eventos.map((item) => [item.id, item]));
        inscricoesList.replaceChildren(...rows.map((row) => inscricaoItem(row, eventoPorId[row.evento_id])));
      } catch (error) {
        console.error('[conta] Não foi possível carregar suas inscrições.', error);
        inscricoesCard.hidden = true;
      }
    }

    $('[data-celula-confirmar]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const celulaId = celulaSelect.value;
      setMessage(celulaMessage, '');
      if (!celulaId) {
        setMessage(celulaMessage, 'Escolha uma célula na lista.');
        return;
      }
      setBusy(button, true, 'Salvando…');
      try {
        await client.from('celula_membros').insert({ perfil_id: userId, celula_id: celulaId });
        await renderCelula();
        toast('Célula salva! Bem-vindo(a) à família.');
      } catch (error) {
        console.error('[conta] Não foi possível salvar a célula.', error);
        setMessage(celulaMessage, error.message || 'Não foi possível salvar. Tente novamente.');
      } finally {
        setBusy(button, false);
      }
    });

    $('[data-celula-trocar]').addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Trocar de célula?',
        text: 'Você vai escolher uma nova célula em seguida.',
        confirmLabel: 'Trocar',
      });
      if (!confirmed) return;
      await client.from('celula_membros').remove('perfil_id=eq.' + userId);
      await renderCelula();
    });

    perfilForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('[data-perfil-save]', perfilForm);
      const nome = perfilForm.elements.nome.value.trim();
      setMessage(perfilMessage, '');
      setBusy(button, true, 'Salvando…');
      try {
        await client.from('perfis').update('id=eq.' + userId, { nome: nome || null });
        toast('Dados salvos');
      } catch (error) {
        console.error('[conta] Não foi possível salvar o perfil.', error);
        setMessage(perfilMessage, error.message || 'Não foi possível salvar. Tente novamente.');
      } finally {
        setBusy(button, false);
      }
    });

    $('[data-sign-out]').addEventListener('click', async () => {
      await client.auth.signOut();
      window.location.replace(window.location.pathname);
    });

    async function enter() {
      showView('carregando');
      let user;
      try {
        user = await client.auth.getUser();
      } catch (error) {
        console.error('[conta] Não foi possível carregar a sessão.', error);
        await client.auth.signOut();
        auth.setMode('entrar');
        auth.showMessage(error.message);
        return;
      }
      if (!user) {
        auth.setMode('entrar');
        return;
      }

      userId = user.id;
      const [perfil] = await client.from('perfis').select('select=nome,email&id=eq.' + userId);
      const primeiroNome = perfil && perfil.nome ? perfil.nome.trim().split(/\s+/)[0] : '';
      $('[data-conta-saudacao]').textContent = primeiroNome ? 'Olá, ' + capitalize(primeiroNome) + '!' : 'Olá!';
      perfilForm.elements.nome.value = (perfil && perfil.nome) || '';
      $('#perfil-email').value = (perfil && perfil.email) || user.email || '';

      showView('painel');
      await Promise.all([renderCelula(), renderEscalas(), renderInscricoes()]);
    }

    (async function boot() {
      let redirectType = null;
      try {
        redirectType = client.auth.consumeRedirect(window.location.hash);
      } catch (error) {
        console.error('[conta] Link inválido ou expirado.', error);
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

  try {
    const { supabase } = window.SITE_CONFIG;
    start(window.SupabaseRest.create({ url: supabase.url, key: supabase.chavePublica }));
  } catch (error) {
    console.error('[conta] Supabase não configurado.', error);
    showView('entrar');
    const message = $('[data-auth-message]');
    message.textContent = 'A conta ainda não está configurada. Verifique assets/js/config.js.';
    message.hidden = false;
  }
})();
