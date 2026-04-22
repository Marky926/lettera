#!/usr/bin/env node
/**
 * `lettera` CLI — headless renderer.
 *
 * Usage:
 *   lettera render --in path/to/doc.json --out path/to/out.html
 *
 * Exits non-zero when warnings include severity "error" (none today; reserved
 * for the linter integration in Phase 4 verification).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { standardBlocks } from '@lettera/blocks-standard';
import { EmailDocument } from '@lettera/core';
import { BlockRegistry, render } from '@lettera/renderer';

interface RenderArgs {
  in: string;
  out: string;
  text?: string;
  'allow-outside-cwd'?: string;
}

/**
 * Reject paths that escape the current working directory unless the caller
 * passes `--allow-outside-cwd`. This makes the CLI safe to drive from CI
 * pipelines that consume untrusted JSON (otherwise `--out ../../etc/...`
 * would happily clobber arbitrary files writable by the Node process).
 */
function safePath(input: string, allowOutside: boolean, label: string): string {
  const cwd = process.cwd();
  const abs = resolve(cwd, input);
  if (!allowOutside) {
    const rel = relative(cwd, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      console.error(
        `Error: ${label} path "${input}" resolves outside the current working directory. ` +
          `Re-run with --allow-outside-cwd to override.`,
      );
      process.exit(1);
    }
  }
  return abs;
}

function parseArgs(argv: string[]): { command: string; args: Record<string, string> } {
  const [command, ...rest] = argv;
  const args: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const cur = rest[i]!;
    if (cur.startsWith('--')) {
      const key = cur.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }
  return { command: command ?? '', args };
}

async function runRender(args: RenderArgs): Promise<void> {
  const allowOutside = args['allow-outside-cwd'] === 'true';
  const inputPath = safePath(args.in, allowOutside, 'input');
  const outputPath = safePath(args.out, allowOutside, 'output');

  const raw = await readFile(inputPath, 'utf8');
  const json = JSON.parse(raw);
  const parsed = EmailDocument.safeParse(json);
  if (!parsed.success) {
    console.error('Invalid document:');
    console.error(parsed.error.format());
    process.exit(2);
  }

  const registry = new BlockRegistry();
  registry.registerAll(standardBlocks);

  const result = render(parsed.data, { registry });
  await writeFile(outputPath, result.html, 'utf8');

  if (args.text) {
    const textPath = safePath(args.text, allowOutside, 'text');
    await writeFile(textPath, result.text, 'utf8');
  }

  if (result.warnings.length > 0) {
    console.warn(`Rendered with ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) {
      console.warn(`  [${w.severity}] ${w.code}${w.nodeId ? ` (${w.nodeId})` : ''}: ${w.message}`);
    }
  }

  console.log(`Wrote ${outputPath}`);
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  switch (command) {
    case 'render': {
      if (!args.in || !args.out) {
        console.error('Usage: lettera render --in <doc.json> --out <out.html> [--text <out.txt>]');
        process.exit(1);
      }
      await runRender(args as unknown as RenderArgs);
      break;
    }
    case '':
    case 'help':
    case '--help':
      console.log(`lettera CLI

Commands:
  render --in <doc.json> --out <out.html> [--text <out.txt>] [--allow-outside-cwd]
        Render an email document to HTML (and optional plain text).

Options:
  --allow-outside-cwd
        Permit input/output paths outside the current working directory.
        Off by default to prevent path-traversal when invoked from CI.
`);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
