/**
 * Strongly-typed environment loader.
 *
 * Reads the file once at startup, validates with zod, and exports a frozen
 * object. Any missing/malformed variable fails fast with a clear message.
 */
import { config } from 'dotenv';
import { z } from 'zod';

config();

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 chars'),
  DATABASE_URL: z.string().url(),
  /** bcrypt cost factor. 13 ≈ ~250ms on commodity hardware in 2026. */
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(13),
  /** Global per-IP rate limit (requests per minute). */
  RATE_LIMIT_GLOBAL: z.coerce.number().int().positive().default(300),
  /** Per-IP rate limit on /auth/* (requests per minute). */
  RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(10),
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
