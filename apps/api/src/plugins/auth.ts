/**
 * Auth plugin: registers @fastify/jwt with cookie support and exposes a
 * `authenticate` decorator usable as a route preHandler.
 *
 * Token shape: `{ sub: <userId>, email: <email>, iat, exp }`. Stored in an
 * httpOnly cookie named `lettera_session` so the browser sends it with every
 * same-site request without JS exposure.
 */

import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';

export const SESSION_COOKIE = 'lettera_session';

export interface SessionUser {
  sub: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
  interface FastifyRequest {
    user: SessionUser;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate(
    'authenticate',
    async function authenticate(req: FastifyRequest, reply: FastifyReply) {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'unauthorized' });
      }
    },
  );
});
