/**
 * Helpers shared by tenant-scoped routes.
 *
 * `requireMember` ensures the JWT user has access to the given workspace and
 * returns the membership row (which carries the role for further checks).
 * `requireRole` layers role-based authorization on top — write/admin routes
 * should call it with the minimum required role.
 */
import type { Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';

/** Role → numeric rank, higher is more privileged. */
const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleAtLeast(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export async function requireMember(req: FastifyRequest, reply: FastifyReply, workspaceId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.user.sub, workspaceId } },
  });
  if (!member) {
    reply.code(403).send({ code: 'not_a_member', message: 'Not a member of this workspace' });
    return null;
  }
  return member;
}

/**
 * Assert the caller has at least the given role in the given workspace. Call
 * this inside a route handler that writes/mutates shared state. Returns the
 * membership on success or `null` after `reply.send(403)` on failure.
 */
export async function requireRole(
  req: FastifyRequest,
  reply: FastifyReply,
  workspaceId: string,
  minimum: Role,
) {
  const member = await requireMember(req, reply, workspaceId);
  if (!member) return null;
  if (!roleAtLeast(member.role, minimum)) {
    reply.code(403).send({
      code: 'insufficient_role',
      message: `Requires role ${minimum} or higher`,
    });
    return null;
  }
  return member;
}

export async function requireProjectAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  minimum: Role = 'VIEWER',
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    reply.code(404).send({ code: 'project_not_found', message: 'Project not found' });
    return null;
  }
  const member = await requireRole(req, reply, project.workspaceId, minimum);
  if (!member) return null;
  return { project, member };
}

export async function requireDocumentAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  documentId: string,
  minimum: Role = 'VIEWER',
) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { project: true },
  });
  if (!doc) {
    reply.code(404).send({ code: 'document_not_found', message: 'Document not found' });
    return null;
  }
  const member = await requireRole(req, reply, doc.project.workspaceId, minimum);
  if (!member) return null;
  return { doc, member };
}
