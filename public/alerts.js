// part of the client (app.js is the entry): see the comment at the top of app.js
import { getLang } from './i18n.js';
import { call, esc, socket, toast } from './core.js';
import { mode, myId, render, roomCode } from './app.js';

// ---------- Push notifications (locked phone, other app) ----------
// iPhone: only from the app added to the home screen (iOS 16.4+), and the permission must come from a tap.
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const PUSH_OK = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let pushState = PUSH_OK ? 'off' : IOS && !STANDALONE ? 'ios' : 'none'; // off | on | denied | ios | none
let pushKey = null;
const b64 = (s) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export async function checkPush() {
  if (!PUSH_OK) return;
  const before = pushState;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    pushKey ||= (await (await fetch('push/key', { cache: 'no-store' })).json()).key;
    const sub = await reg.pushManager.getSubscription();
    pushState = Notification.permission === 'denied' ? 'denied' : sub && Notification.permission === 'granted' ? 'on' : 'off';
    // this game needs to know this phone (a new game, seated later, or the server forgot it);
    // "on" only when the game really has it
    if (sub && pushState === 'on' && myId && (mode === 'player' || mode === 'waiting')) {
      const res = await call('push:subscribe', { sub: sub.toJSON(), lang: getLang() });
      if (!res?.ok) pushState = 'off';
    }
  } catch (err) {
    console.warn('push', err);
  }
  if (mode === 'player' && pushState !== before) render(true);
}
// the push service dropped this phone's address (iPhones do that now and then): make a new one, no tap needed
socket.on('push:lost', async ({ endpoints } = {}) => {
  if (!PUSH_OK) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && !(endpoints || []).includes(sub.endpoint)) return;
    await sub?.unsubscribe();
    if (Notification.permission === 'granted') await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(pushKey) });
  } catch (err) {
    console.warn('push', err);
  }
  checkPush();
});
export async function pushOn() {
  try {
    const perm = await Notification.requestPermission(); // first thing in the tap: iPhone needs that
    if (perm !== 'granted') {
      pushState = perm === 'denied' ? 'denied' : 'off';
      return render(true);
    }
    const reg = await navigator.serviceWorker.ready;
    pushKey ||= (await (await fetch('push/key', { cache: 'no-store' })).json()).key;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(pushKey) }));
    const res = await call('push:subscribe', { sub: sub.toJSON(), lang: getLang() });
    pushState = res?.ok ? 'on' : 'off';
    toast(res?.ok ? '🔔 Alerts on' : 'Could not turn on alerts');
  } catch (err) {
    toast('Could not turn on alerts');
    console.warn('push', err);
  }
  render(true);
}
export async function pushOff() {
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) {
      await call('push:unsubscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch {}
  pushState = 'off';
  render(true);
}
export function alertsCard() {
  if (pushState === 'none') return '';
  if (pushState === 'on') return `<p class="alerts-on small">🔔 Alerts on this phone are on · <button class="linkish" data-act="push-test">send a test</button> · <button class="linkish" data-act="push-off">turn off</button></p>`;
  const body = {
    off: `<p>Get a buzz for your turn at night and when the day timer runs out, also with the screen off.</p><button class="btn primary" data-act="push-on">🔔 Turn on alerts</button>`,
    denied: `<p>Notifications are blocked for this site. Allow them in your phone's settings, then reload.</p>`,
    ios: `<p>On iPhone, alerts only work from the home screen app:</p><ol><li>Tap <b>Share</b> <span aria-hidden="true">⬆︎</span> below</li><li>Tap <b>Add to Home Screen</b></li><li>Open <b>Clocktower</b> from your home screen and join this game there (code <b>${esc(roomCode() || '')}</b>)</li><li>Tap <b>Turn on alerts</b></li></ol>`,
  }[pushState];
  return `<div class="alerts-card"><b>🔔 Alerts on a locked phone</b>${body}</div>`;
}
// tell the server whether this page is in view: no push when you're looking at it anyway
const sendVisible = () => socket.emit('push:visible', { visible: document.visibilityState === 'visible' });
document.addEventListener('visibilitychange', sendVisible);
// back in the app: make sure this game still has this phone's address
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && myId && checkPush());
// keep saying "I'm on screen" while visible; when a phone locks, this stops and the server notices
setInterval(() => document.visibilityState === 'visible' && socket.connected && sendVisible(), 10000);
socket.on('push:testResult', (r) => !r.ok && toast(`Test failed: ${r.error}`, 8000));
window.addEventListener('pagehide', () => socket.emit('push:visible', { visible: false }));
socket.on('connect', sendVisible);
