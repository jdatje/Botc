// part of the client (app.js is the entry): see the comment at the top of app.js
import { $, BASE, call, esc, fmt, langPicker, store, toast, token } from './core.js';
import { EMBED, account, boardpassLinks, enterRoom, me, mode, phaseLabel, pub, roomCode, saveSession, timeLeft, urlCode, view } from './app.js';
import { ccc } from './player.js';

// ---------- Public view (the Wexer facing the table) ----------
export function renderPublic() {
  const v = pub;
  const app = $('#app');
  if (!v) return;
  const mid =
    v.phase === 'setup'
      ? `<span class="mid-phase">Blood on the Clocktower</span><img class="pub-qr" src="qr/${esc(roomCode())}.png" alt="QR code to join"><span>Scan to join, or go to <b>${esc(joinUrl())}</b></span><span class="muted">Waiting for the storyteller · ${v.total} players</span>`
      : v.phase === 'night'
        ? `<span class="moon"></span><span class="mid-phase">Night ${v.night}</span><span class="muted">Everyone, close your eyes</span>`
        : v.phase === 'day'
          ? `<span class="mid-phase">Day ${v.day}</span><b class="big-timer" data-timer>${fmt(timeLeft(v.timer))}</b><span class="muted">${v.alive} of ${v.total} alive · ${Math.ceil(v.alive / 2)} votes to execute</span>`
          : `<span class="mid-phase">${phaseLabel(v)}</span>`;
  app.innerHTML = `<div class="pub">
    <div class="pub-top"><span class="pub-script">${v.script?.logo ? `<img src="${esc(v.script.logo)}" alt="">` : ''}${esc(v.script?.name || '')}</span>
      <span class="grow"></span>
      <span class="pub-code">Join: <b>${esc(roomCode())}</b></span>
      <button class="btn small" data-act="settings">⚙ Style</button>
      <button class="btn small" data-act="login">🔑 Storyteller</button>
      ${EMBED ? `<button class="btn small" data-act="leave-room">⇄ Other game</button><button class="btn small" data-act="close">✕ Close</button>` : `<button class="btn small" data-act="leave-room">✕ Leave</button>`}
    </div>
    <div class="square pub-square" data-square>${v.seats
      .map((s) => `<div class="seat ${s.dead ? 'dead' : ''}">${v.reveal ? token(s.role, { align: s.align }) : `<span class="tk blank"></span>`}${s.dead ? `<span class="shroud ${s.ghost ? '' : 'voted'}"></span>` : ''}<span class="seat-name">${esc(s.name)}</span>${v.reveal && s.shown ? `<span class="seat-note">thought: ${esc(s.shown.name)}</span>` : ''}</div>`)
      .join('')}<div class="square-mid">${mid}</div></div>
    ${ccc()}
  </div>`;
  layoutSquares();
}

export const joinUrl = () => `${location.host}${BASE}?code=${roomCode()}`;

// inside a venue screen without a keyboard (the Wexer): type a game code on a letter pad
const PAD = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let padCode = '';
function renderScreenHome() {
  $('#app').innerHTML = `<div class="home pad screen-home">
    <div class="screen-home-head"><h1 class="h home-title">Blood on the Clocktower</h1><button class="btn small" data-act="close">✕ Close</button></div>
    <p class="muted">The storyteller starts the game on their phone. Type its game code here to show the table: the town square, the join QR code and the day timer.</p>
    <div class="code-box" id="pad-code">${esc(padCode) || '<span class="muted">·····</span>'}</div>
    <div class="code-pad">${[...PAD].map((c) => `<button class="btn" data-pad="${c}">${c}</button>`).join('')}<button class="btn" data-pad="back">⌫</button><button class="btn primary" data-pad="ok" ${padCode.length >= 4 ? '' : 'disabled'}>Show</button></div>
    ${ccc()}
  </div>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pad]');
  if (!b || mode !== 'home') return;
  const k = b.dataset.pad;
  if (k === 'back') padCode = padCode.slice(0, -1);
  else if (k === 'ok') {
    const res = await call('room:watch', { code: padCode });
    if (!res?.ok) return toast(res?.error || 'No game with that code');
    padCode = '';
    saveSession({ code: res.code, role: 'watch' });
    return enterRoom(res);
  } else if (padCode.length < 6) padCode += k;
  renderScreenHome();
});

export function renderHome() {
  if (EMBED) return renderScreenHome();
  const code = urlCode || '';
  $('#app').innerHTML = `<div class="home pad">
    ${boardpassLinks()}
    <div class="tk-back huge"></div>
    <h1 class="h home-title">Blood on the Clocktower</h1>
    <p class="muted">For a game in person, around one table: your phone is your token, notes and chats.</p>
    ${langPicker()}
    <form class="home-card" id="join-form">
      <h2 class="h">Join a game</h2>
      <label>Game code<input id="join-code" maxlength="6" autocomplete="off" autocapitalize="characters" value="${esc(code)}" placeholder="ABCDE" required></label>
      ${account
        ? `<p class="muted small">Playing as <b>${esc(account.username)}</b></p>`
        : `<label>Your name<input id="join-name" maxlength="24" autocomplete="nickname" value="${esc(store.get('botc-name') || '')}" required></label>`}
      <button class="btn primary big" type="submit">Join</button>
    </form>
    <div class="home-card">
      <h2 class="h">Tell the story</h2>
      <p class="muted small">Start a new game as the storyteller. You get a code for the players.</p>
      <button class="btn primary" data-act="create">🕯️ Start a new game</button>
      <details><summary>Already the storyteller on another device?</summary>
        <form class="stack" id="st-form"><label>Game code<input id="st-room" maxlength="6" autocomplete="off" autocapitalize="characters" value="${esc(code)}" required></label>
        <label>Storyteller code<input id="st-code" maxlength="6" inputmode="numeric" autocomplete="off" required></label>
        <button class="btn" type="submit">Open the grimoire</button></form>
      </details>
    </div>
    <form class="home-card" id="watch-form">
      <h2 class="h">Table view</h2>
      <p class="muted small">For a TV or laptop at the table: the town square and the day timer, no secrets.</p>
      <label>Game code<input id="watch-code" maxlength="6" autocomplete="off" autocapitalize="characters" value="${esc(code)}" required></label>
      <button class="btn" type="submit">Show the table</button>
    </form>
    ${ccc()}
  </div>`;
}
export function renderWaiting() {
  const v = me || pub;
  const setup = v?.phase === 'setup';
  $('#app').innerHTML = `<div class="center pad"><div class="tk-back huge"></div><h1 class="h">Blood on the Clocktower</h1>
    <p>Game <b>${esc(roomCode())}</b> · ${setup ? `the storyteller is setting up · ${v.total} ${v.total === 1 ? 'player' : 'players'} so far.` : 'a game is running. You can join the next one.'}</p>
    ${setup ? `<button class="btn primary big" data-act="join">🩸 Join this game</button>` : ''}
    <button class="btn" data-act="settings">⚙ Style</button>
    <button class="btn" data-act="login">🔑 I'm the storyteller</button>
    <button class="btn" data-act="leave-room">✕ Leave this room</button></div>`;
}

// Town square: seats on an oval, wide in landscape and tall in portrait
// unit vector from a seat to the middle of the town square (reminder tokens stack that way)
function inward(el, dx, dy) {
  const l = Math.hypot(dx, dy) || 1;
  el.style.setProperty('--ux', (dx / l).toFixed(3));
  el.style.setProperty('--uy', (dy / l).toFixed(3));
}
export function layoutSquares() {
  document.querySelectorAll('[data-square]').forEach((sq) => {
    const seats = [...sq.querySelectorAll('.seat')];
    const n = seats.length;
    const w = sq.clientWidth;
    const h = sq.clientHeight;
    if (!n || !w) return;
    const size = Math.max(44, Math.min(n <= 6 ? 0.24 : n <= 9 ? 0.2 : n <= 12 ? 0.17 : 0.14, 0.3) * Math.min(w, h) * (w > h ? 1.15 : 1));
    sq.style.setProperty('--tk', `${Math.min(size, 150)}px`);
    const shape = view()?.layout === 'table' ? 'table' : 'circle';
    sq.dataset.shape = shape;
    if (shape === 'circle') {
      seats.forEach((el, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        el.style.left = `${50 + 41 * Math.cos(a)}%`;
        el.style.top = `${50 + 40 * Math.sin(a)}%`;
        inward(el, -0.41 * w * Math.cos(a), -0.4 * h * Math.sin(a));
      });
      return;
    }
    // a long table along the longer side of the screen; seats spread evenly around its edge, clockwise from the top
    const wide = w >= h;
    const A = (wide ? 0.42 : 0.3) * w; // half width in px
    const B = (wide ? 0.27 : 0.42) * h; // half height in px
    sq.style.setProperty('--tbl-x', `${((0.5 - (A / w) * 0.62) * 100).toFixed(1)}%`);
    sq.style.setProperty('--tbl-y', `${((0.5 - (B / h) * 0.62) * 100).toFixed(1)}%`);
    const P = 4 * (A + B);
    seats.forEach((el, i) => {
      let d = (P * i) / n + A; // start at the middle of the top edge... shifted so seat 0 is top-left of centre
      d = (d - A + P) % P;
      let x, y;
      if (d < A) [x, y] = [d, -B];
      else if ((d -= A) < 2 * B) [x, y] = [A, -B + d];
      else if ((d -= 2 * B) < 2 * A) [x, y] = [A - d, B];
      else if ((d -= 2 * A) < 2 * B) [x, y] = [-A, B - d];
      else [x, y] = [-A + (d - 2 * B), -B];
      el.style.left = `${50 + (x / w) * 100}%`;
      el.style.top = `${50 + (y / h) * 100}%`;
      inward(el, -x, -y);
    });
  });
}
window.addEventListener('resize', layoutSquares);
