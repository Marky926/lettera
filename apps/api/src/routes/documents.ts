/**
 * Document routes — the meat of the API.
 *
 *   GET    /projects/:id/documents
 *   POST   /projects/:id/documents               create blank doc
 *   GET    /documents/:id                        load latest content
 *   PATCH  /documents/:id                        autosave (replaces content)
 *   POST   /documents/:id/versions               manual snapshot
 *   GET    /documents/:id/versions               list snapshots
 *   POST   /documents/:id/versions/:vid/restore  restore old snapshot
 *   POST   /documents/:id/render                 server-side render → html+text
 *
 * Autosave strategy: PATCH always rewrites `content` and creates an
 * `autosave` DocumentVersion at most once every AUTOSAVE_THROTTLE_MS, so the
 * version table doesn't explode while typing.
 */

import { standardBlocks } from '@lettera/blocks-standard';
import { createEmptyDocument } from '@lettera/core';
import { BlockRegistry, render } from '@lettera/renderer';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDocumentAccess, requireProjectAccess } from '../lib/access.js';

const AUTOSAVE_THROTTLE_MS = 10_000;

const CreateDocSchema = z.object({ name: z.string().min(1) });
const PatchDocSchema = z.object({
  content: z.unknown(),
  name: z.string().min(1).optional(),
});

const sharedRegistry = new BlockRegistry();
for (const def of standardBlocks) sharedRegistry.register(def as never);

export default async function documentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/projects/:id/documents', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await requireProjectAccess(req, reply, id))) return;
    return prisma.document.findMany({
      where: { projectId: id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
  });

  app.post('/projects/:id/documents', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await requireProjectAccess(req, reply, id, 'EDITOR'))) return;
    const parsed = CreateDocSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const blank = createEmptyDocument(parsed.data.name);
    return prisma.document.create({
      data: {
        projectId: id,
        name: parsed.data.name,
        content: blank as unknown as object,
        versions: {
          create: { content: blank as unknown as object, label: 'initial', authorId: req.user.sub },
        },
      },
    });
  });

  app.get('/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const access = await requireDocumentAccess(req, reply, id);
    if (!access) return;
    // Re-read with the relations the breadcrumb UI needs. The auth helper
    // already loaded the doc + project for tenancy checks; this second
    // query is cheap (PK lookup) and keeps the helper's surface narrow.
    return prisma.document.findUnique({
      where: { id },
      include: {
        project: {
          include: {
            workspace: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
  });

  app.patch('/documents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const access = await requireDocumentAccess(req, reply, id, 'EDITOR');
    if (!access) return;
    const parsed = PatchDocSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // Throttled autosave snapshot.
    const last = await prisma.documentVersion.findFirst({
      where: { documentId: id, label: 'autosave' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const shouldSnapshot = !last || Date.now() - last.createdAt.getTime() > AUTOSAVE_THROTTLE_MS;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.document.update({
        where: { id },
        data: {
          content: parsed.data.content as object,
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
        },
      });
      if (shouldSnapshot) {
        await tx.documentVersion.create({
          data: {
            documentId: id,
            content: parsed.data.content as object,
            label: 'autosave',
            authorId: req.user.sub,
          },
        });
      }
      return u;
    });

    return { id: updated.id, updatedAt: updated.updatedAt, snapshotted: shouldSnapshot };
  });

  app.get('/documents/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const access = await requireDocumentAccess(req, reply, id);
    if (!access) return;
    return prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        createdAt: true,
        author: { select: { id: true, email: true, name: true } },
      },
      take: 50,
    });
  });

  app.post('/documents/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const access = await requireDocumentAccess(req, reply, id, 'EDITOR');
    if (!access) return;
    const body = (req.body ?? {}) as { label?: string; content?: unknown };
    // If the client supplied fresh content (e.g. flushing an in-flight edit
    // before snapshotting), persist it to the document first so the snapshot
    // reflects what the user sees, not the previously-saved server state.
    let snapshotContent = access.doc.content as object;
    if (body.content !== undefined) {
      const updated = await prisma.document.update({
        where: { id },
        data: { content: body.content as object },
      });
      snapshotContent = updated.content as object;
    }
    return prisma.documentVersion.create({
      data: {
        documentId: id,
        content: snapshotContent,
        label: body.label ?? 'manual',
        authorId: req.user.sub,
      },
    });
  });

  app.post('/documents/:id/versions/:vid/restore', async (req, reply) => {
    const { id, vid } = req.params as { id: string; vid: string };
    const access = await requireDocumentAccess(req, reply, id, 'EDITOR');
    if (!access) return;
    const v = await prisma.documentVersion.findFirst({
      where: { id: vid, documentId: id },
    });
    if (!v) return reply.code(404).send({ error: 'version not found' });
    return prisma.$transaction(async (tx) => {
      const u = await tx.document.update({
        where: { id },
        data: { content: v.content as object },
        include: {
          project: {
            include: {
              workspace: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });
      await tx.documentVersion.create({
        data: {
          documentId: id,
          content: v.content as object,
          label: `restored from ${v.id}`,
          authorId: req.user.sub,
        },
      });
      return u;
    });
  });

  app.post('/documents/:id/render', async (req, reply) => {
    const { id } = req.params as { id: string };
    const access = await requireDocumentAccess(req, reply, id);
    if (!access) return;
    const body = (req.body ?? {}) as { mode?: 'preview' | 'export' };
    const result = render(access.doc.content as never, {
      registry: sharedRegistry,
      mode: body.mode ?? 'export',
    });
    return result;
  });
}
