import type { NextFunction, Request, Response } from "express";
import { userForToken } from "./authService";
import type { PublicUser } from "@shared/api";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);
  // EventSource cannot set request headers, so SSE routes fall back to a
  // query-string token. Only honored on GET requests to keep it out of
  // request bodies/logs for state-changing calls.
  if (req.method === "GET" && typeof req.query.token === "string") return req.query.token;
  return null;
}

/** Attaches req.user when a valid bearer token is present; never rejects (Express 4 would crash on an unhandled rejection). */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    req.user = (await userForToken(token)) ?? undefined;
  } catch {
    req.user = undefined;
  }
  next();
}

/** Rejects the request unless attachUser found a valid session. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
}

export function requireRole(...roles: PublicUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions." });
      return;
    }
    next();
  };
}
