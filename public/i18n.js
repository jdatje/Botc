// Dutch for the app's own texts, per device (⚙ → Language). The page is written in English;
// with Dutch on, every text that appears on screen is swapped as it's drawn (exact matches, then patterns).
// Character names and abilities stay English: the official Dutch texts aren't available to us yet.
// Players' names, chats and notes are never touched.

export const LANGS = { en: 'English', nl: 'Nederlands' };
let lang = 'en';
export const getLang = () => lang;

const NL = {
  // tabs, headers
  Token: 'Token', Town: 'Dorp', Chats: 'Chats', Notes: 'Notities', Script: 'Script', Rules: 'Regels', Setup: 'Opzet', Grimoire: 'Grimoire', Night: 'Nacht',
  Settings: 'Instellingen', Style: 'Stijl', Language: 'Taal', 'Town square': 'Dorpsplein', 'First night': 'Eerste nacht', 'This game': 'Dit spel',
  Townsfolk: 'Dorpelingen', Outsider: 'Buitenstaander', Outsiders: 'Buitenstaanders', Minion: 'Handlanger', Minions: 'Handlangers', Demon: 'Demon', Demons: 'Demonen',
  Traveller: 'Reiziger', Travellers: 'Reizigers', Fabled: 'Fabels', good: 'goed', evil: 'kwaad', dead: 'dood', Storyteller: 'Verteller',
  'Blood on the Clocktower': 'Blood on the Clocktower',
  // start page
  'For a game in person, around one table: your phone is your token, notes and chats.': 'Voor een spel aan één tafel: je telefoon is je token, je notities en je chats.',
  'Join a game': 'Meedoen met een spel', 'Game code': 'Spelcode', 'Your name': 'Je naam', 'Join': 'Meedoen', 'Tell the story': 'Vertel het verhaal',
  'Start a new game as the storyteller. You get a code for the players.': 'Start een nieuw spel als verteller. Je krijgt een code voor de spelers.',
  '🕯️ Start a new game': '🕯️ Nieuw spel starten', 'Already the storyteller on another device?': 'Al verteller op een ander apparaat?', 'Open the grimoire': 'Open de grimoire',
  'Storyteller code': 'Vertellercode', 'Storyteller code:': 'Vertellercode:', 'Table view': 'Tafelweergave', 'Show the table': 'Toon de tafel',
  'For a TV or laptop at the table: the town square and the day timer, no secrets.': 'Voor een tv of laptop aan tafel: het dorpsplein en de dagtimer, zonder geheimen.',
  'Connecting…': 'Verbinden…', '← All games': '← Alle spellen', '← Back': '← Terug', Close: 'Sluiten', '✕ Close': '✕ Sluiten', Delete: 'Verwijderen',
  // player: token
  'Waiting for the storyteller': 'Wachten op de verteller', 'Leave this game': 'Dit spel verlaten', 'Leave this game?': 'Dit spel verlaten?',
  'Press and hold to see your character': 'Houd ingedrukt om je personage te zien', 'Let go to hide it again. Keep your screen away from the others.': 'Laat los om het weer te verbergen. Houd je scherm weg van de anderen.',
  '📜 All characters on this script': '📜 Alle personages in dit script', 'ghost vote': 'spookstem', vote: 'stem',
  // alerts
  '🔔 Alerts on a locked phone': '🔔 Meldingen op een vergrendelde telefoon', '🔔 Turn on alerts': '🔔 Meldingen aanzetten', 'Turn on alerts': 'Meldingen aanzetten',
  'Get a buzz for your turn at night and when the day timer runs out, also with the screen off.': 'Krijg een trilling als je ’s nachts aan de beurt bent en als de dagtimer afloopt, ook met je scherm uit.',
  'Notifications are blocked for this site. Allow them in your phone\'s settings, then reload.': 'Meldingen zijn geblokkeerd voor deze site. Sta ze toe in de instellingen van je telefoon en herlaad.',
  'On iPhone, alerts only work from the home screen app:': 'Op iPhone werken meldingen alleen vanuit de app op je beginscherm:',
  'Add to Home Screen': 'Zet op beginscherm', 'send a test': 'stuur een test', 'Test alert in 5 seconds: lock your phone now': 'Testmelding over 5 seconden: vergrendel nu je telefoon',
  '🔔 Alerts on this phone are on ·': '🔔 Meldingen op deze telefoon staan aan ·', 'This phone has no alerts turned on for this game': 'Deze telefoon heeft geen meldingen aan voor dit spel', 'turn off': 'uitzetten', '🔔 Alerts on': '🔔 Meldingen aan', 'Could not turn on alerts': 'Meldingen aanzetten lukte niet',
  // town
  'Tap a player to note what you think they are. Only you can see this.': 'Tik op een speler om te noteren wat je denkt dat die is. Alleen jij ziet dit.',
  'No players yet.': 'Nog geen spelers.', 'Note, e.g. claims Chef, said 1': 'Notitie, bijv. claimt Chef, zei 1', 'Save note': 'Notitie opslaan',
  'Everyone, close your eyes': 'Iedereen, ogen dicht', 'Return to the town square': 'Terug naar het dorpsplein',
  // chats
  'Private: only you and the other person can read a chat.': 'Privé: alleen jij en de ander kunnen een chat lezen.', 'Private chats with each player.': 'Privéchats met elke speler.',
  'No messages yet': 'Nog geen berichten', 'Say something…': 'Zeg iets…', Send: 'Versturen', '🌙 Chats are locked at night': '🌙 Chats zijn ’s nachts dicht',
  // notes
  'My notes': 'Mijn notities', 'Only you can see these. Saved automatically.': 'Alleen jij ziet deze. Worden automatisch bewaard.',
  'Who claimed what, who you trust, your theories…': 'Wie claimde wat, wie je vertrouwt, je theorieën…', 'Storyteller notes': 'Notities van de verteller',
  // rules tab
  'How it works': 'Hoe het werkt',
  // night (players)
  'Your turn': 'Jouw beurt', 'Eyes closed. Your phone buzzes when it\'s your turn.': 'Ogen dicht. Je telefoon trilt als je aan de beurt bent.',
  'Look at my token': 'Mijn token bekijken', '🌙 Back to the night screen': '🌙 Terug naar het nachtscherm', 'Got it: back to sleep': 'Begrepen: weer slapen',
  Confirm: 'Bevestigen', Yes: 'Ja', No: 'Nee', 'You learn': 'Je leert', Choose: 'Kies', 'Choose a player': 'Kies een speler', 'Choose a character': 'Kies een personage',
  'Choose a player to kill': 'Kies een speler om te doden', 'Choose a player to poison': 'Kies een speler om te vergiftigen',
  'Choose 2 players: is one of them the Demon?': 'Kies 2 spelers: is een van hen de Demon?',
  'Choose a player to protect from the Demon tonight (not yourself)': 'Kies een speler om vannacht te beschermen tegen de Demon (niet jezelf)',
  'Choose your Master (not yourself). Tomorrow you may only vote if they vote too': 'Kies je Meester (niet jezelf). Morgen mag je alleen stemmen als die ook stemt',
  'You died tonight. Choose a player to learn their character': 'Je bent vannacht gestorven. Kies een speler om diens personage te leren',
  'Pairs of evil players sitting next to each other': 'Paren kwade spelers die naast elkaar zitten', 'Your alive neighbours that are evil': 'Je levende buren die kwaad zijn',
  'Nobody was executed today': 'Er is vandaag niemand geëxecuteerd', 'The Grimoire': 'De Grimoire', 'You are the Demon': 'Jij bent de Demon', 'You are now the Demon': 'Jij bent nu de Demon',
  'Your Minion': 'Jouw Handlanger', 'Your Minions': 'Jouw Handlangers', 'Your Demon': 'Jouw Demon', 'Not in play: you can bluff as these': 'Niet in het spel: hiermee kun je bluffen',
  'Nothing for you tonight. Tap any player to go back to sleep.': 'Niets voor jou vannacht. Tik op een speler om weer te gaan slapen.',
  'Yes: one of them is the Demon': 'Ja: een van hen is de Demon', 'No: neither is the Demon': 'Nee: geen van beiden is de Demon', 'Your number': 'Je getal',
  // day timer
  "Time's up": 'De tijd is om', "I'm back": 'Ik ben terug', '⏳ 30 seconds left: start wrapping up': '⏳ Nog 30 seconden: rond je gesprek af',
  // storyteller
  '1 · Script': '1 · Script', '2 · Players': '2 · Spelers', '3 · Characters': '3 · Personages', '4 · Demon bluffs': '4 · Demon-bluffs', 'Demon bluffs': 'Demon-bluffs',
  'Add a name (no phone)': 'Naam toevoegen (zonder telefoon)', 'Seating, clockwise around the table': 'Zitplaatsen, met de klok mee rond de tafel', '🔀 Shuffle seats': '🔀 Plaatsen schudden',
  '🎲 Random characters': '🎲 Willekeurige personages', '✋ Choose characters': '✋ Personages kiezen', '🎲 Random bluffs': '🎲 Willekeurige bluffs', '✋ Choose': '✋ Kiezen',
  '🌙 Start the game (first night)': '🌙 Start het spel (eerste nacht)', 'You need at least 5 players.': 'Je hebt minstens 5 spelers nodig.', 'In play now': 'Nu in het spel',
  'Characters dealt': 'Personages uitgedeeld', 'Game log': 'Spellog', 'Add to the log': 'Toevoegen aan de log', 'Game in progress': 'Spel bezig',
  '😇 Good wins (Demon dead)': '😇 Goed wint (Demon dood)', '😈 Evil wins': '😈 Kwaad wint', 'Stop the game without a winner': 'Spel stoppen zonder winnaar',
  'New game with the same players': 'Nieuw spel met dezelfde spelers', '😈 Show the bluffs': '😈 Toon de bluffs', '🃏 Show': '🃏 Toon', 'Show a card': 'Toon een kaart',
  'Night & day rules': 'Regels voor nacht en dag', 'Player chats locked at night (always)': 'Spelerschats ’s nachts dicht (altijd)', 'Also lock the storyteller chat at night': 'Ook de chat met de verteller ’s nachts dicht',
  'Day length': 'Daglengte', 'To open the grimoire on a second device too. Keep it secret.': 'Om de grimoire ook op een tweede apparaat te openen. Houd hem geheim.',
  'Match the real table. To change the order, tap a player in the Grimoire and use ◀ ▶.': 'Net als de echte tafel. Om de volgorde te veranderen: tik een speler aan in de Grimoire en gebruik ◀ ▶.',
  '⭕ Circle': '⭕ Cirkel', '▭ Long table': '▭ Lange tafel', '◀ Move seat': '◀ Plaats verschuiven', 'Move seat ▶': 'Plaats verschuiven ▶',
  '🧪 Test mode: play all seats on this screen': '🧪 Testmodus: speel alle plaatsen op dit scherm', '⏏ Leave the grimoire on this device': '⏏ Grimoire op dit apparaat verlaten',
  "🔑 I'm the storyteller": '🔑 Ik ben de verteller', '✕ Leave this room': '✕ Deze kamer verlaten', '🎭 Change character': '🎭 Personage wijzigen', '👁 Change what they see': '👁 Wijzig wat die ziet',
  'The night order shows up here at night, with only the characters in play.': 'De nachtvolgorde verschijnt hier ’s nachts, met alleen de personages in het spel.',
  'What happened at night': 'Wat er ’s nachts gebeurde', 'The grimoire': 'De grimoire', 'Ask to choose': 'Laat kiezen', 'Show info': 'Toon info',
  'Text on their phone': 'Tekst op hun telefoon', 'They choose': 'Zij kiezen', 'Show players': 'Toon spelers', 'Show characters': 'Toon personages', 'Show a number': 'Toon een getal',
  'Show the whole Grimoire (Spy)': 'Toon de hele Grimoire (Spion)', '📱 Send': '📱 Versturen', '↻ Other suggestion': '↻ Andere suggestie', 'waiting…': 'wacht…', Cancel: 'Annuleren',
  'Marked dead': 'Dood gemarkeerd', 'Nothing to send for this step': 'Niets te versturen voor deze stap', 'No other suggestion for this one': 'Geen andere suggestie hiervoor',
  'Import a script': 'Script importeren', '⬆️ Import a script (JSON)': '⬆️ Script importeren (JSON)', 'Test mode': 'Testmodus', '🧪 Test mode': '🧪 Testmodus',
  'How many players?': 'Hoeveel spelers?',
  'Tap a player to note what you think they are: good, evil or a character. Only you can see this.': 'Tik op een speler om te noteren wat je denkt: goed, kwaad of een personage. Alleen jij ziet dit.',
  '😇 Good': '😇 Goed', '😈 Evil': '😈 Kwaad', '? Not sure': '? Weet niet', Clear: 'Wissen', '👻 vote': '👻 stem',
  'Who dies tonight?': 'Wie sterft er vannacht?', 'Nobody dies': 'Niemand sterft', 'Someone else…': 'Iemand anders…', 'Who dies instead?': 'Wie sterft er in plaats daarvan?',
  'Nothing in the grimoire stops this kill.': 'Niets in de grimoire houdt deze moord tegen.', 'Alerts on phones': 'Meldingen op telefoons',
  '🔔 Send a test alert to every player': '🔔 Stuur een testmelding naar alle spelers', '🔔 Test alert': '🔔 Testmelding', '🔔 No alerts on': '🔔 Geen meldingen aan', Reset: 'Reset', 'Start or pause': 'Start of pauze', 'One minute more': 'Eén minuut erbij',
};

// texts with a name or number in them
const PATTERNS = [
  [/^(🌙|☀️|🕯️) (.+?)( ·)?$/u, (m, icon, inner, dot) => `${icon} ${tr(inner)}${dot || ''}`],
  [/^Setting up$/, 'Opzetten'],
  [/^Game over$/, 'Spel voorbij'],
  [/^Good wins$/, 'Goed wint'],
  [/^Evil wins$/, 'Kwaad wint'],
  [/^Night (\d+)$/, 'Nacht $1'],
  [/^Day (\d+)$/, 'Dag $1'],
  [/^☀️ Start day (\d+)$/, '☀️ Start dag $1'],
  [/^🌙 Night (\d+)$/, '🌙 Nacht $1'],
  [/^Pick (\d+) · (\d+)\/(\d+)$/, 'Kies $1 · $2/$3'],
  [/^(\d+) of (\d+) alive · (\d+) votes? to execute$/, '$1 van $2 levend · $3 stemmen voor executie'],
  [/^You are GOOD · (.+)$/, (m, t) => `Jij bent GOED · ${tr(t)}`],
  [/^You are EVIL · (.+)$/, (m, t) => `Jij bent KWAAD · ${tr(t)}`],
  [/^(.+) \(you\)$/, '$1 (jij)'],
  [/^Waiting for the storyteller · (\d+) players?$/, 'Wachten op de verteller · $1 spelers'],
  [/^You're in the game \((\d+) players? so far\)\. Your character arrives here when the game starts\.$/, 'Je doet mee ($1 spelers tot nu toe). Je personage verschijnt hier als het spel begint.'],
  [/^One of these players is the (.+)$/, 'Een van deze spelers is de $1'],
  [/^There are no (.+)s in play$/, (m, t) => `Er zijn geen ${tr(t + 's').toLowerCase()} in het spel`],
  [/^The character of (.+), executed today$/, 'Het personage van $1, vandaag geëxecuteerd'],
  [/^You are now the (.+)$/, 'Jij bent nu de $1'],
  [/^(.+) is the$/, '$1 is de'],
  [/^Choose (\d+) players$/, 'Kies $1 spelers'],
  [/^You are a Minion\.(?: Your fellow Minions: (.+)\.)?$/, (m, l) => `Jij bent een Handlanger.${l ? ` Je mede-Handlangers: ${l}.` : ''}`],
  [/^You: (.*)$/, 'Jij: $1'],
  [/^Message (.+)$/, 'Bericht aan $1'],
  [/^🌙 Night: chats are locked( \(the storyteller can still be reached\))?$/, (m, x) => `🌙 Nacht: chats zijn dicht${x ? ' (de verteller is nog bereikbaar)' : ''}`],
  [/^📱 Sent to (.+)$/, '📱 Verstuurd naar $1'],
  [/^Choose (\d+) characters$/, 'Kies $1 personages'],
  [/^Picked (\d+)\/(\d+)$/, 'Gekozen $1/$2'],
  [/^Players join with code$/, 'Spelers doen mee met code'],
  [/^(\d+) min$/, '$1 min'],
  [/^Test failed: (.+)$/, 'Test mislukt: $1'],
  [/^👻 (\d+) ghost votes? left$/, '👻 nog $1 spookstem(men)'],
  [/^🗡 (.+) \((.+)\) chose (.+)$/, '🗡 $1 ($2) koos $3'],
  [/^⚠ (.+) is protected \((.+)\)$/, '⚠ $1 is beschermd ($2)'],
  [/^⚠ (.+) is the Soldier$/, '⚠ $1 is de Soldaat'],
  [/^⚠ (.+) is already dead$/, '⚠ $1 is al dood'],
  [/^⚠ (.+) \(the Demon\) is (.+)$/, '⚠ $1 (de Demon) is $2'],
  [/^⚠ The Demon chose themselves: a Minion becomes the Demon \(starpass\)$/, '⚠ De Demon koos zichzelf: een Handlanger wordt de Demon'],
  [/^⚠ (.+) is the Mayor: you may make another player die instead$/, '⚠ $1 is de Burgemeester: je mag iemand anders laten sterven'],
  [/^☠ (.+) marked dead$/, '☠ $1 dood gemarkeerd'],
  [/^(\d+) of (\d+) players have alerts on\.$/, '$1 van $2 spelers hebben meldingen aan.'],
  [/^🔔 Sent to (\d+)(?: · no alerts on: (.+))?$/, (m, n, off) => `🔔 Verstuurd naar ${n}${off ? ` · geen meldingen: ${off}` : ''}`],
  [/^🔔 Test sent to (.+)$/, '🔔 Test verstuurd naar $1'],
  [/^(.+) has no alerts on$/, '$1 heeft geen meldingen aan'],
  [/^What is (.+)\?$/, 'Wat is $1?'],
  [/^You can’t choose yourself$/, 'Je kunt jezelf niet kiezen'],
  [/^Reminder added: (.+)$/, 'Herinnering toegevoegd: $1'],
  [/^☠ (.+) dies$/, '☠ $1 sterft'],
  [/^(.+) chose$/, '$1 koos'],
];

function tr(text) {
  const t = text.trim();
  if (!t) return text;
  let out = NL[t];
  if (out === undefined)
    for (const [re, to] of PATTERNS) {
      if (re.test(t)) {
        out = t.replace(re, to);
        break;
      }
    }
  if (out === undefined) return text;
  return text.replace(t, out);
}

const SKIP = 'textarea, input, .msg, .msgs, .notes, .seat-note, .ns-names, .chat-mid b, .hd-name, script, style';
function walk(root) {
  if (root.nodeType === 3) {
    const p = root.parentElement;
    if (p && !p.closest(SKIP)) {
      const t = tr(root.nodeValue);
      if (t !== root.nodeValue) root.nodeValue = t;
    }
    return;
  }
  if (root.nodeType !== 1) return;
  for (const a of ['placeholder', 'aria-label', 'title']) {
    const v = root.getAttribute?.(a);
    if (v) {
      const t = tr(v);
      if (t !== v) root.setAttribute(a, t);
    }
  }
  if (root.matches?.(SKIP)) return;
  root.querySelectorAll?.('input[placeholder], textarea[placeholder]').forEach((x) => {
    const v = x.getAttribute('placeholder');
    const t = tr(v);
    if (t !== v) x.setAttribute('placeholder', t);
  });
  for (const c of root.childNodes) walk(c);
}

export function setupI18n(store) {
  lang = store.get('botc-lang') === 'nl' ? 'nl' : 'en';
  document.documentElement.lang = lang;
  if (lang === 'en') return;
  walk(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
export const t = (s) => (lang === 'nl' ? tr(s) : s);
