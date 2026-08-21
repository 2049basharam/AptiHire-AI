import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import * as jose from 'jose';
import { env } from './env';

// Parameters for scrypt (N: CPU/memory cost, r: block size, p: parallelization)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

// Hashing symmetric secret key for JWT (TextEncoder is global in Node.js)
const JWT_SECRET_BYTES = new TextEncoder().encode(env.JWT_SECRET);

/**
 * Promisified scrypt helper to avoid TypeScript overload issues with util.promisify
 */
function scryptPromise(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      }
    );
  });
}

/**
 * Hashes a plaintext password using Node's native crypto.scrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptPromise(password, salt);

  // Format: salt:hex_derived_key
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored hash using timingSafeEqual to prevent side-channel attacks
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  
  const [salt, hashHex] = parts;
  const matchBuffer = Buffer.from(hashHex, 'hex');
  const derivedKey = await scryptPromise(password, salt);
  
  return timingSafeEqual(matchBuffer, derivedKey);
}

/**
 * Signs a minimal session JWT containing only the userId claim
 */
export async function signToken(payload: { userId: string }): Promise<string> {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h') // 24 hours session expiration
    .sign(JWT_SECRET_BYTES);
}

/**
 * Verifies a session JWT and returns the parsed payload
 */
export async function verifyToken(token: string): Promise<{ userId: string }> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET_BYTES);
  
  if (!payload || typeof payload.userId !== 'string') {
    throw new Error('Invalid token payload');
  }
  
  return { userId: payload.userId };
}
