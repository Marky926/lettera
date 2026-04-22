import { customAlphabet } from 'nanoid';

// URL-safe, no ambiguous chars. 12 chars ≈ enough entropy for an editor doc.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghijkmnpqrstvwxyz';
const nano = customAlphabet(alphabet, 12);

export type NodeId = string;

export function newId(prefix = 'n'): NodeId {
  return `${prefix}_${nano()}`;
}
