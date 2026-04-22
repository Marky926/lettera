import type { EmailDocument } from '@lettera/core';
import welcome from '../../../fixtures/welcome.json';

// The fixture is the same one used by the CLI. Casting through `unknown` since
// the JSON import lacks type info; the editor will validate via Zod on use.
export const sampleDocument = welcome as unknown as EmailDocument;
