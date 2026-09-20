import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * A time-sortable id: 9 chars of millisecond time, then 12 random chars.
 * Sorting ids lexically sorts them by creation time, which is what lets a
 * DynamoDB sort key double as "newest first".
 */
export function newId(prefix: string, now = Date.now()): string {
  let t = "";
  for (let n = now, i = 0; i < 9; i++, n = Math.floor(n / 32)) t = ALPHABET[n % 32] + t;
  const bytes = randomBytes(12);
  let r = "";
  for (const b of bytes) r += ALPHABET[b % 32];
  return `${prefix}_${t}${r}`;
}

export const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);
