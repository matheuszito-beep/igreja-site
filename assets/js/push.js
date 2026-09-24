/**
 * Notificação push: ativa/desativa no aparelho (funciona sem login — o convite é pra
 * comunidade inteira). Guarda a inscrição na tabela push_tokens; quem dispara os avisos
 * (culto ao vivo, devocional da manhã) são as Edge Functions do Supabase.
 */
(function () {
  'use strict';

  const Site = window.Site;
  const config = window.SITE_CONFIG;
  if (!Site || !config || !config.vapidPublicKey || !window.SupabaseRest) return;

  const { $$ } = Site;
  const buttons = $$('[data-push-toggle]');
  if (!buttons.length) return;

  const READY_TIMEOUT_MS = 8000;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const client = window.SupabaseRest.create({ url: config.supabase.url, key: config.supabase.chavePublica });

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  }

  /** navigator.serviceWorker.ready nunca resolve se o registro falhar — não trava o botão pra sempre. */
  function serviceWorkerReady() {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('O site não conseguiu preparar as notificações agora. Tente novamente em instantes.')), READY_TIMEOUT_MS)),
    ]);
  }

  function setState(active) {
    buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(active));
      const label = button.querySelector('[data-push-label]');
      if (label) label.textContent = active ? 'Ativadas' : 'Notificações';
    });
  }

  function setBusy(busy) {
    buttons.forEach((button) => { button.disabled = busy; });
  }

  async function currentSubscription() {
    const registration = await serviceWorkerReady();
    return registration.pushManager.getSubscription();
  }

  async function activate() {
    if (Notification.permission === 'denied') {
      Site.toast('As notificações estão bloqueadas nas configurações do navegador.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await serviceWorkerReady();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
    });
    const json = subscription.toJSON();
    await client.from('push_tokens').upsert({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, 'endpoint');
    setState(true);
    Site.toast('Notificações ativadas neste aparelho');
  }

  async function deactivate() {
    const subscription = await currentSubscription();
    if (subscription) {
      await client.from('push_tokens').remove('endpoint=eq.' + encodeURIComponent(subscription.endpoint)).catch(() => {});
      await subscription.unsubscribe();
    }
    setState(false);
    Site.toast('Notificações desativadas neste aparelho');
  }

  async function toggle() {
    setBusy(true);
    try {
      const subscription = await currentSubscription();
      if (subscription) await deactivate();
      else await activate();
    } catch (error) {
      console.error('[push] Não foi possível atualizar a notificação.', error);
      Site.toast('Não foi possível atualizar as notificações agora.');
    } finally {
      setBusy(false);
    }
  }

  async function init() {
    if (!supported) return;
    buttons.forEach((button) => {
      button.hidden = false;
      button.addEventListener('click', toggle);
    });
    try {
      const subscription = await currentSubscription();
      setState(Boolean(subscription));
    } catch (error) {
      console.error('[push] Não foi possível ler o estado da notificação.', error);
    }
  }

  init();
})();
