/**
 * Lettera API entrypoint.
 *
 * Wires CORS, security middleware, auth, and tenant routes onto Fastify, then
 * listens. Run with `pnpm dev` (tsx watch) or `pnpm build && pnpm start`.
 */

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './env.js';
import authPlugin from './plugins/auth.js';
import securityPlugin from './plugins/security.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import workspaceRoutes from './routes/workspaces.js';

async function main() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            }
          : undefined,
    },
    // Generate a request-id per request so logs across async hops correlate.
    genReqId: () => `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    trustProxy: true,
    disableRequestLogging: false,
    bodyLimit: 1024 * 1024, // 1 MB — documents can be large, bump if needed
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  await app.register(securityPlugin);
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(workspaceRoutes);
  await app.register(documentRoutes);

  app.get('/health', { config: { rateLimit: false } }, async () => ({
    ok: true,
    ts: Date.now(),
  }));

  // Graceful shutdown: drain in-flight requests before the process exits. PM2,
  // Docker, Kubernetes all send SIGTERM first and expect the app to close.
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Lettera API ready on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
