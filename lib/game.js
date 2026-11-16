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
import * as push from './push.js';
import { setupRules, baseCounts, legionCount, NOT_DEALT, REQUIRES, MULTI } from '../public/setup.js';

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
  rules: { lockStChat: false },
  history: [], // what happened at night on the phones: { night, step, who, kind, text, answer, roles, seats, number }
  layout: 'circle', // town square: circle, or table (a long table, like the real one)
  log: [],
  stNotes: '',
  winner: null,
  reveal: false,
  chats: {}, // 'a|b' -> [{ from, text, t }]; groups: 'g:<id>'
  groups: {}, // id -> { id, name, members: [playerId], by } (only members know a group exists)
  notes: {}, // playerId -> text
  guesses: {}, // playerId -> { seatId: { role, note } }
  prompts: [], // night on phones: { id, night, step, seatId, playerId, kind, text, count, target, roles, seats, number, grim, fake, answer }
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
    if (room.house || Date.now() - room.touched < ROOM_TTL) rooms.set(room.code, { scripts: [], members: {}, tokens: [], ...room, g: { ...blank(), ...room.g } });
    else fs.rmSync(path.join(ROOM_DIR, f), { force: true });
  } catch {}
}
// rooms nobody used for a while are cleaned up
setInterval(() => {
  for (const [code, room] of rooms)
    if (!room.house && Date.now() - room.touched > ROOM_TTL) {
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
  if (!id || typeof id !== 'string') return null;
  const custom = script().custom;
  return (custom && Object.hasOwn(custom, id) ? custom[id] : null) || ROLES.get(id) || null;
}
const scriptRoles = () => script().ids.map(role).filter(Boolean);
const travellersAndFabled = () => [...ROLES.values()].filter((r) => r.team === 'traveller' || r.team === 'fabled');

function addLog(text) {
  g.log.push({ t: Date.now(), phase: g.phase === 'day' ? `Day ${g.day}` : g.phase === 'night' ? `Night ${g.night}` : g.phase, text });
  if (g.log.length > 400) g.log.shift();
}

// player counts per team: official table (public/setup.js), Travellers don't count
export const counts = baseCounts;
const isTraveller = (s) => role(s.role)?.team === 'traveller';
const players = () => g.seats.filter((s) => !isTraveller(s));
const setupNote = (r) => (/\[([^\]]*)\]/.exec(r?.ability || '') || [])[1] || '';

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pickN = (list, n) => shuffle([...list]).slice(0, Math.max(0, n));
const any = (list) => list[crypto.randomInt(list.length)];
const teamOf = (id) => role(id)?.team;
const onScript = (id) => scriptRoles().some((r) => r.id === id);
const rulesFor = (picks) => setupRules(players().length, picks, teamOf, onScript);

// random bag for the players, following the official table and every [setup] change
// (Baron, Godfather, Lil' Monsta, Legion, Huntsman…). Built, then repaired, then checked.
function randomBag() {
  const n = players().length;
  const by = (t) => scriptRoles().filter((r) => r.team === t).map((r) => r.id);
  const T = { townsfolk: by('townsfolk'), outsider: by('outsider'), minion: by('minion'), demon: by('demon') };
  if (!T.demon.length && !T.minion.includes('summoner')) return null;
  const base = counts(n).outsider;
  // a value the storyteller may choose: stay near the normal number when anything goes
  const choose = (vals) => any(vals.filter((v) => Math.abs(v - base) <= 1).length ? vals.filter((v) => Math.abs(v - base) <= 1) : vals);
  const count = (picks, t) => picks.filter((id) => !NOT_DEALT[id] && teamOf(id) === t).length;
  const unused = (picks, t) => T[t].filter((id) => !picks.includes(id));
  const removeOne = (picks, t, keep) => {
    const opts = picks.map((id, i) => [id, i]).filter(([id]) => teamOf(id) === t && !keep.has(id));
    if (!opts.length) return false;
    picks.splice(any(opts)[1], 1);
    return true;
  };

  for (let attempt = 0; attempt < 400; attempt++) {
    const picks = T.demon.length ? [any(T.demon)] : [];
    // Marionette jinx: with the Kazali, Lil' Monsta or Summoner it enters play later, so not in the bag
    const later = ['kazali', 'lilmonsta'].includes(picks[0]);
    picks.push(...pickN(T.minion.filter((id) => !(later && id === 'marionette')), rulesFor(picks).need.minion[0]));
    if (picks.includes('summoner') && picks.includes('marionette')) continue;
    let r = rulesFor(picks);
    if (!r.need.demon.includes(count(picks, 'demon'))) {
      const d = Math.min(...r.need.demon);
      if (d === 0) picks.splice(picks.findIndex((id) => teamOf(id) === 'demon' && !NOT_DEALT[id]), 1); // Summoner
      else while (count(picks, 'demon') < Math.max(d, Math.min(legionCount(n), Math.max(...r.need.demon)))) picks.push(picks.find((id) => teamOf(id) === 'demon')); // Legion
    }
    r = rulesFor(picks);
    picks.push(...pickN(T.outsider, choose(r.need.outsider)));
    picks.push(...pickN(unused(picks, 'townsfolk'), n - picks.filter((id) => !NOT_DEALT[id]).length));

    // Atheist: no evil at all
    if (picks.includes('atheist')) {
      for (let i = picks.length - 1; i >= 0; i--) if (['minion', 'demon'].includes(teamOf(picks[i]))) picks.splice(i, 1);
      picks.push(...pickN(unused(picks, 'townsfolk'), n - picks.length));
    }
    // repair: outsider count after the Townsfolk that change it, and required characters
    for (let pass = 0; pass < 6; pass++) {
      r = rulesFor(picks);
      const keep = new Set(r.missing.map((m) => m.id).concat(Object.values(REQUIRES).filter((q) => picks.includes(q))));
      for (const m of r.missing) {
        if (!m.req || picks.includes(m.req)) continue;
        const t = teamOf(m.req);
        if (removeOne(picks, t, new Set([...keep, m.id]))) picks.push(m.req);
      }
      r = rulesFor(picks);
      if (!r.need.outsider.includes(count(picks, 'outsider'))) {
        const want = choose(r.need.outsider);
        while (count(picks, 'outsider') < want && unused(picks, 'outsider').length && removeOne(picks, 'townsfolk', keep)) picks.push(any(unused(picks, 'outsider')));
        while (count(picks, 'outsider') > want && unused(picks, 'townsfolk').length && removeOne(picks, 'outsider', keep)) picks.push(any(unused(picks, 'townsfolk')));
      }
      if (rulesFor(picks).ok) break;
    }
    // Village Idiot: +0 to +2 extra copies, in place of other Townsfolk
    if (picks.includes('villageidiot')) {
      const keep = new Set(['villageidiot', ...picks.filter((id) => REQUIRES[id] || Object.values(REQUIRES).includes(id) || id === 'atheist' || id === 'balloonist')]);
      for (let k = crypto.randomInt(3); k > 0; k--) if (removeOne(picks, 'townsfolk', keep)) picks.push('villageidiot');
    }
    const bhAlone = picks.includes('bountyhunter') && !picks.some((id) => id !== 'bountyhunter' && teamOf(id) === 'townsfolk');
    if (rulesFor(picks).ok && !bhAlone) return picks;
  }
  return null;
}

// characters who don't know their real character: what does their phone show?
const THINKS = { drunk: 'townsfolk', lunatic: 'demon', marionette: null };
function autoShown(seat, used) {
  const want = THINKS[seat.role];
  if (!want) return null;
  const options = scriptRoles().filter((r) => r.team === want && !used.has(r.id));
  return options.length ? options[crypto.randomInt(options.length)].id : null;
}
const inPlay = () => new Set([...g.seats.flatMap((s) => [s.role, s.shown]), ...(g.offBag || [])].filter(Boolean));

function dealRoles(list) {
  const seats = players();
  g.offBag = list.filter((id) => NOT_DEALT[id]);
  const bag = shuffle(list.filter((id) => !NOT_DEALT[id]));
  const m = seats.length;
  const at = (i) => ((i % m) + m) % m;
  const evil = (id) => ['minion', 'demon'].includes(teamOf(id));
  // Lord of Typhon: all evil in one line, the Lord of Typhon in the middle
  if (bag.includes('lordoftyphon') && m) {
    // closest to the Lord of Typhon first (the Marionette must neighbor the Demon), then alternate sides
    const minions = shuffle(bag.filter((id) => evil(id) && id !== 'lordoftyphon')).sort((x, y) => (y === 'marionette') - (x === 'marionette'));
    const line = ['lordoftyphon'];
    minions.forEach((id, i) => (i % 2 ? line.push(id) : line.unshift(id)));
    const good = shuffle(bag.filter((id) => !evil(id)));
    const start = crypto.randomInt(m);
    bag.length = 0;
    for (let i = 0; i < m; i++) bag[at(start + i)] = i < line.length ? line[i] : good[i - line.length];
  }
  // Marionette: next to the Demon
  const dIdx = bag.findIndex((id) => teamOf(id) === 'demon');
  const mIdx = bag.indexOf('marionette');
  if (dIdx > -1 && mIdx > -1 && m > 2 && at(mIdx - dIdx) !== 1 && at(dIdx - mIdx) !== 1) {
    const n = at(dIdx + (crypto.randomInt(2) ? 1 : -1));
    [bag[n], bag[mIdx]] = [bag[mIdx], bag[n]];
  }
  seats.forEach((s, i) => {
    s.role = bag[i] || null;
    s.shown = null;
    s.align = defaultAlign(role(s.role)?.team);
    s.reminders = [];
  });
  const used = inPlay();
  for (const s of seats) {
    s.shown = autoShown(s, used);
    if (s.shown) used.add(s.shown);
  }
  // Bounty Hunter: 1 Townsfolk is evil
  if (bag.includes('bountyhunter')) {
    const tf = seats.filter((s) => teamOf(s.role) === 'townsfolk' && s.role !== 'bountyhunter');
    if (tf.length) {
      const s = any(tf);
      s.align = 'evil';
      s.reminders.push({ role: 'bountyhunter', label: 'Evil Townsfolk' });
    }
  }
  // Village Idiot: with extras, 1 of the extras is drunk
  const vi = seats.filter((s) => s.role === 'villageidiot');
  if (vi.length > 1) any(vi).reminders.push({ role: 'villageidiot', label: 'Drunk' });
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
  layout: g.layout || 'circle',
});
const publicSeat = (s) => ({ id: s.id, name: s.name, playerId: s.playerId, dead: s.dead, ghost: s.ghost });
const fullSeat = (s) => ({ ...publicSeat(s), role: pub(role(s.role)), shown: pub(role(s.shown)), align: s.align, reminders: s.reminders, diedAt: s.diedAt || null, alerts: Boolean(s.playerId && R.members[s.playerId]?.push?.length) });

// Scarlet Woman: if 5 or more players are alive (Travellers don't count) and the Demon dies,
// she becomes the Demon. The grimoire changes at once; she keeps seeing the Scarlet Woman until
// the storyteller tells her (her night step, or "Show" in person).
function scarletWoman(dead) {
  if (role(dead.role)?.team !== 'demon') return;
  const alive = g.seats.filter((x) => role(x.role)?.team !== 'traveller' && (!x.dead || x === dead)).length;
  if (alive < 5) return;
  const sw = g.seats.find((x) => x.role === 'scarletwoman' && !x.dead && !x.reminders.some((r) => /poison|drunk/i.test(r.label)));
  if (!sw) return;
  sw.role = dead.role;
  sw.shown = 'scarletwoman';
  sw.align = 'evil';
  sw.reminders = sw.reminders.filter((r) => r.role !== 'scarletwoman');
  sw.reminders.push({ role: 'scarletwoman', label: 'Is the Demon' });
  addLog(`${sw.name} (Scarlet Woman) is now the ${role(dead.role)?.name}`);
}

// the 1-of-2 info characters: the right player gets the team reminder, the other "Wrong"
const PAIR_MARK = { washerwoman: 'Townsfolk', librarian: 'Outsider', investigator: 'Minion' };
function pairMarks(step, seatIds, shownRole) {
  if (seatIds.length !== 2) return;
  for (const x of g.seats) x.reminders = x.reminders.filter((r) => r.role !== step);
  const hit = seatIds.findIndex((id) => g.seats.find((x) => x.id === id)?.role === shownRole);
  const right = hit === -1 ? 0 : hit; // false info: the first one shown gets the team reminder
  seatIds.forEach((id, i) => g.seats.find((x) => x.id === id)?.reminders.push({ role: step, label: i === right ? PAIR_MARK[step] : 'Wrong' }));
}

// the game record: what each player chose and was shown at night (storyteller; everyone at the end)
const withRole = (seatId) => {
  const x = g.seats.find((y) => y.id === seatId);
  return x ? `${x.name}${role(x.role) ? ` (${role(x.role).name})` : ''}` : '?';
};
function record(e) {
  const seat = g.seats.find((x) => x.id === e.seatId);
  (g.history ||= []).push({
    t: Date.now(),
    night: e.night,
    phase: g.phase === 'day' ? `Day ${g.day}` : `Night ${g.night}`,
    step: role(e.step)?.name || { minioninfo: 'Minion info', demoninfo: 'Demon info', card: 'Card from you' }[e.step] || e.step,
    stepId: e.step,
    icon: role(e.step)?.icon || null,
    who: seat?.name || '?',
    really: seat && role(e.step) && seat.role !== e.step && role(seat.role) ? role(seat.role).name : null,
    kind: e.kind,
    text: e.text,
    chose: e.chose || [],
    roles: (e.roles || []).map((r) => role(r)?.name || ROLES.get(r)?.name || r),
    seats: (e.seats || []).map(withRole),
    tagged: true,
    number: e.number ?? null,
    grim: Boolean(e.grim),
    off: e.off || '',
  });
  if (g.history.length > 600) g.history.shift();
}

// ---------- Night on phones ----------
const AUTO_MARK = { poisoner: 'Poisoned', monk: 'Safe', butler: 'Master' };
const prompts = () => (g.prompts ||= []);
const openPrompt = (pid) => ['night', 'day'].includes(g.phase) && prompts().find((p) => p.playerId === pid && !p.answer && (p.night === g.night || p.kind === 'info'));
const seatName = (id) => g.seats.find((s) => s.id === id)?.name || '?';
// what the player sees: never whether it's a decoy
function promptForPlayer(p) {
  if (!p) return null;
  return {
    id: p.id,
    kind: p.kind,
    text: p.text,
    count: p.count,
    target: p.target,
    roles: p.roles.map((id) => pub(role(id) || ROLES.get(id))).filter(Boolean),
    seats: p.seats.map((id) => ({ id, name: seatName(id) })),
    number: p.number,
    seatsLabel: p.seatsLabel || '',
    rolesLabel: p.rolesLabel || '',
    notSelf: Boolean(p.notSelf),
    grim: p.grim ? g.seats.map((s) => ({ name: s.name, dead: s.dead, role: pub(role(s.role)), shown: pub(role(s.shown)), align: s.align, reminders: s.reminders.map((r) => r.label) })) : null,
    choices: p.kind === 'choose' && p.target === 'character' ? scriptRoles().map(pub) : null,
  };
}
const promptForST = (p) => ({
  id: p.id,
  step: p.step,
  seatId: p.seatId,
  name: seatName(p.seatId),
  kind: p.kind,
  text: p.text,
  count: p.count,
  target: p.target,
  answer: p.answer && { seats: p.answer.seats.map((id) => ({ id, name: seatName(id) })), roles: p.answer.roles.map((id) => pub(role(id) || ROLES.get(id))).filter(Boolean), yes: p.answer.yes, ack: p.answer.ack },
});
// decoys: 1–2 sleeping players get a buzz too, so a buzz gives nothing away
const decoyTimers = new Map(); // room code -> [timeouts]
function clearDecoys(code) {
  for (const t of decoyTimers.get(code) || []) clearTimeout(t);
  decoyTimers.delete(code);
}
function scheduleDecoys(room) {
  clearDecoys(room.code);
  const night = room.g.night;
  const list = [];
  for (let k = 1 + crypto.randomInt(2); k > 0; k--)
    list.push(
      setTimeout(() => {
        try {
          use(room);
          if (rooms.get(room.code) !== room || g.phase !== 'night' || g.night !== night) return;
          const busy = new Set(prompts().filter((p) => p.night === night && !p.answer).map((p) => p.playerId));
          // someone who can answer: a phone that's connected now or has alerts on
          const hasPhone = (id) => (io?.sockets.adapter.rooms.get(`${room.code}:p:${id}`)?.size || 0) > 0 || Boolean(room.members[id]?.push?.length);
          const free = g.seats.filter((s) => s.playerId && !busy.has(s.playerId) && hasPhone(s.playerId));
          if (!free.length) return;
          const s = any(free);
          notify(room, s.playerId, TURN);
          prompts().push({ id: crypto.randomBytes(5).toString('hex'), night, step: 'decoy', seatId: s.id, playerId: s.playerId, kind: 'choose', text: 'Nothing for you tonight. Tap any player to go back to sleep.', count: 1, target: 'player', roles: [], seats: [], number: null, grim: false, fake: true, answer: null });
          broadcast(room);
        } catch (err) {
          console.error('decoy:', err);
        }
      }, 8000 + crypto.randomInt(50000))
    );
  decoyTimers.set(room.code, list);
}
function endNightPrompts() {
  g.prompts = [];
  clearDecoys(R.code);
}

export function publicView() {
  return {
    ...base(),
    script: { name: script().name, logo: script().logo },
    seats: g.reveal ? g.seats.map(fullSeat) : g.seats.map(publicSeat),
    reveal: g.reveal,
  };
}

// the side a phone shows goes with the character that player thinks they are: a Drunk or Marionette
// sees "good", a Lunatic "evil"; otherwise their real side (which the storyteller may have changed)
const phoneAlign = (seat) => (seat.shown && seat.shown !== seat.role && role(seat.shown) ? defaultAlign(role(seat.shown).team) : seat.align);

export function playerView(pid) {
  const seat = g.seats.find((s) => s.playerId === pid);
  const started = g.phase !== 'setup';
  const shownId = seat && started ? seat.shown || seat.role : null;
  return {
    ...base(),
    script: scriptView(),
    seats: g.reveal ? g.seats.map(fullSeat) : g.seats.map(publicSeat),
    reveal: g.reveal,
    history: g.reveal ? g.history || [] : [],
    me: seat
      ? { seatId: seat.id, name: seat.name, dead: seat.dead, ghost: seat.ghost, role: pub(role(shownId)), align: started ? phoneAlign(seat) : null }
      : null,
    notes: g.notes[pid] || '',
    guesses: g.guesses[pid] || {},
    prompt: seat ? promptForPlayer(openPrompt(pid)) : null,
    groups: groupView(pid),
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
  const skipped = [];
  for (const id of order) {
    if (SPECIAL[id]) {
      if ((id === 'minioninfo' || id === 'demoninfo') && (players().length < 7 || (g.offBag || []).includes('lilmonsta'))) continue;
      out.push({ id, special: true, name: SPECIAL[id].name, text: SPECIAL[id].text, seats: [] });
      continue;
    }
    const seats = g.seats.filter((s) => s.role === id || s.shown === id);
    if (!seats.length && !(g.offBag || []).includes(id)) continue;
    const r = role(id) || ROLES.get(id);
    const text = (first ? r?.firstNightReminder : r?.otherNightReminder) || '';
    if (!text) continue;
    // dead players don't wake. Kept: a step about that character's own death since dawn (Ravenkeeper,
    // Sage, Barber…), the Zombuul (acts while it looks dead) and anyone marked "Has Ability" (Vigormortis)
    if (seats.length && seats.every((s) => s.dead)) {
      const name = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const ownDeath = new RegExp(`the ${name} (died|was killed)|killed the ${name}`, 'i').test(text);
      const sinceDawn = (s) => s.diedAt === `n${g.night}` || s.diedAt === `d${g.night - 1}`;
      const acts = seats.some((s) => s.role === 'zombuul' || s.reminders.some((x) => /has ability/i.test(x.label)) || (ownDeath && sinceDawn(s)));
      if (!acts) {
        skipped.push(r.name);
        continue;
      }
    }
    out.push({
      id,
      name: r.name,
      icon: r.icon,
      team: r.team,
      text,
      seats: seats.map((s) => ({ id: s.id, name: s.name, dead: s.dead, really: s.role !== id ? role(s.role)?.name : null })),
    });
  }
  return { first, list: out, skipped };
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
    counts: counts(players().length),
    players: players().length,
    offBag: (g.offBag || []).map((id) => pub(role(id))).filter(Boolean),
    rules: g.rules,
    night: g.night,
    nightOrder: g.phase === 'night' ? nightOrder() : null,
    history: g.history || [],
    prompts: g.phase === 'night' ? prompts().filter((p) => !p.fake && p.night === g.night).map(promptForST) : [],
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
    if (key.startsWith('g:')) continue;
    const [a, b] = key.split('|');
    if (a === me || b === me) out[a === me ? b : a] = list;
  }
  for (const gr of myGroups(me)) out[`g:${gr.id}`] = g.chats[`g:${gr.id}`] || [];
  return out;
}
const myGroups = (me) => Object.values(g.groups || {}).filter((x) => x.members.includes(me));
const groupView = (me) => myGroups(me).map((x) => ({ id: `g:${x.id}`, name: x.name, members: x.members.map((m) => ({ id: m, name: R.members[m]?.name || '?' })) }));

export function attach(server) {
  io = server;
  // a restart (deploy) in the middle of a day: the "30 seconds" and "time's up" alerts still go out
  for (const room of rooms.values()) if (room.g.timer?.running) scheduleTimerPush(room);
}

// ---------- Push: only when none of the player's open pages is visible ----------
function seenNow(code, playerId) {
  const ids = io?.sockets.adapter.rooms.get(`${code}:p:${playerId}`);
  if (!ids) return false;
  // a page counts as on screen only while it keeps saying so (every 10 s): iPhones freeze a page
  // when locked before it can say goodbye, and its connection lingers for a while
  for (const id of ids) {
    const x = io.sockets.sockets.get(id);
    if (x?.botcVisible && Date.now() - (x.botcSeen || 0) < 20000) return true;
  }
  return false;
}
function notify(room, playerId, payload) {
  const m = room.members[playerId];
  if (!m?.push?.length || seenNow(room.code, playerId)) return;
  const words = m.lang === 'nl' && payload.nl ? payload.nl : payload;
  push.send(m.push, { title: words.title, body: words.body, tag: `botc-${room.code}`, url: `./?code=${room.code}` }).then((gone) => {
    if (!gone.length) return;
    m.push = m.push.filter((x) => !gone.includes(x.endpoint));
    persist(room);
  });
}
const notifySeated = (room, payload) => room.g.seats.forEach((s) => s.playerId && notify(room, s.playerId, payload));
// the same words for a real prompt and a decoy
const CARD = { title: '🃏 From the storyteller', body: 'Open the game to see it.', nl: { title: '🃏 Van de verteller', body: 'Open het spel om het te zien.' } };
const TURN = { title: '🌙 Your turn', body: 'Open the game: the storyteller needs you.', nl: { title: '🌙 Jouw beurt', body: 'Open het spel: de verteller heeft je nodig.' } };
// day timer: 30 seconds left and time's up, also to locked phones
const timerPush = new Map(); // room code -> [timeouts]
function scheduleTimerPush(room) {
  for (const t of timerPush.get(room.code) || []) clearTimeout(t);
  timerPush.delete(room.code);
  const t = room.g.timer;
  if (!t.running) return;
  const left = t.endsAt - Date.now();
  const list = [];
  if (left > 31000) list.push(setTimeout(() => rooms.get(room.code) === room && notifySeated(room, { title: '⏳ 30 seconds left', body: 'Start wrapping up your conversation.', nl: { title: '⏳ Nog 30 seconden', body: 'Rond je gesprek af.' } }), left - 30000));
  if (left > 0) list.push(setTimeout(() => rooms.get(room.code) === room && notifySeated(room, { title: "🔔 Time's up", body: 'Return to the town square.', nl: { title: '🔔 De tijd is om', body: 'Terug naar het dorpsplein.' } }), left));
  timerPush.set(room.code, list);
}
export const stats = () => ({ rooms: rooms.size });

// A "house room": a fixed game room for a venue (e.g. the Wexer bar screen), never cleaned up.
// The host sets its code and storyteller code over the host API (see server.js).
export function house(code, stCode) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (code.length < 4) return { ok: false, error: 'House code needs 4–8 letters or digits' };
  let room = rooms.get(code);
  if (!room) {
    room = { code, created: Date.now(), touched: Date.now(), g: blank(), members: {}, tokens: [], stCode: '', scripts: [] };
    rooms.set(code, room);
  }
  room.house = true;
  const clean = String(stCode || '').replace(/\D/g, '').slice(0, 8);
  if (clean.length >= 4 && clean !== room.stCode) {
    room.stCode = clean;
    room.tokens = []; // a new storyteller code logs out the old storyteller devices
  }
  if (!room.stCode) room.stCode = String(crypto.randomInt(100000, 1000000));
  persist(room);
  const g0 = room.g;
  return { ok: true, code, phase: g0.phase, players: g0.seats.length, alive: g0.seats.filter((x) => !x.dead).length };
}

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
    if (!user) return typeof playerId === 'string' && Object.hasOwn(R.members, playerId) && !R.members[playerId].manual ? playerId : null;
    return Object.entries(R.members).find(([, m]) => m.userId === user.id)?.[0] || null;
  };
  // every handler gets an object and a real callback (or none), whatever a client sends,
  // and a bug in one handler never takes the server down for every table
  const listen = (ev, fn) =>
    socket.on(ev, (p, ack) => {
      if (typeof p === 'function') [p, ack] = [undefined, p];
      if (typeof ack !== 'function') ack = undefined;
      if (p === null || typeof p !== 'object' || Array.isArray(p)) p = {};
      try {
        fn(p, ack);
      } catch (err) {
        console.error(`${ev}:`, err);
        ack?.({ ok: false, error: 'Something went wrong' });
      }
    });
  const pid = () => socket.data.playerId;
  const isST = () => Boolean(socket.data.st);
  const seatOf = (id) => g.seats.find((s) => s.id === id);
  // every handler works on the socket's own room
  const on = (ev, fn) =>
    listen(ev, (p, ack) => {
      const room = rooms.get(socket.data.code);
      if (!room) return ack?.({ ok: false, error: 'This game room no longer exists' });
      use(room);
      fn(p, ack);
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
  listen('room:create', (_p, ack) => {
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
  listen('room:join', ({ code, name, playerId } = {}, ack) => {
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
  listen('room:watch', ({ code } = {}, ack) => {
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
  listen('room:st', ({ code, stCode } = {}, ack) => {
    const room = findRoom(code);
    if (!room || tooMany(`st:${ip}`, 8, 300000) || tooMany(`st-room:${room.code}`, 30, 600000)) return ack?.({ ok: false, error: room ? 'Too many tries, wait 5 minutes' : 'No game with that code' });
    if (String(stCode || '') !== room.stCode) {
      fail(`st:${ip}`);
      fail(`st-room:${room.code}`);
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
  // test mode: the storyteller's device plays a name added by hand (no phone) in its own frame.
  // Needs the storyteller token, so only the storyteller can do this, and only for names without a phone.
  listen('room:dev', ({ code, token, playerId } = {}, ack) => {
    const room = findRoom(code);
    if (!room) return ack?.({ ok: false, error: 'This game room no longer exists' });
    if (!token || !room.tokens.includes(token)) return ack?.({ ok: false, error: 'Test mode needs the storyteller' });
    if (typeof playerId !== 'string' || !Object.hasOwn(room.members, playerId) || !room.members[playerId].manual) return ack?.({ ok: false, error: 'Only names added by hand can be test players' });
    enter(room);
    socket.data.playerId = playerId;
    socket.join(ch(`p:${playerId}`));
    ack?.({ ...views(), playerId, name: R.members[playerId].name });
  });
  // coming back (page reload, new connection)
  listen('room:hello', ({ code, token, playerId } = {}, ack) => {
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
  on('botc:guess', ({ seatId, role: r, note, align } = {}, ack) => {
    if (!pid()) return ack?.({ ok: false });
    if (!seatOf(seatId)) return ack?.({ ok: false });
    const mine = (g.guesses[pid()] ||= {});
    const al = align === 'good' || align === 'evil' ? align : null;
    if (!r && !note && !al) delete mine[seatId];
    else mine[seatId] = { role: r ? norm(r) : null, note: String(note || '').slice(0, 200), align: al };
    persist();
    ack?.({ ok: true, guesses: mine });
  });

  // ----- Group chats: started by a player; only members see them (not the storyteller either) -----
  const seatedId = (id) => g.seats.some((x) => x.playerId === id);
  const groupOf = (id) => (g.groups && Object.hasOwn(g.groups, id) ? g.groups[id] : null);
  on('botc:groupCreate', ({ name, members } = {}, ack) => {
    const me = pid();
    if (!me || !seatedId(me)) return ack?.({ ok: false, error: 'You are not in this game' });
    const list = [...new Set([me, ...(Array.isArray(members) ? members : []).map(String).filter(seatedId)])];
    if (list.length < 3) return ack?.({ ok: false, error: 'Pick at least 2 other players' });
    g.groups ||= {};
    if (Object.keys(g.groups).length >= 40) return ack?.({ ok: false, error: 'Too many groups in this game' });
    const id = crypto.randomBytes(4).toString('hex');
    g.groups[id] = { id, name: String(name || '').trim().slice(0, 30) || list.map((m) => R.members[m]?.name).join(', ').slice(0, 30), members: list, by: me };
    broadcast();
    ack?.({ ok: true, id: `g:${id}` });
  });
  on('botc:groupLeave', ({ id } = {}, ack) => {
    const gr = groupOf(String(id || '').replace(/^g:/, ''));
    if (!gr || !gr.members.includes(pid())) return ack?.({ ok: false });
    gr.members = gr.members.filter((m) => m !== pid());
    if (gr.members.length < 2) {
      delete g.groups[gr.id];
      delete g.chats[`g:${gr.id}`];
    }
    broadcast();
    ack?.({ ok: true });
  });

  // ----- Chats: truly private between two players; the storyteller is 'st' -----
  on('botc:send', ({ to, text } = {}, ack) => {
    const me = isST() ? 'st' : pid();
    if (!me) return ack?.({ ok: false });
    const clean = String(text || '').trim().slice(0, 1000);
    if (!clean) return ack?.({ ok: false });
    // a group chat
    if (typeof to === 'string' && to.startsWith('g:')) {
      const gr = groupOf(to.slice(2));
      if (me === 'st' || !gr || !gr.members.includes(me)) return ack?.({ ok: false });
      if (chatLocked()) return ack?.({ ok: false, error: 'Chats are locked at night' });
      const msg = { from: me, to, text: clean, t: Date.now() };
      (g.chats[to] ||= []).push(msg);
      if (g.chats[to].length > 300) g.chats[to].shift();
      persist();
      for (const m of gr.members) {
        io.to(ch(`p:${m}`)).emit('botc:msg', msg);
        if (m !== me) notify(R, m, { title: `💬 ${gr.name}`, body: `${R.members[me]?.name || '?'}: new message`, nl: { title: `💬 ${gr.name}`, body: `${R.members[me]?.name || '?'}: nieuw bericht` } });
      }
      return ack?.({ ok: true });
    }
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
    if (to !== 'st') {
      const from = me === 'st' ? null : R.members[me]?.name || '?';
      notify(R, to, { title: '💬 New message', body: from ? `From ${from}` : 'From the storyteller', nl: { title: '💬 Nieuw bericht', body: from ? `Van ${from}` : 'Van de verteller' } });
    }
    ack?.({ ok: true });
  });

  // ----- Storyteller -----
  on('botc:script', st(({ id }) => {
    if (g.phase !== 'setup' || !findScript(id)) return { ok: false };
    g.scriptId = id;
    g.bluffs = [];
    g.offBag = [];
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
    g.seats = [...new Set(ids)].filter((id) => typeof id === 'string' && Object.hasOwn(R.members, id)).slice(0, 20).map((id) => g.seats.find((s) => s.playerId === id) || seatFor(id));
    for (const s of g.seats) s.name = R.members[s.playerId]?.name || s.name;
  }));
  // the town square like the real table: shape, and moving a seat at any time
  on('botc:layout', st(({ shape }) => {
    if (!['circle', 'table'].includes(shape)) return { ok: false };
    g.layout = shape;
  }));
  on('botc:moveSeat', st(({ seatId, dir }) => {
    const i = g.seats.findIndex((x) => x.id === seatId);
    if (i < 0 || g.seats.length < 2) return { ok: false };
    const j = (i + (dir < 0 ? -1 : 1) + g.seats.length) % g.seats.length;
    [g.seats[i], g.seats[j]] = [g.seats[j], g.seats[i]];
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
    if (players().length < 5) return { ok: false, error: 'At least 5 players' };
    const bag = randomBag();
    if (!bag) return { ok: false, error: 'This script has too few characters for that many players' };
    dealRoles(bag);
    g.bluffs = [];
  }));
  on('botc:dealRoles', st(({ ids }) => {
    const n = players().length;
    if (!Array.isArray(ids) || ids.length > 40) return { ok: false };
    const list = ids.map(norm).filter((id) => role(id) || ROLES.get(id));
    if (list.length !== ids.length) return { ok: false, error: 'Unknown character in the list' };
    if (list.filter((id) => !NOT_DEALT[id]).length !== n) return { ok: false, error: `Pick exactly ${n} characters` };
    if (list.some((id, i) => !MULTI[id] && list.indexOf(id) !== i)) return { ok: false, error: 'A character is picked twice' };
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
      s.diedAt = s.dead ? (g.phase === 'night' ? `n${g.night}` : `d${g.day}`) : null;
      addLog(`${s.name} ${s.dead ? 'died' : 'is alive again'}`);
      if (s.dead) scarletWoman(s);
      else {
        // a mis-tap undone: no "Died Today", and a Scarlet Woman who wasn't told yet is herself again
        s.reminders = s.reminders.filter((r) => !(r.role === 'undertaker' && r.label === 'Died Today'));
        const sw = teamOf(s.role) === 'demon' && g.seats.find((x) => x !== s && x.shown === 'scarletwoman' && x.role === s.role && x.reminders.some((r) => r.label === 'Is the Demon'));
        if (sw) {
          sw.role = 'scarletwoman';
          sw.shown = null;
          sw.reminders = sw.reminders.filter((r) => r.label !== 'Is the Demon');
          addLog(`${sw.name} is the Scarlet Woman again`);
        }
      }
      if (s.dead && g.phase === 'day' && g.seats.some((x) => x.role === 'undertaker' || x.shown === 'undertaker')) {
        for (const x of g.seats) x.reminders = x.reminders.filter((r) => !(r.role === 'undertaker' && r.label === 'Died Today'));
        s.reminders.push({ role: 'undertaker', label: 'Died Today' });
      }
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

  // ----- Push notifications -----
  socket.botcVisible = true;
  socket.botcSeen = Date.now();
  listen('push:visible', ({ visible } = {}) => {
    socket.botcVisible = Boolean(visible);
    socket.botcSeen = Date.now();
  });
  // storyteller: a test alert to one player or everyone, right away (also when their page is open)
  on('push:testSt', st(({ seatId }) => {
    const room = R;
    const seats = g.seats.filter((x) => x.playerId && (!seatId || x.id === seatId));
    const on = seats.filter((x) => R.members[x.playerId]?.push?.length);
    for (const x of on) {
      const m = R.members[x.playerId];
      const nl = m.lang === 'nl';
      push.send(m.push, { title: '🔔 Test', body: nl ? 'De verteller test je meldingen. Werkt!' : 'The storyteller is testing your alerts. It works!', tag: `botc-${room.code}-test`, url: `./?code=${room.code}` });
    }
    return { ok: true, sent: on.map((x) => x.name), off: seats.filter((x) => !on.includes(x)).map((x) => x.name) };
  }));
  // "send a test": in 5 seconds, also when the page is open, so you can lock the phone first
  on('push:test', (_d, ack) => {
    const room = R;
    const m = pid() && R.members[pid()];
    if (!m?.push?.length) return ack?.({ ok: false, error: 'This phone has no alerts turned on for this game' });
    const nl = m.lang === 'nl';
    setTimeout(() => {
      push.send(m.push, { title: nl ? '🔔 Test' : '🔔 Test', body: nl ? 'Meldingen werken op deze telefoon.' : 'Alerts work on this phone.', tag: `botc-${room.code}-test`, url: `./?code=${room.code}` }, (err) => {
        io.to(`${room.code}:p:${pid()}`).emit('push:testResult', { ok: false, error: `${err.statusCode || ''} ${err.body || err.message}`.trim().slice(0, 200) });
      });
    }, 5000);
    ack?.({ ok: true });
  });
  on('push:subscribe', ({ sub, lang } = {}, ack) => {
    const m = pid() && R.members[pid()];
    const clean = push.cleanSub(sub);
    if (!m || !clean) return ack?.({ ok: false });
    m.push = [...(m.push || []).filter((x) => x.endpoint !== clean.endpoint), clean].slice(-3);
    m.lang = lang === 'nl' ? 'nl' : 'en';
    persist();
    ack?.({ ok: true });
  });
  on('push:unsubscribe', ({ endpoint } = {}, ack) => {
    const m = pid() && R.members[pid()];
    if (m?.push) m.push = m.push.filter((x) => x.endpoint !== endpoint);
    persist();
    ack?.({ ok: true });
  });

  // ----- Night on phones: wake a player, they answer on their phone -----
  const ids = (list, ok, max) => (Array.isArray(list) ? list : []).map(String).filter(ok).slice(0, max);
  on('botc:prompt', st(({ seatIds, step, kind, text, count, target, roles, seats, number, grim, seatsLabel, rolesLabel, notSelf, off }) => {
    if (!['night', 'day'].includes(g.phase)) return { ok: false, error: 'Only during the game' };
    if (kind === 'choose' && g.phase !== 'night') return { ok: false, error: 'Players only choose at night' };
    if (!['choose', 'info'].includes(kind)) return { ok: false };
    const to = ids(seatIds, (id) => seatOf(id)?.playerId, 20);
    if (!to.length) return { ok: false, error: 'Nobody to wake' };
    const first = !prompts().some((p) => p.night === g.night && !p.fake);
    for (const seatId of to) {
      const s = seatOf(seatId);
      // a new prompt replaces an unanswered one for the same step
      g.prompts = prompts().filter((p) => !(p.seatId === seatId && p.step === step && !p.answer && !p.fake));
      prompts().push({
        id: crypto.randomBytes(5).toString('hex'),
        night: g.night,
        step: String(step || '').slice(0, 40),
        seatId,
        playerId: s.playerId,
        kind,
        text: String(text || '').slice(0, 300),
        count: Math.min(5, Math.max(1, Number(count) || 1)),
        target: ['player', 'character', 'yesno'].includes(target) ? target : 'player',
        roles: ids(roles, (id) => role(id) || ROLES.get(id), 12),
        seats: ids(seats, (id) => seatOf(id), 20),
        number: Number.isFinite(Number(number)) && number !== null && number !== '' ? Math.round(Number(number)) : null,
        grim: Boolean(grim),
        seatsLabel: String(seatsLabel || '').slice(0, 80),
        rolesLabel: String(rolesLabel || '').slice(0, 80),
        notSelf: Boolean(notSelf),
        fake: false,
        answer: null,
      });
    }
    if (first && g.phase === 'night') scheduleDecoys(R);
    for (const seatId of to) notify(R, seatOf(seatId).playerId, g.phase === 'night' ? TURN : CARD);
    if (kind === 'info' && PAIR_MARK[step]) pairMarks(step, ids(seats, (id) => seatOf(id), 2), ids(roles, (id) => role(id), 1)[0]);
    if (kind === 'info') {
      const p = prompts().at(-1);
      for (const seatId of to)
        record({ night: g.night, step: p.step, seatId, kind: 'info', text: p.text, roles: p.roles, seats: p.seats, number: p.number, grim: p.grim, off: String(off || '').slice(0, 20) });
    }
  }));
  on('botc:cancelPrompt', st(({ id }) => {
    g.prompts = prompts().filter((p) => p.id !== id);
  }));
  on('botc:answer', ({ id, seats, roles, yes } = {}, ack) => {
    const p = prompts().find((x) => x.id === id && x.playerId === pid() && !x.answer);
    if (!p || (p.kind === 'choose' && g.phase !== 'night')) return ack?.({ ok: false });
    if (p.notSelf && (Array.isArray(seats) ? seats : []).includes(p.seatId)) return ack?.({ ok: false, error: 'You can\u2019t choose yourself' });
    p.answer = {
      seats: ids(seats, (sid) => seatOf(sid), p.count),
      roles: ids(roles, (rid) => role(rid), p.count),
      yes: typeof yes === 'boolean' ? yes : null,
      ack: p.kind === 'info',
      t: Date.now(),
    };
    // Scarlet Woman told on her phone: from now on she sees her new character
    if (!p.fake && p.step === 'scarletwoman' && p.kind === 'info') {
      const sw = seatOf(p.seatId);
      if (sw?.shown === 'scarletwoman' && role(sw.role)?.team === 'demon') sw.shown = null;
    }
    // Poisoner, Monk, Butler: their marker goes on the grimoire at once (it changes the info that follows),
    // moved from last night's player. Not when they're drunk or poisoned themselves.
    const label = AUTO_MARK[p.step];
    const actor = seatOf(p.seatId);
    const off = actor && (actor.role === 'drunk' || actor.reminders.some((r) => /poison|drunk/i.test(r.label)));
    if (!p.fake && label && p.answer.seats[0] && !off) {
      for (const x of g.seats) x.reminders = x.reminders.filter((r) => !(r.role === p.step && r.label === label));
      seatOf(p.answer.seats[0]).reminders.push({ role: p.step, label });
    }
    if (!p.fake && p.kind === 'choose') record({ night: p.night, step: p.step, seatId: p.seatId, kind: 'choose', text: p.text, chose: [...p.answer.seats.map(withRole), ...p.answer.roles.map((r) => role(r)?.name), p.answer.yes === null ? null : p.answer.yes ? 'Yes' : 'No'].filter(Boolean) });
    broadcast();
    ack?.({ ok: true });
  });

  // ----- Phases and the day timer -----
  on('botc:start', st(() => {
    if (g.phase !== 'setup') return { ok: false, error: 'The game has already started' };
    if (players().length < 5) return { ok: false, error: 'At least 5 players' };
    if (g.seats.some((s) => !s.role)) return { ok: false, error: 'Give everyone a character first' };
    const drunk = g.seats.find((s) => THINKS[s.role] && !s.shown && s.role !== 'marionette');
    if (drunk) return { ok: false, error: `Choose what ${drunk.name} (${role(drunk.role).name}) sees first` };
    Object.assign(g, { phase: 'night', night: 1, day: 0, winner: null, reveal: false, chats: {}, groups: {}, notes: {}, guesses: {}, log: [], prompts: [], history: [] });
    for (const s of g.seats) Object.assign(s, { dead: false, ghost: true, diedAt: null });
    g.timer = { ...g.timer, running: false, endsAt: 0, left: g.timer.minutes * 60000 };
    addLog(`Game started: ${script().name}, ${g.seats.length} players`);
    // the Fortune Teller needs a red herring (a good player who reads as the Demon): place one if the
    // storyteller hasn't; it can be moved like any reminder
    const herring = (r) => r.role === 'fortuneteller' && /red herring/i.test(r.label);
    if (g.seats.some((s) => s.role === 'fortuneteller') && !g.seats.some((s) => s.reminders.some(herring))) {
      const good = g.seats.filter((s) => s.align === 'good' && !EVIL_TEAMS.includes(teamOf(s.role)) && !isTraveller(s));
      if (good.length) {
        const h = any(good);
        h.reminders.push({ role: 'fortuneteller', label: 'Red Herring' });
        addLog(`Fortune Teller's red herring: ${h.name}`);
      }
    }
  }));
  on('botc:phase', st(({ to }) => {
    if (g.phase === 'setup' || g.phase === 'ended') return { ok: false };
    if (to === 'day' && g.phase === 'night') {
      endNightPrompts();
      for (const x of g.seats) x.reminders = x.reminders.filter((r) => !(r.role === 'undertaker' && r.label === 'Died Today'));
      g.phase = 'day';
      g.day = g.night;
      // every day starts with the full time (the storyteller starts the clock)
      Object.assign(g.timer, { running: false, endsAt: 0, left: g.timer.minutes * 60000 });
      scheduleTimerPush(R);
      addLog('Dawn');
    } else if (to === 'night' && g.phase === 'day') {
      g.phase = 'night';
      g.night = g.day + 1;
      pauseTimer();
      addLog('Dusk');
    }
  }));
  const startTimer = () => {
    const t = g.timer;
    if (t.running && t.endsAt > Date.now()) return; // already counting (a second tap, or a second device)
    t.endsAt = Date.now() + (!t.running && t.left > 0 ? t.left : t.minutes * 60000);
    t.running = true;
  };
  const pauseTimer = () => {
    const t = g.timer;
    if (t.running) t.left = Math.max(0, t.endsAt - Date.now());
    t.running = false;
    scheduleTimerPush(R);
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
      // one more minute, also after the time ran out
      if (t.running) t.endsAt = Math.max(t.endsAt, Date.now()) + 60000;
      else t.left += 60000;
    }
    if (action === 'minutes' && minutes >= 1 && minutes <= 60) {
      t.minutes = Math.round(minutes);
      if (!t.running) t.left = t.minutes * 60000;
    }
    scheduleTimerPush(R);
  }));
  on('botc:end', st(({ winner }) => {
    if (g.phase === 'setup') return { ok: false };
    g.winner = ['good', 'evil'].includes(winner) ? winner : null;
    g.phase = 'ended';
    endNightPrompts();
    pauseTimer();
    g.reveal = true;
    addLog(g.winner ? `${g.winner === 'good' ? 'Good' : 'Evil'} wins` : 'Game ended');
  }));
  on('botc:reveal', st(({ on }) => {
    g.reveal = Boolean(on);
  }));
  on('botc:newGame', st(() => {
    const keep = { scriptId: g.scriptId, timer: { ...g.timer, running: false, left: g.timer.minutes * 60000 }, rules: g.rules, stNotes: g.stNotes, layout: g.layout };
    const seats = g.seats.map((s) => ({ ...s, role: null, shown: null, align: 'good', dead: false, ghost: true, reminders: [] }));
    endNightPrompts();
    R.g = g = { ...blank(), ...keep, seats };
    scheduleTimerPush(R);
  }));
}

