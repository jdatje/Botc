// Blood on the Clocktower helper, played in person around a table: each
// player's phone is their token, chats, notes and town square; the storyteller
// keeps the grimoire on a phone, tablet or laptop. Many tables (rooms) can play
// at the same time; each room has a short code.
//
// The state of the room being handled lives in the module variables R (room)
// and g (its game state). Every entry point (socket handler, broadcast) first
// calls use(room); handlers are synchronous, so rooms never mix.
//
// Character data, night order, jinxes and icons are The Pandemonium
// Institute's toolmaker resources (github.com/ThePandemoniumInstitute/
// botc-release, resources/), used under their Community Created Content Policy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SEED = path.resolve('data-seed');
const ICON_DIR = path.resolve('public/icons');
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const ROOM_DIR = path.join(DATA_DIR, 'rooms');
fs.mkdirSync(ROOM_DIR, { recursive: true });

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(SEED, f), 'utf8'));
export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- Official data ----------
const ICONS = new Set(fs.readdirSync(ICON_DIR));
const NIGHT = readJson('nightsheet.json');
const ROLES = new Map();
for (const r of readJson('roles.json')) ROLES.set(r.id, decorate({ ...r, official: true }));
const JINXES = [];
for (const j of readJson('jinxes.json')) for (const x of j.jinx || []) JINXES.push({ a: j.id, b: x.id, reason: x.reason });

function iconsOf(id) {
  const pick = (f) => (ICONS.has(f) ? `icons/${f}` : null);
  const plain = pick(`${id}.webp`);
  return { good: pick(`${id}_g.webp`) || plain, evil: pick(`${id}_e.webp`) || plain };
}

function decorate(r) {
  const icons = r.official ? iconsOf(r.id) : { good: r.image || null, evil: r.imageEvil || r.image || null };
  const generic = (side) => (ICONS.has(`${r.team}_${side}.webp`) ? `icons/${r.team}_${side}.webp` : ICONS.has(`${r.team}.webp`) ? `icons/${r.team}.webp` : `icons/custom_${side}.webp`);
  return {
    id: r.id,
    name: r.name,
    team: r.team,
    edition: r.edition || 'custom',
    ability: r.ability || '',
    flavor: r.flavor || '',
    setup: Boolean(r.setup),
    reminders: [...(r.reminders || []), ...(r.remindersGlobal || [])],
    firstNightReminder: r.firstNightReminder || '',
    otherNightReminder: r.otherNightReminder || '',
    firstNight: r.firstNight || 0,
    otherNight: r.otherNight || 0,
    official: Boolean(r.official),
    icon: { good: icons.good || generic('g'), evil: icons.evil || generic('e') },
  };
}

export const EVIL_TEAMS = ['minion', 'demon'];
const defaultAlign = (team) => (EVIL_TEAMS.includes(team) ? 'evil' : 'good');

// ---------- Scripts ----------
const EDITION_NAMES = { tb: 'Trouble Brewing', bmr: 'Bad Moon Rising', snv: 'Sects & Violets' };
const BUILT_IN = Object.entries(EDITION_NAMES).map(([ed, name]) => ({
  id: ed,
  name,
  author: 'The Pandemonium Institute',
  logo: `img/${ed}.webp`,
  builtIn: true,
  ids: [...ROLES.values()].filter((r) => r.edition === ed && r.team !== 'traveller').map((r) => r.id),
  custom: {},
}));

// imported scripts belong to a room
export const scripts = () => [...BUILT_IN, ...R.scripts].map(({ id, name, author, logo, builtIn, ids }) => ({ id, name, author, logo, builtIn: Boolean(builtIn), count: ids.length }));
const findScript = (id) => [...BUILT_IN, ...(R?.scripts || [])].find((s) => s.id === id);
const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) && u.length < 500 ? u : null);

// Import a script JSON (official script tool format, also community scripts).
// Homebrew images are not downloaded: phones load them from their own (https) address.
export function importScript(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return { ok: false, error: 'That is not valid JSON' };
  }
  if (!Array.isArray(data)) return { ok: false, error: 'A script is a JSON list of characters' };
  if (data.length > 300) return { ok: false, error: 'That script is too long' };
  if (R.scripts.length >= 20) return { ok: false, error: 'Delete an imported script first (max 20)' };
  const meta = data.find((x) => x && typeof x === 'object' && x.id === '_meta') || {};
  const ids = [];
  const custom = {};
  const unknown = [];
  const str = (v, n) => String(v || '').slice(0, n);
  for (const item of data) {
    const raw = typeof item === 'string' ? item : item?.id;
    if (!raw || raw === '_meta') continue;
    const id = norm(raw).slice(0, 40);
    if (!id) continue;
    if (ROLES.has(id) && (typeof item === 'string' || !item.ability)) {
      if (!ids.includes(id)) ids.push(id);
      continue;
    }
    if (typeof item === 'object' && item.name && ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled', 'loric'].includes(item.team)) {
      const imgs = Array.isArray(item.image) ? item.image : [item.image];
      custom[id] = decorate({
        id,
        name: str(item.name, 40),
        team: item.team,
        ability: str(item.ability, 400),
        flavor: str(item.flavor, 300),
        setup: Boolean(item.setup),
        reminders: (Array.isArray(item.reminders) ? item.reminders : []).slice(0, 10).map((x) => str(x, 30)),
        remindersGlobal: (Array.isArray(item.remindersGlobal) ? item.remindersGlobal : []).slice(0, 10).map((x) => str(x, 30)),
        firstNightReminder: str(item.firstNightReminder, 400),
        otherNightReminder: str(item.otherNightReminder, 400),
        firstNight: Number(item.firstNight) || 0,
        otherNight: Number(item.otherNight) || 0,
        image: httpsUrl(imgs[0]),
        imageEvil: httpsUrl(imgs[1]) || httpsUrl(imgs[0]),
      });
      if (!ids.includes(id)) ids.push(id);
    } else unknown.push(str(raw, 40));
  }
  if (!ids.length) return { ok: false, error: 'No characters found in this script' };
  const script = {
    id: `s-${crypto.randomBytes(4).toString('hex')}`,
    name: str(meta.name || 'Imported script', 60),
    author: str(meta.author, 60),
    logo: httpsUrl(Array.isArray(meta.logo) ? meta.logo[0] : meta.logo) || 'img/custom.webp',
    ids,
    custom,
  };
  R.scripts.push(script);
  persist();
  return { ok: true, script: { id: script.id, name: script.name, count: ids.length }, unknown: unknown.slice(0, 20) };
}

export function deleteScript(id) {
  R.scripts = R.scripts.filter((s) => s.id !== id);
  persist();
  return { ok: true };
}

// ---------- Game state ----------
const blank = () => ({
  scriptId: 'tb',
  phase: 'setup', // setup | night | day | ended
  night: 0,
  day: 0,
  seats: [], // { id, playerId, name, role, shown, align, dead, ghost, reminders: [{ role, label }] }
  bluffs: [],
  timer: { minutes: 8, endsAt: 0, left: 8 * 60000, running: false },
  rules: { lockStChat: false, autoTimer: true },
  log: [],
  stNotes: '',
  winner: null,
  reveal: false,
  chats: {}, // 'a|b' -> [{ from, text, t }]
  notes: {}, // playerId -> text
  guesses: {}, // playerId -> { seatId: { role, note } }
});

// ---------- Rooms ----------
// room: { code, created, touched, g, members: { playerId: { name, manual } }, tokens: [], stCode, scripts: [] }
const rooms = new Map();
let R = null; // the room being handled
let g = null; // its game state
function use(room) {
  R = room;
  g = room.g;
  room.touched = Date.now();
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const ROOM_TTL = Number(process.env.ROOM_TTL_HOURS || 48) * 3600000;
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 1000);
const MAX_MEMBERS = 30;
const roomFile = (code) => path.join(ROOM_DIR, `${code}.json`);
const saveTimers = new Map();
function persist(room = R) {
  clearTimeout(saveTimers.get(room.code));
  saveTimers.set(
    room.code,
    setTimeout(() => {
      saveTimers.delete(room.code);
      try {
        fs.writeFileSync(`${roomFile(room.code)}.tmp`, JSON.stringify(room));
        fs.renameSync(`${roomFile(room.code)}.tmp`, roomFile(room.code));
      } catch (err) {
        console.warn('Could not save room', room.code, err.message);
      }
    }, 500)
  );
}
// rooms survive a restart
for (const f of fs.readdirSync(ROOM_DIR).filter((x) => /^[A-Z0-9]+\.json$/.test(x))) {
  try {
    const room = JSON.parse(fs.readFileSync(path.join(ROOM_DIR, f), 'utf8'));
    if (Date.now() - room.touched < ROOM_TTL) rooms.set(room.code, { scripts: [], members: {}, tokens: [], ...room, g: { ...blank(), ...room.g } });
    else fs.rmSync(path.join(ROOM_DIR, f), { force: true });
  } catch {}
}
// rooms nobody used for a while are cleaned up
setInterval(() => {
  for (const [code, room] of rooms)
    if (Date.now() - room.touched > ROOM_TTL) {
      rooms.delete(code);
      fs.rmSync(roomFile(code), { force: true });
    }
}, 3600000).unref();
function newRoom() {
  if (rooms.size >= MAX_ROOMS) return null;
  let code;
  do code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
  while (rooms.has(code));
  const room = { code, created: Date.now(), touched: Date.now(), g: blank(), members: {}, tokens: [], stCode: String(crypto.randomInt(100000, 1000000)), scripts: [] };
  rooms.set(code, room);
  return room;
}
const memberList = () =>
  Object.entries(R.members).map(([id, m]) => ({ id, name: m.name, manual: Boolean(m.manual), online: (io?.sockets.adapter.rooms.get(`${R.code}:p:${id}`)?.size || 0) > 0 }));
const nameKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
function addMember(name, manual, wantId, userId) {
  // signed in with Boardpass: you are your account, whatever the device sends
  if (userId !== undefined) {
    const mine = Object.entries(R.members).find(([, m]) => m.userId === userId);
    if (mine) {
      mine[1].name = String(name).slice(0, 24);
      return { ok: true, id: mine[0] };
    }
    wantId = null;
  }
  const clean = String(name || '').trim().slice(0, 24);
  if (!clean) return { ok: false, error: 'Fill in your name' };
  const same = Object.entries(R.members).find(([, m]) => nameKey(m.name) === nameKey(clean));
  if (same) {
    if (manual) return { ok: false, error: 'That name is already in this room' };
    if (same[1].userId !== undefined && same[1].userId !== userId) return { ok: false, error: 'That name is already in this room' };
    same[1].name = clean;
    if (userId !== undefined) same[1].userId = userId;
    same[1].manual = false; // someone added by hand now joins with a phone
    return { ok: true, id: same[0] };
  }
  if (Object.keys(R.members).length >= MAX_MEMBERS) return { ok: false, error: 'This room is full' };
  const id = wantId && !R.members[wantId] && /^[a-f0-9-]{8,40}$/.test(wantId) ? wantId : crypto.randomUUID();
  R.members[id] = { name: clean, manual: Boolean(manual), ...(userId !== undefined && { userId }) };
  return { ok: true, id };
}
const seatFor = (id) => ({ id: crypto.randomBytes(4).toString('hex'), playerId: id, name: R.members[id].name, role: null, shown: null, align: 'good', dead: false, ghost: true, reminders: [] });

const script = () => findScript(g.scriptId) || BUILT_IN[0];
export function role(id) {
  if (!id) return null;
  return script().custom?.[id] || ROLES.get(id) || null;
}
const scriptRoles = () => script().ids.map(role).filter(Boolean);
const travellersAndFabled = () => [...ROLES.values()].filter((r) => r.team === 'traveller' || r.team === 'fabled');

function addLog(text) {
  g.log.push({ t: Date.now(), phase: g.phase === 'day' ? `Day ${g.day}` : g.phase === 'night' ? `Night ${g.night}` : g.phase, text });
  if (g.log.length > 400) g.log.shift();
}

// player counts per team (official table), with setup changes like the Baron
const COUNTS = { 5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1], 10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1] };
export function counts(n) {
  const c = COUNTS[Math.min(15, Math.max(5, n))];
  return { townsfolk: c[0], outsider: c[1], minion: c[2], demon: c[3] };
}
function outsiderShift(r) {
  const m = /\[([^\]]*)\]/.exec(r?.ability || '');
  if (!m) return 0;
  const o = /([+\-−–])\s?(\d)[^\]]*?Outsider/i.exec(m[1]);
  return o ? (o[1] === '+' ? 1 : -1) * Number(o[2]) : 0;
}
const setupNote = (r) => (/\[([^\]]*)\]/.exec(r?.ability || '') || [])[1] || '';

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pickN = (list, n) => shuffle([...list]).slice(0, Math.max(0, n));

// random bag for the seated players, following the counts table
function randomBag() {
  const n = g.seats.length;
  const c = counts(n);
  const by = (t) => scriptRoles().filter((r) => r.team === t);
  const demons = pickN(by('demon'), c.demon);
  const minions = pickN(by('minion'), c.minion);
  let shift = 0;
  for (const r of [...demons, ...minions]) shift += outsiderShift(r);
  const outsiders = pickN(by('outsider'), Math.max(0, c.outsider + shift));
  const townsfolk = pickN(by('townsfolk'), n - demons.length - minions.length - outsiders.length);
  return [...townsfolk, ...outsiders, ...minions, ...demons].map((r) => r.id);
}

// characters who don't know their real character: what does their phone show?
const THINKS = { drunk: 'townsfolk', lunatic: 'demon', marionette: null };
function autoShown(seat, used) {
  const want = THINKS[seat.role];
  if (!want) return null;
  const options = scriptRoles().filter((r) => r.team === want && !used.has(r.id));
  return options.length ? options[crypto.randomInt(options.length)].id : null;
}
const inPlay = () => new Set(g.seats.flatMap((s) => [s.role, s.shown]).filter(Boolean));

function dealRoles(list) {
  const bag = shuffle([...list]);
  g.seats.forEach((s, i) => {
    s.role = bag[i] || null;
    s.shown = null;
    s.align = defaultAlign(role(s.role)?.team);
    s.reminders = [];
  });
  const used = inPlay();
  for (const s of g.seats) {
    s.shown = autoShown(s, used);
    if (s.shown) used.add(s.shown);
  }
}

// ---------- Views ----------
const pub = (r) => r && { id: r.id, name: r.name, team: r.team, ability: r.ability, icon: r.icon, reminders: r.reminders, setup: r.setup, setupNote: setupNote(r) };
function timerView() {
  const t = g.timer;
  return { minutes: t.minutes, running: t.running, endsAt: t.endsAt, left: t.running ? Math.max(0, t.endsAt - Date.now()) : t.left, now: Date.now() };
}
function jinxesFor(ids) {
  const set = new Set(ids);
  return JINXES.filter((j) => set.has(j.a) && set.has(j.b)).map((j) => ({ a: pub(role(j.a) || ROLES.get(j.a)), b: pub(role(j.b) || ROLES.get(j.b)), reason: j.reason }));
}
function scriptView() {
  const s = script();
  return { id: s.id, name: s.name, author: s.author, logo: s.logo, roles: scriptRoles().map(pub), jinxes: jinxesFor(s.ids) };
}
const chatLocked = () => g.phase === 'night';
const base = () => ({
  phase: g.phase,
  night: g.night,
  day: g.day,
  timer: timerView(),
  winner: g.winner,
  chatLocked: chatLocked(),
  stChatLocked: chatLocked() && g.rules.lockStChat,
  alive: g.seats.filter((s) => !s.dead).length,
  total: g.seats.length,
});
const publicSeat = (s) => ({ id: s.id, name: s.name, playerId: s.playerId, dead: s.dead, ghost: s.ghost });
const fullSeat = (s) => ({ ...publicSeat(s), role: pub(role(s.role)), shown: pub(role(s.shown)), align: s.align, reminders: s.reminders });

export function publicView() {
  return {
    ...base(),
    script: { name: script().name, logo: script().logo },
    seats: g.reveal ? g.seats.map(fullSeat) : g.seats.map(publicSeat),
    reveal: g.reveal,
  };
}

export function playerView(pid) {
  const seat = g.seats.find((s) => s.playerId === pid);
  const started = g.phase !== 'setup';
  const shownId = seat && started ? seat.shown || seat.role : null;
  return {
    ...base(),
    script: scriptView(),
    seats: g.reveal ? g.seats.map(fullSeat) : g.seats.map(publicSeat),
    reveal: g.reveal,
    me: seat
      ? { seatId: seat.id, name: seat.name, dead: seat.dead, ghost: seat.ghost, role: pub(role(shownId)), align: started ? (seat.shown && THINKS[seat.role] === 'townsfolk' ? 'good' : seat.align) : null }
      : null,
    notes: g.notes[pid] || '',
    guesses: g.guesses[pid] || {},
  };
}

// the night order for tonight: only characters in play (also what a Drunk thinks)
function nightOrder() {
  const first = g.night <= 1;
  const key = first ? 'firstNight' : 'otherNight';
  const order = [...NIGHT[key]];
  // homebrew characters with their own night number
  for (const r of scriptRoles()) if (!r.official && r[key] > 0 && !order.includes(r.id)) order.splice(Math.min(order.length - 1, Math.round(r[key])), 0, r.id);
  const SPECIAL = {
    dusk: { name: 'Dusk', text: 'Check that all eyes are closed. Some Travellers & Fabled act now.' },
    minioninfo: { name: 'Minion info', text: 'If there are 7 or more players, wake all Minions: show the "This is the Demon" card and point to the Demon. Then put them to sleep.' },
    demoninfo: { name: 'Demon info', text: 'If there are 7 or more players, wake the Demon: show "These are your minions" and point to each Minion. Then show "These characters are not in play" with the 3 bluffs.' },
    dawn: { name: 'Dawn', text: 'Wait a few seconds. Call for eyes open.' },
  };
  const out = [];
  for (const id of order) {
    if (SPECIAL[id]) {
      if ((id === 'minioninfo' || id === 'demoninfo') && g.seats.length < 7) continue;
      out.push({ id, special: true, name: SPECIAL[id].name, text: SPECIAL[id].text, seats: [] });
      continue;
    }
    const seats = g.seats.filter((s) => s.role === id || s.shown === id);
    if (!seats.length) continue;
    const r = role(id) || ROLES.get(id);
    const text = (first ? r?.firstNightReminder : r?.otherNightReminder) || '';
    if (!text) continue;
    out.push({
      id,
      name: r.name,
      icon: r.icon,
      team: r.team,
      text,
      seats: seats.map((s) => ({ name: s.name, dead: s.dead, really: s.role !== id ? role(s.role)?.name : null })),
    });
  }
  return { first, list: out };
}

export function stView() {
  const used = inPlay();
  return {
    ...base(),
    scripts: scripts(),
    scriptId: g.scriptId,
    script: scriptView(),
    extras: travellersAndFabled().map(pub),
    seats: g.seats.map(fullSeat),
    bluffs: g.bluffs.map((id) => pub(role(id))).filter(Boolean),
    bluffOptions: scriptRoles().filter((r) => ['townsfolk', 'outsider'].includes(r.team) && !used.has(r.id) && !(r.id in THINKS)).map((r) => r.id),
    counts: counts(g.seats.length),
    rules: g.rules,
    night: g.night,
    nightOrder: g.phase === 'night' ? nightOrder() : null,
    log: g.log.slice(-200),
    stNotes: g.stNotes,
    reveal: g.reveal,
  };
}

// ---------- Sockets ----------
let io = null;
const ch = (what) => `${R.code}:${what}`; // socket.io room names per game room

export function broadcast(room = R) {
  if (!io || !room) return;
  use(room);
  io.to(ch('st')).emit('botc:st', stView());
  io.to(ch('pub')).emit('botc:pub', publicView());
  // every phone in the room: seated players get their token, the others the join button
  for (const id of Object.keys(R.members)) io.to(ch(`p:${id}`)).emit('botc:me', playerView(id));
  persist();
}

const chatKey = (a, b) => [a, b].sort().join('|');
function chatsFor(me) {
  const out = {};
  for (const [key, list] of Object.entries(g.chats)) {
    const [a, b] = key.split('|');
    if (a === me || b === me) out[a === me ? b : a] = list;
  }
  return out;
}

export function attach(server) {
  io = server;
}
export const stats = () => ({ rooms: rooms.size });

// brakes on guessing: wrong room codes per address, wrong storyteller codes per room
const tries = new Map(); // key -> [times]
function tooMany(key, max, ms) {
  const now = Date.now();
  const list = (tries.get(key) || []).filter((t) => now - t < ms);
  tries.set(key, list);
  return list.length >= max;
}
const fail = (key) => tries.get(key)?.push(Date.now()) ?? tries.set(key, [Date.now()]);
setInterval(() => tries.clear(), 3600000).unref();

// user: the Boardpass account behind this socket ({ id, username }), or null when sign-in is off
export function register(socket, ip, user = null) {
  // a player id this socket may use: with sign-in only your own
  const ownPlayer = (playerId) => {
    if (!user) return playerId && R.members[playerId] && !R.members[playerId].manual ? playerId : null;
    return Object.entries(R.members).find(([, m]) => m.userId === user.id)?.[0] || null;
  };
  const pid = () => socket.data.playerId;
  const isST = () => Boolean(socket.data.st);
  const seatOf = (id) => g.seats.find((s) => s.id === id);
  // every handler works on the socket's own room
  const on = (ev, fn) =>
    socket.on(ev, (p, ack) => {
      if (typeof p === 'function') [p, ack] = [{}, p];
      const room = rooms.get(socket.data.code);
      if (!room) return ack?.({ ok: false, error: 'This game room no longer exists' });
      use(room);
      fn(p || {}, ack);
    });
  const st = (fn) => (p = {}, ack) => {
    if (!isST()) return ack?.({ ok: false, error: 'not_storyteller' });
    const res = fn(p || {});
    broadcast();
    ack?.(res || { ok: true });
  };
  function enter(room) {
    for (const r of socket.rooms) if (r !== socket.id) socket.leave(r);
    socket.data = { code: room.code };
    use(room);
    socket.join(ch('pub'));
  }
  const views = () => ({
    ok: true,
    code: R.code,
    st: isST() ? stView() : null,
    stCode: isST() ? R.stCode : null,
    me: pid() ? playerView(pid()) : null,
    pub: publicView(),
    chats: pid() ? chatsFor(pid()) : isST() ? chatsFor('st') : {},
  });
  const findRoom = (code) => rooms.get(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));

  // ----- Rooms -----
  socket.on('room:create', (_p, ack) => {
    if (typeof _p === 'function') ack = _p;
    if (tooMany(`create:${ip}`, 20, 3600000)) return ack?.({ ok: false, error: 'Too many new games, try again later' });
    const room = newRoom();
    if (!room) return ack?.({ ok: false, error: 'The server is full, try again later' });
    fail(`create:${ip}`);
    enter(room);
    const token = crypto.randomBytes(16).toString('hex');
    R.tokens.push(token);
    socket.data.st = true;
    socket.join(ch('st'));
    persist();
    ack?.({ ...views(), token });
  });
  // join as a player (name), or come back with your player id
  socket.on('room:join', ({ code, name, playerId } = {}, ack) => {
    if (tooMany(`code:${ip}`, 20, 60000)) return ack?.({ ok: false, error: 'Too many tries, wait a minute' });
    const room = findRoom(code);
    if (!room) {
      fail(`code:${ip}`);
      return ack?.({ ok: false, error: 'No game with that code' });
    }
    enter(room);
    if (user) name = user.username;
    const known = ownPlayer(playerId);
    const res = known && !user && !name ? { ok: true, id: known } : addMember(name, false, playerId, user?.id);
    if (!res.ok) return ack?.(res);
    socket.data.playerId = res.id;
    socket.join(ch(`p:${res.id}`));
    // while the storyteller sets up, joining the room means joining the game
    if (g.phase === 'setup' && !g.seats.some((s) => s.playerId === res.id) && g.seats.length < 20) g.seats.push(seatFor(res.id));
    broadcast();
    ack?.({ ...views(), playerId: res.id, name: R.members[res.id].name });
  });
  // a table view (TV, laptop): public information only
  socket.on('room:watch', ({ code } = {}, ack) => {
    if (tooMany(`code:${ip}`, 20, 60000)) return ack?.({ ok: false, error: 'Too many tries, wait a minute' });
    const room = findRoom(code);
    if (!room) {
      fail(`code:${ip}`);
      return ack?.({ ok: false, error: 'No game with that code' });
    }
    enter(room);
    ack?.(views());
  });
  // the storyteller on a second device: room code + 6-digit storyteller code
  socket.on('room:st', ({ code, stCode } = {}, ack) => {
    const room = findRoom(code);
    if (!room || tooMany(`st:${ip}`, 8, 300000)) return ack?.({ ok: false, error: room ? 'Too many tries, wait 5 minutes' : 'No game with that code' });
    if (String(stCode || '') !== room.stCode) {
      fail(`st:${ip}`);
      return ack?.({ ok: false, error: 'Wrong storyteller code' });
    }
    enter(room);
    const token = crypto.randomBytes(16).toString('hex');
    R.tokens = [...R.tokens, token].slice(-10);
    socket.data.st = true;
    socket.join(ch('st'));
    persist();
    ack?.({ ...views(), token });
  });
  // coming back (page reload, new connection)
  socket.on('room:hello', ({ code, token, playerId } = {}, ack) => {
    const room = findRoom(code);
    if (!room) return ack?.({ ok: false, error: 'This game room no longer exists' });
    enter(room);
    if (token && R.tokens.includes(token)) {
      socket.data.st = true;
      socket.join(ch('st'));
    } else if (playerId && ownPlayer(playerId)) {
      const id = ownPlayer(playerId);
      socket.data.playerId = id;
      socket.join(ch(`p:${id}`));
    }
    ack?.(views());
  });
  on('room:leave', ({ token }, ack) => {
    if (isST()) R.tokens = R.tokens.filter((t) => t !== token);
    else if (pid()) {
      if (g.phase === 'setup') g.seats = g.seats.filter((s) => s.playerId !== pid());
      delete R.members[pid()];
    }
    const room = R;
    for (const r of socket.rooms) if (r !== socket.id) socket.leave(r);
    socket.data = {};
    broadcast(room);
    ack?.({ ok: true });
  });

  // ----- Player data (private) -----
  on('botc:notes', ({ text } = {}, ack) => {
    if (!pid()) return ack?.({ ok: false });
    g.notes[pid()] = String(text || '').slice(0, 20000);
    persist();
    ack?.({ ok: true });
  });
  on('botc:guess', ({ seatId, role: r, note } = {}, ack) => {
    if (!pid()) return ack?.({ ok: false });
    const mine = (g.guesses[pid()] ||= {});
    if (!r && !note) delete mine[seatId];
    else mine[seatId] = { role: r ? norm(r) : null, note: String(note || '').slice(0, 200) };
    persist();
    ack?.({ ok: true, guesses: mine });
  });

  // ----- Chats: truly private between two players; the storyteller is 'st' -----
  on('botc:send', ({ to, text } = {}, ack) => {
    const me = isST() ? 'st' : pid();
    if (!me) return ack?.({ ok: false });
    const clean = String(text || '').trim().slice(0, 1000);
    if (!clean) return ack?.({ ok: false });
    const seated = (id) => g.seats.some((s) => s.playerId === id);
    if (me !== 'st') {
      if (!seated(me)) return ack?.({ ok: false, error: 'You are not in this game' });
      if (to !== 'st' && !seated(to)) return ack?.({ ok: false });
      if (to === me) return ack?.({ ok: false });
      if (chatLocked() && (to !== 'st' || g.rules.lockStChat)) return ack?.({ ok: false, error: 'Chats are locked at night' });
    } else if (!seated(to)) return ack?.({ ok: false });
    const key = chatKey(me, to);
    const msg = { from: me, to, text: clean, t: Date.now() };
    (g.chats[key] ||= []).push(msg);
    if (g.chats[key].length > 300) g.chats[key].shift();
    persist();
    const target = (id) => ch(id === 'st' ? 'st' : `p:${id}`);
    io.to(target(me)).to(target(to)).emit('botc:msg', msg);
    ack?.({ ok: true });
  });

  // ----- Storyteller -----
  on('botc:script', st(({ id }) => {
    if (g.phase !== 'setup' || !findScript(id)) return { ok: false };
    g.scriptId = id;
    g.bluffs = [];
    for (const s of g.seats) Object.assign(s, { role: null, shown: null, align: 'good', reminders: [] });
  }));
  on('botc:import', ({ text } = {}, ack) => {
    if (!isST()) return ack?.({ ok: false });
    const res = importScript(text);
    broadcast();
    ack?.(res);
  });
  on('botc:deleteScript', st(({ id }) => {
    if (g.scriptId === id) g.scriptId = 'tb';
    return deleteScript(id);
  }));

  // seats: the room's players (joined phones and names added by hand)
  on('botc:roomPlayers', (_p, ack) => ack?.(isST() ? memberList() : []));
  on('botc:seats', st(({ ids }) => {
    if (g.phase !== 'setup' || !Array.isArray(ids)) return { ok: false };
    g.seats = [...new Set(ids)].filter((id) => R.members[id]).slice(0, 20).map((id) => g.seats.find((s) => s.playerId === id) || seatFor(id));
    for (const s of g.seats) s.name = R.members[s.playerId]?.name || s.name;
  }));
  // players join (or leave) the game themselves while the storyteller sets up
  on('botc:join', ({ on: want }, ack) => {
    const id = pid();
    if (!id) return ack?.({ ok: false });
    if (g.phase !== 'setup') return ack?.({ ok: false, error: 'The game has already started' });
    if (!R.members[id]) return ack?.({ ok: false });
    const seated = g.seats.some((s) => s.playerId === id);
    if (want !== false && !seated) {
      if (g.seats.length >= 20) return ack?.({ ok: false, error: 'The table is full' });
      g.seats.push(seatFor(id));
    }
    if (want === false) g.seats = g.seats.filter((s) => s.playerId !== id);
    broadcast();
    ack?.({ ok: true });
  });
  on('botc:addName', (p, ack) => {
    if (!isST()) return ack?.({ ok: false });
    const res = addMember(p.name, true);
    persist();
    ack?.(res);
  });
  on('botc:move', st(({ seatId, dir }) => {
    const i = g.seats.findIndex((s) => s.id === seatId);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= g.seats.length) return { ok: false };
    [g.seats[i], g.seats[j]] = [g.seats[j], g.seats[i]];
  }));
  on('botc:shuffleSeats', st(() => {
    if (g.phase !== 'setup') return { ok: false };
    shuffle(g.seats);
  }));
  on('botc:randomRoles', st(() => {
    if (g.seats.length < 5) return { ok: false, error: 'At least 5 players' };
    dealRoles(randomBag());
    g.bluffs = [];
  }));
  on('botc:dealRoles', st(({ ids }) => {
    if (!Array.isArray(ids) || ids.length !== g.seats.length) return { ok: false, error: `Pick exactly ${g.seats.length} characters` };
    const list = ids.map(norm).filter((id) => role(id) || ROLES.get(id));
    if (list.length !== g.seats.length) return { ok: false, error: 'Unknown character in the list' };
    dealRoles(list);
    g.bluffs = [];
  }));
  on('botc:seat', st(({ seatId, patch = {} }) => {
    const s = seatOf(seatId);
    if (!s) return { ok: false };
    if ('role' in patch) {
      const r = role(patch.role) || ROLES.get(patch.role);
      const before = role(s.role)?.name;
      s.role = r ? r.id : null;
      s.align = defaultAlign(r?.team);
      if (!THINKS[s.role]) s.shown = null;
      else if (!s.shown) s.shown = autoShown(s, inPlay());
      if (g.phase !== 'setup') addLog(`${s.name}: ${before || '—'} → ${r?.name || '—'}`);
    }
    if ('shown' in patch) {
      const r = role(patch.shown);
      s.shown = r ? r.id : null;
      if (g.phase !== 'setup') addLog(`${s.name} now sees: ${r?.name || 'their real character'}`);
    }
    if ('align' in patch && ['good', 'evil'].includes(patch.align)) {
      s.align = patch.align;
      if (g.phase !== 'setup') addLog(`${s.name} is now ${patch.align}`);
    }
    if ('dead' in patch) {
      s.dead = Boolean(patch.dead);
      if (!s.dead) s.ghost = true;
      addLog(`${s.name} ${s.dead ? 'died' : 'is alive again'}`);
    }
    if ('ghost' in patch) {
      s.ghost = Boolean(patch.ghost);
      if (!s.ghost) addLog(`${s.name} used their ghost vote`);
    }
  }));
  on('botc:reminder', st(({ seatId, add, remove }) => {
    const s = seatOf(seatId);
    if (!s) return { ok: false };
    if (add && s.reminders.length < 12) s.reminders.push({ role: norm(add.role) || null, label: String(add.label || '').slice(0, 30) });
    if (Number.isInteger(remove)) s.reminders.splice(remove, 1);
  }));
  on('botc:bluffs', st(({ ids }) => {
    g.bluffs = (Array.isArray(ids) ? ids : []).map(norm).filter((id) => role(id)).slice(0, 3);
  }));
  on('botc:rules', st((p) => {
    if (typeof p.lockStChat === 'boolean') g.rules.lockStChat = p.lockStChat;
    if (typeof p.autoTimer === 'boolean') g.rules.autoTimer = p.autoTimer;
  }));
  on('botc:notesST', (p = {}, ack) => {
    if (!isST()) return ack?.({ ok: false });
    g.stNotes = String(p.text || '').slice(0, 50000);
    persist();
    socket.to(ch('st')).emit('botc:stNotes', g.stNotes);
    ack?.({ ok: true });
  });
  on('botc:log', st(({ text }) => {
    if (String(text || '').trim()) addLog(String(text).trim().slice(0, 300));
  }));

  // ----- Phases and the day timer -----
  on('botc:start', st(() => {
    if (g.seats.length < 5) return { ok: false, error: 'At least 5 players' };
    if (g.seats.some((s) => !s.role)) return { ok: false, error: 'Give everyone a character first' };
    const drunk = g.seats.find((s) => THINKS[s.role] && !s.shown && s.role !== 'marionette');
    if (drunk) return { ok: false, error: `Choose what ${drunk.name} (${role(drunk.role).name}) sees first` };
    Object.assign(g, { phase: 'night', night: 1, day: 0, winner: null, reveal: false, chats: {}, notes: {}, guesses: {}, log: [] });
    for (const s of g.seats) Object.assign(s, { dead: false, ghost: true });
    g.timer = { ...g.timer, running: false, endsAt: 0, left: g.timer.minutes * 60000 };
    addLog(`Game started: ${script().name}, ${g.seats.length} players`);
  }));
  on('botc:phase', st(({ to }) => {
    if (g.phase === 'setup' || g.phase === 'ended') return { ok: false };
    if (to === 'day' && g.phase === 'night') {
      g.phase = 'day';
      g.day = g.night;
      addLog('Dawn');
      if (g.rules.autoTimer) startTimer();
    } else if (to === 'night' && g.phase === 'day') {
      g.phase = 'night';
      g.night = g.day + 1;
      pauseTimer();
      addLog('Dusk');
    }
  }));
  const startTimer = () => {
    const t = g.timer;
    t.endsAt = Date.now() + (t.left > 0 ? t.left : t.minutes * 60000);
    t.running = true;
  };
  const pauseTimer = () => {
    const t = g.timer;
    if (t.running) t.left = Math.max(0, t.endsAt - Date.now());
    t.running = false;
  };
  on('botc:timer', st(({ action, minutes }) => {
    const t = g.timer;
    if (action === 'start') startTimer();
    if (action === 'pause') pauseTimer();
    if (action === 'reset') {
      t.running = false;
      t.left = t.minutes * 60000;
    }
    if (action === 'add') {
      if (t.running) t.endsAt += 60000;
      else t.left += 60000;
    }
    if (action === 'minutes' && minutes >= 1 && minutes <= 60) {
      t.minutes = Math.round(minutes);
      if (!t.running) t.left = t.minutes * 60000;
    }
  }));
  on('botc:end', st(({ winner }) => {
    if (g.phase === 'setup') return { ok: false };
    g.winner = ['good', 'evil'].includes(winner) ? winner : null;
    g.phase = 'ended';
    pauseTimer();
    g.reveal = true;
    addLog(g.winner ? `${g.winner === 'good' ? 'Good' : 'Evil'} wins` : 'Game ended');
  }));
  on('botc:reveal', st(({ on }) => {
    g.reveal = Boolean(on);
  }));
  on('botc:newGame', st(() => {
    const keep = { scriptId: g.scriptId, timer: { ...g.timer, running: false, left: g.timer.minutes * 60000 }, rules: g.rules, stNotes: g.stNotes };
    const seats = g.seats.map((s) => ({ ...s, role: null, shown: null, align: 'good', dead: false, ghost: true, reminders: [] }));
    R.g = g = { ...blank(), ...keep, seats };
  }));
}

