import { Router } from "express";
import {
  EmailInUseError,
  InvalidCredentialsError,
  loginUser,
  logoutUser,
  registerUser,
} from "../auth/authService";
import { deleteUserData, exportUserData } from "../auth/gdpr";
import { requireAuth } from "../auth/middleware";
import { rateLimit } from "../auth/rateLimit";
import { asyncHandler } from "../asyncHandler";
import { loginRequestSchema, registerRequestSchema } from "@shared/api";

export const authRouter = Router();

// Brute-force / PBKDF2-DoS protection: strict per-IP limits on the two
// unauthenticated credential endpoints.
const credentialLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

authRouter.post(
  "/register",
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
      return;
    }
    try {
      const ipAddress = (req.ip as string) || undefined;
      const result = await registerUser(parsed.data, ipAddress);
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof EmailInUseError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  }),
);

authRouter.post(
  "/login",
  credentialLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
      return;
    }
    try {
      const ipAddress = (req.ip as string) || undefined;
      const result = await loginUser(parsed.data.email, parsed.data.password, ipAddress);
      res.json(result);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        res.status(401).json({ error: error.message });
        return;
      }
      throw error;
    }
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (token) await logoutUser(token);
    res.status(204).end();
  }),
);

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.get(
  "/gdpr/export",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bundle = await exportUserData(req.user!.id);
    res.json(bundle);
  }),
);

authRouter.post(
  "/gdpr/delete",
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteUserData(req.user!.id);
    res.status(204).end();
  }),
);
