/**
 * Painel: utilidades de interface compartilhadas (telas, mensagens, botões ocupados e confirmação).
 */
(function () {
  'use strict';

  const { $, $$, h, toast, capitalize } = window.Site;

  const ROLE_LABELS = Object.freeze({ membro: 'Membro', lider: 'Líder', editor: 'Editor', admin: 'Administrador' });

  const canEditAll = (role) => role === 'editor' || role === 'admin';
  const canUsePanel = (role) => role === 'lider' || canEditAll(role);

  function showView(name) {
    $$('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== name; });
  }

  function setMessage(element, text, tone) {
    element.textContent = text || '';
    element.dataset.tone = tone || 'error';
    element.hidden = !text;
  }

  function setBusy(button, busy, busyLabel) {
    if (busy) {
      button.dataset.idleLabel = button.textContent.trim();
      button.textContent = busyLabel;
      button.disabled = true;
      return;
    }
    if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
    button.disabled = false;
  }

  function setFieldError(form, name, message) {
    const errorText = $('[data-error-for="' + name + '"]', form);
    if (errorText) {
      errorText.textContent = message || '';
      errorText.hidden = !message;
    }
    const control = form.elements[name];
    if (!control || typeof control.closest !== 'function') return;
    const field = control.closest('.field');
    if (field) field.classList.toggle('field--error', Boolean(message));
    control.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function clearFieldErrors(form) {
    $$('[data-error-for]', form).forEach((element) => setFieldError(form, element.dataset.errorFor, ''));
  }

  function confirmDialog({ title, text, confirmLabel }) {
    const dialog = $('[data-confirm]');
    const ok = $('[data-confirm-ok]', dialog);
    const cancel = $('[data-confirm-cancel]', dialog);
    $('[data-confirm-title]', dialog).textContent = title;
    $('[data-confirm-text]', dialog).textContent = text;
    ok.textContent = confirmLabel || 'Confirmar';

    return new Promise((resolve) => {
      const finish = (result) => {
        resolve(result);
        dialog.close();
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      dialog.addEventListener('close', () => {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(false);
      }, { once: true });
      dialog.showModal();
      cancel.focus();
    });
  }

  window.AdminUI = Object.freeze({
    $,
    $$,
    h,
    toast,
    capitalize,
    ROLE_LABELS,
    canEditAll,
    canUsePanel,
    showView,
    setMessage,
    setBusy,
    setFieldError,
    clearFieldErrors,
    confirmDialog,
  });
})();
