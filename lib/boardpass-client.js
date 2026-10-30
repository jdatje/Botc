// Boardpass client for game servers. No dependencies: copy this file
// into a game (Qwixx, Final Boarding, ...) and use it from Node 20+.
//
//   import { createBoardpassClient } from './boardpass-client.js'
//
//   const boardpass = createBoardpassClient({
//       internalUrl: process.env.BOARDPASS_INTERNAL_URL, // http://boardpass:3002 on the Docker network
//       publicUrl: process.env.BOARDPASS_PUBLIC_URL,     // https://boardpass.example.com
//       secret: process.env.BOARDPASS_SECRET             // from Admin › Games, or `cli.js add-game`
//   })
//
//   // Express / node:http / Socket.IO handshake
//   const session = await boardpass.authenticate(req)  // { user: { id, username, roles }, tokenHash } | null
//
//   // POST /boardpass/events (the game's events URL)
//   const event = await boardpass.handleEvent(req)     // verified event, or throws
//   if (event.userId) hub.disconnectUser(event.userId)
//
//   // Not signed in? Send the browser to the login page and back.
//   res.redirect(boardpass.loginUrl('https://qwixx.example.com/'))

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const MAX_EVENT_AGE_SECONDS = 5 * 60

function parseCookies(header) {
    const cookies = {}
    for (const part of String(header ?? '').split(';')) {
        const index = part.indexOf('=')
        if (index < 0) continue
        const name = part.slice(0, index).trim()
        if (!name || name in cookies) continue
        try {
            cookies[name] = decodeURIComponent(part.slice(index + 1).trim())
        } catch {
            cookies[name] = part.slice(index + 1).trim()
        }
    }
    return cookies
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

/**
 * @param {{
 *   internalUrl: string,
 *   publicUrl: string,
 *   secret: string,
 *   cookieName?: string,
 *   cacheMs?: number,
 *   fetchImpl?: typeof fetch
 * }} options
 */
export function createBoardpassClient({
    internalUrl,
    publicUrl,
    secret,
    cookieName = 'boardpass_session',
    cacheMs = 30_000,
    fetchImpl = globalThis.fetch
}) {
    if (!internalUrl || !publicUrl || !secret) throw new Error('boardpass client needs internalUrl, publicUrl and secret')

    // tokenHash → { session, until }. A logout or reset event clears entries straight away;
    // otherwise they run out after cacheMs.
    const cache = new Map()

    function forgetUser(userId) {
        for (const [key, entry] of cache) {
            if (entry.session?.user.id === userId) cache.delete(key)
        }
    }

    /** @returns {Promise<{ user: { id: number, username: string, roles: string[] }, tokenHash: string } | null>} */
    async function authenticateToken(token) {
        if (!token) return null
        const tokenHash = hashToken(token)
        const cached = cache.get(tokenHash)
        if (cached && cached.until > Date.now()) return cached.session

        const res = await fetchImpl(new URL('/internal/session', internalUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
            body: JSON.stringify({ token }),
            signal: AbortSignal.timeout(3000)
        })

        let session = null
        if (res.ok) {
            const data = await res.json()
            session = { user: data.user, tokenHash }
        } else if (res.status !== 401) {
            // Boardpass is down or misconfigured: don't cache, don't pretend.
            throw new Error(`boardpass answered HTTP ${res.status}`)
        }

        cache.set(tokenHash, { session, until: Date.now() + cacheMs })
        if (cache.size > 5000) cache.delete(cache.keys().next().value)
        return session
    }

    return {
        /** Reads the shared session cookie from an HTTP request or WebSocket upgrade. */
        authenticate(req) {
            return authenticateToken(parseCookies(req.headers.cookie)[cookieName])
        },

        authenticateToken,

        /** True when the user has this role in the calling game, e.g. hasRole(session, 'admin'). */
        hasRole(session, role) {
            return session?.user.roles.includes(role) === true
        },

        /** The Boardpass login page, coming back to returnTo afterwards. */
        loginUrl(returnTo) {
            const url = new URL('/login', publicUrl)
            if (returnTo) url.searchParams.set('return', returnTo)
            return url.toString()
        },

        /**
         * Checks and reads an event POSTed by Boardpass, and clears the cache it touches.
         * @param {import('node:http').IncomingMessage} req
         * @returns {Promise<{ type: string, userId?: number, tokenHash?: string, at: string }>}
         */
        async handleEvent(req) {
            const chunks = []
            let size = 0
            for await (const chunk of req) {
                size += chunk.length
                if (size > 10_000) throw new Error('event too large')
                chunks.push(chunk)
            }
            const body = Buffer.concat(chunks).toString('utf8')

            const timestamp = String(req.headers['x-boardpass-timestamp'] ?? '')
            const given = String(req.headers['x-boardpass-signature'] ?? '').replace(/^sha256=/, '')
            const age = Math.abs(Date.now() / 1000 - Number(timestamp))
            if (!/^\d+$/.test(timestamp) || !(age <= MAX_EVENT_AGE_SECONDS)) throw new Error('event timestamp too old')

            const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
            if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
                throw new Error('bad event signature')
            }

            const event = JSON.parse(body)
            if (event.tokenHash) cache.delete(event.tokenHash)
            if (event.userId !== undefined) forgetUser(event.userId)
            return event
        },

        forgetUser
    }
}
