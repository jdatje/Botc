import { JINXES, ROLES, defaultAlign } from './data.js';
import { THINKS, counts, inPlay, players, setupNote } from './deal.js';
import { nightOrder, openPrompt, promptForPlayer, promptForST, prompts } from './night.js';
import { role, script, scriptRoles, scripts, travellersAndFabled } from './scripts.js';
import { R, g, io, persist, requestList, use } from './state.js';

// ---------- Views ----------
export const pub = (r) => r && { id: r.id, name: r.name, team: r.team, ability: r.ability, icon: r.icon, reminders: r.reminders, setup: r.setup, setupNote: setupNote(r) };
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
export const chatLocked = () => g.phase === 'night';
export const base = () => ({
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
    requests: requestList(),
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
export const ch = (what) => `${R.code}:${what}`; // socket.io room names per game room

export function broadcast(room = R) {
  if (!io || !room) return;
  use(room);
  io.to(ch('st')).emit('botc:st', stView());
  io.to(ch('pub')).emit('botc:pub', publicView());
  // every phone in the room: seated players get their token, the others the join button
  for (const id of Object.keys(R.members)) io.to(ch(`p:${id}`)).emit('botc:me', playerView(id));
  persist();
}

export const chatKey = (a, b) => [a, b].sort().join('|');
export function chatsFor(me) {
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

