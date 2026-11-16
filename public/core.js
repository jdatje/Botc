// part of the client (app.js is the entry): see the comment at the top of app.js
import { setupI18n, LANGS, getLang } from './i18n.js';

// works at the site root and under a sub path (e.g. /botc/)
export const BASE = location.pathname.replace(/[^/]*$/, '');
export const socket = io({ path: `${BASE}socket.io`, transports: ['websocket', 'polling'], tryAllTransports: true });
// test mode: ?dev=<slot> gives this frame its own storage, so several "devices" fit in one browser
export const DEV = (new URLSearchParams(location.search).get('dev') || '').replace(/[^a-z0-9]/gi, '').slice(0, 8);
export const DEVGRID = new URLSearchParams(location.search).get('devgrid') === '1';
const pre = DEV ? `dev:${DEV}:` : '';
export const store = {
  get: (k) => { try { return localStorage.getItem(pre + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(pre + k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(pre + k); } catch {} },
};
setupI18n(store);
export const langPicker = () => `<div class="seg lang-seg">${Object.entries(LANGS).map(([k, l]) => `<button class="${getLang() === k ? 'on' : ''}" data-lang="${k}">${k === 'nl' ? '🇳🇱' : '🇬🇧'} ${l}</button>`).join('')}</div>`;
// switching language redraws everything from scratch
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b || b.dataset.lang === getLang()) return;
  store.set('botc-lang', b.dataset.lang);
  location.reload();
});
export const call = (ev, p = {}) => new Promise((res) => socket.timeout(15000).emit(ev, p, (err, r) => res(err ? null : r)));
export const $ = (s, el = document) => el.querySelector(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const osk = '';
// ---------- Helpers ----------
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), ms);
}
export const TEAMS = [
  ['townsfolk', 'Townsfolk'],
  ['outsider', 'Outsiders'],
  ['minion', 'Minions'],
  ['demon', 'Demons'],
  ['traveller', 'Travellers'],
  ['fabled', 'Fabled'],
  ['loric', 'Loric'],
];
export const isEvilTeam = (t) => t === 'minion' || t === 'demon';
export const iconOf = (r, align) => (r ? r.icon?.[align || (isEvilTeam(r.team) ? 'evil' : 'good')] : null);
export function token(r, { align, size = '', label = true, cls = '' } = {}) {
  if (!r) return `<span class="tk empty ${size} ${cls}"><span class="tk-name">?</span></span>`;
  const n = r.name.length;
  const nf = n > 12 ? 0.074 : n > 9 ? 0.083 : n > 7 ? 0.1 : 0.12;
  return `<span class="tk ${size} ${cls}" style="--nf:${nf}"><img src="${esc(iconOf(r, align))}" alt="" loading="lazy" draggable="false">${label ? `<span class="tk-name">${esc(r.name)}</span>` : ''}</span>`;
}
export const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
