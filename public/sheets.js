// part of the client (app.js is the entry): see the comment at the top of app.js
import { setupRules, fmtNeed, MULTI, NOT_DEALT, TEAMS4 } from './setup.js';
import { suggest, offReason } from './night.js';
import { $, DEV, TEAMS, call, esc, isEvilTeam, langPicker, osk, store, toast, token } from './core.js';
import { ACT, EMBED, STYLES, applyStyle, boardpassLinks, boardpassUrl, enterRoom, mode, roleById, roomCode, saveSession, session, setMode, setSt, st, stCode, styleKey } from './app.js';
import { joinUrl } from './screens.js';
import { loadRoomPlayers, openTestMode } from './testmode.js';

// ---------- Sheets ----------
let sheetHandler = null;
export function openSheet(html, onClick, cls = '') {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet ${cls}"><button class="sheet-x" data-sheet="close" aria-label="Close">×</button>${html}</div>`;
  s.hidden = false;
  sheetHandler = onClick;
}
export function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet').innerHTML = '';
  sheetHandler = null;
  // the Demon may have chosen, or a device asked for a seat, while this sheet was open
  setTimeout(killPopup, 0);
  setTimeout(requestPopup, 0);
}
$('#sheet').addEventListener('click', (e) => {
  if (e.target.id === 'sheet' || e.target.closest('[data-sheet="close"]')) return closeSheet();
  sheetHandler?.(e);
});

export function rolePicker(list, { selected = [], title = 'Choose a character', extra = '' } = {}) {
  const groups = TEAMS.map(([team, label]) => {
    const rs = list.filter((r) => r.team === team);
    if (!rs.length) return '';
    return `<h4 class="team-h ${isEvilTeam(team) ? 'evil' : 'good'}">${label}</h4><div class="pick-grid">${rs
      .map((r) => `<button class="pick ${selected.includes(r.id) ? 'on' : ''}" data-role="${esc(r.id)}">${token(r, { size: 'sm' })}</button>`)
      .join('')}</div>`;
  }).join('');
  return `<h2 class="h">${esc(title)}</h2>${extra}${groups}`;
}

export function confirmSheet(text, ok = 'Yes') {
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
let shownCard = null;
function showCard(text, roles = [], align) {
  const el = $('#show');
  shownCard = { text, roles: roles.filter(Boolean) };
  const canSend = mode === 'st' && ['night', 'day'].includes(st?.phase);
  el.innerHTML = `<div class="show-in"><p class="show-text">${esc(text)}</p><div class="show-tokens">${roles.map((r) => token(r, { align, size: 'huge' })).join('')}</div>
    ${canSend ? `<button class="btn show-send" data-send-card="1">📱 Send to a player</button>` : ''}<p class="muted small">Tap to close</p></div>`;
  el.hidden = false;
}
$('#show').addEventListener('click', (e) => {
  $('#show').hidden = true;
  if (e.target.closest('[data-send-card]') && shownCard) sendCard(shownCard.text, shownCard.roles.map((r) => r.id));
});
// a card from the storyteller on a player's phone (by night or by day)
function sendCard(text, roleIds) {
  let to = [];
  const draw = () =>
    openSheet(
      `<h2 class="h">📱 Send this card</h2>
       <p class="show-text small-card">${esc(text)}</p>
       <div class="row">${roleIds.map((id) => token(roleById(id), { size: 'sm' })).join('')}</div>
       <h3 class="sub">To</h3>
       <div class="chips">${st.seats.filter((s) => s.playerId).map((s) => `<button class="chip ${to.includes(s.id) ? 'on' : ''}" data-to="${s.id}">${esc(s.name)}</button>`).join('')}</div>
       <div class="row sticky-foot"><button class="btn primary" data-send="1" ${to.length ? '' : 'disabled'}>📱 Send</button></div>`,
      async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.to) {
          to = to.includes(b.dataset.to) ? to.filter((x) => x !== b.dataset.to) : [...to, b.dataset.to];
          return draw();
        }
        if (b.dataset.send) {
          const res = await call('botc:prompt', { seatIds: to, step: 'card', kind: 'info', text, roles: roleIds });
          if (!res?.ok) return toast(res?.error || 'Could not send');
          closeSheet();
          toast(`📱 Sent to ${to.map((id) => st.seats.find((s) => s.id === id)?.name).join(', ')}`);
        }
      }
    );
  draw();
}

export function openCards() {
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
       <div class="row"><button class="btn primary" data-go="1">Show full screen</button>${['night', 'day'].includes(st.phase) ? `<button class="btn" data-send-it="1">📱 Send to a player</button>` : ''}</div>
       ${rolePicker(st.script.roles, { selected: picked, title: 'Characters' })}`,
      (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.quick === 'bluffs') {
          closeSheet();
          return showCard('These characters are not in play', st.bluffs);
        }
        if (b.dataset.sendIt) {
          closeSheet();
          return sendCard(text, picked);
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
export function openSeat(seatId) {
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
       <button class="btn" data-a="showme">🃏 Show "You are"${s.shown && s.reminders.some((r) => r.label === 'Is the Demon') ? `: ${esc(s.role?.name || '')}` : ''}</button>
       <button class="btn" data-a="testalert" ${s.alerts ? '' : 'disabled'}>🔔 ${s.alerts ? 'Test alert' : 'No alerts on'}</button>
       <button class="btn" data-a="left">◀ Move seat</button>
       <button class="btn" data-a="right">Move seat ▶</button>
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
      if (b.dataset.a === 'testalert') {
        const r = await call('push:testSt', { seatId });
        return toast(r?.sent?.length ? `🔔 Test sent to ${s.name}` : r?.failed?.length ? `Could not reach ${s.name}'s phone` : `${s.name} has no alerts on`, 4000);
      }
      if (b.dataset.a === 'left' || b.dataset.a === 'right') {
        await call('botc:moveSeat', { seatId, dir: b.dataset.a === 'left' ? -1 : 1 });
        return toast(b.dataset.a === 'left' ? '◀ Moved' : 'Moved ▶');
      }
      if (b.dataset.a === 'showme' && s.shown && s.reminders.some((r) => r.label === 'Is the Demon')) {
        // the Scarlet Woman learns she is the Demon now
        await patch({ shown: null });
        closeSheet();
        return showCard('You are', [s.role], s.align);
      }
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

// a player's new device asks for their seat (the game has started): allow or not
const reqSeen = new Set();
export function requestPopup() {
  if (mode !== 'st' || !$('#sheet').hidden) return;
  const q = (st?.requests || []).find((x) => !reqSeen.has(`${x.playerId}:${x.t}`));
  if (!q) return;
  reqSeen.add(`${q.playerId}:${q.t}`);
  openSheet(
    `<h2 class="h">📱 ${esc(q.name)} wants to play on a new device</h2>
     <p>Only allow this if ${esc(q.name)} is really switching phones (a new phone, the home-screen app, a dead battery). Their other device is logged out.</p>
     <div class="row"><button class="btn primary big" data-q="yes">✓ Allow</button><button class="btn big" data-q="no">✕ No</button></div>`,
    async (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      const r = await call('botc:approve', { playerId: q.playerId, allow: b.dataset.q === 'yes' });
      closeSheet();
      if (!r?.ok) toast(r?.error || 'Could not do that');
      else if (b.dataset.q === 'yes') toast(`✓ ${q.name} is on the new device`);
    }
  );
}

// The Demon chose on their phone: ask the storyteller right away who dies (once per answer, per device)
const killAsked = new Set(JSON.parse(store.get('botc-kill-asked') || '[]'));
export function killPopup() {
  if (mode !== 'st' || st?.phase !== 'night' || !$('#sheet').hidden) return;
  const p = (st.prompts || []).find((x) => x.answer && x.kind === 'choose' && roleById(x.step)?.team === 'demon' && !killAsked.has(x.id));
  if (!p) return;
  killAsked.add(p.id);
  store.set('botc-kill-asked', JSON.stringify([...killAsked].slice(-50)));
  const demon = st.seats.find((x) => x.id === p.seatId);
  const target = p.answer.seats[0] && st.seats.find((x) => x.id === p.answer.seats[0].id);
  if (!target || !demon) return;
  const off = offReason(demon);
  // reasons the kill may not happen
  const why = [
    demon.role?.team !== 'demon' && `${demon.name} only thinks they are the Demon (really the ${demon.role?.name || '?'}): nobody dies`,
    off && `${demon.name} (the Demon) is ${off}`,
    target.reminders.some((r) => /safe|protect/i.test(r.label)) && `${target.name} is protected (${target.reminders.find((r) => /safe|protect/i.test(r.label)).label})`,
    target.role?.id === 'soldier' && !offReason(target) && `${target.name} is the Soldier`,
    target.dead && `${target.name} is already dead`,
    target.id === demon.id && 'The Demon chose themselves: a Minion becomes the Demon (starpass)',
    target.role?.id === 'mayor' && !offReason(target) && `${target.name} is the Mayor: you may make another player die instead`,
  ].filter(Boolean);
  openSheet(
    `<h2 class="h">🗡 ${esc(roleById(p.step)?.name || 'The Demon')} (${esc(demon?.name || '?')}) chose ${esc(target.name)}</h2>
     ${why.length ? `<ul class="warn-list">${why.map((w) => `<li>⚠ ${esc(w)}</li>`).join('')}</ul>` : `<p class="hint">Nothing in the grimoire stops this kill.</p>`}
     <p class="hint">Who dies tonight?</p>
     <div class="row">
       ${target.dead ? '' : `<button class="btn ${why.length ? '' : 'primary'} big" data-k="${target.id}">☠ ${esc(target.name)} dies</button>`}
       <button class="btn ${why.length ? 'primary' : ''} big" data-k="none">Nobody dies</button>
       <button class="btn big" data-k="other">Someone else…</button>
     </div>`,
    async (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      if (b.dataset.k === 'none') return closeSheet();
      if (b.dataset.k === 'other') {
        return openSheet(`<h2 class="h">Who dies instead?</h2><div class="chips">${st.seats.filter((x) => !x.dead).map((x) => `<button class="chip" data-k2="${x.id}">${esc(x.name)}</button>`).join('')}</div>`, async (e2) => {
          const c = e2.target.closest('[data-k2]');
          if (!c) return;
          await call('botc:seat', { seatId: c.dataset.k2, patch: { dead: true } });
          closeSheet();
          toast('Marked dead');
        });
      }
      await call('botc:seat', { seatId: b.dataset.k, patch: { dead: true } });
      closeSheet();
      toast(`☠ ${target.name} marked dead`);
    }
  );
}

// ---------- Night on phones: the storyteller checks and sends ----------
export const nightCtx = () => ({ seats: st.seats, night: st.night, script: st.script.roles, bluffs: st.bluffs, roleOf: (id) => roleById(id) });
export function openCompose(step, sugs, idx) {
  const c = JSON.parse(JSON.stringify(sugs[idx]));
  let pickChars = false;
  const seatName = (id) => st.seats.find((s) => s.id === id)?.name || '?';
  const draw = () => {
    const toNames = c.to.map(seatName).join(', ') || 'nobody';
    const off = c.to.map((id) => [seatName(id), offReason(st.seats.find((s) => s.id === id))]).filter(([, o]) => o);
    openSheet(
      `<h2 class="h">📱 ${esc(step.name)} → ${esc(toNames)}</h2>
       ${off.length ? `<p class="warn">⚠ ${off.map(([n, o]) => `${esc(n)} is ${esc(o)}`).join(', ')}${c.falseInfo ? ': this suggestion is <b>false info</b>. Only you see this.' : '.'}</p>` : ''}
       ${c.note ? `<p class="hint">${esc(c.note)}</p>` : ''}
       <h3 class="sub">Wake</h3>
       <div class="chips">${st.seats.map((s) => `<button class="chip ${c.to.includes(s.id) ? 'on' : ''}" data-to="${s.id}">${esc(s.name)}${s.dead ? ' ☠' : ''}</button>`).join('')}</div>
       <div class="seg"><button class="${c.kind === 'choose' ? 'on' : ''}" data-kind="choose">Ask to choose</button><button class="${c.kind === 'info' ? 'on' : ''}" data-kind="info">Show info</button></div>
       <label class="field">Text on their phone<input id="c-text" maxlength="300" value="${esc(c.text)}"${osk}></label>
       ${
         c.kind === 'choose'
           ? `<h3 class="sub">They choose</h3>
              <div class="chips">${[['player', 'Player(s)'], ['character', 'A character'], ['yesno', 'Yes or no']].map(([t, l]) => `<button class="chip ${c.target === t ? 'on' : ''}" data-target="${t}">${l}</button>`).join('')}</div>
              ${c.target === 'player' ? `<div class="chips">${[1, 2, 3].map((n) => `<button class="chip ${c.count === n ? 'on' : ''}" data-count="${n}">${n} player${n > 1 ? 's' : ''}</button>`).join('')}</div>` : ''}`
           : `<h3 class="sub">Show players</h3>
              <div class="chips">${st.seats.map((s) => `<button class="chip ${c.seats.includes(s.id) ? 'on' : ''}" data-seat="${s.id}">${esc(s.name)}</button>`).join('')}</div>
              <h3 class="sub">Show characters</h3>
              <div class="row">${c.roles.map((id) => token(roleById(id), { size: 'sm' })).join('') || '<span class="muted small">none</span>'}<button class="btn small" data-chars="1">${pickChars ? 'Done' : '✏️ Change'}</button></div>
              ${pickChars ? rolePicker([...st.script.roles, ...st.extras], { selected: c.roles, title: 'Characters to show' }) : ''}
              <h3 class="sub">Show a number</h3>
              <div class="chips"><button class="chip ${c.number === null ? 'on' : ''}" data-num="">none</button>${[0, 1, 2, 3, 4, 5].map((n) => `<button class="chip ${c.number === n ? 'on' : ''}" data-num="${n}">${n}</button>`).join('')}</div>
              <label class="toggle"><input type="checkbox" id="c-grim" ${c.grim ? 'checked' : ''}> Show the whole Grimoire (Spy)</label>`
       }
       <div class="row sticky-foot">${sugs.length > 1 ? `<button class="btn" data-next="1">Next (${idx + 1}/${sugs.length})</button>` : ''}<button class="btn" data-reroll="1">↻ Other suggestion</button><button class="btn primary" data-send="1" ${c.to.length ? '' : 'disabled'}>📱 Send</button></div>`,
      async (e) => {
        const t = $('#c-text');
        if (t) c.text = t.value;
        const g = $('#c-grim');
        if (g) c.grim = g.checked;
        const b = e.target.closest('button');
        if (!b) return;
        const d = b.dataset;
        if (d.to) c.to = c.to.includes(d.to) ? c.to.filter((x) => x !== d.to) : [...c.to, d.to];
        else if (d.kind) c.kind = d.kind;
        else if (d.target) c.target = d.target;
        else if (d.count) c.count = Number(d.count);
        else if (d.seat) c.seats = c.seats.includes(d.seat) ? c.seats.filter((x) => x !== d.seat) : [...c.seats, d.seat];
        else if (d.chars) pickChars = !pickChars;
        else if (d.role) c.roles = c.roles.includes(d.role) ? c.roles.filter((x) => x !== d.role) : [...c.roles, d.role];
        else if ('num' in d) c.number = d.num === '' ? null : Number(d.num);
        else if (d.next) return openCompose(step, sugs, (idx + 1) % sugs.length);
        else if (d.reroll) {
          const fresh = step.seats ? suggest(step, nightCtx()) : [];
          if (fresh[idx]) return openCompose(step, fresh, idx);
          return toast('No other suggestion for this one');
        } else if (d.send) {
          const res = await call('botc:prompt', { seatIds: c.to, step: step.id, kind: c.kind, text: c.text, count: c.count, target: c.target, roles: c.roles, seats: c.seats, number: c.number, grim: c.grim, seatsLabel: c.seatsLabel, rolesLabel: c.rolesLabel, notSelf: c.notSelf, off: c.to.map((id) => offReason(st.seats.find((x) => x.id === id))).find(Boolean) || '' });
          if (!res?.ok) return toast(res?.error || 'Could not send');
          toast(`📱 Sent to ${c.to.map(seatName).join(', ')}`);
          if (sugs.length > 1 && idx + 1 < sugs.length) return openCompose(step, sugs, idx + 1);
          return closeSheet();
        } else return;
        draw();
      }
    );
  };
  draw();
}

export function openBluffs() {
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
export function setupCounter(r, roleName, picks = []) {
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

export function openChooseRoles() {
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

export function openImport() {
  openSheet(
    `<h2 class="h">Import a script</h2>
     <p class="hint">Paste the JSON from the official script tool or a community script site, or pick the .json file. Homebrew character images load from their own address.</p>
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

export function openSettings() {
  const cur = document.documentElement.dataset.style;
  const stPart =
    mode === 'st'
      ? `<h3 class="h">Night & day rules</h3>
       <label class="toggle"><input type="checkbox" checked disabled> Player chats locked at night (always)</label>
       <label class="toggle"><input type="checkbox" data-rule="lockStChat" ${st.rules.lockStChat ? 'checked' : ''}> Also lock the storyteller chat at night</label>

       <div class="row"><span>Day length</span>${[3, 5, 8, 10, 12, 15].map((m) => `<button class="chip ${st.timer.minutes === m ? 'on' : ''}" data-min="${m}">${m} min</button>`).join('')}</div>
       <h3 class="h">This game</h3>
       <div class="share"><img src="qr/${esc(roomCode())}.png" alt="QR code to join" class="share-qr">
         <div><p>Players join with code <b class="big-code">${esc(roomCode())}</b><br><span class="small muted">${esc(joinUrl())}</span></p>
         <p class="small">Storyteller code: <b>${esc(stCode || '—')}</b><br><span class="muted">To open the grimoire on a second device too. Keep it secret.</span></p></div></div>
       <h3 class="sub">Alerts on phones</h3>
       <p class="hint">${st.seats.filter((x) => x.alerts).length} of ${st.seats.filter((x) => x.playerId).length} players have alerts on.</p>
       <button class="btn wide" data-x="test-all">🔔 Send a test alert to every player</button>
       <h3 class="sub">Town square</h3>
       <div class="seg"><button class="${st.layout !== 'table' ? 'on' : ''}" data-x="layout-circle">⭕ Circle</button><button class="${st.layout === 'table' ? 'on' : ''}" data-x="layout-table">▭ Long table</button></div>
       <p class="hint">Match the real table. To change the order, tap a player in the Grimoire and use ◀ ▶.</p>
       ${DEV ? '' : `<button class="btn wide" data-x="test">🧪 Test mode: play all seats on this screen</button>`}
       <button class="btn wide" data-x="logout">⏏ Leave the grimoire on this device</button>`
      : mode === 'player'
        ? `<button class="btn wide" data-x="stlogin">🔑 I'm the storyteller</button><button class="btn wide" data-x="leave">✕ Leave this room</button>`
        : '';
  openSheet(
    `<h2 class="h">Language</h2>${langPicker()}<h2 class="h">Style</h2><p class="hint">Only for this device${mode === 'st' ? ' (storyteller)' : mode === 'public' ? ' (table view)' : ''}.</p>
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
      if (b.dataset.x === 'test-all') {
        const r = await call('push:testSt', {});
        return toast(r?.ok ? `🔔 Sent to ${r.sent.length}${r.failed?.length ? ` · could not reach: ${r.failed.join(', ')}` : ''}${r.off.length ? ` · no alerts on: ${r.off.join(', ')}` : ''}` : 'Could not send');
      }
      if (b.dataset.x === 'layout-circle' || b.dataset.x === 'layout-table') {
        await call('botc:layout', { shape: b.dataset.x.slice(7) });
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        return;
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
export async function login() {
  const pin = await askPin();
  if (pin == null) return;
  const res = await call('room:st', { code: roomCode(), stCode: pin });
  if (!res?.ok) return toast(res?.error || 'Wrong code');
  saveSession({ code: res.code, role: 'st', token: res.token, playerId: null });
  enterRoom(res);
}
export async function logout() {
  if (!EMBED && !(await confirmSheet(`Leave the grimoire on this device? Note the storyteller code first (${stCode}) to come back.`, 'Leave'))) return;
  const code = session?.code;
  await call('room:leave', { token: session?.token });
  saveSession(null);
  setSt(null);
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
