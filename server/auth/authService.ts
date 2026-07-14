import crypto from "node:crypto";
import { eq, and, gt, lt } from "drizzle-orm";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { generateSalt, generateToken, hashPassword, verifyPassword, PBKDF2_ITERATIONS, hashToken, hashIp } from "./password";
import type { PublicUser, RegisterRequest } from "@shared/api";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export class EmailInUseError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailInUseError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password.");
    this.name = "InvalidCredentialsError";
  }
}

function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    tier: row.tier,
    createdAt: row.createdAt,
  };
}

export async function registerUser(input: RegisterRequest, ipAddress?: string): Promise<{ user: PublicUser; token: string }> {
  const existing = db.select().from(users).where(eq(users.email, input.email.toLowerCase())).get();
  if (existing) {
    throw new EmailInUseError();
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const now = Date.now();
  const id = crypto.randomUUID();

  db.insert(users)
    .values({
      id,
      email: input.email.toLowerCase(),
      passwordHash,
      passwordSalt: salt,
      passwordIterations: PBKDF2_ITERATIONS,
      displayName: input.displayName,
      role: "player",
      tier: "free",
      createdAt: now,
    })
    .run();

  const row = db.select().from(users).where(eq(users.id, id)).get()!;
  const token = await createSession(id, ipAddress);
  return { user: toPublicUser(row), token };
}

export async function loginUser(email: string, password: string, ipAddress?: string): Promise<{ user: PublicUser; token: string }> {
  const row = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  if (!row || row.deletedAt) {
    // Constant-time dummy verify to prevent timing attacks on user existence.
    await verifyPassword(password, "$2b$12$DummyHashForNonExistentUserDoNotMatch", "salt", PBKDF2_ITERATIONS);
    throw new InvalidCredentialsError();
  }
  const valid = await verifyPassword(password, row.passwordHash, row.passwordSalt, row.passwordIterations);
  if (!valid) {
    throw new InvalidCredentialsError();
  }
  const token = await createSession(row.id, ipAddress);
  return { user: toPublicUser(row), token };
}

async function createSession(userId: string, ipAddress?: string): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = Date.now();
  const ipHash = ipAddress ? hashIp(ipAddress) : null;
  db.insert(sessions)
    .values({ token: tokenHash, userId, createdAt: now, expiresAt: now + SESSION_TTL_MS, ipHash })
    .run();
  return token; // Return the raw token to the client
}

export async function logoutUser(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  db.delete(sessions).where(eq(sessions.token, tokenHash)).run();
}

export async function userForToken(token: string | null): Promise<PublicUser | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = Date.now();
  const row = db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, now)))
    .get();
  if (!row || row.user.deletedAt) return null;

  // Sliding renewal: extend the session when it has burned through more
  // than half its lifetime, so active users are never logged out mid-use.
  if (row.session.expiresAt - now < SESSION_TTL_MS / 2) {
    db.update(sessions).set({ expiresAt: now + SESSION_TTL_MS }).where(eq(sessions.token, tokenHash)).run();
  }

  return toPublicUser(row.user);
}

/** Removes expired session rows; called at boot and periodically. */
export function purgeExpiredSessions(): void {
  db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
}

/**
 * Seeds an admin account only when ADMIN_BOOTSTRAP_PASSWORD is explicitly
 * provided — never with a hardcoded default, which would be an open door
 * on any reachable deployment.
 */
export async function ensureSeedAdmin(): Promise<void> {
  const existing = db.select().from(users).where(eq(users.role, "admin")).get();
  if (existing) return;
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!bootstrapPassword || bootstrapPassword.length < 12) {
    console.warn(
      "[auth] No admin account exists and ADMIN_BOOTSTRAP_PASSWORD is unset (or under 12 chars) — skipping admin seed.",
    );
    return;
  }
  const salt = generateSalt();
  const passwordHash = await hashPassword(bootstrapPassword, salt);
  db.insert(users)
    .values({
      id: crypto.randomUUID(),
      email: "admin@masterchess.local",
      passwordHash,
      passwordSalt: salt,
      passwordIterations: PBKDF2_ITERATIONS,
      displayName: "Admin",
      role: "admin",
      tier: "academy",
      createdAt: Date.now(),
    })
    .run();
  console.log("[auth] Seeded admin account admin@masterchess.local from ADMIN_BOOTSTRAP_PASSWORD.");
}
