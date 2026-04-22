/**
 * Auth routes: register / login / logout / me.
 *
 * Sessions live in an httpOnly cookie. `me` is the canonical "is this user
 * still logged in?" endpoint — the web app calls it on every page that needs
 * a session.
 */

import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { SESSION_COOKIE } from '../plugins/auth.js';

/**
 * Password strength rule — balances usability vs. security without pulling
 * in a full entropy estimator. 10+ characters, at least one letter and one
 * digit. Upgrade to zxcvbn-ts in a later PR if product wants a stronger bar.
 */
const PasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200, 'Password is too long')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one digit');

const RegisterSchema = z.object({
  email: z.string().email(),
  password: PasswordSchema,
  name: z.string().min(1).optional(),
  workspaceName: z.string().min(1).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
} as const;

/** Per-route rate-limit config for auth endpoints. */
const AUTH_RATE_LIMIT = {
  max: env.RATE_LIMIT_AUTH,
  timeWindow: '1 minute',
} as const;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || `ws-${Math.random().toString(36).slice(2, 8)}`
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let n = 0;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email, password, name, workspaceName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: 'email already in use' });

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);
    const wsName = workspaceName ?? `${name ?? email.split('@')[0]}'s workspace`;
    const slug = await uniqueSlug(wsName);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? null,
        members: {
          create: {
            role: 'OWNER',
            workspace: { create: { name: wsName, slug } },
          },
        },
      },
    });

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    reply.setCookie(SESSION_COOKIE, token, COOKIE_OPTS);
    return { user: { id: user.id, email: user.email, name: user.name } };
  });

  app.post('/auth/login', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return reply.code(401).send({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'invalid credentials' });

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    reply.setCookie(SESSION_COOKIE, token, COOKIE_OPTS);
    return { user: { id: user.id, email: user.email, name: user.name } };
  });

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get(
    '/auth/me',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, _reply: FastifyReply) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { id: true, email: true, name: true },
      });
      return { user };
    },
  );
}
