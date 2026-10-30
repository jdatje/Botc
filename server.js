// Blood on the Clocktower table helper — web server.
// Serves the page and the live game over Socket.IO. Configure with env vars:
//   PORT        port to listen on (default 3000)
//   BASE_PATH   when served under a sub path, e.g. /botc (default: site root)
//   PUBLIC_URL  full public address for the join QR code, e.g. https://boardpass.maisonbaron.nl/botc
//               (default: taken from the request, also behind a proxy with X-Forwarded-* headers)
//   DATA_DIR    where rooms are saved (default ./data)
//   ROOM_TTL_HOURS, MAX_ROOMS   cleanup and limits (default 48 h, 1000 rooms)
import express from 'express';
import compression from 'compression';
import http from 'node:http';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import * as game from './lib/game.js';

const PORT = Number(process.env.PORT || 3000);
const BASE = `/${String(process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { path: `${BASE}/socket.io`, maxHttpBufferSize: 512 * 1024 });
game.attach(io);

const site = express.Router();
site.use(compression());
site.get('/health', (_req, res) => res.json({ ok: true, ...game.stats() }));
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

io.on('connection', (socket) => {
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address;
  game.register(socket, ip);
});

server.listen(PORT, () => console.log(`Blood on the Clocktower helper on :${PORT}${BASE || '/'}`));
