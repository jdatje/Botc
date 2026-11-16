# BotC table helper — working notes

**Jeroen: BotC changes are made here and must end up merged to `main`.**
Since 30 Oct 2026 the Wexer runs THIS repo as its `botc` container (latest `main` at every start), so a
change merged here reaches the bar at its next boot/restart. Keep the house-room bits working (HOST_SECRET,
HOUSE_CODE, `/host/house`, `?name=`, `?watch=1`, `?embed=1`): the Wexer depends on them.

Standalone copy of the Blood on the Clocktower helper from the Wexer bar screen (jdatje/bar-screen,
`app/lib/botc.js` + `app/public/botc/`), made multi-room for the public site botc.maisonbaron.nl
(hosted by Gregor, sign-in via Boardpass at boardpass.maisonbaron.nl). All UI text in English.

- Rooms: 5-char codes (no I/O/0/1); room = { code, g (game), members, tokens, stCode, scripts }, saved to
  DATA_DIR/rooms/<code>.json, deleted after ROOM_TTL_HOURS idle. `lib/game.js` handles one room at a time via
  `use(room)` (module vars R/g) — keep socket handlers synchronous so rooms can't mix.
- Socket events: room:create / room:join / room:watch / room:st / room:hello / room:leave, then botc:* (same as
  the Wexer version). Socket.IO rooms: `<code>:st`, `<code>:pub`, `<code>:p:<playerId>`.
- Client works at the root and under BASE_PATH (all URLs relative; socket path from location.pathname).
- Session per device in localStorage `botc-session` ({ code, role, playerId, token }).
- Joining a room during setup seats you automatically; "Leave this game" / the storyteller can untick.
- Homebrew images are hotlinked (https only), never fetched by the server (no SSRF on a public server).
- TPI Community Created Content Policy: free, CCC logo visible, unofficial line, in-person only (no online
  play that competes with their app). Don't remove the footer.
- Boardpass sign-in: optional, on when BOARDPASS_SECRET is set (server.js gates `/` and the Socket.IO handshake; `game.register(socket, ip, user)` ties members to `userId`). `lib/boardpass-client.js` is a copy of gregorvwk/accounts `client/boardpass-client.js`.
- Setup rules live in `public/setup.js` (shared by server + client): official table + every [bracket] character, checked
  against the wiki's "How to Run" + TPI jinxes (31 Oct 2026). Model = real characters on seats (Drunk = Outsider,
  Marionette = Minion); NOT_DEALT (Lil' Monsta) goes in `g.offBag`. Travellers don't count. Random deals: build →
  repair → `setupRules().ok`. Seating: Lord of Typhon line, Marionette next to the Demon. The wiki API works from CCR:
  `https://wiki.bloodontheclocktower.com/api.php?action=parse&page=Baron&prop=wikitext&format=json`.
- Test mode (⚙ in the grimoire → 🧪): `?devgrid=1` shows the grimoire, table view and one frame per test player.
  `?dev=<slot>` prefixes localStorage keys so each frame is its own device. Test players = names added by hand
  (`manual`); a frame plays one via `room:dev` (needs the storyteller token), so it also works with Boardpass on.
- Night on phones: `g.prompts` (botc:prompt / botc:answer / botc:cancelPrompt); a player sees one open prompt at a
  time in a full-screen `#nightscreen`. 1–2 decoy prompts per night (server timers, `fake`, never shown to the ST or
  marked to the player). `public/night.js`: per-character suggestions (TB full, others from reminder text), false
  info when Drunk/Poisoned, follow-ups after answers. Nothing is applied without the storyteller tapping.
- Web Push (`lib/push.js`, `public/sw.js`, `manifest.webmanifest`): night prompts (decoys too, same text), chat
  messages, 30 s / time's up. Only sent when none of the player's pages is visible (`push:visible`). iPhone needs the
  home-screen app (iOS 16.4+) → own storage, so players join again there. VAPID keys from env or DATA_DIR/vapid.json.
  A page seen <20 s ago gets the push 13 s later unless it said "on screen" again (phone locked just after). A phone
  re-registers its address on every join/seat/return to the app; a 404/410 address is dropped and the phone told
  (`push:lost`) to make a new one. iOS ignores `tag` (alerts stack) and needs a visible notification for every push.
- Dutch: `public/i18n.js` swaps on-screen English texts per device (`botc-lang`; exact map + patterns via a
  MutationObserver). New UI text → add its Dutch there. Character texts stay English (official NL behind a login).
- Scarlet Woman: when the Demon dies with 5+ alive she becomes the Demon in the grimoire (`shown` stays Scarlet
  Woman until her night info or the seat sheet's "Show You are"). `g.history` = phone-night log (ST always, all at reveal).
- Town layout: `g.layout` circle | table; `botc:moveSeat` any phase.
- Group chats: `g.groups` (id → { name, members, by }), messages in `g.chats['g:<id>']`. Only members see a group
  (not the storyteller); locked at night like player chats; leaving with <2 members deletes it.
- Grimoire reminders: small tokens (`.rtk`) stacked from each seat towards the middle (`--ux/--uy` set in
  layoutSquares). Auto reminders: Poisoner/Monk/Butler on answer; Washerwoman/Librarian/Investigator on the two
  shown players (team label + Wrong); Undertaker "Died Today" on a day death (cleared at the next dawn).
- Hardening (review 16 Nov 2026): every socket handler goes through `listen()` in `register` (payload always an
  object, ack a function or nothing, try/catch) — add new events with `on()`/`listen()`, never bare `socket.on`.
  Keys from clients are looked up with `Object.hasOwn` (members, groups, custom roles): `__proto__` as a player id
  once made every socket a storyteller. Push endpoints must be a browser push service (`lib/push.js` allowlist,
  `PUSH_EXTRA_HOSTS` for tests). Wrong storyteller codes are braked per address and per room.
- Phones show the side of the character a player thinks they are (`phoneAlign`): Drunk/Marionette good, Lunatic evil.
- Night order skips dead players, except: own death since dawn in the step text, Zombuul, a "Has Ability" reminder.
- Day timer: reset to full and stopped at every dawn. Fortune Teller: a Red Herring is placed at start if missing.
- Tests: `npm test` (node:test, `test/*.test.mjs`; each file starts its own server via `test/helpers.mjs`, with a fake
  https push service). They run in CI on every PR and block the merge. Jeroen: run them for every change unless he says
  otherwise; add a test for each bug fixed. room:create is limited to 20/hour per address, so ≤20 rooms per test file.
- Test locally: `BASE_PATH=/botc PORT=4100 DATA_DIR=/tmp/x node server.js`.
