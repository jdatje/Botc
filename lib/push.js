// Web Push: notifications on a locked phone or in another app ("your turn", "time's up").
// iPhone: only works from the app added to the home screen (iOS 16.4+).
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ VAPID_SUBJECT) from the environment,
// otherwise made once and kept in DATA_DIR/vapid.json so subscriptions survive restarts.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

const DATA_DIR = process.env.DATA_DIR || './data';
let keys = null;

function load() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const file = path.join(DATA_DIR, 'vapid.json');
    try {
      keys = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
      } catch (err) {
        console.error('Push: could not save keys:', err.message);
      }
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@maisonbaron.nl', keys.publicKey, keys.privateKey);
  return keys;
}

export const publicKey = () => load().publicKey;

// Only the browsers' own push services: the server posts to this address, so anything else
// (an internal host, a random site) is refused. PUSH_EXTRA_HOSTS adds hosts, comma separated.
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];
const EXTRA_HOSTS = String(process.env.PUSH_EXTRA_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const hostOf = (endpoint) => {
  try {
    return new URL(endpoint).hostname.toLowerCase();
  } catch {
    return '';
  }
};
const allowedHost = (host) => Boolean(host) && (EXTRA_HOSTS.includes(host) || PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)));

// a subscription from the browser: a real https address at a push service, small
export function cleanSub(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const endpoint = String(sub.endpoint || '');
  const p256dh = String(sub.keys?.p256dh || '');
  const auth = String(sub.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return null;
  if (!allowedHost(hostOf(endpoint))) return null;
  return { endpoint, keys: { p256dh, auth } };
}

// send to every subscription; returns the ones that are gone (to forget them). Never rejects.
export async function send(subs, payload, onError) {
  const gone = [];
  try {
    load();
    await Promise.all(
      (subs || []).map(async (s) => {
        try {
          if (!allowedHost(hostOf(s?.endpoint))) throw Object.assign(new Error('not a push service address'), { statusCode: 410 });
          await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 120, urgency: 'high' });
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) gone.push(s?.endpoint);
          console.error('Push:', hostOf(s?.endpoint) || '?', err.statusCode || '', err.body || err.message);
          try {
            onError?.(err);
          } catch {}
        }
      })
    );
  } catch (err) {
    console.error('Push:', err.message);
  }
  return gone;
}
