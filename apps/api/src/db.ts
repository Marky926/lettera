import { PrismaClient } from '@prisma/client';

/**
 * Single shared Prisma client. Keeping it module-scoped avoids exhausting
 * Postgres connections during dev hot-reload (tsx-watch reuses the module).
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

process.on('beforeExit', () => {
  void prisma.$disconnect();
});
