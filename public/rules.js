// Plain-words rules for the players' Rules tab (own text, not the rulebook).
export const RULES = [
  {
    title: 'The goal',
    body: `<p>Two teams: <b class="good">Good</b> (Townsfolk and Outsiders) and <b class="evil">Evil</b> (Minions and the Demon).</p>
<p><b class="good">Good wins</b> when the Demon dies. <b class="evil">Evil wins</b> when only two players are left alive (and the Demon is one of them).</p>
<p>Evil players know who is on their team. Good players don't know anything about anyone at the start, so they have to talk, share and work it out.</p>`,
  },
  {
    title: 'Night',
    body: `<p>Everyone closes their eyes. The Storyteller wakes players one by one, in a fixed order, to use their ability or to learn something.</p>
<p>When you're woken, don't talk: nod, shake your head, point, or look at what the Storyteller shows you. Then close your eyes again.</p>
<p>Chats on your phone are locked at night.</p>`,
  },
  {
    title: 'Day',
    body: `<p>Everyone opens their eyes. The Storyteller says who died in the night (if anyone).</p>
<p>Now talk! In the open or privately: walk off with someone, whisper, or use the Chats tab. You may say anything, including lies. You can never show someone your phone or token to prove who you are.</p>`,
  },
  {
    title: 'Nominations & execution',
    body: `<p>Near the end of the day the Storyteller opens nominations. Each living player may nominate once per day, and each player may be nominated once per day.</p>
<p>After a nomination everyone votes by raising a hand. If the votes are at least <b>half of the living players</b>, that player is "on the block". A later nomination needs more votes than that to replace them; a tie means nobody is on the block.</p>
<p>At the end of the day the player on the block is executed and usually dies. Max one execution per day.</p>`,
  },
  {
    title: 'Dying & your ghost vote',
    body: `<p>Dead players stay in the game: you may still talk and help your team, and you still win or lose with your team.</p>
<p>You lose your ability, you can't nominate, and you get <b>one ghost vote</b> for the rest of the game. Use it wisely, then it's gone.</p>`,
  },
  {
    title: 'Poisoned',
    body: `<p>A poisoned player has <b>no ability</b>, but nobody tells them. They still wake up and do their thing, but it doesn't work, and any information they get may be false.</p>
<p>Poisoning usually lasts a night and a day. If information doesn't add up, someone may have been poisoned.</p>`,
  },
  {
    title: 'Drunk',
    body: `<p>Drunk works the same as poisoned: no ability, possibly false information, and you don't know it.</p>
<p>The <b>Drunk</b> character is an Outsider who thinks they are a Townsfolk. Their phone shows that Townsfolk, not "Drunk". So yes, the character you see could be a lie.</p>`,
  },
  {
    title: '"Droisoned"',
    body: `<p>Player slang for "drunk or poisoned". When an ability says it doesn't work while you're droisoned, that's both.</p>`,
  },
  {
    title: 'Registers as',
    body: `<p>Some characters can <b>look like</b> something they're not to other abilities. A Recluse might "register as" evil or as a Minion; a Spy might register as good.</p>
<p>So an ability can give a "wrong" answer even if nobody is poisoned.</p>`,
  },
  {
    title: 'Mad',
    body: `<p>Being "mad" about something means trying to convince the group of it. Some characters (not in Trouble Brewing) punish you if you aren't mad enough. The Storyteller decides.</p>`,
  },
  {
    title: 'The Storyteller',
    body: `<p>The Storyteller runs the game, knows everything, and makes judgement calls to keep it fair and fun. Their word is final.</p>
<p>Questions about rules or your character? Ask the Storyteller, privately or in the chat.</p>`,
  },
  {
    title: 'Teams at a glance',
    body: `<p><b class="good">Townsfolk</b>: good characters with helpful abilities.</p>
<p><b class="good">Outsiders</b>: good characters with an ability that hurts the good team.</p>
<p><b class="evil">Minions</b>: evil helpers who know the Demon.</p>
<p><b class="evil">Demon</b>: kills at night. Kill it to win.</p>`,
  },
];
