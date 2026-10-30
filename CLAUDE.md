# BotC table helper — working notes

**Jeroen: every BotC change goes into BOTH this repo and the Wexer (jdatje/bar-screen, `app/lib/botc.js` +
`app/public/botc/`). In this repo it must end up merged to `main`. The Wexer still only gets pushed on Jeroen's go.**
The two versions differ (rooms, Boardpass sign-in here; Wexer room/admin code there), so port changes by hand.

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
- Test locally: `BASE_PATH=/botc PORT=4100 DATA_DIR=/tmp/x node server.js`.
