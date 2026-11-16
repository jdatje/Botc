// part of the client (app.js is the entry): see the comment at the top of app.js
import { RULES } from './rules.js';
import { getLang } from './i18n.js';
import { TEAMS, esc, fmt, isEvilTeam, token } from './core.js';
import { alertsCard } from './alerts.js';
import { me, mode, myId, phaseLabel, roleById, st, timeLeft } from './app.js';
import { chatsBody } from './chats.js';

// ---------- Player ----------
export const P_TABS = [
  ['token', '🎭', 'Token'],
  ['square', '🏘️', 'Town'],
  ['chats', '💬', 'Chats'],
  ['notes', '📝', 'Notes'],
  ['script', '📜', 'Script'],
  ['rules', '📖', 'Rules'],
];
export function playerHeader() {
  const v = me;
  const timer = v.phase === 'day' ? ` · <span data-timer>${fmt(timeLeft(v.timer))}</span>` : '';
  return `<div class="hd-l"><span class="small muted">${esc(v.script?.name || '')}</span><b class="hd-name">${esc(v.me?.name || '')}</b></div>
    <div class="phase-pill ${v.phase}">${v.phase === 'night' ? '🌙' : v.phase === 'day' ? '☀️' : '🕯️'} ${phaseLabel(v)}${timer}</div>
    <button class="icon-btn" data-act="settings" aria-label="Settings">⚙</button>`;
}
export const P_BODY = {
  token() {
    const m = me.me;
    if (me.phase === 'setup') return `<div class="center"><div class="tk-back huge"></div><h2 class="h">Waiting for the storyteller</h2><p class="muted">You're in the game (${me.total} ${me.total === 1 ? 'player' : 'players'} so far). Your character arrives here when the game starts.</p>${alertsCard()}<button class="btn small" data-act="leave">Leave this game</button></div>`;
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
      ${alertsCard()}
      ${me.reveal ? revealHtml(me) : ''}`;
  },
  square() {
    const seats = me.seats;
    if (!seats.length) return `<p class="center muted">No players yet.</p>`;
    return `<p class="hint">Tap a player to note what you think they are: good, evil or a character. Only you can see this.</p>
      <div class="square" data-square>${seats
        .map((s) => {
          const gs = me.guesses[s.id];
          const r = gs?.role ? roleById(gs.role) : null;
          const al = gs?.align;
          const self = s.playerId === myId;
          const full = me.reveal ? s : null;
          return `<button class="seat ${s.dead ? 'dead' : ''} ${self ? 'self' : ''}" data-act="guess" data-seat="${s.id}">
            ${full?.role ? token(full.role, { align: full.align, label: true }) : self ? '<span class="tk tk-back mine-back"></span>' : token(r, { label: Boolean(r), cls: `${r ? 'guess' : ''} ${al ? `g-${al}` : ''}` })}
            ${!full && !self && al ? `<span class="g-mark ${al}">${al === 'evil' ? '😈' : '😇'}</span>` : ''}
            ${s.dead ? `<span class="shroud ${s.ghost ? '' : 'voted'}" title="${s.ghost ? 'dead' : 'dead · ghost vote used'}"></span>` : ''}
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

export function squareMid(v) {
  const timer = v.phase === 'day' ? `<b class="mid-timer" data-timer>${fmt(timeLeft(v.timer))}</b>` : '';
  const ghosts = (v.seats || []).filter((s) => s.dead && s.ghost).length;
  return `<span class="mid-phase">${phaseLabel(v)}</span>${timer}<span class="small muted">${v.alive} of ${v.total} alive · ${Math.ceil(v.alive / 2)} votes to execute</span>${ghosts ? `<span class="mid-ghosts">👻 ${ghosts} ghost vote${ghosts === 1 ? '' : 's'} left</span>` : ''}`;
}

export function scriptHtml(s) {
  if (!s) return '';
  const note = getLang() === 'nl' ? '<p class="hint">Ability texts: unofficial Dutch translation (Trouble Brewing). Character names stay English.</p>' : '';
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
  return `<div class="script-head">${s.logo ? `<img src="${esc(s.logo)}" alt="" class="script-logo">` : ''}<div><h2 class="h">${esc(s.name)}</h2>${s.author ? `<span class="muted small">by ${esc(s.author)}</span>` : ''}</div></div>${note}${groups}${jinx}${ccc()}`;
}
export const ccc = () => `<footer class="ccc"><img src="img/ccc.png" alt="Community Created Content"><span>Blood on the Clocktower is a product of The Pandemonium Institute. This is a free, unofficial fan-made helper.</span></footer>`;

function rulesHtml() {
  return `<h2 class="h">How it works</h2>${RULES.map((r, i) => `<details class="rule" ${i === 0 ? 'open' : ''}><summary>${esc(r.title)}</summary>${r.body}</details>`).join('')}${ccc()}`;
}

// one ability result: who, what they chose or exactly what they were shown
export function recordLine(h) {
  // older entries: add the character from the grimoire as it is now
  if (!h.tagged && mode === 'st') {
    const tag = (n) => {
      const x = st.seats.find((y) => y.name === n);
      return x?.role ? `${n} (${x.role.name})` : n;
    };
    h = { ...h, seats: (h.seats || []).map(tag), chose: h.kind === 'choose' ? (h.chose || []).map(tag) : h.chose };
  }
  const who = `<b>${esc(h.step)}</b> <span class="muted">${esc(h.who)}${h.really ? ` · really ${esc(h.really)}` : ''}</span>`;
  if (h.kind === 'choose') return `${who} chose <b>${esc(h.chose.join(', ') || 'nothing')}</b>`;
  const shown = [
    h.number !== null && h.number !== undefined ? `<span class="rec-num">${h.number}</span>` : '',
    h.seats?.length ? `<span class="rec-seats">${h.seats.map(esc).join(' · ')}</span>` : '',
    h.roles?.length ? h.roles.map((r) => `<span class="rec-role">${esc(r)}</span>`).join('') : '',
    h.grim ? '<span class="rec-role">the Grimoire</span>' : '',
  ].join(' ');
  return `${who} was shown ${shown || '—'}${h.off ? ` <span class="rec-off">⚠ false info (${esc(h.off)})</span>` : ''}<div class="rec-text">“${esc(h.text)}”</div>`;
}

// what happened on the phones, night by night (storyteller any time; everyone at the end)
function historyHtml(list, openLast) {
  if (!list?.length) return '';
  const nights = [...new Set(list.map((h) => h.night))];
  return `<h3 class="team-h">What happened at night</h3>${nights
    .map(
      (n, i) => `<details class="hist" ${openLast && i === nights.length - 1 ? 'open' : ''}><summary>${n <= 1 ? 'First night' : `Night ${n}`}</summary><ul>${list
        .filter((h) => h.night === n)
        .map((h) => `<li>${recordLine(h)}</li>`)
        .join('')}</ul></details>`
    )
    .join('')}`;
}

export function revealHtml(v) {
  return `<h3 class="team-h">The grimoire</h3>${v.seats
    .map((s) => `<div class="role-row">${token(s.role, { align: s.align, label: false, size: 'sm' })}<div><b>${esc(s.name)}</b> — ${esc(s.role?.name || '?')}${s.shown && s.shown.id !== s.role?.id ? ` <span class="muted">(thought: ${esc(s.shown.name)})</span>` : ''} <span class="align ${s.align}">${s.align}</span>${s.dead ? ' ☠' : ''}</div></div>`)
    .join('')}${historyHtml(v.history, false)}`;
}
