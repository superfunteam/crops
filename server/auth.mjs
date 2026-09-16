import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
// OWASP's memory-conscious scrypt profile (32 MiB, three passes).
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const hashPrefix = 'scrypt:32768:8:3:';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, scryptOptions);
  return `${hashPrefix}${salt}:${key.toString('hex')}`;
}
// Valid cost/length even for an unknown username, to avoid a cheap timing oracle.
const dummyHash = hashPrefix + '00000000000000000000000000000000:' + '00'.repeat(64);
export const needsPasswordUpgrade = (stored) => !stored.startsWith(hashPrefix);
export async function verifyPassword(password, stored = dummyHash) {
  const parts = stored.split(':');
  const legacy = parts.length === 3 && parts[0] === 'scrypt';
  if (!legacy && (parts.length !== 6 || !stored.startsWith(hashPrefix))) return false;
  const [salt, key] = parts.slice(-2);
  if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(key)) return false;
  const actual = await scrypt(password, salt, 64, legacy ? { N: 16384, r: 8, p: 1 } : scryptOptions);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function createSession(tx, userId) {
  const token = randomBytes(32).toString('base64url');
  await tx.query('DELETE FROM sessions WHERE expires_at < now()');
  await tx.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [digest(token), userId, new Date(Date.now() + 30 * 86400000)]);
  return token;
}
export function sessionCookie(token, secure) {
  return `crops_session=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${token ? 30 * 86400 : 0}${secure ? '; Secure' : ''}`;
}
