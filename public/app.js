// Blood on the Clocktower table helper. One page, four ways:
//  - start page: create a game (storyteller), join one (code + name), or open a table view
//  - a player's phone: token, town square, chats, notes, script, rules
//  - the storyteller (phone, tablet or laptop): setup, grimoire, night order, chats, notes
//  - a table view for a TV or laptop facing the table: day timer and town square
// Character data and icons: The Pandemonium Institute's toolmaker resources.
//
// Modules: core.js (socket, storage, small helpers) · app.js (state, connect, render, actions)
// player.js · phone-night.js (night on a player's phone) · chats.js · storyteller.js · sheets.js
// (pop-ups and sheets) · screens.js (start, waiting, table view, town square) · alerts.js (push)
// · testmode.js. State lives in app.js; other modules read it (live imports) and change it
// through app.js functions only.
import { suggest, followUps } from './night.js';
import { $, BASE, DEV, DEVGRID, call, esc, fmt, socket, store, toast } from './core.js';
import { checkPush, pushOff, pushOn } from './alerts.js';
import { locked, updateThread } from './chats.js';
import { updateNight } from './phone-night.js';
import { P_BODY, P_TABS, playerHeader } from './player.js';
import { layoutSquares, renderHome, renderPublic, renderWaiting } from './screens.js';
import { closeSheet, confirmSheet, killPopup, login, logout, nightCtx, openBluffs, openCards, openChooseRoles, openCompose, openImport, openSeat, openSettings, openSheet, requestPopup, rolePicker } from './sheets.js';
import { ST_BODY, ST_TABS, stHeader, updateLog } from './storyteller.js';
import { loadRoomPlayers, renderDevGrid } from './testmode.js';

// ---------- Styles (per device and per role) ----------
export const STYLES = [
  { id: 'gothic', label: 'Gothic', desc: 'Dark wood and gold' },
  { id: 'parchment', label: 'Parchment', desc: 'Light paper, ink and wax' },
  { id: 'bloodmoon', label: 'Blood Moon', desc: 'Black and crimson' },
  { id: 'ravenswood', label: 'Ravenswood', desc: 'Forest green and bone' },
  { id: 'midnight', label: 'Midnight', desc: 'Dim navy, easy on the eyes at night' },
  { id: 'candlelight', label: 'Candlelight', desc: 'Warm amber glow' },
];
export const styleKey = () => `botc-style-${mode === 'public' ? 'screen' : mode === 'st' ? 'st' : 'player'}`;
export function applyStyle() {
  const s = store.get(styleKey()) || (mode === 'public' ? 'candlelight' : mode === 'st' ? 'midnight' : 'gothic');
  document.documentElement.dataset.style = STYLES.some((x) => x.id === s) ? s : 'gothic';
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  $('meta[name="theme-color"]')?.setAttribute('content', bg || '#120d0b');
}

// ---------- State ----------
export let mode = 'loading'; // loading | home | waiting | asking | player | st | public
export let pub = null; // public view
export let me = null; // player view
export let st = null; // storyteller view
export let chats = {}; // partner id -> messages
let ptab = 'token';
export let stab = 'grim';
export let thread = null; // open chat
export let offset = 0; // server clock - our clock
export let roomPlayers = [];
export let done = new Set(); // night order items ticked off
// this device's seat at a game: { code, role: 'player' | 'st' | 'watch', playerId, name, key, token }
export let session = (() => {
  try { return JSON.parse(store.get('botc-session') || 'null'); } catch { return null; }
})();
export const saveSession = (s) => {
  session = s;
  if (s) store.set('botc-session', JSON.stringify(s));
  else store.del('botc-session');
};
export let myId = session?.playerId || null;
export let stCode = null; // the storyteller code, for a second storyteller device
const params = new URLSearchParams(location.search);
export const urlCode = (params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// links from a venue screen (the Wexer): ?code=X&name=Anna joins straight away,
// ?code=X&watch=1 opens the table view; ?embed=1 = inside the venue's screen (a Close button)
const urlName = (params.get('name') || '').trim().slice(0, 24);
const urlWatch = params.get('watch') === '1';
export const EMBED = params.get('embed') === '1';
const cleanUrl = () => history.replaceState(null, '', EMBED ? `${BASE}?embed=1` : DEV ? `${BASE}?dev=${DEV}` : DEVGRID ? `${BASE}?devgrid=1` : BASE);
export const roomCode = () => session?.code || '';

export const view = () => (mode === 'st' ? st : mode === 'player' ? me : pub);
export const meChatId = () => (mode === 'st' ? 'st' : myId);

// other modules change the state through these
export const setThread = (t) => (thread = t);
export const setSt = (v) => (st = v);
export const setRoomPlayers = (list) => (roomPlayers = list);

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
    if (res?.pending) {
      cleanUrl();
      return askingFor(res);
    }
    if (res?.ok) {
      saveSession(urlWatch ? { code: res.code, role: 'watch' } : { code: res.code, role: 'player', playerId: res.playerId, name: res.name, key: res.key });
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
  const res = await call('room:hello', { code: session.code, token: session.token, playerId: session.playerId, key: session.key });
  if (!res) return;
  if (!res.ok || res.lost) {
    saveSession(null);
    toast(res.lost ? 'Your seat is on another device now' : res.error || 'That game is gone', 5000);
    return setMode('home');
  }
  if (res.key) saveSession({ ...session, key: res.key });
  enterRoom(res);
}
// a new device for a seat in a running game: wait for the storyteller
let asking = null; // { code, name }
function askingFor(res) {
  asking = { code: res.code, name: res.name };
  pub = res.pub;
  setMode('asking');
}
function renderAsking() {
  $('#app').innerHTML = `<div class="center pad"><div class="tk-back huge"></div><h1 class="h">Waiting for the storyteller</h1>
    <p>${esc(`${asking?.name || ''} is already playing in game ${asking?.code || ''} on another device. The storyteller has to allow this one.`)}</p>
    <p class="hint">Once allowed, the other device is logged out.</p>
    <button class="btn" data-act="cancel-ask">✕ Cancel</button></div>`;
}
socket.on('room:approved', (res) => {
  if (mode !== 'asking') return;
  asking = null;
  saveSession({ code: res.code, role: 'player', playerId: res.playerId, name: res.name, key: res.key });
  toast('✓ The storyteller let you in');
  enterRoom(res);
});
socket.on('room:denied', ({ replaced } = {}) => {
  if (mode !== 'asking') return;
  asking = null;
  toast(replaced ? 'Another device asked for this seat' : 'The storyteller said no', 5000);
  setMode('home');
});
socket.on('room:moved', () => {
  saveSession(null);
  myId = null;
  me = null;
  toast('Your seat is on another device now', 6000);
  setMode('home');
});
socket.on('connect', hello);

// ---------- Boardpass sign-in (when the server has it on) ----------
export let account = null; // { username } when signed in with Boardpass
export let boardpassUrl = ''; // Boardpass itself: the game picker and the account page
const boardpassLink = (path) => (boardpassUrl ? new URL(path, boardpassUrl).toString() : '');
// "← All games" and the account page, only when sign-in is on
export function boardpassLinks(cls = '') {
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
export function enterRoom(res) {
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
    setTimeout(checkPush, 0);
    return setMode(me.me ? 'player' : 'waiting');
  }
  setMode('public');
}

export function setMode(m) {
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
  pub = v;
  if (mode === 'public' || mode === 'waiting') render();
});
socket.on('botc:me', (v) => {
  sync(v);
  me = v;
  if (mode === 'waiting' && v.me) {
    checkPush();
    return setMode('player');
  }
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
  setTimeout(killPopup, 0);
  setTimeout(requestPopup, 0);
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
  const other = String(m.to).startsWith('g:') ? m.to : m.from === mine ? m.to : m.from;
  (chats[other] ||= []).push(m);
  if (m.from !== mine) {
    try { navigator.vibrate?.([120, 60, 120]); } catch {}
    const open = thread === other && ((mode === 'player' && ptab === 'chats') || (mode === 'st' && stab === 'chats'));
    if (open) markRead(other);
    else toast(`💬 ${other.startsWith('g:') ? `${nameOf(other)} · ${nameOf(m.from)}` : nameOf(other)}: ${m.text.slice(0, 60)}`);
  }
  render();
});

export const roleById = (id) => [...(view()?.script?.roles || []), ...(st?.extras || [])].find((r) => r.id === id);
export function timeLeft(t) {
  if (!t) return 0;
  return t.running ? Math.max(0, t.endsAt - (Date.now() + offset)) : t.left;
}
export function phaseLabel(v) {
  if (!v) return '';
  if (v.phase === 'setup') return 'Setting up';
  if (v.phase === 'night') return `Night ${v.night}`;
  if (v.phase === 'day') return `Day ${v.day}`;
  return v.winner ? `${v.winner === 'good' ? 'Good' : 'Evil'} wins` : 'Game over';
}
export function nameOf(id) {
  if (id === 'st') return 'Storyteller';
  if (String(id).startsWith('g:')) return (view()?.groups || []).find((x) => x.id === id)?.name || 'Group';
  return (view()?.seats || []).find((s) => s.playerId === id)?.name || 'Someone';
}
const readKey = () => `botc-read-${meChatId()}`;
function readMap() {
  try { return JSON.parse(store.get(readKey()) || '{}'); } catch { return {}; }
}
export function markRead(other) {
  const m = readMap();
  m[other] = Date.now() + offset + 1000;
  store.set(readKey(), JSON.stringify(m));
}
export function unread(other) {
  const since = readMap()[other] || 0;
  return (chats[other] || []).filter((m) => m.from !== meChatId() && m.t > since).length;
}
const unreadTotal = () => Object.keys(chats).reduce((n, k) => n + unread(k), 0);

// ---------- Render ----------
let lastBody = '';
// a redraw of the same tab (someone joined, a timer tick) keeps half-typed text, focus and cursor
function keepTyped() {
  const fields = [...$('#bd').querySelectorAll('input[id], textarea[id], select[id]')].filter((x) => x.type !== 'checkbox' && x.type !== 'radio' && x.value !== x.defaultValue);
  const active = document.activeElement?.id && $('#bd').contains(document.activeElement) ? document.activeElement : null;
  if (!fields.length && !active) return null;
  const saved = fields.map((x) => [x.id, x.value]);
  const sel = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  return () => {
    for (const [id, value] of saved) {
      const x = document.getElementById(id);
      if (x && x.value === x.defaultValue) x.value = value;
    }
    const a = active && document.getElementById(active.id);
    if (!a) return;
    a.focus({ preventScroll: true });
    if (sel) try { a.setSelectionRange(...sel); } catch {}
  };
}
export function render(force) {
  if (DEVGRID) return renderDevGrid();
  updateNight();
  const app = $('#app');
  app.className = `mode-${mode} phase-${view()?.phase || 'none'}`;
  if (mode === 'loading') return (app.innerHTML = '<div class="center muted">Connecting…</div>');
  if (mode === 'public') return renderPublic();
  if (mode === 'home') return renderHome();
  if (mode === 'waiting') return renderWaiting();
  if (mode === 'asking') return renderAsking();
  const tabs = mode === 'st' ? ST_TABS : P_TABS;
  const cur = mode === 'st' ? stab : ptab;
  const key = `${mode}:${cur}:${thread || ''}:${cur === 'chats' && thread ? locked(thread) : ''}`;
  // half-typed text survives any redraw of the same tab, also a full one
  const typed = key === lastBody && $('#bd') ? keepTyped() : null;
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
  if (typed) typed();
  $('#bd').classList.toggle('in-thread', cur === 'chats' && Boolean(thread));
  $('#bd').scrollTop = scroll;
  if (cur === 'chats' && thread) {
    markRead(thread);
    updateThread(true);
    $('#nav').innerHTML = $('#nav').innerHTML.replace(/<b class="badge">\d+<\/b>/, unreadTotal() ? `<b class="badge">${unreadTotal()}</b>` : '');
  }
  layoutSquares();
}

// ---------- Actions ----------
export const ACT = {
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
  'group-new': () => {
    const others = me.seats.filter((x) => x.playerId && x.playerId !== myId);
    let pick = [];
    const draw = () =>
      openSheet(
        `<h2 class="h">👥 New group</h2>
         <p class="hint">Only the players you pick see this group. The storyteller can't read it.</p>
         <label class="field">Name (optional)<input id="group-name" maxlength="30" autocomplete="off" value="${esc($('#group-name')?.value || '')}"></label>
         <h3 class="sub">With</h3>
         <div class="chips">${others.map((x) => `<button class="chip ${pick.includes(x.playerId) ? 'on' : ''}" data-gp="${esc(x.playerId)}">${esc(x.name)}</button>`).join('')}</div>
         <div class="row sticky-foot"><button class="btn primary" data-gcreate="1" ${pick.length >= 2 ? '' : 'disabled'}>Start the group${pick.length >= 2 ? ` (${pick.length + 1})` : ': pick 2 or more'}</button></div>`,
        async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.gp) {
            pick = pick.includes(b.dataset.gp) ? pick.filter((x) => x !== b.dataset.gp) : [...pick, b.dataset.gp];
            return draw();
          }
          if (b.dataset.gcreate) {
            const res = await call('botc:groupCreate', { name: $('#group-name').value, members: pick });
            if (!res?.ok) return toast(res?.error || 'Could not start the group');
            closeSheet();
            thread = res.id;
            ptab = 'chats';
            setTimeout(() => render(true), 300);
          }
        }
      );
    draw();
  },
  'group-leave': async () => {
    if (!(await confirmSheet(`Leave “${nameOf(thread)}”? You won't see its messages anymore.`, 'Leave'))) return;
    await call('botc:groupLeave', { id: thread });
    delete chats[thread];
    thread = null;
    render(true);
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
       <div class="seg"><button class="${cur.align === 'good' ? 'on' : ''}" data-align="good">😇 Good</button><button class="${!cur.align ? 'on' : ''}" data-align="">? Not sure</button><button class="${cur.align === 'evil' ? 'on' : ''}" data-align="evil">😈 Evil</button></div>
       <form class="inline-form" id="guess-note"><input id="guess-note-in" maxlength="200" placeholder="Note, e.g. claims Chef, said 1" value="${esc(cur.note || '')}" autocomplete="off"><button class="btn small" type="submit">Save note</button></form>
       <button class="btn small" data-clear="1">Clear</button>
       ${rolePicker(me.script.roles, { selected: [cur.role], title: '' })}`,
      async (e) => {
        const al = e.target.closest('[data-align]');
        if (al) {
          const res = await call('botc:guess', { seatId: seat.id, role: cur.role, note: $('#guess-note-in').value, align: al.dataset.align || null });
          if (res?.guesses) me.guesses = res.guesses;
          closeSheet();
          return render();
        }
        const r = e.target.closest('[data-role],[data-clear]');
        if (!r) return;
        const res = await call('botc:guess', r.dataset.clear ? { seatId: seat.id } : { seatId: seat.id, role: r.dataset.role, note: $('#guess-note-in').value, align: cur.align });
        if (res?.guesses) me.guesses = res.guesses;
        closeSheet();
        render();
      }
    );
    $('#guess-note').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await call('botc:guess', { seatId: seat.id, role: (me.guesses[seat.id] || {}).role, note: $('#guess-note-in').value, align: (me.guesses[seat.id] || {}).align });
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
  move: (b) => call('botc:moveSeat', { seatId: b.dataset.seat, dir: Number(b.dataset.dir) }),
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
  'cancel-ask': async () => {
    await call('room:cancelJoin');
    asking = null;
    setMode('home');
  },
  'push-on': () => pushOn(),
  'push-off': () => pushOff(),
  'push-test': async () => {
    const r = await call('push:test');
    toast(r?.ok ? 'Test alert in 5 seconds: lock your phone now' : r?.error || 'Could not send a test', 5000);
  },
  wake: (b) => {
    const it = st.nightOrder?.list.find((x) => x.id === b.dataset.step);
    if (!it) return;
    const sug = suggest(it, nightCtx());
    if (!sug.length) return toast('Nothing to send for this step');
    openCompose(it, sug, 0);
  },
  unprompt: (b) => call('botc:cancelPrompt', { id: b.dataset.id }),
  follow: async (b) => {
    const p = st.prompts.find((x) => x.id === b.dataset.id);
    const f = p && followUps(p, nightCtx())[Number(b.dataset.i)];
    if (!f) return;
    if (f.dead) {
      await call('botc:seat', { seatId: f.dead, patch: { dead: true } });
      return toast('Marked dead');
    }
    if (f.reminder) {
      await call('botc:reminder', { seatId: f.reminder.seatId, add: { role: f.reminder.role, label: f.reminder.label } });
      return toast(`Reminder added: ${f.reminder.label}`);
    }
    if (f.compose) {
      const it = st.nightOrder?.list.find((x) => x.id === p.step) || { id: p.step, name: roleById(p.step)?.name || p.step, seats: [] };
      openCompose(it, [{ roles: [], seats: [], number: null, count: 1, target: 'player', grim: false, ...f.compose }], 0);
    }
  },
  nightdone: (b) => {
    const k = b.dataset.k;
    if (done.has(k)) done.delete(k);
    else done.add(k);
    b.classList.toggle('done');
  },
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.closest('#sheet') || b.closest('#nightscreen')) return;
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
    const mine = session?.code === code && session.role === 'player';
    const res = await call('room:join', { code, name, playerId: mine ? session.playerId : null, key: mine ? session.key : null });
    if (!res?.ok) return toast(res?.error || 'Could not join');
    if (!account) store.set('botc-name', name);
    history.replaceState(null, '', BASE);
    if (res.pending) return askingFor(res);
    saveSession({ code: res.code, role: 'player', playerId: res.playerId, name: res.name, key: res.key });
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
    if (!text || f.dataset.busy) return;
    f.dataset.busy = '1'; // a double tap on Send is one message
    const res = await call('botc:send', { to: thread, text });
    delete f.dataset.busy;
    if (res?.ok && inp.value.trim() === text) inp.value = '';
    else if (!res?.ok) toast(res?.error || 'Not sent');
    inp?.focus();
  }
  if (f.id === 'add-name') {
    e.preventDefault();
    const name = $('#add-name-in').value.trim();
    if (!name) return;
    const res = await call('botc:addName', { name });
    if (!res?.ok) return toast(res?.error || 'Could not add');
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
  dayAlerts(v);
}, 250);

// phones: 30 seconds left → buzz + message; time's up → buzz, bell and "back to the town square".
// Only when the timer crosses the mark while it runs, so opening the page at 0:00 doesn't alarm.
let lastLeft = null;
function dayAlerts(v) {
  if (mode !== 'player' && mode !== 'waiting' && mode !== 'st') return (lastLeft = null);
  const left = timeLeft(v.timer);
  const was = lastLeft;
  lastLeft = v.timer.running ? left : null;
  if (!v.timer.running || was == null) return;
  if (was > 30000 && left <= 30000 && left > 0) {
    buzz([200, 100, 200]);
    toast('⏳ 30 seconds left: start wrapping up');
  }
  if (was > 0 && left === 0) {
    buzz([500, 200, 500, 200, 800]);
    bell();
    timeUp();
  }
}
export const buzz = (p) => {
  try { navigator.vibrate?.(p); } catch {}
};
function timeUp() {
  document.querySelector('.time-up')?.remove();
  const el = document.createElement('div');
  el.className = 'time-up';
  el.setAttribute('role', 'alertdialog');
  el.innerHTML = `<div class="time-up-in"><div class="time-up-icon" aria-hidden="true">🔔</div><h2 class="h">Time's up</h2><p>Return to the town square</p><button class="btn primary big" data-timeup="ok">I'm back</button></div>`;
  document.body.append(el);
  el.addEventListener('click', (e) => e.target.closest('[data-timeup]') && el.remove());
}
// browsers only allow sound after a tap: wake the audio on the first one
window.addEventListener('pointerdown', () => {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {}
}, { once: true });

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
