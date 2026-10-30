// Blood on the Clocktower table helper — web server.
// Serves the page and the live game over Socket.IO. Configure with env vars:
//   PORT        port to listen on (default 3000)
//   BASE_PATH   when served under a sub path, e.g. /botc (default: site root)
//   PUBLIC_URL  full public address for the join QR code, e.g. https://botc.maisonbaron.nl
//               (default: taken from the request, also behind a proxy with X-Forwarded-* headers)
//   DATA_DIR    where rooms are saved (default ./data)
//   ROOM_TTL_HOURS, MAX_ROOMS   cleanup and limits (default 48 h, 1000 rooms)
// Optional: a fixed "house room" for a venue screen (the Wexer bar screen). Off unless HOST_SECRET is set:
//   HOST_SECRET  shared secret for the host API (POST /host/house with header X-Host-Secret)
//   HOUSE_CODE   the house room's code, e.g. WEXER
// Optional: sign in with Boardpass (everyone needs an account). Off unless BOARDPASS_SECRET is set:
//   BOARDPASS_INTERNAL_URL  e.g. http://boardpass:3002 (Docker network)
//   BOARDPASS_PUBLIC_URL    e.g. https://boardpass.maisonbaron.nl
//   BOARDPASS_SECRET        the game's secret from Boardpass › Admin › Games
import express from 'express';
import compression from 'compression';
import http from 'node:http';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import * as game from './lib/game.js';
import { createBoardpassClient } from './lib/boardpass-client.js';

const PORT = Number(process.env.PORT || 3000);
const BASE = `/${String(process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');

const boardpass = process.env.BOARDPASS_SECRET
  ? createBoardpassClient({
      internalUrl: process.env.BOARDPASS_INTERNAL_URL || 'http://boardpass:3002',
      publicUrl: process.env.BOARDPASS_PUBLIC_URL,
      secret: process.env.BOARDPASS_SECRET,
    })
  : null;

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { path: `${BASE}/socket.io`, maxHttpBufferSize: 512 * 1024 });
game.attach(io);

const publicBase = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}${BASE}`).replace(/\/$/, '');

// Boardpass: the page needs a signed-in user, so does every socket
async function whoIs(req, res) {
  try {
    return await boardpass.authenticate(req);
  } catch (err) {
    console.error('Boardpass:', err.message);
    res.status(503).type('text').send('Sign-in is unavailable right now. Try again in a minute.');
    return undefined;
  }
}
const pageGate = async (req, res, next) => {
  if (!boardpass) return next();
  const session = await whoIs(req, res);
  if (session === undefined) return;
  if (session) return next();
  // come back to the same page, join code included
  const back = `${publicBase(req)}${req.url === '/' ? '/' : req.url}`;
  res.redirect(302, boardpass.loginUrl(back));
};

const site = express.Router();
site.use(compression());
// version: the git commit the image was built from (set by the deploy pipeline)
site.get('/health', (_req, res) => res.json({ ok: true, version: process.env.GIT_SHA || 'dev', login: Boolean(boardpass), ...game.stats() }));
// who am I (the start page uses this to skip the name field)
site.get('/me', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!boardpass) return res.json({ login: false, user: null });
  const session = await whoIs(req, res);
  if (session === undefined) return;
  res.json({
    login: true,
    user: session ? { id: session.user.id, username: session.user.username } : null,
    loginUrl: boardpass.loginUrl(publicBase(req) + '/'),
    // the game picker and account page, for the "All games" links
    boardpassUrl: process.env.BOARDPASS_PUBLIC_URL || '',
  });
});
// Boardpass tells us about sign-outs, password resets and deleted users: drop those sockets
site.post('/boardpass/events', async (req, res) => {
  if (!boardpass) return res.status(404).end();
  try {
    const event = await boardpass.handleEvent(req);
    for (const socket of io.of('/').sockets.values()) {
      const s = socket.boardpass;
      if (!s) continue;
      if ((event.tokenHash && s.tokenHash === event.tokenHash) || (event.userId !== undefined && event.type !== 'user.updated' && s.user.id === event.userId)) {
        socket.emit('auth:revoked');
        socket.disconnect(true);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
site.get(['/', '/index.html'], pageGate);
// Host API: the venue's own server keeps its house room and storyteller code in sync
site.post('/host/house', express.json({ limit: '4kb' }), (req, res) => {
  const secret = process.env.HOST_SECRET;
  if (!secret || req.get('x-host-secret') !== secret) return res.status(404).end();
  res.json(game.house(req.body?.code || process.env.HOUSE_CODE, req.body?.stCode));
});
// QR code with the join link for a room
site.get('/qr/:code.png', async (req, res) => {
  const code = String(req.params.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}${BASE}`).replace(/\/$/, '');
  const png = await QRCode.toBuffer(`${base}/?code=${code}`, { margin: 1, width: 360, color: { dark: '#111111', light: '#FFFFFF' } });
  res.type('png').set('Cache-Control', 'public, max-age=86400').send(png);
});
site.use('/icons', express.static('public/icons', { maxAge: '30d' }));
site.use('/img', express.static('public/img', { maxAge: '30d' }));
site.use(express.static('public', { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
// /botc → /botc/ (relative links need the slash)
if (BASE) app.use((req, res, next) => (req.path === BASE ? res.redirect(301, `${BASE}/${req.url.slice(BASE.length)}`) : next()));
app.use(BASE || '/', site);

if (boardpass) {
  io.use(async (socket, next) => {
    try {
      const session = await boardpass.authenticate(socket.request);
      if (!session) return next(new Error('login_required'));
      socket.boardpass = session; // not socket.data: game.js resets that when you enter a room
      next();
    } catch (err) {
      console.error('Boardpass:', err.message);
      next(new Error('login_unavailable'));
    }
  });
}

io.on('connection', (socket) => {
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address;
  const user = socket.boardpass ? { id: socket.boardpass.user.id, username: socket.boardpass.user.username } : null;
  game.register(socket, ip, user);
});

server.listen(PORT, () => console.log(`Blood on the Clocktower helper on :${PORT}${BASE || '/'}${boardpass ? ' (Boardpass sign-in on)' : ''}`));
