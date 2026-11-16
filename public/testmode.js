// part of the client (app.js is the entry): see the comment at the top of app.js
import { $, BASE, call, esc, store } from './core.js';
import { mode, render, roomPlayers, session, setRoomPlayers, st, stab } from './app.js';
import { closeSheet, openSheet } from './sheets.js';

// ---------- Test mode: the grimoire, the table view and every test player side by side ----------
let gridKey = '';
export async function renderDevGrid() {
  const app = $('#app');
  app.className = 'mode-devgrid';
  if (mode !== 'st' || !session?.token) {
    gridKey = '';
    app.innerHTML = `<div class="center pad"><h2 class="h">Test mode</h2><p class="muted">Open the grimoire first, then choose 🧪 Test mode in ⚙.</p><a class="btn" href="${BASE}">Back</a></div>`;
    return;
  }
  const members = (await call('botc:roomPlayers')) || [];
  const testers = members.filter((m) => m.manual);
  const key = `${session.code}|${testers.map((m) => m.id).join(',')}`;
  if (key === gridKey) return;
  gridKey = key;
  // the storyteller frame gets a copy of this device's grimoire session
  try { localStorage.setItem('dev:st:botc-session', JSON.stringify(session)); } catch {}
  const q = (o) => new URLSearchParams(o).toString();
  const frame = (label, src, cls = '') => `<figure class="dev-f ${cls}"><figcaption>${esc(label)}<a href="${esc(src)}" target="_blank" title="Open on its own">↗</a></figcaption><iframe src="${esc(src)}" title="${esc(label)}"></iframe></figure>`;
  app.innerHTML = `<header class="dev-bar">
      <b>🧪 Test mode · ${esc(session.code)}</b>
      <span class="muted small">${testers.length} test player${testers.length === 1 ? '' : 's'} · each frame is its own device</span>
      <span class="grow"></span>
      <label class="small">Size <select id="dev-zoom">${[100, 85, 70, 55].map((z) => `<option value="${z}" ${String(z) === (store.get('dev-zoom') || '85') ? 'selected' : ''}>${z}%</option>`).join('')}</select></label>
      <button class="btn small" data-dev="add">+ Test player</button>
      <button class="btn small" data-dev="reload">↻ Reload all</button>
      <a class="btn small" href="${BASE}">✕ Close test mode</a>
    </header>
    <div class="dev-grid" id="dev-grid" style="zoom:${(Number(store.get('dev-zoom')) || 85) / 100}">
      ${frame('Storyteller', `${BASE}?${q({ dev: 'st' })}`, 'wide')}
      ${frame('Table view', `${BASE}?${q({ dev: 'tv', code: session.code, watch: '1' })}`, 'wide')}
      ${testers.map((m, i) => frame(m.name, `${BASE}?${q({ dev: `p${i}`, code: session.code, devplayer: m.id, devtoken: session.token })}`)).join('')}
    </div>`;
}
document.addEventListener('change', (e) => {
  if (e.target.id !== 'dev-zoom') return;
  store.set('dev-zoom', e.target.value);
  $('#dev-grid').style.zoom = Number(e.target.value) / 100;
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-dev]');
  if (!b) return;
  if (b.dataset.dev === 'reload') return document.querySelectorAll('.dev-grid iframe').forEach((f) => (f.src = f.src));
  if (b.dataset.dev === 'add') {
    const members = (await call('botc:roomPlayers')) || [];
    await addTestPlayers(members.filter((m) => m.manual).length + 1);
    gridKey = '';
    renderDevGrid();
  }
});
// make sure there are n names added by hand ("Test 1"…), seated while setting up
async function addTestPlayers(n) {
  let members = (await call('botc:roomPlayers')) || [];
  for (let i = 1; members.filter((m) => m.manual).length < n && i < 40; i++) {
    if (!members.some((m) => m.name.toLowerCase() === `test ${i}`)) await call('botc:addName', { name: `Test ${i}` });
    members = (await call('botc:roomPlayers')) || [];
  }
  if (st?.phase === 'setup') {
    const seated = st.seats.map((s) => s.playerId);
    const add = members.filter((m) => m.manual && !seated.includes(m.id)).map((m) => m.id);
    if (add.length) await call('botc:seats', { ids: [...seated, ...add].slice(0, 20) });
  }
}
export function openTestMode() {
  const manual = roomPlayers.filter((m) => m.manual).length;
  openSheet(
    `<h2 class="h">🧪 Test mode</h2>
     <p>Play every seat yourself on this screen: the grimoire, the table view and one phone per test player, side by side. Each frame is its own device, so you can hold a token, chat between players and run the nights.</p>
     <p class="hint">Test players are names added by hand ("Test 1", "Test 2"…). They're seated while you set up. Best on a laptop or big screen.</p>
     <h3 class="h">How many players?</h3>
     <div class="row">${[5, 6, 7, 8, 9, 10, 12, 15].map((n) => `<button class="chip ${n === Math.max(7, manual) ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}</div>`,
    async (e) => {
      const b = e.target.closest('[data-n]');
      if (!b) return;
      b.textContent = '…';
      await addTestPlayers(Number(b.dataset.n));
      closeSheet();
      location.href = `${BASE}?devgrid=1`;
    },
    'narrow'
  );
}

export async function loadRoomPlayers() {
  setRoomPlayers((await call('botc:roomPlayers')) || []);
  if (mode === 'st' && stab === 'setup') render();
}
