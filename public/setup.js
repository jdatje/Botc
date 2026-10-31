// Setup rules: how many Townsfolk, Outsiders, Minions and Demons go into the bag,
// following the official table plus the characters whose [setup] text changes it.
// Shared by the server (random deals) and the storyteller's picker (live counter).
//
// "In play" here means the real characters on the seats: the Drunk counts as an
// Outsider, the Marionette as a Minion. A few characters are in play without a seat
// (Lil' Monsta): those are picked but not dealt.

export const BASE = { 5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1], 10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1] };
export const TEAMS4 = ['townsfolk', 'outsider', 'minion', 'demon'];

export function baseCounts(n) {
  const c = BASE[Math.min(15, Math.max(5, n))];
  return { townsfolk: c[0], outsider: c[1], minion: c[2], demon: c[3] };
}

// Outsider changes, as the sets of allowed changes. 'any' = the storyteller picks.
const OUTSIDER = {
  baron: [2],
  fanggu: [1],
  vigormortis: [-1],
  godfather: [-1, 1],
  balloonist: [0, 1],
  hermit: [0, -1],
  huntsman: [0, 1], // the Damsel is added, unless it's already in play
  xaan: 'any',
  kazali: 'any',
  lordoftyphon: 'any',
};
// characters that may sit on several seats
export const MULTI = { legion: true, villageidiot: true };
// in play, but no player gets this token
export const NOT_DEALT = { lilmonsta: true };
// Marionette jinxes: with these Demons the Marionette enters play later, next to the Demon
const MARIONETTE_LATER = ['kazali', 'lilmonsta', 'summoner'];
// must be in play when this character is
export const REQUIRES = { huntsman: 'damsel', choirboy: 'king' };

// Legion: the recommended number is the reverse of the normal good/evil split (10 players: 7 Legion)
export function legionCount(n) {
  const b = baseCounts(n);
  return Math.max(Math.floor(n / 2) + 1, n - b.minion - b.demon);
}

const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

// n: number of (non-Traveller) players. picks: character ids, a duplicate per extra copy.
// teamOf(id) -> team. onScript(id) -> whether that character is on the script.
export function setupRules(n, picks, teamOf, onScript = () => true) {
  const has = new Set(picks);
  const b = baseCounts(n);
  const notes = [];
  let minion = b.minion;
  let demon = b.demon;
  let outs = [b.outsider];
  let anyOut = false;

  // evil side
  if (has.has('atheist')) {
    minion = 0;
    demon = 0;
    anyOut = true;
    notes.push('Atheist: no evil characters; the evil tokens become any Townsfolk or Outsiders. The Storyteller can break the rules.');
  } else if (has.has('legion')) {
    minion = 0;
    demon = range(Math.floor(n / 2) + 1, n - 1); // most players are Legion
    anyOut = true;
    notes.push(`Legion: more than half the players are Legion, the rest are Townsfolk or Outsiders (any mix). No Minions. Recommended: ${legionCount(n)} Legion.`);
  } else {
    if (has.has('lilmonsta')) {
      minion += 1;
      demon = 0;
      notes.push("Lil' Monsta: no player gets the Demon token; one extra Minion instead. Skip Minion info and Demon info on the first night.");
    }
    if (has.has('summoner')) {
      demon = 0;
      notes.push('Summoner: no Demon at the start, an extra Townsfolk instead. The Summoner makes one on night 3.');
    }
    if (has.has('lordoftyphon')) {
      minion += 1;
      notes.push('Lord of Typhon: +1 Minion. The evil players sit in one line with the Lord of Typhon in the middle (done when dealing).');
    }
    if (has.has('kazali')) {
      notes.push(`Kazali: no Minions in the bag (${minion} good players instead). On night 1 the Kazali picks ${minion} player${minion === 1 ? '' : 's'} to become which Minion.`);
      minion = 0;
    }
  }
  if (has.has('marionette')) {
    if (MARIONETTE_LATER.some((d) => has.has(d))) notes.push('Marionette (jinx): with this Demon the Marionette enters play after the Demon, as their neighbor. Leave it out of the bag.');
    else notes.push('Marionette: sits next to the Demon (done when dealing) and thinks they are a good character.');
  }
  if (has.has('boffin')) notes.push('Boffin: if the good ability you give the Demon has [brackets], apply that setup change too.');
  if (has.has('alchemist')) notes.push('Alchemist: if their Minion ability has [brackets], apply that setup change too.');
  if (has.has('bountyhunter')) notes.push('Bounty Hunter: 1 Townsfolk is evil (picked at random when dealing).');
  if (has.has('villageidiot')) notes.push('Village Idiot: +0 to +2 extra Village Idiots. If there are extras, 1 of them is drunk.');
  if (has.has('huntsman')) notes.push('Huntsman: the Damsel must be in play (it replaces a Townsfolk, unless it was already in).');
  if (has.has('choirboy')) notes.push('Choirboy: the King must be in play (it replaces a Townsfolk).');
  if (has.has('drunk')) notes.push('Drunk: thinks they are a Townsfolk that is not in play (picked automatically).');

  // outsiders
  for (const id of has) {
    const d = OUTSIDER[id];
    if (!d) continue;
    if (d === 'any') anyOut = true;
    else outs = [...new Set(outs.flatMap((o) => d.map((x) => o + x)))];
  }
  const demons = Array.isArray(demon) ? demon : [demon];
  const maxGood = n - minion - Math.min(...demons);
  outs = anyOut ? range(0, maxGood) : outs.filter((o) => o >= 0 && o <= maxGood);
  if (!outs.length) outs = [0];

  // what's picked (dealt characters only)
  const dealt = picks.filter((id) => !NOT_DEALT[id]);
  const have = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const id of dealt) {
    const t = teamOf(id);
    if (t in have) have[t] += 1;
  }

  // allowed values per team; townsfolk follow from the rest
  const need = { outsider: outs, minion: [minion], demon: demons };
  const fit = (t) => need[t].includes(have[t]);
  const oFor = fit('outsider') ? [have.outsider] : outs;
  const dFor = fit('demon') ? [have.demon] : demons;
  need.townsfolk = [...new Set(oFor.flatMap((o) => dFor.map((d) => n - minion - d - o)))].filter((x) => x >= 0).sort((a, b) => a - b);

  const missing = [];
  for (const [id, req] of Object.entries(REQUIRES)) if (has.has(id) && !has.has(req) && onScript(req)) missing.push({ id, req });
  for (const id of has) if (!MULTI[id] && picks.filter((x) => x === id).length > 1) missing.push({ id, dup: true });

  const tokens = n + picks.filter((id) => NOT_DEALT[id]).length;
  const ok = dealt.length === n && TEAMS4.every((t) => need[t].includes(have[t])) && !missing.length;
  return { n, need, have, notes, missing, tokens, ok, base: b };
}

// "7", "1–3", "0 or 2"
export function fmtNeed(vals) {
  if (vals.length === 1) return String(vals[0]);
  const s = [...vals].sort((a, b) => a - b);
  if (s.every((v, i) => !i || v === s[i - 1] + 1)) return `${s[0]}–${s[s.length - 1]}`;
  return s.slice(0, -1).join(', ') + ' or ' + s[s.length - 1];
}
