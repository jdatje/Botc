// Blood on the Clocktower table helper. One page, four ways:
//  - start page: create a game (storyteller), join one (code + name), or open a table view
//  - a player's phone: token, town square, chats, notes, script, rules
//  - the storyteller (phone, tablet or laptop): setup, grimoire, night order, chats, notes
//  - a table view for a TV or laptop facing the table: day timer and town square
// Character data and icons: The Pandemonium Institute's toolmaker resources.
import { RULES } from './rules.js';
import { setupRules, fmtNeed, MULTI, NOT_DEALT, TEAMS4 } from './setup.js';

// works at the site root and under a sub path (e.g. /botc/)
const BASE = location.pathname.replace(/[^/]*$/, '');
const socket = io({ path: `${BASE}socket.io`, transports: ['websocket', 'polling'], tryAllTransports: true });
// test mode: ?dev=<slot> gives this frame its own storage, so several "devices" fit in one browser
const DEV = (new URLSearchParams(location.search).get('dev') || '').replace(/[^a-z0-9]/gi, '').slice(0, 8);
const DEVGRID = new URLSearchParams(location.search).get('devgrid') === '1';
const pre = DEV ? `dev:${DEV}:` : '';
const store = {
  get: (k) => { try { return localStorage.getItem(pre + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(pre + k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(pre + k); } catch {} },
};
const call = (ev, p = {}) => new Promise((res) => socket.timeout(15000).emit(ev, p, (err, r) => res(err ? null : r)));
const $ = (s, el = document) => el.querySelector(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const osk = '';

// ---------- Styles (per device and per role) ----------
const STYLES = [
  { id: 'gothic', label: 'Gothic', desc: 'Dark wood and gold' },
  { id: 'parchment', label: 'Parchment', desc: 'Light paper, ink and wax' },
  { id: 'bloodmoon', label: 'Blood Moon', desc: 'Black and crimson' },
  { id: 'ravenswood', label: 'Ravenswood', desc: 'Forest green and bone' },
  { id: 'midnight', label: 'Midnight', desc: 'Dim navy, easy on the eyes at night' },
  { id: 'candlelight', label: 'Candlelight', desc: 'Warm amber glow' },
];
const styleKey = () => `botc-style-${mode === 'public' ? 'screen' : mode === 'st' ? 'st' : 'player'}`;
function applyStyle() {
  const s = store.get(styleKey()) || (mode === 'public' ? 'candlelight' : mode === 'st' ? 'midnight' : 'gothic');
  document.documentElement.dataset.style = STYLES.some((x) => x.id === s) ? s : 'gothic';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  $('meta[name="theme-color"]')?.setAttribute('content', bg || '#120d0b');
}

// ---------- State ----------
let mode = 'loading'; // loading | home | waiting | player | st | public
let pub = null; // public view
let me = null; // player view
let st = null; // storyteller view
let chats = {}; // partner id -> messages
let ptab = 'token';
let stab = 'grim';
let thread = null; // open chat
let offset = 0; // server clock - our clock
let roomPlayers = [];
let done = new Set(); // night order items ticked off
// this device's seat at a game: { code, role: 'player' | 'st' | 'watch', playerId, name, token }
let session = (() => {
  try { return JSON.parse(store.get('botc-session') || 'null'); } catch { return null; }
})();
const saveSession = (s) => {
  session = s;
  if (s) store.set('botc-session', JSON.stringify(s));
  else store.del('botc-session');
};
let myId = session?.playerId || null;
let stCode = null; // the storyteller code, for a second storyteller device
const params = new URLSearchParams(location.search);
const urlCode = (params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// links from a venue screen (the Wexer): ?code=X&name=Anna joins straight away,
// ?code=X&watch=1 opens the table view; ?embed=1 = inside the venue's screen (a Close button)
const urlName = (params.get('name') || '').trim().slice(0, 24);
const urlWatch = params.get('watch') === '1';
const EMBED = params.get('embed') === '1';
const cleanUrl = () => history.replaceState(null, '', EMBED ? `${BASE}?embed=1` : DEV ? `${BASE}?dev=${DEV}` : DEVGRID ? `${BASE}?devgrid=1` : BASE);
const roomCode = () => session?.code || '';

const view = () => (mode === 'st' ? st : mode === 'player' ? me : pub);
const meChatId = () => (mode === 'st' ? 'st' : myId);

// ---------- Connect ----------
async function hello() {
  // test mode: a frame playing a test player (storyteller token + a name added by hand)
  const devPlayer = DEV && params.get('devplayer');
  if (devPlayer || session?.devToken) {
    const want = devPlayer ? { code: urlCode, token: params.get('devtoken'), playerId: devPlayer } : { code: session.code, token: session.devToken, playerId: session.playerId };
    const res = await call('room:dev', want);
    if (res?.ok) {
      saveSession({ code: res.code, role: 'player', playerId: res.playerId, name: res.name, devToken: want.token });
      cleanUrl();
      return enterRoom(res);
    }
    saveSession(null);
    toast(res?.error || 'Test player not available');
    return setMode('home');
  }
  // a link that says who you are (venue screen): join or watch right away. A table view
  // link always opens the table view, never a grimoire left open on that screen.
  const sameName = session?.role === 'player' && session.name && session.name.toLowerCase() === urlName.toLowerCase();
  if (urlCode && (urlWatch || urlName) && !(session?.code === urlCode && (urlWatch ? session.role === 'watch' : sameName || session.role === 'st'))) {
    const res = urlWatch ? await call('room:watch', { code: urlCode }) : await call('room:join', { code: urlCode, name: urlName });
    if (res?.ok) {
      saveSession(urlWatch ? { code: res.code, role: 'watch' } : { code: res.code, role: 'player', playerId: res.playerId, name: res.name });
      cleanUrl();
      return enterRoom(res);
    }
    toast(res?.error || 'Could not join');
  }
  // a join link for another game than the one this device is in: offer that one
  if (!session || (urlCode && urlCode !== session.code && session.role !== 'st')) {
    if (session && urlCode && urlCode !== session.code) saveSession(null);
    return setMode('home');
  }
  const res = await call('room:hello', { code: session.code, token: session.token, playerId: session.playerId });
  if (!res) return;
  if (!res.ok) {
    saveSession(null);
    toast(res.error || 'That game is gone');
    return setMode('home');
  }
  enterRoom(res);
}
socket.on('connect', hello);

// ---------- Boardpass sign-in (when the server has it on) ----------
let account = null; // { username } when signed in with Boardpass
let boardpassUrl = ''; // Boardpass itself: the game picker and the account page
const boardpassLink = (path) => (boardpassUrl ? new URL(path, boardpassUrl).toString() : '');
// "← All games" and the account page, only when sign-in is on
function boardpassLinks(cls = '') {
  if (!boardpassUrl) return '';
  return `<nav class="bp-links ${cls}"><a href="${esc(boardpassLink('/'))}">← All games</a>${account ? `<a href="${esc(boardpassLink('/account'))}">${esc(account.username)} · Boardpass account</a>` : ''}</nav>`;
}
fetch(`${BASE}me`, { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : null))
  .then((r) => {
    account = r?.user || null;
    boardpassUrl = r?.boardpassUrl || '';
    if (mode === 'home') render();
  })
  .catch(() => {});
// the session ended (signed out elsewhere, password reset): the page sends you to the login
socket.on('auth:revoked', () => location.reload());
socket.on('connect_error', (err) => {
  if (err?.message === 'login_required') location.reload();
});
// the server only kicks a socket when its sign-in ended; it won't reconnect by itself
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') location.reload();
});

// put a room:* answer on screen
function enterRoom(res) {
  pub = res.pub;
  stCode = res.stCode || stCode;
  chats = res.chats || {};
  if (res.st) {
    st = res.st;
    return setMode('st');
  }
  if (session?.token && !session.devToken) saveSession({ ...session, token: null, role: session.playerId ? 'player' : 'watch' });
  if (session?.role === 'player' && res.me) {
    me = res.me;
    myId = session.playerId;
    return setMode(me.me ? 'player' : 'waiting');
  }
  setMode('public');
}

function setMode(m) {
  const changed = m !== mode;
  mode = m;
  applyStyle();
  if (changed) {
    thread = null;
    if (m === 'st' && st) stab = st.phase === 'setup' ? 'setup' : st.phase === 'night' ? 'night' : 'grim';
    if (m === 'st' && st?.phase === 'setup') loadRoomPlayers();
  }
  render(true);
}

const sync = (t) => {
  if (t?.timer) offset = t.timer.now - Date.now();
};
socket.on('botc:pub', (v) => {
  sync(v);
  const was = pub?.timer?.left;
  pub = v;
  if (mode === 'public' || mode === 'waiting') render();
});
socket.on('botc:me', (v) => {
  sync(v);
  me = v;
  if (mode === 'waiting' && v.me) return setMode('player');
  if (mode === 'player' && !v.me) return setMode('waiting');
  if (mode === 'player') render();
});
socket.on('botc:st', (v) => {
  sync(v);
  const prevNight = st?.night;
  const prevPhase = st?.phase;
  st = v;
  if (prevNight !== v.night) done = new Set();
  if (mode !== 'st') return;
  if (prevPhase !== v.phase) {
    if (v.phase === 'night') stab = 'night';
    if (v.phase === 'day') stab = 'grim';
    if (v.phase === 'setup') {
      stab = 'setup';
      loadRoomPlayers();
    }
  }
  render();
});
socket.on('botc:stNotes', (text) => {
  if (st) st.stNotes = text;
  const ta = $('#st-notes');
  if (ta && document.activeElement !== ta) ta.value = text;
});
socket.on('botc:msg', (m) => {
  const mine = meChatId();
  const other = m.from === mine ? m.to : m.from;
  (chats[other] ||= []).push(m);
  if (m.from !== mine) {
    try { navigator.vibrate?.([120, 60, 120]); } catch {}
    const open = thread === other && ((mode === 'player' && ptab === 'chats') || (mode === 'st' && stab === 'chats'));
    if (open) markRead(other);
    else toast(`💬 ${nameOf(other)}: ${m.text.slice(0, 60)}`);
  }
  render();
});

// ---------- Helpers ----------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}
const TEAMS = [
  ['townsfolk', 'Townsfolk'],
  ['outsider', 'Outsiders'],
  ['minion', 'Minions'],
  ['demon', 'Demons'],
  ['traveller', 'Travellers'],
  ['fabled', 'Fabled'],
  ['loric', 'Loric'],
];
const isEvilTeam = (t) => t === 'minion' || t === 'demon';
const iconOf = (r, align) => (r ? r.icon?.[align || (isEvilTeam(r.team) ? 'evil' : 'good')] : null);
function token(r, { align, size = '', label = true, cls = '' } = {}) {
  if (!r) return `<span class="tk empty ${size} ${cls}"><span class="tk-name">?</span></span>`;
  const n = r.name.length;
  const nf = n > 12 ? 0.074 : n > 9 ? 0.083 : n > 7 ? 0.1 : 0.12;
  return `<span class="tk ${size} ${cls}" style="--nf:${nf}"><img src="${esc(iconOf(r, align))}" alt="" loading="lazy" draggable="false">${label ? `<span class="tk-name">${esc(r.name)}</span>` : ''}</span>`;
}
const roleById = (id) => [...(view()?.script?.roles || []), ...(st?.extras || [])].find((r) => r.id === id);
function timeLeft(t) {
  if (!t) return 0;
  return t.running ? Math.max(0, t.endsAt - (Date.now() + offset)) : t.left;
}
const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function phaseLabel(v) {
  if (!v) return '';
  if (v.phase === 'setup') return 'Setting up';
  if (v.phase === 'night') return `Night ${v.night}`;
  if (v.phase === 'day') return `Day ${v.day}`;
  return v.winner ? `${v.winner === 'good' ? 'Good' : 'Evil'} wins` : 'Game over';
}
function nameOf(id) {
  if (id === 'st') return 'Storyteller';
  return (view()?.seats || []).find((s) => s.playerId === id)?.name || 'Someone';
}
const readKey = () => `botc-read-${meChatId()}`;
function readMap() {
  try { return JSON.parse(store.get(readKey()) || '{}'); } catch { return {}; }
}
function markRead(other) {
  const m = readMap();
  m[other] = Date.now() + offset + 1000;
  store.set(readKey(), JSON.stringify(m));
}
function unread(other) {
  const since = readMap()[other] || 0;
  return (chats[other] || []).filter((m) => m.from !== meChatId() && m.t > since).length;
}
const unreadTotal = () => Object.keys(chats).reduce((n, k) => n + unread(k), 0);

// ---------- Render ----------
let lastBody = '';
function render(force) {
  if (DEVGRID) return renderDevGrid();
  const app = $('#app');
  app.className = `mode-${mode} phase-${view()?.phase || 'none'}`;
  if (mode === 'loading') return (app.innerHTML = '<div class="center muted">Connecting…</div>');
  if (mode === 'public') return renderPublic();
  if (mode === 'home') return renderHome();
  if (mode === 'waiting') return renderWaiting();
  const tabs = mode === 'st' ? ST_TABS : P_TABS;
  const cur = mode === 'st' ? stab : ptab;
  const key = `${mode}:${cur}:${thread || ''}`;
  if (!$('#hd') || force) {
    app.innerHTML = `<header id="hd" class="hd"></header><main id="bd" class="bd"></main><nav id="nav" class="nav"></nav>`;
    lastBody = '';
  }
  $('#hd').innerHTML = mode === 'st' ? stHeader() : playerHeader();
  $('#nav').innerHTML = tabs
    .map(([id, icon, label]) => {
      const badge = id === 'chats' && unreadTotal() ? `<b class="badge">${unreadTotal()}</b>` : '';
      return `<button data-act="tab" data-tab="${id}" class="${id === cur ? 'on' : ''}"><span class="ni">${icon}</span><span>${label}</span>${badge}</button>`;
    })
    .join('');
  // keep what someone is typing: notes are only drawn when you open the tab
  if (key === lastBody && (cur === 'notes' || (cur === 'chats' && thread))) {
    if (cur === 'chats') updateThread();
    if (cur === 'notes' && mode === 'st') updateLog();
    return;
  }
  const scroll = key === lastBody ? $('#bd').scrollTop : 0;
  lastBody = key;
  const body = mode === 'st' ? ST_BODY[stab]() : P_BODY[ptab]();
  $('#bd').innerHTML = body;
  $('#bd').scrollTop = scroll;
  if (cur === 'chats' && thread) {
    markRead(thread);
    updateThread(true);
    $('#nav').innerHTML = $('#nav').innerHTML.replace(/<b class="badge">\d+<\/b>/, unreadTotal() ? `<b class="badge">${unreadTotal()}</b>` : '');
  }
  layoutSquares();
}

// ---------- Player ----------
const P_TABS = [
  ['token', '🎭', 'Token'],
  ['square', '⭕', 'Town'],
  ['chats', '💬', 'Chats'],
  ['notes', '📝', 'Notes'],
  ['script', '📜', 'Script'],
  ['rules', '📖', 'Rules'],
];
function playerHeader() {
  const v = me;
  const timer = v.phase === 'day' ? ` · <span data-timer>${fmt(timeLeft(v.timer))}</span>` : '';
  return `<div class="hd-l"><span class="small muted">${esc(v.script?.name || '')}</span><b class="hd-name">${esc(v.me?.name || '')}</b></div>
    <div class="phase-pill ${v.phase}">${v.phase === 'night' ? '🌙' : v.phase === 'day' ? '☀️' : '🕯️'} ${phaseLabel(v)}${timer}</div>
    <button class="icon-btn" data-act="settings" aria-label="Settings">⚙</button>`;
}
const P_BODY = {
  token() {
    const m = me.me;
    if (me.phase === 'setup') return `<div class="center"><div class="tk-back huge"></div><h2 class="h">Waiting for the storyteller</h2><p class="muted">You're in the game (${me.total} ${me.total === 1 ? 'player' : 'players'} so far). Your character arrives here when the game starts.</p><button class="btn small" data-act="leave">Leave this game</button></div>`;
    const r = m.role;
    const dead = m.dead
      ? `<div class="dead-note">☠ You are dead. ${m.ghost ? 'You still have your <b>ghost vote</b>: one vote for the rest of the game.' : 'You have used your ghost vote.'}</div>`
      : '';
    return `${dead}<div class="hold" data-hold>
        <div class="hold-hidden"><div class="tk-back huge"></div><p class="h">Press and hold to see your character</p><p class="muted small">Let go to hide it again. Keep your screen away from the others.</p></div>
        <div class="hold-shown">
          ${token(r, { align: m.align, size: 'huge' })}
          <p class="align ${m.align}">${m.align === 'evil' ? 'You are EVIL' : 'You are GOOD'} · ${esc(teamName(r?.team))}</p>
          <p class="ability">${esc(r?.ability || '')}</p>
        </div>
      </div>
      <button class="btn wide" data-act="tab" data-tab="script">📜 All characters on this script</button>
      ${me.reveal ? revealHtml(me) : ''}`;
  },
  square() {
    const seats = me.seats;
    if (!seats.length) return `<p class="center muted">No players yet.</p>`;
    return `<p class="hint">Tap a player to note what you think they are. Only you can see this.</p>
      <div class="square" data-square>${seats
        .map((s) => {
          const gs = me.guesses[s.id];
          const r = gs?.role ? roleById(gs.role) : null;
          const self = s.playerId === myId;
          const full = me.reveal ? s : null;
          return `<button class="seat ${s.dead ? 'dead' : ''} ${self ? 'self' : ''}" data-act="guess" data-seat="${s.id}">
            ${full?.role ? token(full.shown && full.shown.id !== full.role.id ? full.role : full.role, { align: full.align, label: true }) : self ? token(me.me.role, { align: me.me.align, cls: 'mine' }) : token(r, { label: Boolean(r), cls: r ? 'guess' : '' })}
            ${s.dead ? `<span class="shroud" title="dead"></span>` : ''}
            ${s.dead && s.ghost ? `<span class="ghost" title="ghost vote">vote</span>` : ''}
            <span class="seat-name">${esc(s.name)}${self ? ' (you)' : ''}</span>
            ${gs?.note ? `<span class="seat-note">${esc(gs.note)}</span>` : ''}
          </button>`;
        })
        .join('')}
        <div class="square-mid">${squareMid(me)}</div>
      </div>`;
  },
  chats: () => chatsBody(),
  notes() {
    return `<label class="h" for="p-notes">My notes</label>
      <p class="hint">Only you can see these. Saved automatically.</p>
      <textarea id="p-notes" class="notes" placeholder="Who claimed what, who you trust, your theories…">${esc(me.notes || '')}</textarea>`;
  },
  script: () => scriptHtml(me.script),
  rules: () => rulesHtml(),
};
const teamName = (t) => ({ townsfolk: 'Townsfolk', outsider: 'Outsider', minion: 'Minion', demon: 'Demon', traveller: 'Traveller', fabled: 'Fabled' })[t] || '';

function squareMid(v) {
  const timer = v.phase === 'day' ? `<b class="mid-timer" data-timer>${fmt(timeLeft(v.timer))}</b>` : '';
  return `<span class="mid-phase">${phaseLabel(v)}</span>${timer}<span class="small muted">${v.alive} of ${v.total} alive · ${Math.ceil(v.alive / 2)} votes to execute</span>`;
}

function scriptHtml(s) {
  if (!s) return '';
  const groups = TEAMS.map(([team, label]) => {
    const list = s.roles.filter((r) => r.team === team);
    if (!list.length) return '';
    return `<h3 class="team-h ${isEvilTeam(team) ? 'evil' : 'good'}">${label}</h3>${list
      .map((r) => `<div class="role-row">${token(r, { label: false, size: 'sm' })}<div><b>${esc(r.name)}</b><p>${esc(r.ability)}</p></div></div>`)
      .join('')}`;
  }).join('');
  const jinx = s.jinxes?.length
    ? `<h3 class="team-h">Jinxes</h3><p class="hint">Special rules when both characters are in play.</p>${s.jinxes
        .map((j) => `<div class="role-row">${token(j.a, { label: false, size: 'xs' })}${token(j.b, { label: false, size: 'xs' })}<div><b>${esc(j.a?.name)} & ${esc(j.b?.name)}</b><p>${esc(j.reason)}</p></div></div>`)
        .join('')}`
    : '';
  return `<div class="script-head">${s.logo ? `<img src="${esc(s.logo)}" alt="" class="script-logo">` : ''}<div><h2 class="h">${esc(s.name)}</h2>${s.author ? `<span class="muted small">by ${esc(s.author)}</span>` : ''}</div></div>${groups}${jinx}${ccc()}`;
}
const ccc = () => `<footer class="ccc"><img src="img/ccc.png" alt="Community Created Content"><span>Blood on the Clocktower is a product of The Pandemonium Institute. This is a free, unofficial fan-made helper.</span></footer>`;

function rulesHtml() {
  return `<h2 class="h">How it works</h2>${RULES.map((r, i) => `<details class="rule" ${i === 0 ? 'open' : ''}><summary>${esc(r.title)}</summary>${r.body}</details>`).join('')}${ccc()}`;
}

function revealHtml(v) {
  return `<h3 class="team-h">The grimoire</h3>${v.seats
    .map((s) => `<div class="role-row">${token(s.role, { align: s.align, label: false, size: 'sm' })}<div><b>${esc(s.name)}</b> — ${esc(s.role?.name || '?')}${s.shown && s.shown.id !== s.role?.id ? ` <span class="muted">(thought: ${esc(s.shown.name)})</span>` : ''} <span class="align ${s.align}">${s.align}</span>${s.dead ? ' ☠' : ''}</div></div>`)
    .join('')}`;
}

// ---------- Chats ----------
function chatPartners() {
  const v = view();
  const others = (v.seats || []).filter((s) => s.playerId && s.playerId !== myId).map((s) => ({ id: s.playerId, name: s.name, dead: s.dead }));
  return mode === 'st' ? others : [{ id: 'st', name: 'Storyteller', st: true }, ...others];
}
function locked(partner) {
  const v = view();
  if (mode === 'st') return false;
  if (partner === 'st') return v.stChatLocked;
  return v.chatLocked;
}
function chatsBody() {
  if (thread) {
    const lock = locked(thread);
    return `<div class="thread-head"><button class="btn small" data-act="thread-back">← Back</button><b>${esc(nameOf(thread))}</b></div>
      <div class="msgs" id="msgs"></div>
      <form class="send" id="send-form">
        ${lock ? `<p class="locked">🌙 Chats are locked at night</p>` : `<input id="send-text" autocomplete="off" maxlength="1000" placeholder="Message ${esc(nameOf(thread))}"${osk}><button class="btn primary" type="submit">Send</button>`}
      </form>`;
  }
  const v = view();
  const lockNote = mode !== 'st' && v.chatLocked ? `<p class="locked">🌙 Night: chats are locked${v.stChatLocked ? '' : ' (the storyteller can still be reached)'}</p>` : '';
  return `${lockNote}<p class="hint">${mode === 'st' ? 'Private chats with each player.' : 'Private: only you and the other person can read a chat.'}</p>
    <div class="chat-list">${chatPartners()
      .map((p) => {
        const list = chats[p.id] || [];
        const last = list[list.length - 1];
        const n = unread(p.id);
        return `<button class="chat-row ${p.st ? 'st' : ''}" data-act="thread" data-id="${esc(p.id)}">
          <span class="avatar">${p.st ? '🕯️' : esc(p.name[0] || '?')}</span>
          <span class="chat-mid"><b>${esc(p.name)}${p.dead ? ' ☠' : ''}</b><span class="muted small">${last ? esc((last.from === meChatId() ? 'You: ' : '') + last.text) : 'No messages yet'}</span></span>
          ${n ? `<b class="badge">${n}</b>` : ''}
        </button>`;
      })
      .join('')}</div>`;
}
function updateThread(scrollDown) {
  const box = $('#msgs');
  if (!box) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const mine = meChatId();
  box.innerHTML =
    (chats[thread] || [])
      .map((m) => `<div class="msg ${m.from === mine ? 'me' : ''}"><span>${esc(m.text)}</span><time>${new Date(m.t - offset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>`)
      .join('') || `<p class="muted center small">Say something…</p>`;
  if (scrollDown || atBottom) box.scrollTop = box.scrollHeight;
  markRead(thread);
}

// ---------- Storyteller ----------
const ST_TABS = [
  ['setup', '🛠️', 'Setup'],
  ['grim', '📕', 'Grimoire'],
  ['night', '🌙', 'Night'],
  ['chats', '💬', 'Chats'],
  ['notes', '📝', 'Notes'],
];
function stHeader() {
  const v = st;
  let ctrl = '';
  if (v.phase === 'night') ctrl = `<button class="btn small" data-act="phase" data-to="day">☀️ Start day ${v.night}</button>`;
  if (v.phase === 'day')
    ctrl = `<span class="timer-ctl"><b data-timer>${fmt(timeLeft(v.timer))}</b>
      <button class="icon-btn" data-act="timer" data-a="${v.timer.running ? 'pause' : 'start'}" aria-label="Start or pause">${v.timer.running ? '⏸' : '▶'}</button>
      <button class="icon-btn" data-act="timer" data-a="add" aria-label="One minute more">+1</button>
      <button class="icon-btn" data-act="timer" data-a="reset" aria-label="Reset">↺</button></span>
      <button class="btn small" data-act="phase" data-to="night">🌙 Night ${v.day + 1}</button>`;
  return `<div class="hd-l"><span class="small muted">Storyteller</span><b class="hd-name">${phaseLabel(v)}</b></div>
    <div class="hd-ctrl">${ctrl}<button class="btn small" data-act="cards">🃏 Show</button></div>
    ${EMBED ? `<button class="icon-btn" data-act="watch" aria-label="Table view" title="Back to the table view">⏏</button>` : ''}
    <button class="icon-btn" data-act="settings" aria-label="Settings">⚙</button>`;
}

const ST_BODY = {
  setup() {
    const v = st;
    if (v.phase === 'night' || v.phase === 'day')
      return `<h2 class="h">Game in progress</h2><p class="muted">${esc(v.script.name)} · ${v.total} players · ${phaseLabel(v)}</p>
        <div class="stack">
          <button class="btn wide good-btn" data-act="end" data-w="good">😇 Good wins (Demon dead)</button>
          <button class="btn wide evil-btn" data-act="end" data-w="evil">😈 Evil wins</button>
          <button class="btn wide" data-act="end" data-w="">Stop the game without a winner</button>
        </div>`;
    if (v.phase === 'ended')
      return `<h2 class="h">${phaseLabel(v)}</h2>
        <label class="toggle"><input type="checkbox" data-act="reveal" ${v.reveal ? 'checked' : ''}> Show the grimoire on the Wexer and phones</label>
        <button class="btn primary wide" data-act="newgame">New game with the same players</button>${revealHtml(v)}`;
    const n = v.players;
    const trav = v.seats.length - v.players;
    const c = v.counts;
    const inGame = new Set(v.seats.map((s) => s.playerId));
    const dealt = v.seats.length && v.seats.every((s) => s.role);
    const inPlayIds = [...v.seats.filter((s) => s.role && s.role.team !== 'traveller').map((s) => s.role.id), ...(v.offBag || []).map((r) => r.id)];
    const roleOf = (id) => v.script.roles.find((r) => r.id === id) || roleById(id);
    const dealtRules = dealt && n >= 5 ? setupRules(n, inPlayIds, (id) => roleOf(id)?.team, (id) => v.script.roles.some((r) => r.id === id)) : null;
    return `
      <section class="block"><h3 class="h">1 · Script</h3>
        <div class="script-chips">${v.scripts
          .map((s) => `<span class="script-chip ${s.id === v.scriptId ? 'on' : ''}"><button data-act="script" data-id="${esc(s.id)}"><img src="${esc(s.logo)}" alt=""><span>${esc(s.name)}<small>${s.count} characters</small></span></button>${s.builtIn ? '' : `<button class="x" data-act="delscript" data-id="${esc(s.id)}" aria-label="Delete">×</button>`}</span>`)
          .join('')}</div>
        <button class="btn small" data-act="import">⬆️ Import a script (JSON)</button>
      </section>
      <section class="block"><h3 class="h">2 · Players <span class="muted small">(${n}${trav ? ` + ${trav} Traveller${trav === 1 ? '' : 's'}` : ''})</span></h3>
        <div class="share"><img src="qr/${esc(roomCode())}.png" alt="QR code to join" class="share-qr"><p>Players scan this or go to <b>${esc(joinUrl())}</b> and use code <b class="big-code">${esc(roomCode())}</b>. Everyone who joins shows up here; tick who plays.</p></div>
        <div class="chips">${roomPlayers
          .map((p) => `<button class="chip ${inGame.has(p.id) ? 'on' : ''}" data-act="pick-player" data-id="${esc(p.id)}">${inGame.has(p.id) ? '✓ ' : ''}${esc(p.name)}${p.online || p.manual ? '' : ' 💤'}</button>`)
          .join('') || '<span class="muted">Nobody joined yet.</span>'}</div>
        <form class="inline-form" id="add-name"><input id="add-name-in" placeholder="Add a name (no phone)" maxlength="24" autocomplete="off"${osk}><button class="btn small" type="submit">Add</button><button class="btn small" type="button" data-act="refresh-players">↻</button></form>
        ${n ? `<h4 class="sub">Seating, clockwise around the table</h4>
        <ol class="seat-list">${v.seats
          .map((s, i) => `<li><span class="seat-i">${i + 1}</span><b>${esc(s.name)}</b>${s.role ? `<span class="muted small">${esc(s.role.name)}${s.shown ? ` (sees ${esc(s.shown.name)})` : ''}</span>` : ''}<span class="grow"></span><button class="icon-btn" data-act="move" data-seat="${s.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" data-act="move" data-seat="${s.id}" data-dir="1" ${i === n - 1 ? 'disabled' : ''}>↓</button></li>`)
          .join('')}</ol>
        <button class="btn small" data-act="shuffle-seats">🔀 Shuffle seats</button>` : ''}
      </section>
      <section class="block"><h3 class="h">3 · Characters</h3>
        ${n < 5 ? '<p class="muted">You need at least 5 players.</p>' : `<p class="counts"><b>${n} players:</b> <span class="good">${c.townsfolk} Townsfolk</span> · <span class="good">${c.outsider} Outsider${c.outsider === 1 ? '' : 's'}</span> · <span class="evil">${c.minion} Minion${c.minion === 1 ? '' : 's'}</span> · <span class="evil">${c.demon} Demon</span></p>
        ${n > 15 ? '<p class="hint">More than 15 players: the official setup stops at 15, so the rest should be Travellers.</p>' : ''}
        ${trav ? `<p class="hint">Travellers don't count here and keep their character when dealing.</p>` : ''}
        ${dealtRules ? `<h4 class="sub">In play now</h4>${setupCounter(dealtRules, (id) => roleOf(id)?.name || id, inPlayIds)}` : ''}
        ${v.offBag?.length ? `<p class="hint">Also in play without a player: ${v.offBag.map((r) => esc(r.name)).join(', ')}</p>` : ''}
        <div class="row"><button class="btn" data-act="random-roles">🎲 Random characters</button><button class="btn" data-act="choose-roles">✋ Choose characters</button></div>
        ${dealt ? `<p class="hint">Dealt. Tap a player in the Grimoire to change a character. A Drunk automatically sees a Townsfolk that's not in play.</p>` : ''}`}
      </section>
      <section class="block"><h3 class="h">4 · Demon bluffs</h3>
        <div class="row">${v.bluffs.map((r) => token(r, { size: 'sm' })).join('') || '<span class="muted">None yet</span>'}</div>
        <div class="row"><button class="btn small" data-act="random-bluffs" ${dealt ? '' : 'disabled'}>🎲 Random bluffs</button><button class="btn small" data-act="pick-bluffs" ${dealt ? '' : 'disabled'}>✋ Choose</button></div>
      </section>
      <button class="btn primary wide big" data-act="start" ${dealt ? '' : 'disabled'}>🌙 Start the game (first night)</button>`;
  },
  grim() {
    const v = st;
    if (!v.seats.length) return `<p class="center muted">No players yet. Start in Setup.</p>`;
    return `<div class="square grim" data-square>${v.seats
      .map((s) => {
        const marker = s.role?.team === 'demon' ? '<span class="marker demon">DEMON</span>' : s.role?.team === 'minion' ? '<span class="marker minion">MINION</span>' : s.align === 'evil' ? '<span class="marker minion">EVIL</span>' : '';
        return `<button class="seat ${s.dead ? 'dead' : ''}" data-act="seat" data-seat="${s.id}">
          ${token(s.role, { align: s.align })}
          ${marker}
          ${s.dead ? `<span class="shroud"></span>` : ''}
          ${s.dead && s.ghost ? `<span class="ghost">vote</span>` : ''}
          <span class="seat-name">${esc(s.name)}</span>
          ${s.shown ? `<span class="seat-note">sees ${esc(s.shown.name)}</span>` : ''}
          ${s.reminders.length ? `<span class="rems">${s.reminders.map((r) => `<span class="rem">${esc(r.label)}</span>`).join('')}</span>` : ''}
        </button>`;
      })
      .join('')}
      <div class="square-mid">${squareMid(v)}
        <button class="bluffs" data-act="pick-bluffs" aria-label="Demon bluffs">${v.bluffs.length ? v.bluffs.map((r) => token(r, { size: 'xs', label: false })).join('') : '<span class="small">+ bluffs</span>'}</button>
      </div>
    </div>`;
  },
  night() {
    const v = st;
    if (!v.nightOrder) return `<div class="center"><p class="h">🌙</p><p class="muted">The night order shows up here at night, with only the characters in play.</p></div>`;
    const list = v.nightOrder.list;
    return `<h2 class="h">${v.nightOrder.first ? 'First night' : `Night ${v.night}`}</h2><p class="hint">Tap a step when it's done.</p>
      <ol class="night">${list
        .map((it) => {
          const k = `${v.night}:${it.id}`;
          const dead = it.seats.length && it.seats.every((s) => s.dead);
          return `<li class="${done.has(k) ? 'done' : ''} ${dead ? 'all-dead' : ''} ${it.special ? 'special' : ''}" data-act="nightdone" data-k="${esc(k)}">
            ${it.special ? `<span class="tk sm special-tk">${it.id === 'dusk' ? '🌆' : it.id === 'dawn' ? '🌅' : it.id === 'demoninfo' ? '😈' : '👹'}</span>` : token({ name: it.name, icon: it.icon, team: it.team }, { size: 'sm', label: false })}
            <div><b>${esc(it.name)}</b>${it.seats.length ? ` <span class="who">${it.seats.map((s) => `${esc(s.name)}${s.really ? ` (really ${esc(s.really)})` : ''}${s.dead ? ' ☠' : ''}`).join(', ')}</span>` : ''}
            <p>${esc(it.text).replace(/:reminder:/g, '<span class="rem-ico">◉</span>').replace(/\*([^*]+)\*/g, '<b>$1</b>')}</p></div>
          </li>`;
        })
        .join('')}</ol>`;
  },
  chats: () => chatsBody(),
  notes() {
    return `<label class="h" for="st-notes">Storyteller notes</label>
      <textarea id="st-notes" class="notes"${osk}>${esc(st.stNotes || '')}</textarea>
      <h3 class="h">Game log</h3>
      <form class="inline-form" id="log-form"><input id="log-in" placeholder="Add to the log" maxlength="300" autocomplete="off"${osk}><button class="btn small" type="submit">Add</button></form>
      <ol class="log" id="log">${logItems()}</ol>`;
  },
};
const logItems = () =>
  st.log
    .slice()
    .reverse()
    .map((l) => `<li><span class="muted small">${esc(l.phase)} · ${new Date(l.t - offset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> ${esc(l.text)}</li>`)
    .join('');
function updateLog() {
  const el = $('#log');
  if (el) el.innerHTML = logItems();
}

// ---------- Test mode: the grimoire, the table view and every test player side by side ----------
let gridKey = '';
async function renderDevGrid() {
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
function openTestMode() {
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

async function loadRoomPlayers() {
  roomPlayers = (await call('botc:roomPlayers')) || [];
  if (mode === 'st' && stab === 'setup') render();
}

// ---------- Public view (the Wexer facing the table) ----------
function renderPublic() {
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
      .map((s) => `<div class="seat ${s.dead ? 'dead' : ''}">${v.reveal ? token(s.role, { align: s.align }) : `<span class="tk blank"></span>`}${s.dead ? '<span class="shroud"></span>' : ''}${s.dead && s.ghost ? '<span class="ghost">vote</span>' : ''}<span class="seat-name">${esc(s.name)}</span>${v.reveal && s.shown ? `<span class="seat-note">thought: ${esc(s.shown.name)}</span>` : ''}</div>`)
      .join('')}<div class="square-mid">${mid}</div></div>
    ${ccc()}
  </div>`;
  layoutSquares();
}

const joinUrl = () => `${location.host}${BASE}?code=${roomCode()}`;

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

function renderHome() {
  if (EMBED) return renderScreenHome();
  const code = urlCode || '';
  $('#app').innerHTML = `<div class="home pad">
    ${boardpassLinks()}
    <div class="tk-back huge"></div>
    <h1 class="h home-title">Blood on the Clocktower</h1>
    <p class="muted">For a game in person, around one table: your phone is your token, notes and chats.</p>
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
function renderWaiting() {
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
function layoutSquares() {
  document.querySelectorAll('[data-square]').forEach((sq) => {
    const seats = [...sq.querySelectorAll('.seat')];
    const n = seats.length;
    const w = sq.clientWidth;
    const h = sq.clientHeight;
    if (!n || !w) return;
    const size = Math.max(44, Math.min(n <= 6 ? 0.24 : n <= 9 ? 0.2 : n <= 12 ? 0.17 : 0.14, 0.3) * Math.min(w, h) * (w > h ? 1.15 : 1));
    sq.style.setProperty('--tk', `${Math.min(size, 150)}px`);
    seats.forEach((el, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      el.style.left = `${50 + 41 * Math.cos(a)}%`;
      el.style.top = `${50 + 40 * Math.sin(a)}%`;
    });
  });
}
window.addEventListener('resize', layoutSquares);

// ---------- Sheets ----------
let sheetHandler = null;
function openSheet(html, onClick, cls = '') {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet ${cls}"><button class="sheet-x" data-sheet="close" aria-label="Close">×</button>${html}</div>`;
  s.hidden = false;
  sheetHandler = onClick;
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
  sheetHandler = null;
}
$('#sheet').addEventListener('click', (e) => {
  if (e.target.id === 'sheet' || e.target.closest('[data-sheet="close"]')) return closeSheet();
  sheetHandler?.(e);
});

function rolePicker(list, { selected = [], multi = false, title = 'Choose a character', extra = '' } = {}) {
  const groups = TEAMS.map(([team, label]) => {
    const rs = list.filter((r) => r.team === team);
    if (!rs.length) return '';
    return `<h4 class="team-h ${isEvilTeam(team) ? 'evil' : 'good'}">${label}</h4><div class="pick-grid">${rs
      .map((r) => `<button class="pick ${selected.includes(r.id) ? 'on' : ''}" data-role="${esc(r.id)}">${token(r, { size: 'sm' })}</button>`)
      .join('')}</div>`;
  }).join('');
  return `<h2 class="h">${esc(title)}</h2>${extra}${groups}${multi ? '' : ''}`;
}

function confirmSheet(text, ok = 'Yes') {
  return new Promise((resolve) => {
    openSheet(`<h2 class="h">${esc(text)}</h2><div class="row"><button class="btn" data-c="0">Cancel</button><button class="btn primary" data-c="1">${esc(ok)}</button></div>`, (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      closeSheet();
      resolve(b.dataset.c === '1');
    }, 'narrow');
  });
}

// PIN pad (works on the Wexer without a keyboard)
function askPin() {
  return new Promise((resolve) => {
    let pin = '';
    const draw = () => {
      $('#pin-dots').textContent = pin ? '•'.repeat(pin.length) : '—';
    };
    openSheet(
      `<h2 class="h">Storyteller code</h2><div class="pin-dots" id="pin-dots">—</div>
       <div class="pin-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="btn" data-n="${n}">${n}</button>`).join('')}<button class="btn" data-x="back">⌫</button><button class="btn" data-n="0">0</button><button class="btn primary" data-x="ok">OK</button></div>`,
      (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.n && pin.length < 8) pin += b.dataset.n;
        if (b.dataset.x === 'back') pin = pin.slice(0, -1);
        if (b.dataset.x === 'ok') {
          closeSheet();
          return resolve(pin);
        }
        draw();
      },
      'narrow'
    );
  });
}

// ---------- Info cards ("Show to player") ----------
const CARDS = ['This is the Demon', 'These are your minions', 'These characters are not in play', 'You are', 'This player is', 'This character selected you', 'You are poisoned', 'Use your ability?', 'Did you nominate today?', 'Did you vote today?', 'Make a choice'];
function showCard(text, roles = [], align) {
  const el = $('#show');
  el.innerHTML = `<div class="show-in"><p class="show-text">${esc(text)}</p><div class="show-tokens">${roles.map((r) => token(r, { align, size: 'huge' })).join('')}</div><p class="muted small">Tap to close</p></div>`;
  el.hidden = false;
}
$('#show').addEventListener('click', () => ($('#show').hidden = true));

function openCards() {
  let text = CARDS[0];
  let picked = [];
  const all = [...st.script.roles, ...st.extras];
  const draw = () =>
    openSheet(
      `<h2 class="h">Show a card</h2>
       <div class="row"><button class="btn" data-quick="bluffs" ${st.bluffs.length ? '' : 'disabled'}>😈 Show the bluffs</button></div>
       <div class="chips">${CARDS.map((c) => `<button class="chip ${c === text ? 'on' : ''}" data-card="${esc(c)}">${esc(c)}</button>`).join('')}</div>
       <p class="hint">Add characters to show with it (optional):</p>
       <div class="row">${picked.map((id) => token(all.find((r) => r.id === id), { size: 'sm' })).join('') || '<span class="muted small">none</span>'}</div>
       <button class="btn primary wide" data-go="1">Show full screen</button>
       ${rolePicker(st.script.roles, { selected: picked, title: 'Characters' })}`,
      (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.quick === 'bluffs') {
          closeSheet();
          return showCard('These characters are not in play', st.bluffs);
        }
        if (b.dataset.card) text = b.dataset.card;
        if (b.dataset.role) picked = picked.includes(b.dataset.role) ? picked.filter((x) => x !== b.dataset.role) : [...picked, b.dataset.role].slice(-4);
        if (b.dataset.go) {
          closeSheet();
          return showCard(text, picked.map((id) => all.find((r) => r.id === id)));
        }
        draw();
      }
    );
  draw();
}

// ---------- Seat sheet (storyteller) ----------
function openSeat(seatId) {
  const s = st.seats.find((x) => x.id === seatId);
  if (!s) return;
  const inPlay = st.seats.map((x) => x.role).filter(Boolean);
  const reminderOptions = [...new Map(inPlay.flatMap((r) => (r.reminders || []).map((label) => [`${r.id}:${label}`, { role: r, label }]))).values()];
  openSheet(
    `<div class="seat-head">${token(s.role, { align: s.align, size: 'lg' })}<div><h2 class="h">${esc(s.name)}</h2>
       <p>${esc(s.role?.name || 'No character')} · <span class="align ${s.align}">${s.align}</span>${s.shown ? ` · sees <b>${esc(s.shown.name)}</b>` : ''}</p>
       <p class="small muted">${esc(s.role?.ability || '')}</p></div></div>
     <div class="grid2">
       <button class="btn" data-a="dead">${s.dead ? '❤️ Make alive' : '☠ Dies'}</button>
       <button class="btn" data-a="ghost" ${s.dead ? '' : 'disabled'}>${s.ghost ? '🗳 Used ghost vote' : '🗳 Give ghost vote back'}</button>
       <button class="btn" data-a="role">🎭 Change character</button>
       <button class="btn" data-a="shown">👁 Change what they see</button>
       <button class="btn" data-a="align">⚖️ Make ${s.align === 'good' ? 'evil' : 'good'}</button>
       <button class="btn" data-a="showme">🃏 Show "You are"</button>
     </div>
     <h3 class="h">Reminders</h3>
     <div class="chips">${s.reminders.map((r, i) => `<button class="chip on" data-rm="${i}">${esc(r.label)} ×</button>`).join('') || '<span class="muted small">none</span>'}</div>
     <div class="chips">${reminderOptions.map((o, i) => `<button class="chip" data-add="${i}">${esc(o.role.name)}: ${esc(o.label)}</button>`).join('')}
       ${['Poisoned', 'Drunk', 'Protected', 'Died today', 'Executed', 'No ability'].map((l) => `<button class="chip" data-addg="${esc(l)}">${esc(l)}</button>`).join('')}</div>`,
    async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const patch = (p) => call('botc:seat', { seatId, patch: p });
      if (b.dataset.a === 'dead') await patch({ dead: !s.dead });
      if (b.dataset.a === 'ghost') await patch({ ghost: !s.ghost });
      if (b.dataset.a === 'align') await patch({ align: s.align === 'good' ? 'evil' : 'good' });
      if (b.dataset.a === 'showme') {
        closeSheet();
        return showCard('You are', [s.shown || s.role], s.shown ? undefined : s.align);
      }
      if (b.dataset.a === 'role' || b.dataset.a === 'shown') {
        const which = b.dataset.a;
        const list = [...st.script.roles, ...st.extras];
        openSheet(
          rolePicker(list, {
            selected: [which === 'role' ? s.role?.id : s.shown?.id],
            title: which === 'role' ? `${s.name}'s character` : `What ${s.name} sees on their phone`,
            extra: which === 'shown' ? `<button class="btn small" data-role="">Their real character</button>` : '',
          }),
          async (ev) => {
            const r = ev.target.closest('[data-role]');
            if (!r) return;
            await call('botc:seat', { seatId, patch: { [which]: r.dataset.role || null } });
            openSeat(seatId);
          }
        );
        return;
      }
      if (b.dataset.rm) await call('botc:reminder', { seatId, remove: Number(b.dataset.rm) });
      if (b.dataset.add) {
        const o = reminderOptions[Number(b.dataset.add)];
        await call('botc:reminder', { seatId, add: { role: o.role.id, label: o.label } });
      }
      if (b.dataset.addg) await call('botc:reminder', { seatId, add: { label: b.dataset.addg } });
      openSeat(seatId);
    }
  );
}

function openBluffs() {
  let picked = st.bluffs.map((r) => r.id);
  const options = st.script.roles.filter((r) => st.bluffOptions.includes(r.id) || picked.includes(r.id));
  const draw = () =>
    openSheet(
      `${rolePicker(options, { selected: picked, title: 'Demon bluffs (3 good characters not in play)' })}
       <div class="row sticky-foot"><button class="btn" data-x="show" ${picked.length ? '' : 'disabled'}>🃏 Show</button><button class="btn primary" data-x="save">Save (${picked.length}/3)</button></div>`,
      async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.role) {
          const id = b.dataset.role;
          picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-3);
          return draw();
        }
        if (b.dataset.x) {
          await call('botc:bluffs', { ids: picked });
          closeSheet();
          if (b.dataset.x === 'show') showCard('These characters are not in play', picked.map((id) => options.find((r) => r.id === id)));
        }
      }
    );
  draw();
}

// live setup counter: what's picked against what the setup needs, with every [setup] change
const TEAM_LABEL = { townsfolk: ['Townsfolk', 'Townsfolk'], outsider: ['Outsider', 'Outsiders'], minion: ['Minion', 'Minions'], demon: ['Demon', 'Demons'] };
function setupCounter(r, roleName, picks = []) {
  const by = [...new Set(picks)].filter((id) => /\[/.test(roleById(id)?.ability || '')).map(roleName);
  const cell = (t) => {
    const ok = r.need[t].includes(r.have[t]);
    const label = TEAM_LABEL[t][r.need[t].length === 1 && r.need[t][0] === 1 ? 0 : 1];
    return `<span class="cnt ${ok ? 'ok' : 'off'} ${t === 'minion' || t === 'demon' ? 'evil' : 'good'}"><b>${r.have[t]}/${fmtNeed(r.need[t])}</b> ${label}</span>`;
  };
  const changed = TEAMS4.some((t) => r.need[t].length !== 1 || r.need[t][0] !== r.base[t]);
  const warn = r.missing.map((m) => (m.req ? `${roleName(m.id)} needs the ${roleName(m.req)} in play.` : `${roleName(m.id)} is picked twice.`));
  return `<div class="counter">${TEAMS4.map(cell).join('')}</div>
    ${changed ? `<p class="hint">Normal for ${r.n} players: ${r.base.townsfolk} Townsfolk, ${r.base.outsider} Outsider${r.base.outsider === 1 ? '' : 's'}, ${r.base.minion} Minion${r.base.minion === 1 ? '' : 's'}, ${r.base.demon} Demon. Changed by: ${esc(by.join(', ') || 'the setup rules')}.</p>` : ''}
    ${r.notes.length ? `<ul class="setup-notes">${r.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${warn.length ? `<p class="warn">⚠ ${warn.map(esc).join(' ')}</p>` : ''}`;
}

function openChooseRoles() {
  const n = st.players;
  let picked = [...st.seats.filter((s) => s.role && s.role.team !== 'traveller').map((s) => s.role.id), ...(st.offBag || []).map((r) => r.id)];
  const roleOf = (id) => st.script.roles.find((r) => r.id === id) || roleById(id);
  const roleName = (id) => roleOf(id)?.name || id;
  const onScript = (id) => st.script.roles.some((r) => r.id === id);
  const dealtCount = () => picked.filter((id) => !NOT_DEALT[id]).length;
  const draw = () => {
    const r = setupRules(n, picked, (id) => roleOf(id)?.team, onScript);
    const copies = [...new Set(picked.filter((id) => MULTI[id]))]
      .map((id) => `<span class="copies">${esc(roleName(id))} ×${picked.filter((x) => x === id).length}<button class="icon-btn" data-copy="-1" data-id="${esc(id)}" aria-label="One fewer">−</button><button class="icon-btn" data-copy="1" data-id="${esc(id)}" aria-label="One more">+</button></span>`)
      .join('');
    openSheet(
      `${rolePicker(st.script.roles, {
        selected: picked,
        title: `Choose ${n} characters`,
        extra: `<p class="counts">Picked ${dealtCount()}/${n}${picked.length > dealtCount() ? ` (+ ${picked.filter((id) => NOT_DEALT[id]).map(roleName).join(', ')}, not given to a player)` : ''}</p>${setupCounter(r, roleName, picked)}${copies ? `<div class="row">${copies}</div>` : ''}`,
      })}
      <div class="row sticky-foot"><button class="btn primary" data-x="deal" ${dealtCount() === n ? '' : 'disabled'}>${r.ok || dealtCount() !== n ? 'Deal at random to the players' : 'Deal anyway (setup is off)'}</button></div>`,
      async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.copy) {
          const id = b.dataset.id;
          if (b.dataset.copy === '1' && dealtCount() < n) picked.push(id);
          else if (b.dataset.copy === '-1' && picked.filter((x) => x === id).length > 1) picked.splice(picked.lastIndexOf(id), 1);
          return draw();
        }
        if (b.dataset.role) {
          const id = b.dataset.role;
          if (picked.includes(id)) picked = picked.filter((x) => x !== id);
          else if (NOT_DEALT[id] || dealtCount() < n) picked = [...picked, id];
          else return toast(`Already ${n} picked: tap one to remove it first`);
          return draw();
        }
        if (b.dataset.x === 'deal') {
          if (!r.ok && !(await confirmSheet('The numbers don’t match the setup rules. Deal anyway?', 'Deal anyway'))) return draw();
          const res = await call('botc:dealRoles', { ids: picked });
          if (!res?.ok) return toast(res?.error || 'Could not deal');
          closeSheet();
          toast('Characters dealt');
        }
      }
    );
  };
  draw();
}

function openImport() {
  openSheet(
    `<h2 class="h">Import a script</h2>
     <p class="hint">Paste the JSON from the official script tool or a community script site, or pick the .json file. Homebrew character images are downloaded once.</p>
     <input type="file" id="imp-file" accept=".json,application/json">
     <textarea id="imp-text" class="notes short" placeholder='[{"id":"_meta","name":"My script"},"washerwoman","imp",…]'${osk}></textarea>
     <button class="btn primary wide" data-x="go">Import</button><p id="imp-msg" class="hint"></p>`,
    async (e) => {
      if (!e.target.closest('[data-x="go"]')) return;
      const text = $('#imp-text').value.trim();
      if (!text) return;
      $('#imp-msg').textContent = 'Importing…';
      const res = await call('botc:import', { text });
      if (!res?.ok) return ($('#imp-msg').textContent = res?.error || 'Import failed');
      closeSheet();
      toast(`Imported ${res.script.name} (${res.script.count} characters)${res.unknown?.length ? `; unknown: ${res.unknown.join(', ')}` : ''}`);
      call('botc:script', { id: res.script.id });
    }
  );
  $('#imp-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (f) $('#imp-text').value = await f.text();
  });
}

function openSettings() {
  const cur = document.documentElement.dataset.style;
  const stPart =
    mode === 'st'
      ? `<h3 class="h">Night & day rules</h3>
       <label class="toggle"><input type="checkbox" checked disabled> Player chats locked at night (always)</label>
       <label class="toggle"><input type="checkbox" data-rule="lockStChat" ${st.rules.lockStChat ? 'checked' : ''}> Also lock the storyteller chat at night</label>
       <label class="toggle"><input type="checkbox" data-rule="autoTimer" ${st.rules.autoTimer ? 'checked' : ''}> Start the day timer at dawn</label>
       <div class="row"><span>Day length</span>${[3, 5, 8, 10, 12, 15].map((m) => `<button class="chip ${st.timer.minutes === m ? 'on' : ''}" data-min="${m}">${m} min</button>`).join('')}</div>
       <h3 class="h">This game</h3>
       <div class="share"><img src="qr/${esc(roomCode())}.png" alt="QR code to join" class="share-qr">
         <div><p>Players join with code <b class="big-code">${esc(roomCode())}</b><br><span class="small muted">${esc(joinUrl())}</span></p>
         <p class="small">Storyteller code: <b>${esc(stCode || '—')}</b><br><span class="muted">To open the grimoire on a second device too. Keep it secret.</span></p></div></div>
       ${DEV ? '' : `<button class="btn wide" data-x="test">🧪 Test mode: play all seats on this screen</button>`}
       <button class="btn wide" data-x="logout">⏏ Leave the grimoire on this device</button>`
      : mode === 'player'
        ? `<button class="btn wide" data-x="stlogin">🔑 I'm the storyteller</button><button class="btn wide" data-x="leave">✕ Leave this room</button>`
        : '';
  openSheet(
    `<h2 class="h">Style</h2><p class="hint">Only for this device${mode === 'st' ? ' (storyteller)' : mode === 'public' ? ' (table view)' : ''}.</p>
     <div class="styles">${STYLES.map((s) => `<button class="style-card ${s.id === cur ? 'on' : ''}" data-style="${s.id}"><span class="sw" data-sw="${s.id}"><i></i><i></i><i></i></span><b>${s.label}</b><small>${s.desc}</small></button>`).join('')}</div>
     ${stPart}
     ${boardpassUrl ? `<h3 class="h">Boardpass</h3>${boardpassLinks('stack')}<p class="hint">Your seat stays in this game; come back any time.</p>` : ''}`,
    async (e) => {
      const b = e.target.closest('[data-style],[data-rule],[data-min],[data-x]');
      if (!b) return;
      if (b.dataset.style) {
        store.set(styleKey(), b.dataset.style);
        applyStyle();
        return openSettings();
      }
      if (b.dataset.rule) return call('botc:rules', { [b.dataset.rule]: b.checked });
      if (b.dataset.min) {
        await call('botc:timer', { action: 'minutes', minutes: Number(b.dataset.min) });
        return openSettings();
      }
      if (b.dataset.x === 'test') {
        closeSheet();
        await loadRoomPlayers();
        return openTestMode();
      }
      if (b.dataset.x === 'logout') {
        closeSheet();
        return logout();
      }
      if (b.dataset.x === 'stlogin') {
        closeSheet();
        return login();
      }
      if (b.dataset.x === 'leave') {
        closeSheet();
        return ACT['leave-room']();
      }
    }
  );
}

// the table view (or a player) opens the grimoire with the storyteller code
async function login() {
  const pin = await askPin();
  if (pin == null) return;
  const res = await call('room:st', { code: roomCode(), stCode: pin });
  if (!res?.ok) return toast(res?.error || 'Wrong code');
  saveSession({ code: res.code, role: 'st', token: res.token, playerId: null });
  enterRoom(res);
}
async function logout() {
  if (!EMBED && !(await confirmSheet(`Leave the grimoire on this device? Note the storyteller code first (${stCode}) to come back.`, 'Leave'))) return;
  const code = session?.code;
  await call('room:leave', { token: session?.token });
  saveSession(null);
  st = null;
  // on a venue screen: back to the table view
  if (EMBED && code) {
    const res = await call('room:watch', { code });
    if (res?.ok) {
      saveSession({ code: res.code, role: 'watch' });
      return enterRoom(res);
    }
  }
  setMode('home');
}

// ---------- Actions ----------
const ACT = {
  tab: (b) => {
    thread = null;
    if (mode === 'st') stab = b.dataset.tab;
    else ptab = b.dataset.tab;
    if (stab === 'setup' && mode === 'st') loadRoomPlayers();
    render();
  },
  settings: openSettings,
  join: async () => {
    const res = await call('botc:join', { on: true });
    if (!res?.ok) toast(res?.error || 'Could not join');
  },
  leave: async () => {
    if (await confirmSheet('Leave this game?', 'Leave')) await call('botc:join', { on: false });
  },
  login,
  logout,
  watch: logout,
  // inside a venue screen: back to its own menu
  close: () => window.parent?.postMessage({ botc: 'close' }, '*'),
  'leave-room': async () => {
    if (mode !== 'public' && !(await confirmSheet('Leave this game room?', 'Leave'))) return;
    await call('room:leave', {});
    saveSession(null);
    me = null;
    setMode('home');
  },
  create: async () => {
    const res = await call('room:create');
    if (!res?.ok) return toast(res?.error || 'Could not start a game');
    saveSession({ code: res.code, role: 'st', token: res.token, playerId: null });
    history.replaceState(null, '', BASE);
    enterRoom(res);
  },
  thread: (b) => {
    thread = b.dataset.id;
    render();
  },
  'thread-back': () => {
    thread = null;
    render();
  },
  guess: (b) => {
    const seat = me.seats.find((s) => s.id === b.dataset.seat);
    if (!seat || seat.playerId === myId) return;
    const cur = me.guesses[seat.id] || {};
    openSheet(
      `<h2 class="h">What is ${esc(seat.name)}?</h2>
       <form class="inline-form" id="guess-note"><input id="guess-note-in" maxlength="200" placeholder="Note, e.g. claims Chef, said 1" value="${esc(cur.note || '')}" autocomplete="off"><button class="btn small" type="submit">Save note</button></form>
       <button class="btn small" data-clear="1">Clear</button>
       ${rolePicker(me.script.roles, { selected: [cur.role], title: '' })}`,
      async (e) => {
        const r = e.target.closest('[data-role],[data-clear]');
        if (!r) return;
        const res = await call('botc:guess', r.dataset.clear ? { seatId: seat.id } : { seatId: seat.id, role: r.dataset.role, note: $('#guess-note-in').value });
        if (res?.guesses) me.guesses = res.guesses;
        closeSheet();
        render();
      }
    );
    $('#guess-note').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await call('botc:guess', { seatId: seat.id, role: (me.guesses[seat.id] || {}).role, note: $('#guess-note-in').value });
      if (res?.guesses) me.guesses = res.guesses;
      closeSheet();
      render();
    });
  },
  // storyteller
  phase: (b) => call('botc:phase', { to: b.dataset.to }),
  timer: (b) => call('botc:timer', { action: b.dataset.a }),
  cards: openCards,
  seat: (b) => openSeat(b.dataset.seat),
  'pick-bluffs': openBluffs,
  'random-bluffs': async () => {
    const opts = [...st.bluffOptions].sort(() => Math.random() - 0.5).slice(0, 3);
    await call('botc:bluffs', { ids: opts });
  },
  script: (b) => call('botc:script', { id: b.dataset.id }),
  delscript: async (b) => {
    if (await confirmSheet('Delete this imported script?', 'Delete')) await call('botc:deleteScript', { id: b.dataset.id });
  },
  import: openImport,
  'pick-player': async (b) => {
    const ids = st.seats.map((s) => s.playerId);
    const id = b.dataset.id;
    await call('botc:seats', { ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  },
  'refresh-players': loadRoomPlayers,
  move: (b) => call('botc:move', { seatId: b.dataset.seat, dir: Number(b.dataset.dir) }),
  'shuffle-seats': () => call('botc:shuffleSeats'),
  'random-roles': async () => {
    const res = await call('botc:randomRoles');
    toast(res?.ok ? 'Characters dealt at random' : res?.error || 'Could not deal');
  },
  'choose-roles': openChooseRoles,
  start: async () => {
    const res = await call('botc:start');
    if (!res?.ok) toast(res?.error || 'Could not start');
  },
  end: async (b) => {
    const w = b.dataset.w;
    if (!(await confirmSheet(w ? `${w === 'good' ? 'Good' : 'Evil'} wins: end the game?` : 'End the game without a winner?', 'End game'))) return;
    await call('botc:end', { winner: w });
  },
  reveal: (b) => call('botc:reveal', { on: b.checked }),
  newgame: () => call('botc:newGame'),
  nightdone: (b) => {
    const k = b.dataset.k;
    if (done.has(k)) done.delete(k);
    else done.add(k);
    b.classList.toggle('done');
  },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.closest('#sheet')) return;
  if (b.type === 'checkbox') return;
  ACT[b.dataset.act]?.(b, e);
});
document.addEventListener('change', (e) => {
  const b = e.target.closest('[data-act]');
  if (b?.type === 'checkbox' && !b.closest('#sheet')) ACT[b.dataset.act]?.(b, e);
});
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.id === 'join-form') {
    e.preventDefault();
    const code = $('#join-code').value.trim().toUpperCase();
    const name = account ? account.username : $('#join-name').value.trim();
    const res = await call('room:join', { code, name, playerId: session?.code === code ? session.playerId : null });
    if (!res?.ok) return toast(res?.error || 'Could not join');
    if (!account) store.set('botc-name', name);
    saveSession({ code: res.code, role: 'player', playerId: res.playerId, name: res.name });
    history.replaceState(null, '', BASE);
    return enterRoom(res);
  }
  if (f.id === 'watch-form') {
    e.preventDefault();
    const res = await call('room:watch', { code: $('#watch-code').value.trim() });
    if (!res?.ok) return toast(res?.error || 'No game with that code');
    saveSession({ code: res.code, role: 'watch' });
    history.replaceState(null, '', BASE);
    return enterRoom(res);
  }
  if (f.id === 'st-form') {
    e.preventDefault();
    const res = await call('room:st', { code: $('#st-room').value.trim(), stCode: $('#st-code').value.trim() });
    if (!res?.ok) return toast(res?.error || 'Wrong code');
    saveSession({ code: res.code, role: 'st', token: res.token, playerId: null });
    history.replaceState(null, '', BASE);
    return enterRoom(res);
  }
  if (f.id === 'send-form') {
    e.preventDefault();
    const inp = $('#send-text');
    const text = inp?.value.trim();
    if (!text) return;
    const res = await call('botc:send', { to: thread, text });
    if (res?.ok) inp.value = '';
    else toast(res?.error || 'Not sent');
    inp?.focus();
  }
  if (f.id === 'add-name') {
    e.preventDefault();
    const name = $('#add-name-in').value.trim();
    if (!name) return;
    const res = await call('botc:addName', { name });
    if (!res?.ok) return toast(res?.error === 'exists' ? 'That name is already in the room' : 'Could not add');
    roomPlayers = (await call('botc:roomPlayers')) || [];
    await call('botc:seats', { ids: [...st.seats.map((s) => s.playerId), res.id] });
  }
  if (f.id === 'log-form') {
    e.preventDefault();
    const text = $('#log-in').value.trim();
    if (text) await call('botc:log', { text });
    $('#log-in').value = '';
  }
});

// notes save themselves
let noteTimer = null;
document.addEventListener('input', (e) => {
  if (e.target.id === 'p-notes' || e.target.id === 'st-notes') {
    const ev = e.target.id === 'p-notes' ? 'botc:notes' : 'botc:notesST';
    const text = e.target.value;
    if (me && ev === 'botc:notes') me.notes = text;
    if (st && ev === 'botc:notesST') st.stNotes = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => call(ev, { text }), 600);
  }
});

// Your character: only while you hold the screen
let holdTimer = null;
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-hold]');
  if (!h) return;
  holdTimer = setTimeout(() => h.classList.add('revealed'), 180);
});
const unhold = () => {
  clearTimeout(holdTimer);
  document.querySelectorAll('[data-hold].revealed').forEach((h) => h.classList.remove('revealed'));
};
for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) window.addEventListener(ev, unhold);
document.addEventListener('visibilitychange', unhold);
document.addEventListener('contextmenu', (e) => e.target.closest('[data-hold]') && e.preventDefault());

// timers tick everywhere
setInterval(() => {
  const v = view();
  if (!v?.timer) return;
  const t = fmt(timeLeft(v.timer));
  document.querySelectorAll('[data-timer]').forEach((el) => {
    if (el.textContent !== t) el.textContent = t;
    el.classList.toggle('low', v.timer.running && timeLeft(v.timer) < 60000);
  });
  // the Wexer rings the bell when time is up
  if (mode === 'public' && v.timer.running && timeLeft(v.timer) === 0 && !bell.rung) {
    bell.rung = true;
    bell();
  }
  if (v.timer.running && timeLeft(v.timer) > 0) bell.rung = false;
}, 250);

// a church bell, made with Web Audio (no sound files)
let audio = null;
function bell() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audio.currentTime + 0.05;
    for (let k = 0; k < 3; k++) {
      const t = t0 + k * 1.4;
      for (const [f, v] of [[220, 0.35], [440, 0.18], [554, 0.1], [660, 0.08]]) {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 2.6);
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + 2.7);
      }
    }
  } catch {}
}

applyStyle();
render(true);
