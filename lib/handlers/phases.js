import { scheduleTimerPush } from '../alerts.js';
import { EVIL_TEAMS } from '../data.js';
import { THINKS, any, isTraveller, players, teamOf } from '../deal.js';
import { endNightPrompts } from '../night.js';
import { role, script } from '../scripts.js';
import { R, addLog, blank, g, setGame } from '../state.js';

export default function (ctx) {
  const { on, st } = ctx;
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
    setGame({ ...blank(), ...keep, seats });
    scheduleTimerPush(R);
  }));
}
