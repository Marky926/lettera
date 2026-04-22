/**
 * Workspace + project routes.
 *
 * Tenancy: every endpoint resolves a workspace from path/body and checks
 * membership via the helpers in `lib/access`.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireMember, requireRole } from '../lib/access.js';

const CreateWorkspaceSchema = z.object({ name: z.string().min(1) });
const CreateProjectSchema = z.object({ name: z.string().min(1) });

export default async function workspaceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/workspaces', async (req) => {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user.sub },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
    }));
  });

  app.post('/workspaces', async (req, reply) => {
    const parsed = CreateWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const slug = `${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const ws = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        slug,
        members: { create: { userId: req.user.sub, role: 'OWNER' } },
      },
    });
    return ws;
  });

  app.get('/workspaces/:id/projects', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await requireMember(req, reply, id))) return;
    return prisma.project.findMany({
      where: { workspaceId: id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { documents: true } } },
    });
  });

  app.post('/workspaces/:id/projects', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await requireRole(req, reply, id, 'EDITOR'))) return;
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return prisma.project.create({
      data: { workspaceId: id, name: parsed.data.name },
    });
  });
}
