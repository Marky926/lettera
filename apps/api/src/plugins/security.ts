/**
 * Security middleware bundle for the Lettera API.
 *
 *   • @fastify/helmet — standard HTTP hardening headers
 *   • @fastify/rate-limit — global throttle (per-IP)
 *   • originGuard — CSRF-equivalent: rejects state-changing requests whose
 *     `Origin`/`Referer` header is not in the allow-list. Combined with the
 *     existing `sameSite: lax` + `httpOnly` session cookie this closes the
 *     classic cookie-based CSRF gap without requiring a double-submit token
 *     dance on the client.
 *
 * Error handler is centralised here too so every route produces a consistent
 * RFC-7807-ish body `{ code, message, details? }`.
 */
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isLoopback(req: FastifyRequest): boolean {
  const ip = req.ip;
  if (!ip) return false;
  // IPv4 loopback, IPv6 loopback, and IPv4-mapped IPv6 loopback.
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function originAllowed(req: FastifyRequest): boolean {
  // GET/HEAD/OPTIONS are safe by definition (browsers don't include cookies
  // on non-simple cross-origin requests without preflight, and preflight is
  // already restricted by CORS).
  if (!STATE_CHANGING.has(req.method)) return true;
  const origin = req.headers.origin ?? req.headers.referer;
  if (!origin) {
    // Non-browser clients (tests, curl, server-to-server) set neither.
    // Production: deny outright — a browser-driven CSRF can also strip
    // these headers via <form> submission, and we have no way to tell them
    // apart from a curl request.
    // Non-prod: allow only loopback so a dev server exposed via ngrok/LAN
    // does not inadvertently fail-open.
    if (env.NODE_ENV === 'production') return false;
    return isLoopback(req);
  }
  try {
    const hostOrigin = new URL(origin).origin;
    return env.WEB_ORIGIN.includes(hostOrigin);
  } catch {
    return false;
  }
}

export default fp(async function securityPlugin(app: FastifyInstance) {
  // Standard security headers; CSP is off because the API never returns HTML.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  // Global throttle. Auth routes get a stricter limit attached per-route in
  // auth.ts — Fastify merges them correctly.
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_GLOBAL,
    timeWindow: '1 minute',
    // Allow local loopback bursts in dev; don't disable — we want it on in CI.
    skipOnError: true,
  });

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!originAllowed(req)) {
      return reply.code(403).send({
        code: 'forbidden_origin',
        message: 'Request origin is not permitted',
      });
    }
  });

  // Uniform error shape for everything downstream throws or `reply.send`s.
  app.setErrorHandler((error: FastifyError, req, reply) => {
    const status = error.statusCode ?? 500;
    // Log server errors with full stack; client errors get a terse line.
    if (status >= 500) {
      req.log.error({ err: error }, 'request failed');
    } else {
      req.log.warn({ err: error }, 'request rejected');
    }
    const code = error.code ?? (status >= 500 ? 'internal_error' : 'bad_request');
    reply.code(status).send({
      code,
      message: env.NODE_ENV === 'production' && status >= 500 ? 'Internal error' : error.message,
      ...(error.validation ? { details: error.validation } : {}),
    });
  });
});
