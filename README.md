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

```
cp .env.example .env          # fill it in
docker compose up -d --build
```

It listens on `127.0.0.1:3004` and keeps games in the `botc-data` volume. The `.env` decides the mode:
keep the `COMPOSE_FILE=...` line to sign in with Boardpass (adds `docker-compose.boardpass.yml`,
which joins the `boardpass` Docker network), or remove it to run without accounts.

Without compose:

```
docker build -t botc-table .
docker run -d --name botc -p 3000:3000 -v botc-data:/data --restart unless-stopped botc-table
```

### Deploy from `main`

`.github/workflows/deploy.yml` checks every push and PR. On `main` it builds `ghcr.io/jdatje/botc` and,
once switched on, deploys it to a VPS over SSH:

1. On the VPS: `mkdir ~/botc`, then put a filled-in `.env` (from `.env.example`) in it. The pipeline copies the
   compose files there but never touches `.env`.
2. In the repo settings, add the secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (a private key whose public key
   is in that user's `~/.ssh/authorized_keys`) and `VPS_KNOWN_HOSTS`: the server's host key fingerprint,
   e.g. the `SHA256:…` of the ED25519 line from `ssh-keyscan your-vps | ssh-keygen -lf -` (full
   `ssh-keyscan` lines work too). The pipeline scans the server on each deploy and only connects if it
   matches. Add `VPS_PORT` if SSH isn't on 22.
3. Add the repository variable `DEPLOY_ENABLED=true` (and `DEPLOY_PATH` if not `botc`).

Each deploy pulls the image of that exact commit, waits for the health check, and then checks that `/health`
reports that commit as its `version`. Open `https://botc.maisonbaron.nl/health` to see what's live.

### nginx

- Its own subdomain (`https://botc.maisonbaron.nl/`, the default): [`deploy/nginx/botc-site.conf`](deploy/nginx/botc-site.conf), with `BASE_PATH` empty.
- Sub path on an existing site (`https://example.com/botc/`):
  [`deploy/nginx/botc-location.conf`](deploy/nginx/botc-location.conf), included in that site's `server { }` block, with `BASE_PATH=/botc`.

Both pass the WebSocket upgrade and keep `/boardpass/events` off the internet.

### Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `BASE_PATH` | *(root)* | Serve under a sub path, e.g. `/botc` → `https://example.com/botc/` |
| `PUBLIC_URL` | from the request | Full public address used in the join QR code, e.g. `https://botc.maisonbaron.nl` |
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

Set the game's events URL in Boardpass to `http://botc:3000/boardpass/events` (with `BASE_PATH=/botc`: `/botc/boardpass/events`), so signing out or a
password reset drops that person's live connection straight away. `GET /me` tells the page who is signed in.

### Health check

`/health` (or `/botc/health` under a sub path); the Docker image uses it as its `HEALTHCHECK`.

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
