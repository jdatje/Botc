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
- Test locally: `BASE_PATH=/botc PORT=4100 DATA_DIR=/tmp/x node server.js`.
