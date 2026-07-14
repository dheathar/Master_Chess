import crypto from "node:crypto";

export const PBKDF2_ITERATIONS = 600_000;

export function hashPassword(password: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, "sha256", (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey.toString("base64url"));
    });
  });
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  const incoming = await hashPassword(password, salt, iterations);
  const a = Buffer.from(incoming);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("base64url");
}
