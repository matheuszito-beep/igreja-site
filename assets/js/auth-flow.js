/**
 * Painel: entrar, criar acesso, recuperar senha e definir nova senha.
 */
(function () {
  'use strict';

  const { $, $$, toast, showView, setMessage, setBusy } = window.AdminUI;

  const MIN_PASSWORD_LENGTH = 8;
  const MIN_NAME_LENGTH = 2;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const MODES = Object.freeze({
    entrar: {
      title: 'Painel da agenda',
      lead: 'Entre com seu e-mail e senha para gerenciar os eventos.',
      submit: 'Entrar',
      fields: ['email', 'senha'],
      passwordAutocomplete: 'current-password',
      links: ['cadastro', 'recuperar'],
    },
    cadastro: {
      title: 'Criar acesso',
      lead: 'Depois de criar, um administrador libera o que você pode fazer no painel.',
      submit: 'Criar acesso',
      fields: ['nome', 'email', 'senha'],
      passwordAutocomplete: 'new-password',
      links: ['entrar'],
    },
    recuperar: {
      title: 'Recuperar senha',
      lead: 'Enviaremos um link para você criar uma nova senha.',
      submit: 'Enviar link',
      fields: ['email'],
      passwordAutocomplete: 'current-password',
      links: ['entrar'],
    },
    'nova-senha': {
      title: 'Criar nova senha',
      lead: 'Escolha uma senha com pelo menos ' + MIN_PASSWORD_LENGTH + ' caracteres.',
      submit: 'Salvar nova senha',
      fields: ['senha'],
      passwordAutocomplete: 'new-password',
      links: [],
    },
  });

  /**
   * `texts` deixa cada página usar suas próprias frases (painel da equipe vs. conta do
   * membro) sem duplicar todo o fluxo de entrar/cadastro/recuperar senha.
   */
  function create({ client, onSignedIn, texts = {} }) {
    const view = $('[data-view="entrar"]');
    const form = $('[data-auth-form]', view);
    const title = $('[data-auth-title]', view);
    const lead = $('[data-auth-lead]', view);
    const message = $('[data-auth-message]', view);
    const submit = $('[data-auth-submit]', view);
    let mode = 'entrar';

    const redirectUrl = () => window.location.origin + window.location.pathname;

    function setMode(nextMode) {
      mode = nextMode;
      const config = { ...MODES[nextMode], ...texts[nextMode] };
      title.textContent = config.title;
      lead.textContent = config.lead;
      submit.textContent = config.submit;
      // Se o modo mudar enquanto o botão está "ocupado" (ex.: cadastro concluído dispara
      // setMode('entrar') antes do setBusy(false) do envio), atualiza o rótulo guardado
      // também — senão o setBusy(false) restaura o texto antigo por cima deste.
      if (submit.dataset.idleLabel) submit.dataset.idleLabel = config.submit;
      ['nome', 'email', 'senha'].forEach((name) => {
        $('[data-field="' + name + '"]', form).hidden = !config.fields.includes(name);
      });
      form.elements.senha.setAttribute('autocomplete', config.passwordAutocomplete);
      $$('[data-auth-mode]', view).forEach((button) => {
        button.hidden = !config.links.includes(button.dataset.authMode);
      });
      setMessage(message, '');
      showView('entrar');
      form.elements[config.fields[0]].focus();
    }

    function readValues() {
      return {
        nome: form.elements.nome.value.trim(),
        email: form.elements.email.value.trim().toLowerCase(),
        senha: form.elements.senha.value,
      };
    }

    function validate(values) {
      const required = MODES[mode].fields;
      if (required.includes('nome') && values.nome.length < MIN_NAME_LENGTH) return 'Informe seu nome.';
      if (required.includes('email') && !EMAIL_RE.test(values.email)) return 'Informe um e-mail válido.';
      if (required.includes('senha') && values.senha.length < MIN_PASSWORD_LENGTH) {
        return 'A senha precisa ter pelo menos ' + MIN_PASSWORD_LENGTH + ' caracteres.';
      }
      return '';
    }

    async function runMode(values) {
      if (mode === 'entrar') {
        await client.auth.signIn(values.email, values.senha);
        form.reset();
        await onSignedIn();
        return;
      }
      if (mode === 'cadastro') {
        const result = await client.auth.signUp(values.email, values.senha, values.nome, redirectUrl());
        if (result && result.access_token) {
          await client.auth.signIn(values.email, values.senha);
          form.reset();
          await onSignedIn();
          return;
        }
        form.reset();
        setMode('entrar');
        setMessage(message, 'Conta criada! Confirme pelo link que enviamos para o seu e-mail e depois entre.', 'success');
        return;
      }
      if (mode === 'recuperar') {
        await client.auth.requestPasswordReset(values.email, redirectUrl());
        form.reset();
        setMode('entrar');
        setMessage(message, 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.', 'success');
        return;
      }
      await client.auth.updatePassword(values.senha);
      form.reset();
      toast('Senha atualizada');
      await onSignedIn();
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = readValues();
      const error = validate(values);
      if (error) {
        setMessage(message, error);
        return;
      }
      setMessage(message, '');
      setBusy(submit, true, 'Aguarde…');
      try {
        await runMode(values);
      } catch (failure) {
        console.error('[painel] Falha na autenticação.', failure);
        setMessage(message, failure.message || 'Não foi possível concluir. Tente novamente.');
      } finally {
        setBusy(submit, false);
      }
    });

    $$('[data-auth-mode]', view).forEach((button) => {
      button.addEventListener('click', () => setMode(button.dataset.authMode));
    });

    return Object.freeze({
      setMode,
      showMessage: (text, tone) => setMessage(message, text, tone),
    });
  }

  window.AuthFlow = Object.freeze({ create });
})();
