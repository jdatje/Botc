# Blood on the Clocktower: table helper

A web app for playing **Blood on the Clocktower in person**, around one table.

- **Players** join on their phone with a 5-letter game code (or QR code). Their phone is their character token (shown only while they hold the screen), plus a town square for their own guesses, private chats, notes, the script and plain-words rules.
- **The storyteller** starts a game and runs it from a phone, tablet or laptop. The grimoire covers setup (script, seating, random or chosen characters, bluffs), reminders, deaths and ghost votes, the night order, info cards to show, the day timer and a game log.
- **A table view** for a TV or laptop facing the table shows the town square, the join QR code and the big day timer. It never shows secrets until the grimoire is revealed at the end.

Nominations, voting and night actions happen in real life, as in the board game. Many groups can play at the same time; each game has its own code. Built-in scripts are Trouble Brewing, Bad Moon Rising and Sects & Violets. Storytellers can import any script JSON (official script tool or community scripts), including homebrew characters.

## Run it

Needs Node.js 20 or newer.

```bash
npm install
npm start            # http://localhost:3000
```

### With Docker

```bash
docker build -t botc-table .
docker run -d --name botc -p 3000:3000 -v botc-data:/data --restart unless-stopped botc-table
```

### Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `BASE_PATH` | *(root)* | Serve under a sub path, e.g. `/botc` → `https://boardpass.maisonbaron.nl/botc/` |
| `PUBLIC_URL` | from the request | Full public address used in the join QR code, e.g. `https://boardpass.maisonbaron.nl/botc` |
| `DATA_DIR` | `./data` (`/data` in Docker) | Where games are saved (one small JSON file per game), so a restart doesn't lose them |
| `ROOM_TTL_HOURS` | `48` | Games nobody touched for this long are deleted |
| `MAX_ROOMS` | `1000` | Maximum number of games at once |

### Sign in with Boardpass (optional)

Set these three and everyone needs a Boardpass account to play (player, storyteller and table view).
Players then join as their account name and can't take over someone else's seat. Leave them out and
the app works as before, with typed names and no accounts.

| Variable                 | Example                         | What it does                                       |
|--------------------------|---------------------------------|----------------------------------------------------|
| `BOARDPASS_SECRET`       | from Boardpass › Admin › Games  | Turns sign-in on                                   |
| `BOARDPASS_PUBLIC_URL`   | `https://boardpass.maisonbaron.nl` | The login page people are sent to               |
| `BOARDPASS_INTERNAL_URL` | `http://boardpass:3002`         | Where the server checks sessions (Docker network)  |

Set the game's events URL in Boardpass to `http://botc:3000/botc/boardpass/events`, so signing out or a
password reset drops that person's live connection straight away. `GET /me` tells the page who is signed in.

### Behind a reverse proxy (nginx)

The game is live over WebSockets (Socket.IO), so the proxy must pass the upgrade headers:

```nginx
location /botc/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1h;
}
```

With `location /botc/` run the app with `BASE_PATH=/botc`. On its own (sub)domain, leave `BASE_PATH` empty and use `location /`. The health check is at `/health` (or `/botc/health`).

## Security notes

- A game is reached with its 5-character code. Wrong codes are rate-limited per address (20 per minute).
- The storyteller gets a secret token on the device that created the game. A second storyteller device needs the game code plus a 6-digit storyteller code (shown in the storyteller's ⚙). Wrong storyteller codes are limited to 8 per 5 minutes.
- Players' chats are private between the two people in them. The storyteller can't read them.
- Imported scripts are only used in that game. Homebrew character images are not downloaded by the server; phones load them straight from their own `https://` address.
- No accounts and no personal data beyond the names people type in (unless Boardpass sign-in is on: then the Boardpass username and user id are kept with the game). Games are deleted after `ROOM_TTL_HOURS`.

## Code layout

- `server.js`: Express + Socket.IO server, QR codes, sub-path handling
- `lib/game.js`: rooms and the game (setup, grimoire, phases, timer, chats, notes); socket events `room:*` and `botc:*`
- `public/index.html`, `public/app.js`, `public/botc.css`: the single-page app (start page, player, storyteller, table view; six styles)
- `public/rules.js`: our own plain-words rules text
- `data-seed/`: official character data, night order and jinxes; `public/icons`, `public/img`: official icons and logos

## Credits and licence

Blood on the Clocktower is © The Pandemonium Institute. Character data, night order, jinxes, icons and logos come from TPI's **toolmaker resources** ([github.com/ThePandemoniumInstitute/botc-release](https://github.com/ThePandemoniumInstitute/botc-release), `resources/`). They are used under their [Community Created Content Policy](https://bloodontheclocktower.com/pages/community-created-content-policy), which means:

- it stays **free**: no charging, ads or paywalls around it;
- it must not look **official** (keep the "Community Created Content" logo in the footer and the "unofficial" line);
- it must not **compete** with TPI's own online app. This tool is for in-person games only, not online play.

TPI can update the policy or ask for content to be taken down. This is an unofficial, fan-made helper.
