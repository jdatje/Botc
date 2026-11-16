// part of the client (app.js is the entry): see the comment at the top of app.js
import { setupRules } from './setup.js';
import { suggest, followUps } from './night.js';
import { $, esc, fmt, iconOf, osk, token } from './core.js';
import { EMBED, done, offset, phaseLabel, roleById, roomCode, roomPlayers, st, timeLeft } from './app.js';
import { chatsBody } from './chats.js';
import { recordLine, revealHtml, scriptHtml, squareMid } from './player.js';
import { joinUrl } from './screens.js';
import { nightCtx, setupCounter } from './sheets.js';

// ---------- Storyteller ----------
export const ST_TABS = [
  ['setup', '🛠️', 'Setup'],
  ['grim', '📕', 'Grimoire'],
  ['night', '🌙', 'Night'],
  ['chats', '💬', 'Chats'],
  ['notes', '📝', 'Notes'],
  ['script', '📜', 'Script'],
];
export function stHeader() {
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

export const ST_BODY = {
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
        <label class="toggle"><input type="checkbox" data-act="reveal" ${v.reveal ? 'checked' : ''}> Show the grimoire on the table view and phones</label>
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
          .map((s, i) => `<li><span class="seat-i">${i + 1}</span><b>${esc(s.name)}</b>${s.role ? `<span class="muted small">${esc(s.role.name)}${s.shown ? ` (sees ${esc(s.shown.name)})` : ''}</span>` : ''}<span class="grow"></span><button class="icon-btn" data-act="move" data-seat="${s.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" data-act="move" data-seat="${s.id}" data-dir="1" ${i === v.seats.length - 1 ? 'disabled' : ''}>↓</button></li>`)
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
          ${s.dead ? `<span class="shroud ${s.ghost ? '' : 'voted'}"></span>` : ''}
          <span class="seat-name">${esc(s.name)}</span>
          ${s.shown ? `<span class="seat-note">sees ${esc(s.shown.name)}</span>` : ''}
          ${s.reminders.length ? `<span class="rtks">${s.reminders.map((r, i) => { const rr = roleById(r.role); return `<span class="rtk" style="--i:${i}" title="${esc(rr?.name || '')}: ${esc(r.label)}">${rr ? `<img src="${esc(iconOf(rr, ['minion', 'demon'].includes(rr.team) ? 'evil' : 'good'))}" alt="" draggable="false">` : ''}<b>${esc(r.label)}</b></span>`; }).join('')}</span>` : ''}
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
    if (!v.nightOrder) return `<div class="center"><p class="h">🌙</p><p class="muted">The night order shows up here at night, with only the characters in play.</p></div><h3 class="h">Game record</h3><div id="log">${logItems()}</div>`;
    const list = v.nightOrder.list;
    const ctx = nightCtx();
    return `<h2 class="h">${v.nightOrder.first ? 'First night' : `Night ${v.night}`}</h2><p class="hint">📱 wakes that player on their phone; you can change what's sent first. Or do it in person and tap the step when it's done.</p>
      <ol class="night">${list
        .map((it) => {
          const k = `${v.night}:${it.id}`;
          const dead = it.seats.length && it.seats.every((s) => s.dead);
          const canWake = !['dusk', 'dawn'].includes(it.id) && (it.special ? suggest(it, ctx).some((x) => x.to.length) : it.seats.length);
          const ps = v.prompts.filter((p) => p.step === it.id);
          const status = ps
            .map((p) => {
              const a = p.answer;
              const what = !a ? '<span class="wait">waiting…</span>' : a.ack ? '✓ seen' : `chose <b>${esc([...a.seats.map((x) => x.name), ...a.roles.map((r) => r.name), a.yes === null ? '' : a.yes ? 'yes' : 'no'].filter(Boolean).join(', ') || 'nothing')}</b>`;
              const fu = followUps(p, ctx);
              return `<div class="pstat"><span>📱 ${esc(p.name)}: ${what}</span>${!a ? `<button class="chip" data-act="unprompt" data-id="${p.id}">Cancel</button>` : ''}
                ${fu.map((f, i) => (f.note ? `<span class="small muted">${esc(f.label)}</span>` : `<button class="chip" data-act="follow" data-id="${p.id}" data-i="${i}">${esc(f.label)}</button>`)).join('')}</div>`;
            })
            .join('');
          return `<li class="${done.has(k) ? 'done' : ''} ${dead ? 'all-dead' : ''} ${it.special ? 'special' : ''}" data-act="nightdone" data-k="${esc(k)}">
            ${it.special ? `<span class="tk sm special-tk">${it.id === 'dusk' ? '🌆' : it.id === 'dawn' ? '🌅' : it.id === 'demoninfo' ? '😈' : '👹'}</span>` : token({ name: it.name, icon: it.icon, team: it.team }, { size: 'sm', label: false })}
            <div><b>${esc(it.name)}</b>${it.seats.length ? ` <span class="who">${it.seats.map((s) => `${esc(s.name)}${s.really ? ` (really ${esc(s.really)})` : ''}${s.dead ? ' ☠' : ''}`).join(', ')}</span>` : ''}
            <p>${esc(it.text).replace(/:reminder:/g, '<span class="rem-ico">◉</span>').replace(/\*([^*]+)\*/g, '<b>$1</b>')}</p>
            ${status}</div>
            ${canWake ? `<button class="wake-btn" data-act="wake" data-step="${esc(it.id)}" aria-label="Wake on their phone">📱</button>` : ''}
          </li>`;
        })
        .join('')}</ol>${v.nightOrder.skipped?.length ? `<p class="hint">Skipped (dead): ${esc(v.nightOrder.skipped.join(', '))}</p>` : ''}
        <h3 class="h">Game record</h3><div id="log">${logItems()}</div>`;
  },
  script: () => scriptHtml(st.script),
  chats: () => chatsBody(),
  notes() {
    return `<details class="st-free" ${st.stNotes ? 'open' : ''}><summary class="h">My notes</summary>
        <textarea id="st-notes" class="notes small-notes"${osk}>${esc(st.stNotes || '')}</textarea></details>
      <h3 class="h">Game record</h3>
      <p class="hint">Everything that happened, night by night: what each player chose and exactly what they were shown, deaths, and your own lines.</p>
      <form class="inline-form" id="log-form"><input id="log-in" placeholder="Add to the record, e.g. Test 3 claimed Chef" maxlength="300" autocomplete="off"${osk}><button class="btn small" type="submit">Add</button></form>
      <div id="log">${logItems()}</div>`;
  },
};
// the record: log lines + ability results, grouped per night/day in game order (newest on top)
function logItems() {
  const time = (t) => (t ? new Date(t - offset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  // game order: setup, first night, day 1, night 2, day 2, … after the game
  const rank = (ph) => {
    const m = /^(Night|Day) (\d+)$/.exec(ph || '');
    if (m) return m[1] === 'Night' ? 2 * Number(m[2]) - 1 : 2 * Number(m[2]);
    return ph === 'setup' ? -1 : 1e6;
  };
  const items = [
    ...st.log.map((l, i) => ({ t: l.t, i, phase: l.phase, html: `${/ died$/.test(l.text) ? '☠ ' : ''}${esc(l.text)}`, cls: 'rec-log' })),
    ...(st.history || []).map((h, i) => ({ t: h.t || 0, i: 1e5 + i, phase: h.phase || `Night ${h.night}`, html: recordLine(h), cls: `rec-ab ${h.kind}` })),
  ];
  if (!items.length) return '<p class="muted center">Nothing yet. Results show up here as soon as you send them.</p>';
  const phases = new Map();
  for (const it of items) {
    if (!phases.has(it.phase)) phases.set(it.phase, []);
    phases.get(it.phase).push(it);
  }
  const label = (n) => (n === 'Night 1' ? 'First night' : n === 'setup' ? 'Setup' : n === 'ended' ? 'After the game' : n);
  return [...phases.entries()]
    .sort((a, b) => rank(b[0]) - rank(a[0]))
    .map(([name, list]) => {
      // within a night or day: by time; older entries without a time keep their own order, after the first line
      const first = Math.min(...list.filter((x) => x.t).map((x) => x.t), Infinity);
      const key = (x) => (x.t ? x.t : (first === Infinity ? 0 : first) + 1 + x.i / 1e6);
      list.sort((x, y) => key(x) - key(y));
      return `<details class="rec-phase" open><summary>${/^Night/.test(name) ? '🌙' : /^Day/.test(name) ? '☀️' : '🕯️'} ${esc(label(name))}</summary><ul>${list.map((it) => `<li class="${it.cls}"><span class="rec-time">${time(it.t)}</span><div>${it.html}</div></li>`).join('')}</ul></details>`;
    })
    .join('');
}
export function updateLog() {
  const el = $('#log');
  if (el) el.innerHTML = logItems();
}
